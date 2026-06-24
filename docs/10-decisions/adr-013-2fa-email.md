# ADR-013 — Autenticación de doble factor (2FA) por email

> **Status:** Active
> **Date:** 2026-04 (origen Sprint 1) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §5 (parcial)
> **Domain:** auth, security

---

## Contexto

Las cuentas con privilegios (superadmin, agentes) tienen acceso a datos sensibles (facturas de clientes, datos personales, panel de soporte con conversaciones, configuración del sistema). Una contraseña filtrada compromete todo el sistema.

Aelium necesita 2FA al menos para roles privilegiados, y debe ser:

1. **Obligatorio** para superadmin y todos los `agent_*`. No opcional.
2. **Sin dependencias adicionales** del cliente: no se puede asumir que cada agente tenga smartphone con Google Authenticator instalado.
3. **Recuperable:** si el agente pierde el dispositivo de 2FA, debe poder volver a entrar (escalación al superadmin).
4. **Bajo coste de implementación.**

---

## Opciones consideradas

1. **TOTP (Google Authenticator / Authy / etc.)** con QR.
   - Pros: estándar de la industria, sin dependencia de email.
   - Contras: requiere app instalada en cada agente. Si pierde el dispositivo, recuperación dolorosa. Más UX para enrolar (mostrar QR, validar código inicial).

2. **WebAuthn / Passkeys.**
   - Pros: máxima seguridad, sin contraseña en algunos flows.
   - Contras: bleeding edge en 2026, soporte de navegadores irregular. Recovery flow complejo.

3. **SMS.**
   - Pros: simple para usuarios.
   - Contras: SIM swapping es vector real, coste por SMS, no funciona en todos los países sin esfuerzo. Aelium no quiere depender de un proveedor SMS.

4. **(Elegida)** **Código por email** de 6 dígitos numéricos, TTL configurable.
   - Pros: cero dependencia adicional (los agentes ya tienen email). Recuperación = mismo email. Coste cero. Simple de enrolar (cero enrolment, automático en login).
   - Contras: si el email se compromete, 2FA se compromete. Acepta el trade-off porque el email del agente es de Aelium con su propio 2FA del proveedor (Google Workspace, etc.).

---

## Decisión

**2FA por email obligatorio para roles privilegiados.**

### Flujo

```
1. Usuario submite email + password en /auth/login
2. Si rol ∈ ROLES_REQUIRING_2FA → backend NO emite tokens.
   Genera código aleatorio 6 dígitos numéricos.
   Hash del código se guarda en User.two_factor_secret (no en plain).
   Envía email con el código (template twoFactorCodeTemplate).
   Devuelve { requires_2fa: true, temp_token } al frontend.
3. Frontend cambia step → '2fa'. Muestra input de 6 dígitos.
4. Usuario submite el código en /auth/verify-2fa con el temp_token.
5. Backend valida:
   - temp_token JWT válido (type: 'temp_2fa', userId).
   - El hash del código submitido coincide con User.two_factor_secret.
   - El temp_token no está expirado (5 minutos default).
6. Si OK → emite access_token + refresh_token (sesión completa).
7. Borra User.two_factor_secret (un código = un solo uso).
```

### Roles que requieren 2FA

```typescript
const ROLES_REQUIRING_2FA: RoleSlug[] = [
  RoleSlug.superadmin,
  RoleSlug.agent_full,
  RoleSlug.agent_billing,
  RoleSlug.agent_support,
];
// Quedan SIN 2FA: client, partner, partner_pending
```

> **Decisión consciente:** clientes y partners no requieren 2FA. Reduce fricción del onboarding. Aceptamos el trade-off porque sus permisos son acotados (solo sus propios datos).

### Configuración

Settings configurables (categoría `auth`):

| Key | Default | Descripción |
|-----|---------|-------------|
| `two_factor_code_expires_minutes` | 5 | TTL del código 2FA |

### Recuperación

Si un agente pierde acceso al email:

1. Solicita al superadmin reset manual.
2. Superadmin desde la UI de admin: "Reset 2FA" → borra `two_factor_secret`. El próximo login genera código nuevo en el email actual del usuario.
3. Si el email del agente está comprometido: superadmin cambia el email del agente desde `users` table directamente (decisión consciente: no exponer este flujo en UI por superficie de ataque).

---

## Consecuencias

- ✅ **Ganamos:**
  - 2FA real con cero dependencias adicionales.
  - Si la password de un agente se filtra, atacante necesita además acceso al email para entrar.
  - UX simple: el usuario no enrola nada. Funciona desde el primer login.
- ⚠️ **Aceptamos:**
  - Si el email del agente es comprometido, 2FA es vulnerado. Mitigación: emails corporativos en proveedor con 2FA propio (Google Workspace).
  - El email puede tardar en llegar (segundos o minutos) → UX degrada vs TOTP instantáneo. Aceptable para uso interno.
  - Phishing: un atacante puede engañar al usuario para que revele el código. Mitigación parcial: el subject del email lo deja claro ("`<code> — Código de verificación Aelium`") y el flujo de login dice exactamente que pidió el código.
- 🚪 **Cierra:**
  - **No TOTP** en esta versión. Si más adelante se quiere ofrecer como alternativa, requiere ADR nuevo y migration.
  - **No SMS** como segundo factor — coste y SIM swapping.

---

## Cuándo revisar

- Si Aelium contrata agentes externos (no de Aelium con email corporativo) y el supuesto "email seguro" se rompe → considerar TOTP como alternativa opcional.
- Si surge un incidente real de cuenta comprometida pese al 2FA email → revisar.
- Si Passkeys se vuelven mainstream y hay soporte universal de navegadores → ofrecer como alternativa.

---

## Referencias

- **Módulos afectados:** auth.
- **Reglas relacionadas:** R7 (errores notificados), R12 (credenciales encriptadas).
- **ADRs relacionados:** ADR-011 (roles), ADR-012 (CASL), ADR-014 (bloqueo intentos).
- **Glosario:** [2FA](../00-foundations/glossary.md), [Sesión](../00-foundations/glossary.md).
- **Implementación:** `backend/src/modules/auth/auth-login.service.ts:initiate2fa()`, `verify2fa()`, plantilla `twoFactorCodeTemplate`.

---

## Amendments

### A1 — 2FA email opt-in para clientes (2026-06-24, Sprint Cuenta · [ADR-085](./adr-085-cuenta-cliente-self-service.md))

La decisión original deja a **clientes/partners sin 2FA** (reduce fricción de onboarding). La página
de cuenta self-service ([ADR-085](./adr-085-cuenta-cliente-self-service.md)) añade 2FA **opcional**.
Es **additivo** — no supersede ADR-013, lo extiende:

- Clientes/partners pueden **activar voluntariamente** 2FA por email desde `/dashboard/profile`
  (sección Seguridad). Mecánica idéntica al **código-por-email** ya existente — **cero TOTP, cero
  dependencias nuevas**.
- **Trigger de login extendido:** el reto 2FA se dispara cuando `role ∈ ROLES_REQUIRING_2FA`
  **O** `user.two_factor_enabled === true` (antes: sólo el rol).
- **Activar/desactivar** requiere confirmar la contraseña (acción sensible). **Desactivar está
  prohibido** para roles con 2FA obligatorio (no pueden bajar su seguridad).
- Para privilegiados, la decisión original **no cambia**: 2FA sigue obligatorio e inmutable.
