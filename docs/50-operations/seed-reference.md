# Seed reference — base de datos de desarrollo

> Documento canónico de cuentas, datos de muestra y comandos del seed
> de Prisma. Sprint 9.6 Fase F.0 (DC.7) introdujo el seed modular en
> `backend/prisma/seeds/`.

---

## Comando

Desde la raíz del repo o desde `backend/`:

```bash
cd backend && pnpm seed
```

Reseed es **siempre seguro** (idempotente vía `upsert`); no destruye
datos modificados manualmente desde la UI excepto los `password_hash`
de cuentas demo (que se rehashean a las credenciales canónicas
documentadas más abajo).

---

## Salvaguardas profesionales

El seed implementa cuatro salvaguardas para que sea seguro ejecutarlo
en cualquier entorno:

1. **Guard `NODE_ENV !== 'production'`** — los módulos que crean
   datos demo (`test-accounts`, `sample-clients`, `sample-products`,
   `sample-invoices`, `sample-support`) **no corren** si la variable
   `NODE_ENV` está en `production`. La cuenta `superadmin` sí se
   siembra siempre (la necesitamos también para el boot inicial de
   producción).
2. **TLD `.test` (RFC 6761)** — todas las cuentas demo usan dominio
   `.test`, reservado por el IETF. No resuelve en internet, imposible
   que los emails de seed lleguen a inboxes reales.
3. **Override por env vars** — todas las passwords son configurables
   vía `SEED_*_PASSWORD` (`SEED_AGENT_FULL_PASSWORD`,
   `SEED_CLIENT_PASSWORD`, etc.) sin necesidad de tocar el repo.
4. **Markers `metadata.seeded = true` y `notes = 'SEED_DEMO'`** —
   cada usuario, cliente, factura y conversación creada por el seed
   lleva un marker. Permite que un futuro `pnpm seed:clean`
   (planificado en Sprint 14 pre-deploy) borre selectivamente lo demo
   sin tocar datos reales.

---

## Cuentas canónicas

Cada `pnpm seed` crea / actualiza estas 7 cuentas. Una por cada rol
del sistema (`RoleSlug`), con credenciales conocidas para que el
desarrollo y los tests E2E puedan validar inmediatamente cada portal
y cada granularidad CASL.

| Rol | Email | Password | Email override | Password override |
|-----|-------|----------|----------------|-------------------|
| `superadmin` | `admin@aelium.net` | `AeliumDev2026!` | `SUPERADMIN_EMAIL` | `SUPERADMIN_PASSWORD` |
| `agent_full` | `agent.full@aelium.test` | `AgentFull2026!` | — | `SEED_AGENT_FULL_PASSWORD` |
| `agent_billing` | `agent.billing@aelium.test` | `AgentBilling2026!` | — | `SEED_AGENT_BILLING_PASSWORD` |
| `agent_support` | `agent.support@aelium.test` | `AgentSupport2026!` | — | `SEED_AGENT_SUPPORT_PASSWORD` |
| `client` | `cliente@aelium.test` | `Cliente2026!` | — | `SEED_CLIENT_PASSWORD` |
| `partner` | `partner@aelium.test` | `Partner2026!` | — | `SEED_PARTNER_PASSWORD` |
| `partner_pending` | `partner.pending@aelium.test` | `Partner2026!` | — | `SEED_PARTNER_PENDING_PASSWORD` |

Todas se siembran con `status: active` y `email_verified_at: now()`,
lo que permite login inmediato sin pasar por flujo de verificación.
Dos casos especiales:

- **`partner_pending`**: rol que existe en el enum pero el módulo
  Partner se implementa en **Sprint 19**. La cuenta se crea ahora como
  placeholder; CASL le asigna sólo `Manage Dashboard` + `Manage
  Profile` ([backend/src/core/casl/permissions.ts](../../backend/src/core/casl/permissions.ts)).
- **`superadmin`**: requiere 2FA al login (rol en `ROLES_REQUIRING_2FA`).
  El código se envía a Mailpit (`http://localhost:8025`) en dev. Para
  smoke manual rápido, pulsar el botón "Sin 2FA" si está disponible o
  usar `agent_full` (sin 2FA) que tiene casi todos los permisos.

---

## Datos de muestra (sólo dev/CI)

`pnpm seed` también puebla la base de datos con un volumen mínimo
profesional para que el smoke manual y los tests E2E tengan datos
reales contra los que validar la UX divergente entre `/admin/*` y
`/dashboard/*`.

