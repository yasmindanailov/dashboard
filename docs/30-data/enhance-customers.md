# Schema canónico — `enhance_customers`

> Sprint 15C Fase 15C.C — [ADR-083 §2 decisión 7](../10-decisions/adr-083-plugin-enhance-cp-specifics.md) + [Amendment A2](../10-decisions/adr-083-plugin-enhance-cp-specifics.md#amendment-a2-2026-05-08--naming-sql-del-campo-pk-user_id-en-lugar-de-client_id). Tabla dedicada al **mapping** Client Aelium ↔ Customer Org Enhance + cache de identificadores Enhance que optimizan SSO y reconcile. Específica del plugin `enhance_cp` — los demás plugins de provisioning NO la consumen.

---

## Doctrina canónica

- **PK natural `user_id`** (NO UUID extra). El `User` Aelium es la identidad del customer Enhance — añadir un identificador artificial encima duplicaría la identidad funcional ya garantizada por `users.id`. Misma doctrina que `plugin_installs.slug` PK natural ([ADR-080 §2](../10-decisions/adr-080-plugin-framework.md)).

- **Naming SQL `user_id` ≠ doctrina conceptual `client_id`**. La doctrina del proyecto habla de "Client Aelium ↔ Customer Org Enhance" (ver [glossary §Enhance Customer](../00-foundations/glossary.md)). El campo SQL respeta la convención del schema (`user_id` con FK a `users.id`, idéntico a `Session.user_id`/`Service.user_id`/`Setting.user_id`/etc.). Razón completa en [ADR-083 Amendment A2](../10-decisions/adr-083-plugin-enhance-cp-specifics.md#amendment-a2-2026-05-08--naming-sql-del-campo-pk-user_id-en-lugar-de-client_id).

- **Lazy create al primer hosting Enhance del cliente.** NO se crea en alta del User — la mayoría de Users pueden no contratar nunca un hosting Enhance. La creación se dispara desde `EnhanceCustomersService.ensureCustomer()` durante `EnhanceProvisionerPlugin.provision()` ([ADR-083 §2 decisión 8](../10-decisions/adr-083-plugin-enhance-cp-specifics.md)).

- **Idempotencia 3-step con advisory lock cross-process** (`pg_advisory_xact_lock(ns, key)`). Dos jobs BullMQ concurrentes para el mismo `user.id` se serializan; el segundo lee el mapping ya persistido en Step 1. Namespace canónico `ADVISORY_LOCK_NAMESPACE_ENHANCE_CUSTOMERS = 1_500_301` declarado en [`enhance-customers.service.ts`](../../backend/src/plugins/provisioners/enhance_cp/enhance-customers.service.ts) (combinación sprint+componente, NO colisiona con futuros usos del advisory lock).

- **`enhance_owner_login_id` + `enhance_owner_member_id` cacheados** para optimizar el SSO 2-call OTP a 1 sola llamada ([ADR-083 §4 decisión 13](../10-decisions/adr-083-plugin-enhance-cp-specifics.md)). Sin estos campos, cada SSO requeriría `GET /orgs/{cust}` previo para resolver `ownerId/ownerLoginId` antes de `GET /orgs/{cust}/members/{owner}/sso`.

- **NO se persiste la password generada en Step 3.b del provision flow** (R12). Vive solo en memoria durante el flow; Enhance se la entrega al cliente cuando éste resetea con la action `reset_account_password`.

---

## Definición Prisma

```prisma
model EnhanceCustomer {
  user_id                 String   @id @db.Uuid
  enhance_org_id          String   @unique @db.Uuid
  enhance_owner_login_id  String   @db.Uuid
  enhance_owner_member_id String   @db.Uuid
  created_at              DateTime @default(now()) @db.Timestamptz()
  updated_at              DateTime @default(now()) @updatedAt @db.Timestamptz()

  user User @relation("UserEnhanceCustomer", fields: [user_id], references: [id], onDelete: Cascade)

  @@map("enhance_customers")
}
```

Definición real en [`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma) (modelo `EnhanceCustomer` + relación inversa `User.enhance_customer` con nombre canónico `"UserEnhanceCustomer"`).

---

## Definición SQL (post-migración)

```sql
CREATE TABLE "enhance_customers" (
    "user_id"                 UUID         NOT NULL PRIMARY KEY,
    "enhance_org_id"          UUID         NOT NULL,
    "enhance_owner_login_id"  UUID         NOT NULL,
    "enhance_owner_member_id" UUID         NOT NULL,
    "created_at"              TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"              TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enhance_customers_enhance_org_id_key" UNIQUE ("enhance_org_id")
);

ALTER TABLE "enhance_customers"
    ADD CONSTRAINT "enhance_customers_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
```

Migración: [`20260508140000_sprint15c_enhance_customers/migration.sql`](../../backend/prisma/migrations/20260508140000_sprint15c_enhance_customers/migration.sql).

> **Nota sobre índices**: la `UNIQUE` constraint sobre `enhance_org_id` ya crea el índice unique correspondiente — permite búsqueda inversa Enhance → User al recibir eventos del reconcile cron (Fase 15C.H). NO se añade `@@index([enhance_org_id])` redundante.

---

## Bootstrap canónico

**No se seedea.** A diferencia de `plugin_installs` (que sí seedea `internal` + `manual` en `seedPluginInstalls`), `enhance_customers` se llena exclusivamente vía lazy create desde `EnhanceCustomersService.ensureCustomer()` cuando un cliente contrata su primer hosting Enhance.

Patrón canónico de plugins SaaS reales (heredado de [ADR-080 §2](../10-decisions/adr-080-plugin-framework.md)): el seed cubre solo entidades operativas del backend (plugins triviales). Las entidades por-tenant del cliente final se crean on-demand.

---

## Relaciones

| Campo | Apunta a | Notas |
|-------|----------|-------|
| `user_id` (PK + FK) | `users.id` | `ON DELETE CASCADE` — al borrar el User Aelium (RGPD), se borra el mapping. **La cuenta Enhance NO se borra automáticamente** — eso lo gestiona un proceso de retention RGPD separado (Sprint 12.5 Portal Transparencia) que decide si purgar o conservar la cuenta en Enhance por compliance. |
| `enhance_org_id` (UNIQUE) | API Enhance — `Org.id` (no es FK SQL — entidad externa) | Identifica el customer org dentro del Master Org Aelium. |
| `enhance_owner_login_id` | API Enhance — `Login.id` (no FK SQL) | Cacheado para reset password (`PUT /v2/logins/{id}/password`). |
| `enhance_owner_member_id` | API Enhance — `Member.id` (no FK SQL) | Cacheado para SSO 1-call (`GET /orgs/{org}/members/{m}/sso`). |

> **No** hay FK reverse en `Service` — el linkage `Service ↔ enhance_customers` es por `services.user_id = enhance_customers.user_id` (ambos apuntan a `users.id`). Un mismo `EnhanceCustomer` puede tener N `Service` con `provisioner_slug='enhance_cp'` (un cliente con varios hostings).

---

## Operaciones canónicas

| Operación | Quién la dispara | Acción |
|-----------|-----------------|--------|
| `INSERT` Step 1 hit | `EnhanceCustomersService.ensureCustomer()` | (NO inserta — lee la fila existente y retorna) |
| `INSERT` Step 2 (cross-restart recovery) | Idem | Si `searchCustomersByEmail(user.email)` devuelve customer existente en Enhance → INSERT mapping con `enhance_org_id/owner_login_id/owner_member_id` recuperados. |
| `INSERT` Step 3 (first-time provision) | Idem, durante `EnhanceProvisionerPlugin.provision()` | Ejecuta provision flow steps 1-4 (`POST /orgs/{master}/customers`, `POST /logins`, `POST /orgs/{cust}/members`, `PUT /orgs/{cust}/owner`) + INSERT mapping. Steps 5-6 (subscription + website) NO viven aquí — son por-service, no por-customer. |
| `UPDATE` campos `enhance_*` | (futuro Fase 15C.H) `reconcile-enhance-services` cron 6h | Si el reconcile detecta ownership change (admin promueve a otro Owner en Enhance manualmente) → actualiza `enhance_owner_member_id` + `enhance_owner_login_id` + emite `service.reconciled_external_change`. NO modifica `enhance_org_id` (cambiarlo equivale a re-mapping completo — error condition). |
| `DELETE` | Cascada FK al borrar `User` | Aelium NO emite DELETE explícito sobre `enhance_customers` v1. La eliminación física requiere borrar el `User` (RGPD) o SQL manual con justificación documentada. |

---

## Reglas de negocio

| Invariante | Aplicación |
|------------|------------|
| 1 fila por User Aelium con al menos 1 hosting Enhance | Garantizado por PK natural + `findUnique` en Step 1. |
| `enhance_org_id` es único cluster-wide (no 2 Users mapeados al mismo customer Enhance) | UNIQUE constraint enforza. Si el reconcile detectara colisión (caso patológico) → emite alerta superadmin. |
| Lazy create cross-process safe | `pg_advisory_xact_lock(1_500_301, fnv32(user.id))` en Step 0 de `ensureCustomer` (auto-released on tx commit/rollback). |
| `enhance_*_id` son UUIDs validados al insertar | Los IDs los emite Enhance — Aelium los persiste literales tras parse JSON. |
| Cardinalidad acotada por número de clientes Aelium con hosting Enhance | Lazy create — la mayoría de Users NO tienen fila aquí. Tabla pequeña incluso para Aelium escalado a miles de clientes. |

---

## Referencias

- [ADR-083 — Plugin Enhance CP specifics](../10-decisions/adr-083-plugin-enhance-cp-specifics.md) — fuente de verdad de las decisiones del modelo (§2 decisiones 7 + 8 + Amendment A2).
- [ADR-080 — Plugin Framework](../10-decisions/adr-080-plugin-framework.md) — doctrina de PK natural slug, heredada por `enhance_customers`.
- [ADR-082 — Modelo Domain↔Hosting + DNS doctrine](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) — invariante DH-INV-6 (Enhance gana en conflicto operacional) que justifica el reconcile drift detection.
- [`docs/00-foundations/glossary.md`](../00-foundations/glossary.md) — términos canónicos *Enhance Customer*, *Master Org Aelium*, *Customer Org Enhance*, *OTP SSO URL*, *Reconcile drift detection*.
- [`docs/20-modules/_events.md` §🔧 service.\*](../20-modules/_events.md) — eventos `service.admin_sso_impersonation` (Fase F) + `service.reconciled_external_change` (Fase H) consumidores futuros del mapping.
- [`docs/20-modules/provisioning/contract.md`](../20-modules/provisioning/contract.md) §4 — modelos Prisma del módulo (incluido `enhance_customers`).
- Backend:
  - [`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma) — modelo Prisma + relación inversa.
  - [`backend/prisma/migrations/20260508140000_sprint15c_enhance_customers/migration.sql`](../../backend/prisma/migrations/20260508140000_sprint15c_enhance_customers/migration.sql) — migración canónica.
  - [`backend/src/plugins/provisioners/enhance_cp/enhance-customers.service.ts`](../../backend/src/plugins/provisioners/enhance_cp/enhance-customers.service.ts) — service que gestiona el lifecycle (`ensureCustomer` 3-step + `userAdvisoryLockKey` helper).
  - [`backend/src/plugins/provisioners/enhance_cp/enhance.plugin.ts`](../../backend/src/plugins/provisioners/enhance_cp/enhance.plugin.ts) — plugin que invoca el service durante `provision()` + lee `enhance_owner_member_id` durante `getSsoUrl()`.
