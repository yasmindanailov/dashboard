# ADR-085 — Página de cuenta self-service del cliente (perfil + seguridad + facturación)

> **Status:** Active
> **Date:** 2026-06-24
> **Domain:** auth, billing, ui

---

## Contexto

La página `/dashboard/profile` ("Mi perfil") es hoy un MVP de **una sola tarjeta**: el editor de
titular WHOIS (`GET/PUT /domains/registrant`, Sprint 15D.G·2). La auditoría de esta superficie
(2026-06-24) destapó cuatro problemas:

1. **La página no es alcanzable.** En `Topbar.tsx` el item de menú "Mi perfil" tiene
   `onClick: () => {}` — no navega. La página existe pero ningún flujo de UI lleva a ella.
2. **Editar tu identidad está acoplado al registrador de dominios.** El **único** camino
   self-service para escribir `User.first_name/last_name` + `ClientProfile.*` es
   `PUT /domains/registrant`, que **siempre** intenta propagar el contacto al registrar
   (`contacts/modify`). Un cliente sin dominios que quiere corregir su nombre pasa, conceptualmente,
   por un flujo de dominios.
3. **Se expone el almacén fiscal que no factura.** Las facturas y servicios referencian
   `BillingProfile` (`billing_profile_id`, 1:N, tipo personal/autónomo/empresa, `is_default` —
   [ADR-060 §A](./adr-060-decisiones-pre-schema.md)), cuyo CRUD es **admin-only**
   (`/admin/clients/:id/billing-profiles`). La página de perfil edita `ClientProfile` (1:1, fuente
   del WHOIS). Resultado: los "datos fiscales de las facturas" que ve el cliente **no son los que le
   facturan**, y el cliente **no puede gestionar sus perfiles de facturación reales**.
4. **No existe self-service de cuenta/seguridad.** Faltan: editar nombre/idioma/zona horaria
   (`PATCH /auth/me`), cambiar contraseña autenticado, gestionar 2FA, "cerrar sesión en todos los
   dispositivos". Sólo existen `GET /auth/me`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`,
   `POST /auth/logout`.

El [Enfoque B](../60-roadmap/current.md) identifica "página de perfil + ajustes" como hueco de la
superficie v1. La pregunta de arquitectura: ¿cómo se construye una página de cuenta **profesional**
(donde el cliente edite sus datos, cambie su contraseña, gestione su seguridad y sus perfiles de
facturación) **sin acoplarla a dominios, sin romper el aislamiento admin/cliente, y reutilizando lo
que ya existe**?

> **Qué pasa si NO tomamos esta decisión:** la página de cuenta se construiría ad-hoc, perpetuando
> el acoplamiento WHOIS↔identidad y la duplicación `ClientProfile`/`BillingProfile`, y abriría
> superficie de auth sin doctrina (zona sensible). Por eso requiere ADR.

**Lo ya existente que la decisión reutiliza** (la arquitectura estaba anticipada):

- **CASL:** `Subject.Profile` y `Subject.BillingProfile` ya declarados; el rol `client` ya tiene
  `{ Action.Manage, Subject.Profile }` y `{ Action.Manage, Subject.BillingProfile }`
  (`permissions.ts`, comentario *"guard allows, controller enforces user_id ownership"*).
- **`ClientsBillingService`** ya implementa el CRUD de `BillingProfile` con **ownership check en cada
  método** (`userId` param, EC-4.1) — sólo está expuesto por rutas admin.
- **Sesiones:** modelo y semántica "solo activas, borrar al cerrar; el cliente puede cerrar todas"
  ya fijados en [ADR-060 §B](./adr-060-decisiones-pre-schema.md).
- **2FA por email** ([ADR-013](./adr-013-2fa-email.md)): mecanismo de código-por-email ya operativo
  (`initiate2fa`/`verify2fa`).

---

## Opciones consideradas

1. **Extender el editor WHOIS actual con más campos (cuenta + seguridad dentro del registrant).**
   - Pros: una sola página, cero rutas nuevas.
   - Contras: perpetúa el acoplamiento identidad↔registrador; toda edición de perfil dispararía
     `contacts/modify`; mezcla seguridad con dominios. **Descartada.**

2. **Abrir las rutas admin (`/admin/clients/:id/...`) al rol cliente.**
   - Pros: reutiliza controladores existentes.
   - Contras: rompe el aislamiento de portales ([ADR-066](./adr-066-tres-portales-raiz-portalbadge.md));
     el `:id` lo controlaría el cliente → exactamente el patrón IDOR horizontal que cerró el HIGH-2
     de la auditoría. **Descartada.**

3. **(Elegida) Nueva superficie self-service self-scoped** que deriva el `userId` del JWT
   (`req.user.id`, nunca de un parámetro), reutiliza los servicios ya ownership-safe, **desacopla
   identidad de WHOIS**, y se apoya en los `Subject.Profile`/`BillingProfile` ya existentes.
   - Pros: sin IDOR (no hay id manipulable); reutiliza `ClientsBillingService`; respeta R4 (la
     propagación al registrar sigue siendo capability-routed y vive sólo en el flujo de dominios);
     separa identidad/seguridad/facturación/dominios en secciones claras.
   - Contras: añade endpoints nuevos en `auth` (zona sensible) — mitigado con confirmación de
     contraseña en las acciones de seguridad y tests dedicados.