### Clientes (3 totales)

- `cliente@aelium.test` (Carla Cliente Demo) — el cliente principal
  del que cuelgan facturas y tickets demo.
- `maria.perez@aelium.test` (María Pérez, B2C, Madrid).
- `contacto@acme-demo.test` (Acme Solutions S.L., B2B, Barcelona).

Cada uno con su `client_profile` y `billing_profile` completos. Los
dos adicionales solo cumplen rol "tener >1 cliente en
`/admin/clients`" para validar paginación / búsqueda.

### Productos (2 totales)

| Slug | Tipo | Pricing | Notas |
|------|------|---------|-------|
| `hosting-pro` | `hosting_web` | mensual 12 € · trimestral 34,20 € (5%) · anual 115,20 € (20%) | Producto principal del catálogo, badge "Recomendado" |
| `support-inside-basic` | `support_inside` (addon global) | mensual 19 € | Addon para validar UX de addons en checkout |

### Facturas (2 totales — del cliente principal)

| Número | Estado | Total | Fechas |
|--------|--------|-------|--------|
| `INV-DEMO-0001` | `paid` | 14,52 € | Pagada hace 23 días, vencía hace 23 días |
| `INV-DEMO-0002` | `pending` | 22,99 € | Vence en 7 días |

Permiten validar:

- `/admin/billing` con tabs Pagadas / Pendientes y columna Cliente.
- `/dashboard/billing` UX cliente (sin columna Cliente, sin acciones
  admin, mismo set de datos).

### Conversaciones (2 totales — del cliente principal)

| Tipo | Asunto | Estado | Categoría |
|------|--------|--------|-----------|
| `ticket` | `[SEED] No me llega la factura mensual por email` | `waiting_agent` | `support_billing` |
| `chat` | `[SEED] Consulta sobre cambio de plan` | `open` | `support_general` |

Permiten validar:

- `/admin/support` con tab "Esperando agente" no vacío.
- `/admin/support/chats` con un chat en bandeja.
- `/admin/support/[id]` con sidebar contexto cliente cargado.
- `/dashboard/support` versión cliente.

---

## Estructura del seed (Sprint 9.6 Fase F.0)

```
backend/prisma/
├── seed.ts                            ← orquestador
└── seeds/
    ├── roles.ts                       ← 7 roles del enum RoleSlug
    ├── settings.ts                    ← settings canónicos categorizados
    ├── plugin-installs.ts             ← bootstrap plugins triviales (Sprint 15A)
    ├── sample-enhance-plugin-install.ts ← plugin install enhance_cp dev/QA (Sprint 15C Fase J)
    ├── notification-templates.ts      ← plantillas Handlebars
    ├── support-inside-plans.ts        ← 3 planes canónicos Support Inside (Sprint 8 D)
    ├── test-accounts.ts               ← 1 cuenta por rol + guard NODE_ENV
    ├── sample-clients.ts              ← 2 clientes + billing profiles
    ├── sample-products.ts             ← 2 productos + pricing rows
    ├── sample-invoices.ts             ← 2 facturas + items
    ├── sample-support.ts              ← 1 ticket + 1 chat con mensajes
    ├── sample-support-inside.ts       ← subscription Support Inside Carla
    └── sample-client-notes.ts         ← 2 notas demo (Sprint 16)
```

### Seed dev/QA del plugin install Enhance CP (Sprint 15C Fase 15C.J)

`seedSampleEnhancePluginInstall` materializa el segundo objetivo de la
Fase J: pre-crear `plugin_installs.slug='enhance_cp'` con `enabled=true`
+ secrets cifrados, sin requerir que el admin pase por
`/admin/settings/plugins` en cada `pnpm seed`. DX para QA/staging/dev.

**Activación condicional** (4 condiciones AND, ambigüedad A3 resuelta
2026-05-09):

1. `NODE_ENV !== 'production'` (skip silencioso en producción).
2. `process.env.ENHANCE_DEV_BASE_URL` no vacía (tras trim).
3. `process.env.ENHANCE_DEV_MASTER_ORG_ID` no vacía (tras trim).
4. `process.env.ENHANCE_DEV_API_TOKEN` no vacía (tras trim).

