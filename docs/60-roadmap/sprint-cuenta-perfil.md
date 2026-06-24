# Sprint Cuenta — Página de usuario self-service (perfil + seguridad + facturación)

> **Estado:** 🟢 CÓDIGO-COMPLETO (verde por fase) — rama `sprint-cuenta-perfil`, sobre `master` `497127f`.
> **Falta (Yasmin):** smoke visual (cliente **y** staff) + merge.
> **Doctrina:** [ADR-085](../10-decisions/adr-085-cuenta-cliente-self-service.md) · **Amendment A1 de [ADR-013](../10-decisions/adr-013-2fa-email.md#amendments)** (2FA email opt-in para clientes).
> **Operativa:** [`docs/features/account/client.md`](../features/account/client.md).

Este documento es el registro de trazabilidad del sprint (commit-by-commit + verificación empírica).
El estado vivo está en [`current.md` §Sprint Cuenta](./current.md).

---

## 1. Por qué (el problema, medido)

`/dashboard/profile` ("Mi perfil") era un **MVP de una sola tarjeta**: el editor de titular WHOIS
(`GET/PUT /domains/registrant`, Sprint 15D.G·2). La revisión de esta superficie (2026-06-24) destapó
**cuatro problemas concretos verificados en código**:

1. **La página no era alcanzable.** `Topbar.tsx` tenía el item "Mi perfil" con `onClick: () => {}`
   (no navegaba). Existía la página, pero ningún flujo de UI llevaba a ella.
2. **Editar la identidad estaba acoplado al registrador.** El **único** camino self-service para
   escribir `User.first_name/last_name` + `ClientProfile.*` era `PUT /domains/registrant`, que
   **siempre** propaga el contacto al registrar (`contacts/modify`). Un cliente sin dominios que
   corrige su nombre pasaba, conceptualmente, por un flujo de dominios.
3. **Se exponía el almacén fiscal que no factura.** Facturas/servicios referencian `BillingProfile`
   (`billing_profile_id`), cuyo CRUD era **admin-only**. La página editaba `ClientProfile` (fuente
   del WHOIS). Resultado: los "datos fiscales" que veía el cliente **no eran los que le facturan**.
4. **No existía self-service de cuenta/seguridad.** Faltaba editar nombre/idioma/zona
   (`PATCH /auth/me`), cambiar contraseña autenticado, gestionar 2FA, "cerrar todas las sesiones".

**Decisión Yasmin (2026-06-24):** construir la página de cuenta profesional completa, como sprint
con doctrina, alcance "cuenta completa" (+ confirmó el 2FA opt-in para clientes).

**La arquitectura ya estaba anticipada** (clave para el bajo coste): CASL tenía `Subject.Profile` y
`Subject.BillingProfile` con `Manage` ya concedido al rol `client` (comentario en código:
*"guard allows, controller enforces user_id ownership"*); `ClientsBillingService` ya validaba la
propiedad (`userId`) en cada método; las sesiones ya estaban modeladas ([ADR-060 §B](../10-decisions/adr-060-decisiones-pre-schema.md)).

---

## 2. Doctrina (Fase A)

[ADR-085](../10-decisions/adr-085-cuenta-cliente-self-service.md) — **superficie self-service
self-scoped por el JWT** (deriva `userId` de `req.user.id`, **nunca** de un parámetro de ruta → sin
IDOR), que **desacopla identidad de WHOIS**, reutiliza los servicios ya ownership-safe, y se apoya
en los `Subject.*` ya existentes. Cuatro secciones: **Cuenta · Seguridad · Facturación · Dominios**.

**Amendment A1 de [ADR-013](../10-decisions/adr-013-2fa-email.md#amendments)** — ADR-013 dejaba a los
clientes **sin** 2FA (reduce fricción). Es additivo, no lo contradice: el cliente puede **activar
voluntariamente** 2FA por email (mismo código-por-email ya existente, cero deps); el login dispara el
reto si `role ∈ ROLES_REQUIRING_2FA` **o** `two_factor_enabled`; desactivar está **prohibido** para
roles con 2FA obligatorio.

**Sin migraciones**: todos los campos ya existían en el schema.

---

## 3. Fases (commit-by-commit, con verificación empírica)

| Fase | Commit | Contenido | Verificación |
|------|--------|-----------|--------------|
| **A** Doctrina | `8287635` | ADR-085 + Amendment A1 de ADR-013 + entrada en el índice de ADRs + §Sprint Cuenta en `current.md`. Doc-only. | — |
| **B** Backend | `4d9e4c2` | `AccountController` (`/account/*`) + `AccountBillingController` (`/account/billing-profiles`) + `AuthAccountService` + `auth.constants.ts` (`ROLES_REQUIRING_2FA` compartido) + login honra `two_factor_enabled`. DTOs en `dto/account.dto.ts`. | typecheck 0 · lint:check 0 · **1258 unit / 90 suites** (+10 `auth-account.service.spec`) · **boot smoke**: rutas `/account/*` responden **401** (montadas + guard chain + grafo DI sano, sin `UnknownDependenciesException`). |
| **C** Frontend | `3b885b1` | `/dashboard/profile` en **Tabs** (4 secciones), DS-compliant **CSS Modules** (fin del `style={}` inline del MVP), Server Actions self-scoped (`_actions.ts`), Topbar cableado ("Mi perfil", "Configuración"). `getMe` expone `two_factor_enabled` (additivo). | frontend typecheck 0 · lint:check 0 (`--max-warnings=0`) · backend typecheck 0 · lint:check 0. |
| **D** Cierre | `dc1c87f` | [`docs/features/account/client.md`](../features/account/client.md) + `current.md` (fases ✅, rutas reales). | DoD del sprint verde. |
| **C·2** Fix staff | `ca28c37` | **Bug (Yasmin):** `/dashboard/*` es portal de cliente ([ADR-066](../10-decisions/adr-066-tres-portales-raiz-portalbadge.md)) → el `dashboard/layout` rebota al staff a `/admin`, así que "Mi perfil"→`/dashboard/profile` era **inalcanzable para staff**, y `/admin/profile` no existía. **Fix:** componentes movidos a `_shared/account/` (reuso entre portales) + `AccountView` gana `audience?: 'client'\|'staff'` (staff = Cuenta + Seguridad) + `/admin/profile` (staff) + Topbar enruta "Mi perfil" por rol. | frontend typecheck 0 · lint:check 0 · probe dev: `/admin/profile` y `/dashboard/profile` → **307** (redirect a login sin sesión; compilan, no 404/500), igual que `/admin/settings`. |

**Baseline final medido:** backend **1258 unit · 90 suites · 0 fallos · 12 skipped**; typecheck + lint
verdes (back+front); boot smoke OK.

---

## 4. Contrato producido (rutas, todas self-scoped por JWT)

| Método | Ruta | Semántica | Servicio |
|--------|------|-----------|----------|
| `PATCH` | `/account/profile` | nombre/idioma/zona (NO toca el registrar) | `AuthAccountService.updateMe` |
| `POST` | `/account/change-password` | verifica la actual + **revoca las demás sesiones** | `…changePassword` |
| `POST` | `/account/2fa/enable\|disable` | opt-in email; confirma password; bloqueado para roles obligatorios | `…enable2fa`/`disable2fa` |
| `POST` | `/account/logout-all` | cierra todas las sesiones activas | `…logoutAll` |
| `GET/POST/PATCH/DELETE` | `/account/billing-profiles[/:id][/default]` | CRUD de perfiles de facturación | `ClientsBillingService` (reusado) |

Reutilizados (sin cambios): `GET /auth/me`, `GET/DELETE /auth/sessions[/:id]`, `POST /auth/logout`,
`GET/PUT /domains/registrant`. Las acciones de seguridad se auditan en `audit_access_log` (R3).

---

## 5. Frontend

- **`/dashboard/profile`** (cliente): SC carga `/auth/me` + `/auth/sessions` + `/account/billing-profiles`
  + `/domains/registrant` (los 3 últimos degradan con gracia) → `AccountView` (Tabs).
- **`/admin/profile`** (staff): SC carga `/auth/me` + `/auth/sessions` → `AccountView audience='staff'`
  (Cuenta + Seguridad).
- Componentes reutilizables en **`_shared/account/`** (`AccountView`, `AccountInfoForm`,
  `SecurityPanel`, `BillingProfilesPanel`, `RegistrantForm`, `_actions.ts`, `AccountView.module.css`).
- Topbar enruta "Mi perfil" por rol: staff → `/admin/profile`, cliente/partner → `/dashboard/profile`.

---

## 6. Lecciones / hallazgos empíricos del sprint

- **L — Portales (ADR-066) primero.** Cablear "Mi perfil" a `/dashboard/profile` para todos
  fue el bug: el portal cliente rebota al staff. Cualquier enlace del **Topbar compartido** debe
  ser **consciente del portal/rol**. (Fix C·2.)
- **L — `set-state-in-effect` (DC.6) en formato de fechas.** El "mounted guard"
  (`useEffect(()=>setMounted(true))`) para evitar hydration mismatch **viola** la regla del lint del
  repo. Solución correcta: formatear con **`timeZone` fijo del usuario** → determinista server↔client,
  sin `useEffect` y sin mismatch.
- **L — Sesiones: soft-revoke, no delete.** [ADR-060 §B](../10-decisions/adr-060-decisiones-pre-schema.md)
  dice "borrar la fila al cerrar"; la implementación real (Sprint 13, replay detection) usa
  `is_active=false` + `revoked_reason`. `logout-all`/`change-password` siguen la **implementación**
  (soft-revoke con `revoked_reason='logout_all'`/`'password_changed'`), no el texto literal del ADR.
- **L — `commitlint` scope-enum.** `account` no está en el enum de scopes → usar `auth`/`ui`/`adr`/
  `docs` (sin scope). (Aviso, no error.)
- **Empírico — `ClientsBillingService` ya era ownership-safe** → el self-service de facturación fue
  casi gratis (un controlador self-scoped que pasa `req.user.id`).

---

## 7. Fuera de alcance v1 (diferido consciente)

- **Cambio de email** (requiere round-trip de re-verificación).
- **Subida de avatar** a MinIO ([ADR-062](../10-decisions/adr-062-storage-canonico-minio.md)) — hoy
  fallback a iniciales.
- **Página de "Configuración/Ajustes" del cliente** + **preferencias de notificaciones**: hoy los
  ajustes del cliente viven en "Mi perfil" (idioma/zona/seguridad/facturación); no hay endpoint de
  preferencias de notificaciones. Decisión de producto **parada** (Yasmin, 2026-06-25): el cliente
  **no** tiene ni ve una opción "Configuración" (es superadmin-only → `/admin/settings`).

---

## 8. Definition of Done

**Código:** A→D + fix C·2 verdes · typecheck + lint:check (back+front) · 1258 unit · boot smoke ·
sin migraciones. **Documentación:** ADR-085 + ADR-013 A1 + índice ADR + `features/account/client.md` +
`current.md` + este dossier. **Proceso:** Conventional Commits, rama única con commit por fase.
**Smoke (Yasmin):** editar perfil/contraseña/2FA/sesiones/facturación en el dashboard (cliente) y en
`/admin/profile` (staff) + merge.
