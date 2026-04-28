# ADR-067 — Granularidad CASL por rol staff + Subjects nuevos (`NotificationTemplate`, `Job`)

> **Status:** Active
> **Date:** 2026-04-28
> **Domain:** authorization (CASL), cross-cutting
> **Sprint:** 9.6 — split admin/cliente retroactivo (P1.1.6, DC.7)

---

## Contexto

El sistema CASL ya distingue cuatro roles staff en [`backend/src/core/casl/permissions.ts`](../../backend/src/core/casl/permissions.ts):

- `superadmin` — `Manage All` (acceso total).
- `agent_full` — todo excepto `Setting` y `Agent` (con reglas `inverted: true`).
- `agent_billing` — Clientes + Facturación + Tareas + Servicios (read).
- `agent_support` — Clientes (read) + Soporte + Tareas + KB (read).

Los controllers backend aplican `@CheckPolicies(...)` a nivel handler de forma consistente. Cuando un rol no autorizado llama a un endpoint que requiere `Manage.Conversation` (p. ej. `agent_billing` intentando leer tickets), CASL responde 403.

A 2026-04-28 (cierre Sprint 9.5) hay **dos huecos de granularidad** que se difirieron explícitamente a Sprint 9.6:

1. **Plantillas de notificaciones** (`/api/v1/admin/notifications/templates/*`) — Sprint 9.5 §3 registró: "TODOS los staff (`superadmin`, `agent_*`) pueden leer/editar plantillas. Granularidad fina por rol se difiere a **Sprint 9.6** (DC.7) cuando se aplique CASL `Manage.NotificationTemplate` con reglas role-specific". Hoy el control es solo `AdminOnlyGuard` puro (boolean staff vs no-staff).
2. **DLQ — Jobs fallidos** (`/api/v1/admin/jobs/failed/*` + `POST /jobs/:id/retry`) — Sprint 9 Fase F dejó la página `/admin/jobs/failed` accesible a todo staff vía `AdminOnlyGuard`. La operación "reintentar job" tiene impacto operacional (re-ejecuta side effects: emails, PDFs, integraciones) y debe restringirse al rol con visión global.

Ambos casos comparten un patrón: son **operaciones críticas de plataforma** (cambian comportamiento sistémico, no datos de un cliente concreto) que solo el `superadmin` debe ejecutar. El `agent_full` opera sobre datos de negocio (clientes, facturas, tickets), no sobre la configuración de la plataforma.

> **¿Qué pasaría si NO tomáramos esta decisión?** El control sigue siendo binario (staff vs no-staff). Cuando un `agent_billing` se equivoca y reintenta un job de `pdf-generation` que ya está en DLQ por bug en MinIO, dispara reintentos en cadena. Cuando un `agent_support` edita por error la plantilla `invoice.paid`, el copy del email sale roto al próximo cobro. Ninguno de los dos errores tiene auditoría individual del rol — solo "alguien staff lo hizo". La granularidad por rol no es paranoia: es trazabilidad operacional + defense in depth.

---

## Opciones consideradas

### A. Mantener autorización solo con `AdminOnlyGuard`

- Pros: cero cambios. Sigue funcionando.
- Contras: contradice la filosofía CASL del proyecto (granularidad por Subject). Crea inconsistencia: `Setting` ya está restringido a superadmin vía CASL; las plantillas y jobs no, sin razón arquitectónica clara. **Descartado**.

### B. Restringir vía constantes de roles en cada controller (`if (!['superadmin'].includes(slug)) throw...`)

- Pros: simple.
- Contras: imperativo, repite lógica, no centralizado, no auditable. Mismo antipatrón que `ADMIN_ROLES` constant que ya existe en `billing.controller.ts:40` y `support.controller.ts:55` (deuda menor que Sprint 13 Hardening planea consolidar). **Descartado**.

### C. Introducir Subjects CASL nuevos + reglas role-specific ✅ elegido

- Pros: declarativo, centralizado en `permissions.ts`, auditable, testeable, coherente con el patrón canónico del proyecto. Cuando llegue Sprint 13 a colapsar la duplicación frontend/backend de `SIDEBAR_PERMISSIONS`, todo está en una fuente.
- Contras: dos Subjects más en el enum (no es contra real, es ampliar la matriz canónica).

---

## Decisión

### 1. Subjects nuevos en `Subject` enum

```typescript
// backend/src/core/casl/permissions.ts §Subjects

// Notifications & Templates
Notification = 'Notification',
NotificationTemplate = 'NotificationTemplate', // ← NUEVO

// Jobs & DLQ
Job = 'Job', // ← NUEVO
```

### 2. Reglas role-specific

| Subject | superadmin | agent_full | agent_billing | agent_support |
|---------|:----------:|:----------:|:-------------:|:-------------:|
| `NotificationTemplate` | `Manage` | ❌ | ❌ | ❌ |
| `Job` | `Manage` | ❌ | ❌ | ❌ |

`superadmin` ya tiene `Manage All` (regla wildcard) — automáticamente gana acceso. Los demás roles **no obtienen ninguna regla** sobre estos Subjects, por lo que CASL responde `false` en `can(action, subject)` y el guard `PoliciesGuard` retorna 403.

### 3. Aplicación en controllers

```typescript
// backend/src/modules/notifications/notification-templates-admin.controller.ts

@Controller('admin/notifications/templates')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, PoliciesGuard) // defense in depth
export class NotificationTemplatesAdminController {
  @Get()
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.NotificationTemplate))
  findAll(...) {}

  // ... mismo patrón en findOne, update, preview
}
```

