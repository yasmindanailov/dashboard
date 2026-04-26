# ADR-049 — Roles y onboarding del partner (semi-automático)

> **Status:** Active (planificada — Fase 2)
> **Date:** 2026-04 · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §35 (auth + onboarding)
> **Domain:** partner, auth

---

## Contexto

El partner (ADR-048) accede al mismo sistema de auth que clientes y agentes (mismo login, misma URL). Pero la **experiencia del dashboard** y los **permisos** son completamente distintos: el partner ve sus clientes, sus comisiones, su facturación con Aelium — no ve el catálogo administrativo, ni la configuración del sistema, ni clientes de otros partners.

Tres preguntas clave:

1. **¿Cómo distinguir un partner de un cliente o agente** sin duplicar el sistema de auth?
2. **¿Cómo se da de alta** un partner sin que cualquiera pueda registrarse y empezar a vender?
3. **¿Cómo se le restringe** el dashboard hasta que el admin lo apruebe?

La opción de "self-service total" (cualquiera se registra como partner y empieza) abre la puerta a abuso. La opción de "alta 100% manual por email" no escala. Solución: **onboarding semi-automático** — registro vía formulario, verificación de email, dashboard bloqueado hasta aprobación manual del admin.

---

## Decisión

### Roles nuevos

Se añaden **dos roles** al sistema (ADR-011 — los roles son inmutables y `is_system: true`):

| Rol | Significado | Acceso al dashboard |
|-----|-------------|---------------------|
| `partner_pending` | Registrado y email verificado · pendiente de aprobación manual | **Bloqueado** — solo puede completar su perfil |
| `partner` | Aprobado · acceso completo al dashboard partner | Completo (con permisos del partner, ADR-050) |

Estos roles **conviven** con los roles existentes (cliente, agente, admin, superadmin) — un usuario tiene un único rol.

### Mismo sistema de auth, misma URL de login

- **Una sola pantalla de login** para todos los roles (ADR-059 auth layout).
- El sistema detecta el rol al autenticar y redirige al dashboard correspondiente:
  - `client*` → `/dashboard` (vista cliente).
  - `agent*` / `admin*` / `superadmin` → `/dashboard` (vista agente con permisos según rol).
  - `partner_pending` → `/dashboard/partner/pending` (pantalla informativa).
  - `partner` → `/dashboard/partner` (vista partner completa).

### Flujo de onboarding semi-automático

```
1. Partner se registra desde la landing con datos adicionales:
   - Nombre de la agencia
   - CIF
   - Web
   - Volumen estimado de clientes (orientativo)

2. Verifica email → entra al dashboard con rol partner_pending
   Dashboard bloqueado · solo puede completar su perfil
   (datos de pago / payout, datos fiscales, web/branding propio)

3. Admin recibe notificación: "Nueva solicitud de partner"
   Puede revisar datos · contactar · pedir documentación adicional

4. Admin aprueba manualmente
   → Rol cambia a partner
   → Se genera enlace de registro personalizado (`partners.referral_code`)
   → Partner recibe email de activación
   → Dashboard completamente desbloqueado

5. Si se rechaza:
   → Partner recibe email con motivo
   → Estado: rejected · puede volver a solicitar
```

### Datos del partner (tabla `partners`)

```
id, user_id (FK), agency_name, cif, website, estimated_volume,
status (pending | active | rejected | suspended),
referral_code (string único, generado al aprobar),
payout_method (iban | stripe_connect),
payout_details (jsonb, encriptado si tiene credenciales),
linked_client_discount_pct (ADR-053),
created_at, approved_at, rejected_at, rejection_reason
```

### Restricciones del dashboard `partner_pending`

- Solo puede acceder a `/dashboard/partner/profile` para completar datos.
- No puede acceder a `/dashboard/partner/clients` (no tiene clientes asignados aún).
- No puede acceder a `/dashboard/partner/commissions` ni `/dashboard/partner/payouts`.
- El módulo `partner` valida el rol en cada endpoint via guard NestJS (PBAC con CASL, ADR-012).

### Aprobación manual

- El admin ve la cola de solicitudes en `/dashboard/admin/partners/pending`.
- Puede ver datos enviados, navegar a la web declarada, contactar via ticket o email externo.
- Aprobar = transición de rol `partner_pending` → `partner` + generación de `referral_code` + email automatizado de activación.
- Rechazar = transición a `rejected` + email con motivo.
- **Auditado** en `audit_change_log` (R3, ADR-017).

### Re-solicitud tras rechazo

- Estado `rejected` permite volver a solicitar.
- Implementación: pantalla específica para usuarios `rejected` con CTA "Solicitar de nuevo" — limpia campos editables y vuelve a estado `pending`.
- Histórico de rejections se conserva (R3 — solo INSERT en `audit_change_log`).

---

## Consecuencias

- ✅ **Ganamos:**
  - Filtro humano evita partners que abusan o no encajan (sector incompatible, datos incompletos, calidad dudosa).
  - El partner tiene experiencia clara desde el día 1 — sabe que está pendiente de aprobación, no se confunde.
  - Un solo sistema de auth — sin duplicar login, sin URLs raras.
  - Roles inmutables + guards centralizados → permisos coherentes.
- ⚠️ **Aceptamos:**
  - **Aprobación manual no escala** sin más a 100+ solicitudes/semana. Mitigación: aceptable hoy (Fase 2 inicial); revisar (ADR-048) si se vuelve cuello de botella.
  - Tiempo de aprobación = fricción para el partner. Mitigación: SLA interno para revisar en <48h.
  - El admin necesita criterios claros para aprobar/rechazar — riesgo de inconsistencia entre admins. Mitigación: documentar criterios en `docs/50-operations/partner-onboarding.md` (futuro F5).
- 🚪 **Cierra:**
  - **No registro como `partner` directo.** Siempre pasa por `partner_pending` y aprobación manual.
  - **No cambiar de rol cliente → partner directamente** sin pasar por el flujo de aprobación. El cliente que quiere ser partner se registra de nuevo (ADR-053 cubre la vinculación de ambas cuentas).

---

## Cuándo revisar

- Si la cola de aprobación crece > 20 pendientes sostenido → automatizar parcialmente con scoring (ej: web válida + CIF válido + sector aceptado → pre-aprobación).
- Si los rechazos generan apelaciones recurrentes → considerar proceso de review más formal.
- Si se identifica patrón de abuso (registros falsos para acceder al sistema) → reforzar verificación (CIF contra registro mercantil, etc.).

---

## Referencias

- **Módulos afectados:** partner, auth (registro y validación), users (rol).
- **Reglas relacionadas:** R3 (audit log de cambios de rol), R12 (permisos / PBAC).
- **ADRs relacionados:** ADR-048 (modelo partner), ADR-011 (roles del sistema — añade dos), ADR-012 (PBAC con CASL — guards), ADR-013 (2FA — el partner es rol privilegiado, requiere 2FA), ADR-050 (permisos del partner), ADR-053 (vinculación cuenta cliente — caso especial), ADR-059 (auth layout — login único).
- **Glosario:** [Partner](../00-foundations/glossary.md), [Onboarding](../00-foundations/glossary.md), [Rol](../00-foundations/glossary.md).
- **Implementación pendiente:** módulo `partner`, módulo `users` (extensión de roles).
