# Account (cuenta self-service) — Contract

> Superficie self-service de la cuenta del usuario autenticado: perfil, seguridad (contraseña, 2FA, sesiones), facturación (perfiles fiscales) y RGPD. Doctrina: [ADR-085](../../10-decisions/adr-085-cuenta-cliente-self-service.md) + [ADR-013 Amendment A1](../../10-decisions/adr-013-2fa-email.md#amendments) (2FA email opt-in cliente).

---

## 1. Propósito

Que cada usuario gestione **su propia** cuenta —identidad, seguridad y datos fiscales— derivando todo del JWT (`req.user.id`), **nunca de un parámetro de URL** (sin IDOR), desacoplando la **identidad de la cuenta** de los datos de **titular WHOIS** (que son del dominio).

---

## 2. Estado de implementación

🟡 **Parcial (código-completo v1) — Sprint Cuenta (ADR-085), sobre infraestructura anticipada.**
- ✅ Perfil (`PATCH /account/profile`), seguridad (contraseña, 2FA opt-in, logout-all, sesiones), facturación (CRUD billing-profiles self-scoped), titular WHOIS, RGPD (export + borrado + subprocesadores, GL-5).
- ✅ Staff: `/admin/profile` reutiliza los mismos componentes (Cuenta + Seguridad).
- ⬜ Diferido v1: cambio de email (re-verificación); avatar a MinIO.

> **No es un módulo NestJS único** — es una *superficie* repartida por 3 módulos: `auth` (`AccountController` + `AuthAccountService`), `clients` (`AccountBillingController`) y `domains` (`DomainRegistrantController`). Este contrato documenta la superficie completa.

---

## 3. Modelos Prisma propios

**Ninguno.** La superficie de cuenta no posee tablas; opera self-scoped sobre tablas de otros módulos (§4).

---

## 4. Modelos foráneos accedidos

| Tabla | Módulo dueño | Acceso | Razón |
|-------|--------------|--------|-------|
| `users` | auth | lectura/escritura | Perfil (nombre/idioma/zona), password_hash, `two_factor_enabled`. |
| `sessions` | auth | lectura/escritura | Listar / revocar / logout-all (revoca las demás al cambiar contraseña). |
| `billing_profiles` | clients | CRUD (self-scoped) | Datos fiscales que aparecen en las facturas (≠ titular WHOIS). |
| `client_profiles` | clients/domains | lectura/escritura | Titular WHOIS (1 por cliente; PUT propaga al registrar). |
| `audit_access_log` | audit | escritura vía `AuditService` | Auditar acciones de seguridad + accesos RGPD (R3). |

---

## 5. API REST expuesta

Todo bajo `JwtAuthGuard`, **self-scoped por `req.user.id`** (sin IDOR):

**Cuenta + Seguridad** (`AccountController`, módulo auth):

| Método | Ruta | Descripción |
|--------|------|-------------|
| PATCH | `/api/v1/account/profile` | Nombre / idioma / zona horaria (**no** toca el registrar). |
| POST | `/api/v1/account/change-password` | Verifica la actual + **revoca las demás sesiones** (Throttle 5/60s). |
| POST | `/api/v1/account/2fa/enable` · `/2fa/disable` | 2FA email opt-in (confirma contraseña; `disable` bloqueado para roles 2FA-obligatorio). |
| POST | `/api/v1/account/logout-all` | Cierra todas las sesiones. |
| GET | `/api/v1/auth/me` *(reusado)* | Lectura de identidad + estado de seguridad (`two_factor_enabled`, email verificado). |
| GET / DELETE | `/api/v1/auth/sessions` · `/auth/sessions/:id` *(reusado)* | Listar / cerrar una sesión. |

**Facturación** (`AccountBillingController`, módulo clients):

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET / POST | `/api/v1/account/billing-profiles` | Listar / crear perfil fiscal propio. |
| PATCH / DELETE | `/api/v1/account/billing-profiles/:id` | Editar / borrar (404 si es ajeno — ownership-safe). |
| PATCH | `/api/v1/account/billing-profiles/:id/default` | Marcar predeterminado (no se borra el default). |

**Titular WHOIS** (`DomainRegistrantController`, módulo domains): `GET / PUT /api/v1/domains/registrant`.

**RGPD** (`AccountController`, GL-5): `GET /account/transparency` (subprocesadores) · `GET /account/data-export` (export JSON, Throttle) · `GET/POST/DELETE /account/deletion-request` (solicitud de borrado → la revisa/ejecuta un admin).

---

## 6. WebSocket gateway

N/A.

---

## 7. Eventos emitidos

Reusa los eventos de seguridad de auth (`auth.session_closed`, etc. — ver [`_events.md`](_events.md) §`auth.*`). La superficie de cuenta no emite eventos de dominio propios; las acciones sensibles se **auditan** en `audit_access_log` (R3), no como evento de negocio.

---

## 8. Eventos consumidos

Ninguno.

---

## 9. Servicios consumidos (cross-módulo)

| Servicio | De módulo | Razón legítima |
|----------|-----------|----------------|
| `AuthService` → `AuthAccountService` | auth | Sub-servicio del propio dominio (R15: controller aparte de `AuthController`). |
| `ClientsBillingService` | clients | CRUD ownership-safe de billing-profiles (valida `user_id` del JWT → 404 si ajeno). |
| `AccountTransparencyService` / `AccountDeletionService` | auth | Export RGPD + flujo de borrado (GL-5). |
| `DomainRegistrantService` | domains | Titular WHOIS self-scoped. |
| `AuditService` | audit | R3 (acciones de seguridad + accesos RGPD). |

---

## 10. CASL — Permisos

| Subject | superadmin | agent_* | client | partner |
|---------|------------|---------|--------|---------|
| `Profile` | manage | manage (own) | **manage (own)** | manage (own) |
| `BillingProfile` | manage | manage | **manage (own)** | manage (own) |

La arquitectura estaba **anticipada**: `Subject.Profile`/`BillingProfile` con `Manage` para `client` ya existían en `permissions.ts`. El scoping real es por `req.user.id`, no por condición CASL de parámetro.

---

## 11. Settings consumidos

Ninguno directamente. El login honra `ROLES_REQUIRING_2FA` (`auth.constants.ts`) **o** `user.two_factor_enabled` (opt-in).

---

## 12. Emails enviados

Vía el flujo de 2FA (código por email en el próximo login si está activo) y las notificaciones de seguridad existentes de auth. La superficie de cuenta no introduce plantillas propias nuevas (diferido: emails del flujo de borrado RGPD).

---

## 13. Jobs / cron

Ninguno propio. (La retención/anonimización RGPD vive en el módulo `audit`/`auth` — ver [ADR-010](../../10-decisions/adr-010-rgpd-retencion-datos.md).)

---

## 14. Invariantes

- **ACC-INV-1 (sin IDOR):** todo endpoint deriva el `userId` de `req.user.id` (JWT), **nunca** de un parámetro de URL. Verificado en `AccountController`/`AccountBillingController`/`DomainRegistrantController`.
- **ACC-INV-2 (identidad ≠ WHOIS):** `PATCH /account/profile` actualiza la identidad de la cuenta y **no** toca el titular del registrador; el titular WHOIS es un flujo aparte (`/domains/registrant`).
- **ACC-INV-3 (cambio de contraseña revoca sesiones):** al cambiar la contraseña se revocan las **demás** sesiones (la actual se mantiene).
- **ACC-INV-4 (2FA obligatorio inmutable):** un rol en `ROLES_REQUIRING_2FA` no puede desactivar su 2FA; el opt-in es solo para roles sin 2FA obligatorio (cliente/partner) — [ADR-013 A1](../../10-decisions/adr-013-2fa-email.md#amendments).
- **ACC-INV-5 (default fiscal protegido):** no se borra el `billing_profile` predeterminado; hay que marcar otro como default primero.

---

## 15. Decisiones relacionadas

- [ADR-085](../../10-decisions/adr-085-cuenta-cliente-self-service.md) — Cuenta cliente self-service (superficie self-scoped, desacople identidad/WHOIS, reuso de servicios ownership-safe).
- [ADR-013 Amendment A1](../../10-decisions/adr-013-2fa-email.md#amendments) — 2FA email opt-in para clientes.
- [ADR-060 §B](../../10-decisions/adr-060-decisiones-pre-schema.md) — Modelo de sesiones (logout-all).
- [ADR-066](../../10-decisions/adr-066-tres-portales-raiz-portalbadge.md) — Portales: la cuenta de staff vive en `/admin/profile` (mismos componentes `_shared/account/`, audiencia `staff` = Cuenta + Seguridad).

---

## 16. Excepciones documentadas

- **R1:** los servicios consumidos son sub-servicios del propio dominio (auth) o módulos core; `ClientsBillingService` es reuso ownership-safe explícito (R15) — legítimo.
- **R8:** N/A — la cuenta no emite eventos de dominio (las acciones se auditan, no disparan acciones cross-módulo).

---

## 17. Pendiente / deuda técnica

- [ ] Cambio de email con re-verificación (diferido v1).
- [ ] Subida de avatar a MinIO (hoy fallback a iniciales).
- [ ] Emails del flujo de borrado RGPD (notificar al cliente al solicitar/ejecutar).
- [ ] Consentimiento granular RGPD (diferido — sin analítica viva).

---

## 18. Cómo testear este módulo

- **Unit:** `backend/src/modules/auth/auth-account.service.spec.ts` (perfil/contraseña/2fa/logout-all) · `backend/src/modules/clients/clients-billing.service.spec.ts` (anti-IDOR de billing-profiles).
- **E2E (Playwright):** `tests/e2e/account-profile.spec.ts` (cliente `/dashboard/profile` self-scoped + staff `/admin/profile` solo Cuenta+Seguridad — GL-26).
- **Smoke manual:** en `/dashboard/profile` editar nombre → persiste; cambiar contraseña → cierra otras sesiones; activar 2FA → el siguiente login pide código; crear/borrar billing-profile; intentar borrar el default → bloqueado.
