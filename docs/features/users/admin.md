# Users Module — Gestión de cuentas de staff (admin)

> Módulo: `users`
> GL-21 (audit 2026-06-25 §6 Tier 3) — cierra el riesgo de hacer altas/bajas de
> agentes únicamente en BD (offboarding manual).
> Estado: ✅ código-completo · acceso **solo superadmin** (CASL `Manage.Agent`).

---

## Resumen

`/admin/users` ("Equipo") permite al **superadmin** gestionar las cuentas internas
(staff/agentes): darlas de alta, cambiar su rol y darlas de baja (offboarding).
El resto de staff (`agent_*`) **no ve** la página ni puede llamar los endpoints
(ADR-067: `Manage.Agent` es exclusivo del superadmin; `agent_full` solo tiene
`Read/List.Agent` para el selector de asignación de tareas).

Las cuentas **nunca se borran físicamente**: la baja es `status=inactive`. Esto
preserva la integridad del historial (tareas asignadas, auditoría y sesiones
referencian `user_id`) y respeta AUTH-INV-7. La baja **revoca todas las sesiones
activas** del agente, por lo que su acceso se corta al instante (el `JwtStrategy`
rechaza los tokens de un usuario `inactive`).

---

## Endpoints de la API

Prefijo `/api/v1`. Triple guard: `JwtAuthGuard → AdminOnlyGuard → PoliciesGuard`.

| Método | Ruta | CASL | Descripción |
|--------|------|------|-------------|
| GET | `/admin/users` | `List.Agent` | Selector de agentes asignables (todo staff). Legacy Sprint 8. |
| GET | `/admin/users/staff` | `Manage.Agent` | Listado de gestión (todos los roles staff, todos los estados). |
| GET | `/admin/users/staff/:id` | `Manage.Agent` | Detalle de una cuenta staff. |
| POST | `/admin/users/staff` | `Manage.Agent` | Alta de cuenta staff. |
| PATCH | `/admin/users/staff/:id` | `Manage.Agent` | Editar nombre y/o rol. |
| PATCH | `/admin/users/staff/:id/status` | `Manage.Agent` | Activar / desactivar (offboarding). |

Roles asignables: `superadmin`, `agent_full`, `agent_billing`, `agent_support`
(`MANAGEABLE_STAFF_ROLES`). Nunca `client`/`partner` — este módulo gestiona
**exclusivamente** cuentas internas.

---

## Flujos

### Alta
1. El superadmin abre "Crear cuenta" e introduce email, nombre, rol y una
   **contraseña inicial** (política igual que el registro: 8+ con mayúscula,
   minúscula y número, bcrypt cost 12).
2. La cuenta se crea `active` + `email_verified_at` (el admin avala al agente).
3. El reto **2FA en login es automático** para roles staff (AUTH-INV-3, 2FA por
   email) — no requiere setup. El agente cambia su contraseña desde su cuenta.

> El flujo de invitación por email (el agente fija su propia contraseña) queda
> como mejora futura, acoplado a SMTP real (audit GL-12).

### Cambio de rol
- Cambia el rol entre los 4 roles staff. **El cambio es inmediato** (cada request
  reevalúa el rol desde BD; no hace falta revocar sesiones).

### Baja / alta operativa (offboarding)
- **Desactivar** (`inactive`): revoca todas las sesiones en la misma transacción.
- **Reactivar** (`active`): vuelve a permitir el login. Una cuenta **anonimizada**
  (RGPD, audit GL-5) nunca se reactiva.

---

## Invariantes de seguridad

| Invariante | Razón |
|---|---|
| Solo `superadmin` (CASL `Manage.Agent`) | Crear/editar cuentas staff es operación de plataforma (ADR-067). |
| No puedes cambiar **tu propio rol** | Evita auto-degradación / auto-bloqueo accidental. |
| No puedes **desactivar tu propia cuenta** | Evita auto-lockout. |
| No se puede degradar ni desactivar al **último superadmin activo** | El sistema siempre conserva una raíz operativa (AUTH-INV-7). |
| Baja = `inactive` + **revocación de sesiones** | El acceso se corta al instante, no al expirar el JWT. |
| **Nunca borrado físico** | Integridad de FKs (tasks/audit/sessions) + retención legal. |
| Todo cambio se **audita (R3)** | `audit_change_log` `entity_type='User'`: `staff_created` / `staff_updated` / `staff_deactivated` / `staff_reactivated`. |

---

## Archivos clave

```
backend/src/modules/users/
  users.controller.ts        ← GET /admin/users + /admin/users/staff/*
  users.service.ts           ← findAgents + listStaff/getStaff/createStaff/updateStaff/setStaffStatus
  users.service.spec.ts      ← invariantes de seguridad (14 tests)
  dto/staff.dto.ts           ← Create/Update/Status/List DTOs + MANAGEABLE_STAFF_ROLES

frontend/app/admin/users/
  page.tsx                   ← Server Component (requireRole superadmin + fetch)
  _actions.ts                ← Server Actions (create / updateRole / setStatus)
  _components/StaffManager.tsx ← tabla + modales (DS components)
  types.ts · staff.module.css
```

## Ref
- [ADR-067](../../10-decisions/adr-067-granularidad-casl-rol-staff.md) — granularidad CASL por rol staff (Subject `Agent`).
- [auth/contract.md](../../20-modules/auth/contract.md) — AUTH-INV-1..9 (identidad, 2FA, roles de sistema).
- audit 2026-06-25 §6 GL-21.
