# Sprint 3.5 — Auth Hardening ✅

> **Estado:** ✅ Cerrado
> **Sprint origen:** Edge cases de Sprints 1-3.

---

## Objetivo

Cerrar edge cases críticos de auth detectados tras Sprints 1-3 antes de construir Clients/Billing sobre la base.

---

## Lo que entregó

### Backend fixes
- **3.5.1** Email lowercase normalizado en register/login/forgot/resend.
- **3.5.2** Tokens de verificación antiguos invalidados al generar uno nuevo (`used_at = now()`).
- **3.5.3** Tokens de reset antiguos invalidados al solicitar nuevo reset.
- **3.5.4** Welcome email al verificar email (faltaba en Sprint 3).
- **3.5.5** Sanitizar inputs en plantillas HTML (escape de `first_name`).

### Frontend fixes
- **3.5.6** Protección de rutas con middleware/layout.
- **3.5.7** Auto-refresh del access token (interceptor antes de los 15 min).
- **3.5.8** Login "email no verificado" → botón "Reenviar verificación".
- **3.5.9** Confirmar contraseña en registro.
- **3.5.10** Fix double-fire `useEffect` en verify-email (React Strict Mode).
- **3.5.11** Auto-redirect a `/dashboard` si ya logueado.
- **3.5.12** `docs/features/auth/admin.md` actualizado.

---

## Decisiones clave

- **Hardening preventivo** antes de añadir features = base sólida.
- **Patrón de invalidar tokens antiguos** al generar nuevos — luego se generaliza en sprints siguientes.

---

## Verificación de cierre (auditoría 2026-04-26)

- ✅ Cambios reflejados en `auth-recovery.service.ts`, `auth-register.service.ts`.
- ✅ Frontend con interceptor de refresh + protección de rutas activos.
- ✅ Tests E2E pasan tras hardening.
