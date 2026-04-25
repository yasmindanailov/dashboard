# ADR-012 — Autorización con CASL (PBAC isomórfico)

> **Status:** Active
> **Date:** 2026-04 (origen Sprint 5) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §5 (parcial)
> **Domain:** auth, foundation

---

## Contexto

Con 7 roles (ADR-011) y permisos granulares por recurso (cliente solo ve sus facturas, agente_billing no ve soporte, partner solo ve sus clientes referidos), un sistema de **decoradores `@Roles()` hardcodeados** en cada controller se vuelve insostenible:

- Cada endpoint repite la lista de roles permitidos.
- Permisos condicionales (`cliente puede leer SUS facturas, no las de otros`) requieren lógica adicional duplicada.
- El frontend necesita las mismas reglas para filtrar sidebar, ocultar botones, validar formularios. Si están hardcoded en backend, hay drift.

Hace falta un sistema de autorización que sea:

1. **Centralizado:** una sola fuente de verdad para todas las reglas.
2. **Isomórfico:** el mismo motor evalúa permisos en backend y frontend.
3. **Condicional:** soporte `puede actuar SOBRE recursos que cumplan condición X`.
4. **Tipado:** TypeScript valida actions/subjects.
5. **Dinámico futuro:** posibilidad de migrar reglas a BD para gestión sin redeploy.

---

## Opciones consideradas

1. **`@Roles()` decoradores** en cada endpoint.
   - Descartado al final de Sprint 5: imposible de escalar con condiciones.

2. **AccessControl.js** (npm package).
   - Pros: sintaxis declarativa.
   - Contras: ecosistema más pequeño, no isomórfico nativo, no tiene integración con Prisma.

3. **OpenFGA** (Google Zanzibar-style).
   - Pros: máxima granularidad, escalable.
   - Contras: overkill. Requiere servicio externo o auto-host adicional. Curva de aprendizaje significativa.

4. **(Elegida)** **CASL** (`@casl/ability` + `@casl/prisma`).
   - Pros: isomórfico (mismo código en back y front), tipado TS, condiciones declarativas, integración nativa con Prisma para `where` automático, comunidad activa, ya usado por proyectos NestJS de referencia.
   - Contras: la ability factory se vuelve compleja con muchos roles + condiciones. Debugging menos directo que `@Roles()`.

---

## Decisión

Sistema PBAC con CASL (decisión adoptada en Sprint 5).

### Componentes

1. **`backend/src/core/casl/permissions.ts`** — un único archivo que define la matriz: para cada rol, qué `Action` puede hacer sobre qué `Subject`, con qué condiciones.

   ```typescript
   // Ejemplo
   client: (userId: string) => [
     { action: Action.Manage, subject: Subject.Profile },
     // Cliente solo ve facturas suyas
     { action: [Action.Read, Action.List], subject: Subject.Invoice, conditions: { user_id: userId } },
   ]
   ```

2. **`backend/src/core/casl/casl-ability.factory.ts`** — construye la `Ability` del usuario actual a partir de su rol y user.id.

3. **`@CheckPolicies()` decorator + `PoliciesGuard`** — guard que evalúa las policies declaradas en cada endpoint.

   ```typescript
   @Get()
   @UseGuards(JwtAuthGuard, PoliciesGuard)
   @CheckPolicies((ability) => ability.can(Action.List, Subject.Invoice))
   findAll() { ... }
   ```

4. **Frontend** — el JWT incluye el rol; el frontend reconstruye la `Ability` con la misma lógica para filtrar sidebar, rutas accesibles, botones visibles.

### Subjects definidos

`Profile`, `Dashboard`, `Client`, `BillingProfile`, `ClientNote`, `Product`, `ProductCategory`, `Invoice`, `Payment`, `Service`, `Conversation`, `Message`, `Task`, `Maintenance`, `AuditLog`, `Notification`, `Promotion`, `DiscountCode`, `KnowledgeBase`, `ErrorLog`, `Server`, `Partner`, `PartnerClient`, `PartnerNote`, `PartnerTicket`, `PartnerCommission`, `PartnerPayout`, `PartnerLink`, `PartnerUnlink`, `PartnerNotification`, `Referral`, `SupportInside`.

### Actions definidas

`Manage` (comodín), `Create`, `Read`, `Update`, `Delete`, `List`.

### Reglas de uso

1. **Reemplaza completamente** los `@Roles()` decorators (Sprint 5 hizo la migración).
2. **Condiciones soportadas:** lo que CASL permite (igualdad, in, gte, lte, etc.) sobre campos del modelo.
3. **Data isolation no se delega solo a CASL:** el controller filtra explícitamente por `user_id` cuando hace falta (decisión Sprint 6 hardening — algunas conditions se removieron del guard porque CASL conditions no se evalúan automáticamente a nivel servicio sin queries Prisma típicas).
4. **Para el rol `client` y `partner`:** las conditions se aplican; pero **el service también debe validar `req.user.id === resource.user_id`** para defensa en profundidad.
5. **Migración futura a BD:** cuando se priorice, el archivo `permissions.ts` puede generarse desde tabla `permissions` para gestión dinámica desde el dashboard.

---

## Consecuencias

- ✅ **Ganamos:**
  - Una sola fuente de verdad para permisos.
  - Frontend filtra UI usando la misma lógica del backend → cero drift.
  - Conditions declarativas para data isolation.
  - Tipado TS de subjects y actions.
- ⚠️ **Aceptamos:**
  - La ability factory crece con cada rol/subject añadido. Mantener orden con secciones por dominio.
  - **Conditions de CASL no son una garantía absoluta** — el service debe validar también. Defensa en profundidad. Documentado en EC-5.1.
  - Debugging menos directo que `@Roles()`: cuando un endpoint dice "Forbidden", hay que revisar la matriz para saber por qué.
- 🚪 **Cierra:**
  - **No `@Roles()` hardcoded** en endpoints nuevos. Cualquier autorización pasa por CASL.
  - **No lógica de autorización en el controller** (solo `@CheckPolicies()`). La lógica vive en `permissions.ts`.

---

## Cuándo revisar

- Si la matriz de permisos crece a >300 reglas y se vuelve difícil de auditar a ojo: migrar a tabla en BD + UI de gestión para el superadmin.
- Si surgen requisitos de authorization que CASL no cubre (ej: jerarquía dinámica de organizaciones, ABAC complejo): evaluar OpenFGA u otro motor.
- Si `@casl/prisma` deja de mantener compatibilidad con Prisma 7+.

---

## Referencias

- **Módulos afectados:** todos (cada controller usa CASL).
- **Reglas relacionadas:** R5 (no lógica en frontend — pero validación visual de permisos sí), R6 (stateless).
- **ADRs relacionados:** ADR-011 (roles), ADR-013 (2FA), ADR-014 (bloqueo).
- **Glosario:** [CASL](../00-foundations/glossary.md), [Subject](../00-foundations/glossary.md), [Action](../00-foundations/glossary.md), [Permiso](../00-foundations/glossary.md).
- **Implementación:** `backend/src/core/casl/permissions.ts`, `casl-ability.factory.ts`, `policies.guard.ts`.