---

## Decisión

### 1. Modelo de datos: qué edita cada sección (sin migraciones)

Todos los campos ya existen en el schema. **No hay migración en este sprint.**

| Sección (UI)            | Almacén                          | Campos |
|-------------------------|----------------------------------|--------|
| **Cuenta**              | `User`                           | `first_name`, `last_name`, `language`, `timezone`, `avatar_url` (email **read-only**) |
| **Seguridad**           | `User`                           | `password_hash` (cambio), `two_factor_enabled`, sesiones (`Session`) |
| **Facturación**         | `BillingProfile` (1:N)           | perfiles fiscales que **referencian las facturas** ([ADR-060 §A](./adr-060-decisiones-pre-schema.md)) |
| **Dominios (titular)**  | `User` + `ClientProfile`         | editor WHOIS existente — **propaga al registrar** (sigue siendo el flujo de dominios) |

> **Doctrina del dato fiscal:** la sección "Facturación" gestiona `BillingProfile` (lo que de verdad
> factura). `ClientProfile` queda como **fuente del titular WHOIS**, gestionado en la sección
> "Dominios". Se acepta que ambos guardan datos de dirección/tax_id solapados: son **roles
> distintos** (facturación vs. registrante de dominios) y el cliente puede quererlos diferentes.
> *(Nota de drift conocido: [ADR-060 §A](./adr-060-decisiones-pre-schema.md) describe "máx. 3
> perfiles, uno por tipo"; el modelo implementado usa `label` + `is_default` sin tope por tipo. No
> se reconcilia en este sprint — se respeta el modelo implementado.)*

### 2. Endpoints (todos self-scoped por `req.user.id` — NUNCA por parámetro de ruta)

**Identidad / seguridad — módulo `auth`** (controlador self-scoped; la organización exacta de
ficheros es detalle de implementación, p.ej. un `AccountController` dedicado):

| Método | Ruta | Semántica |
|--------|------|-----------|
| `PATCH` | `/auth/me` | Actualiza `first_name`/`last_name`/`language`/`timezone`/`avatar_url`. **No toca el registrar.** |
| `POST` | `/auth/change-password` | `current_password` + `new_password`. Verifica la actual (bcrypt), aplica política de fortaleza, y **revoca el resto de sesiones** (mantiene la actual). `@Throttle`. |
| `POST` | `/auth/2fa/enable` | Activa 2FA opt-in (ver §3). Requiere confirmar contraseña. |
| `POST` | `/auth/2fa/disable` | Desactiva 2FA. Requiere confirmar contraseña. **Bloqueado para roles con 2FA obligatorio.** |
| `POST` | `/auth/logout-all` | Cierra **todas** las sesiones del usuario (`DELETE FROM sessions WHERE user_id`), [ADR-060 §B](./adr-060-decisiones-pre-schema.md). |