```typescript
// backend/src/core/jobs/jobs.controller.ts

@Controller('admin/jobs')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, PoliciesGuard)
export class JobsController {
  @Get('failed')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.Job))
  listFailed(...) {}

  @Post(':id/retry')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.Job))
  retry(...) {}
}
```

### 4. Defense in depth

`AdminOnlyGuard` se mantiene en el stack de guards. La cadena completa por request es:

1. `JwtAuthGuard` — valida JWT y popula `req.user`.
2. `AdminOnlyGuard` — corta clientes/partners (rechazo temprano antes de tocar CASL).
3. `PoliciesGuard` — evalúa `@CheckPolicies` con la `Ability` del usuario.

Las dos primeras capas cubren el "no debería estar aquí". La tercera capa cubre la granularidad fina entre roles staff legítimos. Si algún día se elimina `AdminOnlyGuard` (poco probable), CASL sigue protegiendo igual.

---

## Implicaciones

### Cambios en `SIDEBAR_PERMISSIONS`

`SIDEBAR_PERMISSIONS` define los items que cada rol ve en su Sidebar (filtrado UI, no autorización). Tras este ADR, los Subjects nuevos NO se añaden al array de `agent_full`/`agent_billing`/`agent_support` — es decir, esos roles NO ven los items "Plantillas de notificaciones" ni "Jobs DLQ" en su Sidebar admin (`AdminSidebar.tsx`).

`AdminSidebar.tsx` migra de `allowedRoles: ['superadmin']` hardcoded a `useAbility().can(Action.Manage, Subject.NotificationTemplate)` como fuente de verdad (Sprint 9.6 Fase D). Así Sidebar y backend evalúan la **misma regla CASL** — coherencia.

### Frontend `lib/permissions.ts`

`frontend/app/lib/permissions.ts` es réplica simplificada del backend. Tras este ADR debe sincronizarse: añadir `NotificationTemplate` y `Job` al type `AppModule`, y al array de `superadmin` en `SIDEBAR_PERMISSIONS`. La duplicación entre frontend/backend queda como deuda DC.X (Sprint 13 Hardening colapsará a un endpoint `/api/v1/me/permissions`).

### Mensaje 403 al usuario

CASL devuelve 403 con mensaje genérico. Para los Subjects nuevos, se aprovecha el campo `reason` de `PermissionRule` cuando aplique (no necesario en el caso "ausencia de regla"). El frontend muestra el mensaje del backend (R14 + helper `getErrorMessage(err)`).

### Auditoría

Los intentos de acceso denegado por CASL no se loguean por defecto. Si en el futuro Yasmin requiere auditoría de denegaciones (típico requisito SOC 2 / ISO 27001), se introduce un interceptor `ForbiddenAuditInterceptor` que escriba a `audit_access_log` cuando `PoliciesGuard` lance `ForbiddenException`. Fuera de scope de Sprint 9.6.

---

## Tests requeridos

### Tests unit CASL (`backend/src/core/casl/casl-ability.factory.spec.ts`)

Matriz mínima de aserciones:

```typescript
describe('CaslAbilityFactory — granularidad NotificationTemplate + Job', () => {
  for (const role of ['agent_full', 'agent_billing', 'agent_support']) {
    test(`${role} NO puede Manage NotificationTemplate`, () => {
      const ability = factory.createForUser(userWithRole(role));
      expect(ability.can(Action.Manage, Subject.NotificationTemplate)).toBe(false);
    });
    test(`${role} NO puede Manage Job`, () => {
      const ability = factory.createForUser(userWithRole(role));
      expect(ability.can(Action.Manage, Subject.Job)).toBe(false);
    });
  }
  test('superadmin puede Manage NotificationTemplate', () => {
    const ability = factory.createForUser(userWithRole('superadmin'));
    expect(ability.can(Action.Manage, Subject.NotificationTemplate)).toBe(true);
  });
  test('superadmin puede Manage Job', () => {
    const ability = factory.createForUser(userWithRole('superadmin'));
    expect(ability.can(Action.Manage, Subject.Job)).toBe(true);
  });
});
```

### Tests E2E (`tests/e2e/admin-granular-roles.spec.ts`)

Cubierto en Sprint 9.6 Fase F.4: `agent_full`/`agent_billing`/`agent_support` reciben 403 sobre `/api/v1/admin/notifications/templates` y `/api/v1/admin/jobs/failed`. `superadmin` recibe 200.

---

## Referencias

- [ADR-042](./adr-042-sistema-notificaciones.md) — declaró notificaciones cross-módulo (origen del módulo).
- [ADR-065](./adr-065-notification-channel-plugin-pattern.md) — formalizó plantillas editables (DB + Handlebars).
- [ADR-063](./adr-063-bullmq-canonico-dlq-retries.md) — formalizó DLQ + retries (origen de Jobs UI).
- [ADR-066](./adr-066-tres-portales-raiz-portalbadge.md) — tres portales raíz (Sprint 9.6 Fase C).
- [ADR-068](./adr-068-multi-path-deprecation-headers.md) — aliases REST con Deprecation headers (Sprint 9.6 Fase B).
- [`docs/00-foundations/rules.md`](../00-foundations/rules.md) §Patrones canónicos — actualizado para citar Subjects nuevos.
- [`docs/60-roadmap/current.md`](../60-roadmap/current.md) Sprint 9.6 §F.A — pasos de aplicación.
- [`docs/60-roadmap/backlog.md`](../60-roadmap/backlog.md) DC.7 — deuda cerrada por este sprint.
- Sprint 9.5 §3 (Decisiones registradas) — diferimiento explícito que este ADR cierra.
