# ADR-011 — Roles del sistema (7 roles fijos inmutables)

> **Status:** Active
> **Date:** 2026-04 (origen) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §5 (parcial)
> **Domain:** auth

---

## Contexto

El dashboard sirve a 4 audiencias distintas (superadmin, agentes, clientes finales, partners) con permisos muy diferentes. Hace falta un modelo de roles que:

1. Sea claro y limitado (no proliferación de roles ad hoc).
2. Soporte agentes con acceso parcial (solo billing, solo soporte) sin tocar configuración global.
3. Distinga al partner del cliente final (diferente UX, diferentes permisos).
4. No permita escalar privilegios accidentalmente.

---

## Opciones consideradas

1. **Roles dinámicos** definidos por el superadmin desde el dashboard.
   - Pros: flexibilidad máxima.
   - Contras: el código tiene que asumir cualquier rol → permisos hardcoded basados en nombres se rompen. Demasiada complejidad para un negocio con jerarquía estable.

2. **Solo dos roles** (admin / cliente) con flags para todo lo demás.
   - Pros: simplísimo.
   - Contras: no separa agente_billing de agente_support. Cualquier feature parcial requiere más lógica condicional.

3. **(Elegida)** **7 roles fijos inmutables** del sistema, definidos en seed con `is_system: true`. Permisos detallados se gestionan vía CASL (ADR-012).
   - Pros: claridad. El sistema sabe exactamente con quién trata. CASL añade granularidad sobre los roles.
   - Contras: añadir un rol nuevo requiere migración + ADR.

---

## Decisión

7 roles del sistema, todos `is_system: true` en tabla `roles` (no editables ni borrables desde la UI):

| Slug | Audiencia | Acceso |
|------|-----------|--------|
| `superadmin` | Dueño del sistema | **Todo.** Configuración global, productos, agentes, infra. Único que puede cambiar settings críticos. |
| `agent_full` | Agente con acceso amplio | Soporte + facturación + clientes + tareas. **Sin** configuración del sistema (settings, productos). |
| `agent_billing` | Agente especializado en facturación | Facturas, pagos, clientes, tareas. **Sin** soporte ni configuración. |
| `agent_support` | Agente especializado en soporte | Chat, conversaciones, tickets, historial cliente, tareas. **Sin** facturación ni configuración. |
| `client` | Cliente final de Aelium | Su propio dashboard: sus servicios, sus facturas, sus conversaciones. Solo lectura sobre cosas de Aelium (catálogo). |
| `partner_pending` | Partner registrado, pendiente de aprobación | Solo perfil propio editable. Dashboard bloqueado hasta aprobación manual del admin. |
| `partner` | Partner aprobado (agencia) | Sus clientes referidos (solo lectura), sus facturas con Aelium, sus comisiones, sus tickets a clientes. |

### Reglas

1. **Auth unificado.** Un único endpoint de login para todos los roles. La ruta `/admin` no existe públicamente — el rol determina qué se ve.
2. **`superadmin` solo se asigna desde la base de datos directamente.** Nunca desde la UI. Esto evita escalada accidental o intencional.
3. **Los agentes no pueden escalar sus propios permisos.** El cambio de rol cliente → agente solo lo hace el superadmin manualmente.
4. **2FA obligatorio** para todos los roles privilegiados (`superadmin`, `agent_*`). Implementación en ADR-013.
5. **`is_system: true`** en seed. La tabla `roles` puede tener roles dinámicos en el futuro (`is_system: false`), pero los 7 actuales son inmutables.

### Diferencia partner vs partner_pending

`partner_pending` es estado intermedio entre registro y aprobación. El partner registrado ve un dashboard bloqueado con texto "Tu solicitud está siendo revisada" y solo puede completar datos de la agencia. Tras aprobación manual del admin, el rol cambia a `partner` y el dashboard se desbloquea. Detalle del flow en ADR-049.

---

## Consecuencias

- ✅ **Ganamos:**
  - Modelo claro: 7 roles, sin proliferación.
  - Cada rol tiene UX diferenciada (sidebar role-aware + permisos CASL).
  - El superadmin no puede ser creado desde la UI → escalada accidental imposible.
- ⚠️ **Aceptamos:**
  - Si un rol nuevo se necesita en el futuro → migración Prisma + ADR + actualización del seed. No es trivial.
  - Casos edge: un partner que también es cliente directo de Aelium tiene **dos cuentas separadas**, vinculables (ADR-053). No se reusa la misma cuenta porque mezclaría permisos.
- 🚪 **Cierra:**
  - **No roles dinámicos creados desde UI** en el corto plazo.
  - **No tabla de `permissions` granular en BD.** Los permisos viven en código (CASL ability factory) — ADR-012.

---

## Cuándo revisar

- Si el negocio crece y aparecen sub-roles necesarios (ej: "billing readonly", "support viewer"), antes de añadirlos hardcoded → evaluar si tabla de permisos dinámicos es necesaria.
- Si un cliente B2B necesita su propio sistema de roles internos: evaluar si ese caso justifica multi-tenancy o sigue siendo un caso del rol `client` con configuración adicional.

---

## Referencias

- **Módulos afectados:** auth (define roles), todos los demás (CASL los usa).
- **Reglas relacionadas:** ninguna directa; conecta con la matriz de permisos en cada `contract.md`.
- **ADRs relacionados:** ADR-012 (JWT + sesiones), ADR-013 (2FA), ADR-049 (onboarding partner), ADR-050 (permisos partner).
- **Glosario:** [Rol](../00-foundations/glossary.md), [Sesión](../00-foundations/glossary.md).
- **Implementación:** `backend/prisma/schema.prisma` (enum RoleSlug), `backend/prisma/seed.ts` (creación), `backend/src/core/casl/permissions.ts` (matriz).
