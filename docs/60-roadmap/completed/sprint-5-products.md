# Sprint 5 — Products + Role-Aware Dashboard ✅

> **Estado:** ✅ Cerrado

---

## Objetivo

Catálogo de productos dinámico con pricing + sistema PBAC (CASL) que sustituye `RolesGuard` legacy. Cada rol ve estrictamente solo los módulos a los que tiene acceso.

---

## Lo que entregó

### PBAC con CASL ([ADR-012](../../10-decisions/adr-012-pbac-casl.md))
- **Sistema PBAC con `@casl/ability` + `@casl/prisma`**.
- **Ability factory** centralizada en `core/casl/permissions.ts`.
- **Guard `@CheckPolicies()`** reemplaza todos los `@Roles()` (deuda legacy queda hasta Sprint 6).
- **Sidebar role-aware** — consume `PERMISSIONS` para filtrar `NAV_ITEMS` por rol.
- **Manejo de 403 en frontend** — componente "Sin permisos" + redirect.
- **Sidebar responsive mobile** con drawer overlay (<768px).

### Products
- **`ProductsService`** (refactorizado en Sprint 13.R15.6 a fachada + `products-catalog.service.ts`):
  - CRUD productos + activar/desactivar.
  - Lógica de pricing: setup + recurrente + ciclos (con campo `currency` preparado).
  - **Extras de producto** ([ADR-020](../../10-decisions/adr-020-categorias-extras-producto.md)) — obligatorios/opcionales, dominio gratis con anual.
  - **Tipos de producto** ([ADR-019](../../10-decisions/adr-019-configuracion-tipos-producto.md)) — `provisioner_type`, `audit_event_types`, `resource_config`, Docker templates.
- **`ProductsController`:** 13 endpoints (productos, pricing, categorías).
- **Frontend:** catálogo admin, crear/editar producto con pricing + extras + tipo.
- **`docs/features/products/admin.md`**.

### Decisiones de producto consolidadas
- **`hosting_agency` eliminado** ([ADR-024](../../10-decisions/adr-024-eliminacion-hosting-agency.md)) — partners venden los mismos planes con descuento.
- **`we_do_it`** addon vinculable a `hosting_web` y `docker_service` (NO a `support_*`/`custom_service`). **Deprecado** en Sprint 22 ([ADR-022](../../10-decisions/adr-022-wdify-deprecado-proyectos.md)).
- **`custom_service`** = proyectos a escala (ERP, CRM), creación manual.
- **`BillingCycle`:** `monthly`, `quarterly`, `semiannual`, `annual`, `one_time`.

### Edge cases resueltos (hardening)
- EC-1 Slug duplicado en edición → `ConflictException`.
- EC-2 Tipo de producto inmutable.
- EC-3 Último pricing no eliminable (PROD-INV-5).
- EC-4 Flags inmutables auto-set por tipo.
- EC-5 Pricing duplicado por ciclo → validación.
- EC-6 `partner_commission_pct` validado `@Min(0) @Max(100)`.

---

## Mapa de permisos por rol (implementado)

| Módulo | superadmin | agent_full | agent_billing | agent_support | client | partner |
|--------|-----------|-----------|--------------|--------------|--------|--------|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Clientes | ✅ | ✅ | ✅ | ✅ (lectura) | ❌ | lectura propios |
| Productos | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Facturación | ✅ | ✅ | ✅ | ❌ | ✅ propio | lectura clientes |
| Soporte | ✅ | ✅ | ❌ | ✅ | ✅ propio | lectura clientes |
| Tareas | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Settings | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Mi perfil | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Partner | ✅ gestión | lectura | ❌ | ❌ | ❌ | ✅ propio |

---

## Verificación de cierre (auditoría 2026-04-26)

- ✅ `core/casl/permissions.ts` (362 líneas — excepción Regla 15 documentada por ser declarativo).
- ✅ Modelos Prisma: `Product`, `ProductPricing`, `ProductExtra`, `ProductCategory`, `ProductChecklistItem`.
- ✅ 13 endpoints products operativos.
- ✅ Sidebar role-aware funcional.
- ✅ Decisiones documentadas en ADRs 011-024.

**Sin drift detectado.**

**Edge cases pendientes (asignados a sprints futuros):**
- EC-5.1 (Sprint 7+) CASL conditions a nivel de servicio.
- EC-5.2/5.3 (Sprint 6) eliminar legacy `@Roles()`.
- EC-7 a EC-10 (Sprints 6-8) varios.