*(Existentes, reutilizados: `GET /auth/me`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`,
`POST /auth/logout`.)*

**Facturación — módulo `clients`, controlador self-scoped nuevo** (reutiliza
`ClientsBillingService`, ya ownership-safe):

| Método | Ruta | Servicio |
|--------|------|----------|
| `GET` | `/account/billing-profiles` | `getBillingProfiles(req.user.id)` |
| `POST` | `/account/billing-profiles` | `createBillingProfile(req.user.id, dto)` |
| `PATCH` | `/account/billing-profiles/:id` | `updateBillingProfile(req.user.id, id, dto)` |
| `DELETE` | `/account/billing-profiles/:id` | `deleteBillingProfile(req.user.id, id)` |
| `PATCH` | `/account/billing-profiles/:id/default` | `setDefaultBillingProfile(req.user.id, id)` |

Guard: `@UseGuards(JwtAuthGuard, PoliciesGuard)` + `@CheckPolicies(a => a.can(Action.Manage, Subject.BillingProfile))`.
El `:id` de un perfil ajeno devuelve **404** (el servicio ya lo hace: `profile.user_id !== userId`).

**Dominios (titular WHOIS):** `GET/PUT /domains/registrant` **sin cambios** — es el flujo de
dominios y sigue propagando al registrar.

### 3. 2FA opt-in para clientes — **Amendment A1 de [ADR-013](./adr-013-2fa-email.md)**

[ADR-013](./adr-013-2fa-email.md) decidió conscientemente que **clientes y partners NO requieren
2FA** (reduce fricción de onboarding). Una página de cuenta profesional ofrece 2FA **opcional**.
Esto **no contradice** ADR-013 (los privilegiados siguen siendo obligatorios) — lo **extiende**:

- **Amendment A1:** clientes/partners pueden **activar voluntariamente** 2FA por email desde su
  página de cuenta. Mecánica = el **mismo** código-por-email ya existente (cero TOTP, cero deps).
- Implicación en login: el servicio de login debe disparar el reto 2FA cuando
  `role ∈ ROLES_REQUIRING_2FA` **O** `user.two_factor_enabled === true` (hoy sólo mira el rol).
- **Activar** requiere confirmar la contraseña (la acción es sensible). **Desactivar** requiere
  contraseña y está **prohibido** para roles con 2FA obligatorio (no pueden bajar su seguridad).
- Privilegiados: 2FA sigue **obligatorio** e inmutable desde la cuenta (UI lo muestra como "exigido
  por tu rol", sin toggle).

### 4. Frontend: página de cuenta en secciones

`/dashboard/profile` deja de ser una tarjeta y pasa a ser una página seccionada (DS-compliant: CSS
Modules + tokens, **cero `style={{}}` inline** — corrige la violación actual), con cuatro secciones:
**Cuenta · Seguridad · Facturación · Dominios (titular)**. Server Actions self-scoped
(`serverFetch` + `revalidatePath`, patrón `plugins/_actions.ts`). Componentes reutilizables en
`app/_shared/account/` (preparados para reuso staff, §"Cuándo revisar").

Además: **cablear el item "Mi perfil" del Topbar** para que navegue a `/dashboard/profile` (hoy es
`onClick: () => {}`).

### 5. Fuera de alcance v1 (diferido explícito)

- **Cambio de email** (requiere round-trip de re-verificación + impacto en login) → ronda posterior;
  el email permanece read-only.
- **Página de cuenta de staff** (`/admin/profile`): el backend es role-agnóstico (sirve a staff
  igual), pero la UI v1 cubre el portal cliente (`/dashboard/profile`). El staff la reutiliza vía los
  componentes `_shared/account/` como fast-follow.
- **Avatar:** subida real a MinIO ([ADR-062](./adr-062-storage-canonico-minio.md)) es deseable; si no
  entra en v1 se difiere, mostrando iniciales como fallback.

---

## Consecuencias

- ✅ **Ganamos:**
  - Página de cuenta profesional: identidad, seguridad (contraseña + 2FA + sesiones) y facturación
    self-service, sin acoplar a dominios.
  - El cliente gestiona por fin **sus perfiles de facturación reales** (los que facturan).
  - Sin IDOR: todo deriva `userId` del JWT; reutiliza servicios ownership-safe ya probados.
  - 2FA opcional real para clientes con **cero dependencias nuevas** (reusa el email-code).
- ⚠️ **Aceptamos:**
  - Más endpoints en `auth` (sensible) — mitigado con confirmación de contraseña + `@Throttle` +
    tests dedicados.
  - `ClientProfile` (WHOIS) y `BillingProfile` (facturas) conviven con datos solapados — es
    intencional (roles distintos), pero el cliente debe entender la diferencia (copy de UI claro).
- 🚪 **Cierra:**
  - **No** se editan datos de identidad por el flujo de dominios (el registrant queda sólo para WHOIS).
  - **No** se abren rutas admin al cliente (aislamiento de portales intacto).
  - **No** TOTP — el 2FA opt-in reusa el email-code (coherente con ADR-013).

---

## Cuándo revisar

- **Staff account page:** cuando se quiera que el staff gestione su cuenta en el portal admin →
  materializar `/admin/profile` reusando `_shared/account/` (el backend ya sirve).
- **Cambio de email self-service:** cuando se priorice → ADR/flujo de re-verificación.
- **TOTP:** si el supuesto "email seguro" de [ADR-013](./adr-013-2fa-email.md) se rompe (agentes
  externos) → ofrecer TOTP como alternativa (ADR nuevo).
- **Perfiles fiscales:** si se decide hacer cumplir el "máx. 3, uno por tipo" de
  [ADR-060 §A](./adr-060-decisiones-pre-schema.md) → reconciliar modelo + validación.

---

## Referencias

- **Módulos afectados:** `auth` (identidad/seguridad), `clients` (billing-profiles self-service),
  `domains` (registrant, sin cambios), `ui` (`/dashboard/profile`).
- **Reglas relacionadas:** R4 (propagación al registrar capability-routed), R12 (credenciales/sesiones
  hasheadas), R3 (auditar cambios sensibles), R17 (auth en cookies httpOnly — Modelo A).
- **ADRs relacionados:** [ADR-013](./adr-013-2fa-email.md) (2FA email — **Amendment A1 aquí**),
  [ADR-060](./adr-060-decisiones-pre-schema.md) (perfiles fiscales + sesiones),
  [ADR-066](./adr-066-tres-portales-raiz-portalbadge.md) (aislamiento de portales),
  [ADR-078](./adr-078-auth-server-side-cookies-httponly.md) (Modelo A cookies),
  [ADR-062](./adr-062-storage-canonico-minio.md) (avatar a MinIO),
  [ADR-081 A2](./adr-081-plugin-resellerclub-specifics.md) (1 titular WHOIS/cliente).
- **Glosario:** [Perfil fiscal](../00-foundations/glossary.md), [Sesión activa](../00-foundations/glossary.md), [2FA](../00-foundations/glossary.md).
- **Implementación:** (Fase B en adelante) `backend/src/modules/auth/`, `backend/src/modules/clients/`,
  `frontend/app/dashboard/profile/`, `frontend/app/_shared/account/`.
