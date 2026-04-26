# Sprint 4 — Clients ✅

> **Estado:** ✅ Cerrado

---

## Objetivo

CRM ligero del cliente: ficha completa, notas internas (legacy — luego sustituidas por estructuradas en Sprint 7.H19), datos de facturación múltiples (perfiles personal/autónomo/empresa).

---

## Lo que entregó

- **`RolesGuard`** — autorización por rol en endpoints (legacy — migrado a CASL `@CheckPolicies()` en Sprint 5).
- **Auto-creación de `ClientProfile`** al registrar usuario.
- **Utilidad de paginación** reutilizable (`PaginatedResult`, `PaginationDto`).
- **Modelo `BillingProfile`** + migración Prisma — perfiles fiscales múltiples por cliente ([ADR-060](../../10-decisions/adr-060-decisiones-pre-schema.md)).
- **`ClientsService`** (refactorizado en Sprint 13.R15.7 a fachada + `clients-billing.service.ts`):
  - CRUD clientes con search + paginación.
  - CRUD billing profiles + endpoint default.
  - Notas internas (legacy `client_profiles.notes_internal`).
- **`ClientsController`:** endpoints list, get, update, notes legacy, billing profiles CRUD + default.
- **DTOs** con validación.
- **Frontend:** sidebar/layout dashboard, tabla clientes admin/agente, ficha con tabs.
- **Notificación campana** placeholder visual.
- **`docs/features/clients/admin.md`**.

---

## Decisiones clave

- **Perfiles fiscales múltiples por cliente** ([ADR-060](../../10-decisions/adr-060-decisiones-pre-schema.md)) — `personal` + `autonomo` + `empresa` simultáneos.
- **Sin NIF en perfil personal** → factura simplificada al usar ese perfil.
- **`is_default` UNIQUE PARTIAL** — solo uno por usuario.
- **Auto-creación de `ClientProfile`** al registrar — el usuario nunca está sin profile.
- **Notas internas como texto plano** (legacy) — sustituido por sistema estructurado en Sprint 7.H19 ([ADR-038](../../10-decisions/adr-038-notas-estructuradas-cliente.md)).

---

## Verificación de cierre (auditoría 2026-04-26)

- ✅ Modelos `ClientProfile`, `BillingProfile` en Prisma.
- ✅ 12 endpoints en `clients.controller.ts`.
- ✅ Sub-servicios separados (`clients.service.ts`, `clients-billing.service.ts`).
- ✅ Frontend ficha cliente con tabs operativa.

**Sin drift detectado.**