Si alguna falta → log info "ENHANCE_DEV_* env vars incompletas — saltando
enhance_cp plugin install" + skip. NO crea fila vacía con `enabled=false`
(anti-patrón: confunde al admin viendo la UI de plugins y no aporta DX).

**Encrypt del apiToken**: el seed instancia `SecretVaultService`
([backend/src/core/security/secret-vault.service.ts](../../backend/src/core/security/secret-vault.service.ts))
con un shim `ConfigService` que delega a `process.env.ENCRYPTION_KEY`.
Mismo algoritmo AES-256-GCM ([ADR-080 §3](../10-decisions/adr-080-plugin-framework.md))
que el backend en runtime — el blob cifrado por el seed es descifrable por
el plugin tras boot. Verificado por spec con round-trip real.

**Idempotente**: si la fila `plugin_installs.slug='enhance_cp'` ya existe
(admin la creó vía UI o seed previo) → preserved (NO sobreescribe). Loguea
"preserved (existing — admin config wins)".

```bash
# .env (dev/QA):
ENHANCE_DEV_BASE_URL=https://enhance.lab.aelium.net
ENHANCE_DEV_MASTER_ORG_ID=00000000-0000-0000-0000-00000000aaaa
ENHANCE_DEV_API_TOKEN=eyJhbG...

# pnpm seed:
🌱 Seeding database...
  ...
  📦 plugin_installs: 0 created, 2 preserved.
  📦 enhance_cp plugin install: created (enabled=true, baseUrl=https://enhance.lab.aelium.net)
  ...
✅ Seed completed
```

En producción la fila `enhance_cp` se crea desde la UI admin con secrets
cifrados (mismo `SecretVaultService` runtime — blob format compatible).

Cada módulo es **self-contained** y se ejecuta de forma independiente.
Para añadir un nuevo bloque de datos demo:

1. Crear `backend/prisma/seeds/sample-<dominio>.ts` con función
   exportada `seedSample<Dominio>(prisma)`.
2. Aplicar guard `NODE_ENV !== 'production'` y marker
   `metadata.seeded = true` (o equivalente).
3. Garantizar idempotencia (`upsert` por unique natural o
   `findFirst + create-if-not-exists`).
4. Importar y llamar en `backend/prisma/seed.ts` orquestador, en el
   orden correcto de FKs.
5. Documentar el nuevo set en este archivo.

---

## Flujo de uso típico en desarrollo

```bash
# 1. Levantar infra dev
docker compose -f docker/docker-compose.dev.yml up -d

# 2. Aplicar migraciones Prisma
cd backend && pnpm prisma migrate deploy

# 3. Seed
pnpm seed

# 4. Backend dev
pnpm dev

# 5. Frontend dev (en otra terminal)
cd ../frontend && pnpm dev

# 6. Login con cualquier cuenta canónica de la tabla anterior.
#    Ej: agent.billing@aelium.test / AgentBilling2026!
#    → landing en /admin con sidebar reducido (Clientes, Facturación, Tareas).
```

---

## Política de cuentas en producción

Cuando Sprint 14 (Deploy real) se ejecute:

- Se ejecutará `pnpm seed` con `NODE_ENV=production`. Eso solo crea
  roles, settings, plantillas de notificaciones, y la cuenta
  superadmin (con `SUPERADMIN_PASSWORD` desde el secret manager).
- Las cuentas `*.test` y los `sample-*` **NO se crean**. El guard
  `NODE_ENV !== 'production'` lo impide.
- Si por error alguien copia una DB de dev a producción sin limpiar:
  pre-deploy hook del Sprint 14 ejecutará `pnpm seed:clean` (a
  implementar) que borra todo lo marcado `metadata.seeded = true`.

---

## Referencias

- [`backend/prisma/seed.ts`](../../backend/prisma/seed.ts) — orquestador.
- [`backend/prisma/seeds/`](../../backend/prisma/seeds/) — módulos individuales.
- [`docs/00-foundations/rules.md`](../00-foundations/rules.md) §R3, R12 — reglas de
  manejo de credenciales y datos sensibles.
- [`docs/10-decisions/adr-067-granularidad-casl-rol-staff.md`](../10-decisions/adr-067-granularidad-casl-rol-staff.md)
  — qué subjects ve cada rol al hacer login con la cuenta correspondiente.
- [`docs/60-roadmap/current.md`](../60-roadmap/current.md) Sprint 9.6 Fase F.0 — registro
  del cambio.
