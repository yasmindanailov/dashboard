# ROADMAP.md — Plan de ejecución del Dashboard Aelium

> Fuente de verdad para el orden de implementación.
> Diseñado para ejecución por agente IA con pasos granulares.
> Actualizar el estado de cada paso al completarlo.

---

## Principios del roadmap

1. **Cada paso es atómico**: un paso = una sesión de trabajo razonable, sin exceder tokens.
2. **Cada paso es testable**: no se avanza sin verificar que lo anterior funciona.
3. **Bottom-up**: datos → lógica de negocio → infraestructura → producción.
4. **Zero TODOs**: cada paso deja el código funcional, sin placeholders.
5. **Documentación incluida**: admin.md se escribe al cerrar cada sprint.

---

## Sprint 0 — Scaffolding ✅

| # | Paso | Estado |
|---|------|--------|
| 0.1 | Monorepo (backend + frontend + docker + docs) | ✅ |
| 0.2 | Docker Compose dev (PostgreSQL 16 + Redis 7) | ✅ |
| 0.3 | NestJS 11 scaffolding con 13 módulos stub | ✅ |
| 0.4 | Prisma 7 schema + migración init | ✅ |
| 0.5 | Seed idempotente (roles, superadmin, settings) | ✅ |
| 0.6 | Global: ExceptionFilter, CorrelationId, Helmet, CORS, Swagger | ✅ |
| 0.7 | Next.js 16 + Tailwind 4 + DM Sans + tokens de diseño | ✅ |
| 0.8 | Login page split-screen con Aurora Digital | ✅ |
| 0.9 | README.md | ✅ |

**Commit:** `53704d3`

---

## Sprint 1 — Auth ✅

| # | Paso | Estado |
|---|------|--------|
| 1.1 | DTOs con class-validator (password policy) | ✅ |
| 1.2 | SettingsService global con cache 1min | ✅ |
| 1.3 | JwtStrategy + JwtAuthGuard (Passport) | ✅ |
| 1.4 | AuthService: register (pending_verification) | ✅ |
| 1.5 | AuthService: login + bloqueo por intentos fallidos | ✅ |
| 1.6 | AuthService: 2FA por email (superadmin + agentes) | ✅ |
| 1.7 | AuthService: refresh token, logout, sessions | ✅ |
| 1.8 | AuthService: verify-email, forgot/reset-password | ✅ |
| 1.9 | AuthController: 12 endpoints | ✅ |
| 1.10 | Frontend: login funcional + 2FA con transiciones | ✅ |
| 1.11 | Frontend: dashboard placeholder (/dashboard) | ✅ |
| 1.12 | Frontend: API client tipado (lib/api.ts) | ✅ |
| 1.13 | 11 settings configurables de auth en seed | ✅ |
| 1.14 | docs/features/auth/admin.md | ✅ |

**Commit:** `13c5f15`

---

## Sprint 2 — Notifications Core ✅

| # | Paso | Estado |
|---|------|--------|
| 2.1 | MailPit en Docker (SMTP dev + Web UI :8025) | ✅ |
| 2.2 | EmailService (nodemailer, SMTP configurable) | ✅ |
| 2.3 | EmailModule global | ✅ |
| 2.4 | 4 plantillas HTML auth (verificación, 2FA, reset, welcome) | ✅ |
| 2.5 | AuthService: eliminar TODOs, enviar emails reales | ✅ |

**Commit:** `ba688c6`

---

## Sprint 3 — Auth Frontend Polish ✅

> Objetivo: completar todas las páginas frontend de auth para que sean testables end-to-end.

| # | Paso | Estado |
|---|------|--------|
| 3.1 | Página de registro (/register) | ✅ |
| 3.2 | Página de verificación email (/verify-email?token=) | ✅ |
| 3.3 | Página de forgot password (/forgot-password) | ✅ |
| 3.4 | Página de reset password (/reset-password?token=) | ✅ |
| 3.5 | Navegación entre login ↔ register ↔ forgot | ✅ |
| 3.6 | Test end-to-end: register → email → verify → login | ✅ |
| 3.7 | Actualizar docs/features/auth/admin.md | ✅ |

**Commit:** `59f5a21`

---

## Sprint 3.5 — Auth Hardening ⬜

> Objetivo: corregir edge cases críticos de Sprints 1-3 antes de construir sobre la base de auth.
> Sin esto, Clients y Billing se construyen sobre cimientos frágiles.

### Backend fixes

| # | Paso | Origen | Estado |
|---|------|--------|--------|
| 3.5.1 | **Email lowercase** — normalizar `dto.email.toLowerCase()` en register, login, forgot, resend | Bug S1 | ⬜ |
| 3.5.2 | **Invalidar tokens antiguos** — al generar nuevo token de verificación, marcar los anteriores como `used_at = now()` | Bug S1 | ⬜ |
| 3.5.3 | **Invalidar reset tokens antiguos** — al solicitar nuevo reset, invalidar los pendientes del mismo usuario | Bug S1 | ⬜ |
| 3.5.4 | **Enviar welcome email** — `verifyEmail()` debe enviar `welcomeTemplate` tras activar al usuario | Bug S2 | ⬜ |
| 3.5.5 | **Sanitizar inputs en templates** — escapar `first_name` en plantillas HTML para prevenir inyección | Bug S2 | ⬜ |

### Frontend fixes

| # | Paso | Origen | Estado |
|---|------|--------|--------|
| 3.5.6 | **Protección de rutas** — middleware/layout que redirige a `/` si no hay token válido en `/dashboard` y rutas internas | Edge S3 | ⬜ |
| 3.5.7 | **Auto-refresh del token** — interceptor en API client que llame a `/auth/refresh` cuando el access token expire (antes de los 15 min) | Edge S3 | ⬜ |
| 3.5.8 | **Login "email no verificado"** — mostrar botón "Reenviar verificación" cuando el backend devuelve `pending_verification` | Edge S3 | ⬜ |
| 3.5.9 | **Confirmar contraseña en registro** — añadir campo de confirmación con validación visual | Edge S3 | ⬜ |
| 3.5.10 | **Fix double-fire verify-email** — evitar que useEffect ejecute la verificación dos veces en React Strict Mode | Edge S3 | ⬜ |
| 3.5.11 | **Auto-redirect si ya logueado** — si hay token válido en localStorage y el usuario va a `/`, redirigir a `/dashboard` | Edge S3 | ⬜ |
| 3.5.12 | Actualizar docs/features/auth/admin.md con los cambios | DoD | ⬜ |

---

## Sprint 4 — Clients ⬜

> Objetivo: CRM de clientes. Ficha completa, notas internas, datos de facturación.

| # | Paso | Estado |
|---|------|--------|
| 4.1 | ClientsService: CRUD completo | ⬜ |
| 4.2 | ClientsController: endpoints (list, get, update, notes) | ⬜ |
| 4.3 | DTOs con validación | ⬜ |
| 4.4 | Frontend: tabla de clientes (admin/agente) | ⬜ |
| 4.5 | Frontend: ficha de cliente con tabs | ⬜ |
| 4.6 | Frontend: sidebar/layout del dashboard | ⬜ |
| 4.7 | Notificación interna (campana) — base | ⬜ |
| 4.8 | docs/features/clients/admin.md | ⬜ |

---

## Sprint 5 — Products ⬜

> Objetivo: catálogo de productos con pricing y ciclos de facturación.

| # | Paso | Estado |
|---|------|--------|
| 5.1 | ProductsService: CRUD + activar/desactivar | ⬜ |
| 5.2 | ProductsController: endpoints | ⬜ |
| 5.3 | Lógica de pricing: setup + recurrente + ciclos | ⬜ |
| 5.4 | Frontend: catálogo de productos (admin) | ⬜ |
| 5.5 | Frontend: crear/editar producto con pricing | ⬜ |
| 5.6 | docs/features/products/admin.md | ⬜ |

---

## Sprint 6 — Billing ⬜

> Objetivo: facturas, ciclos de cobro, integración Stripe.

| # | Paso | Estado |
|---|------|--------|
| 6.1 | BillingService: crear factura, calcular importes | ⬜ |
| 6.2 | Lógica de prorrateo | ⬜ |
| 6.3 | Integración Stripe (plugin payment) | ⬜ |
| 6.4 | Webhooks de Stripe (payment_intent) | ⬜ |
| 6.5 | Frontend: lista de facturas (admin + cliente) | ⬜ |
| 6.6 | Frontend: detalle de factura | ⬜ |
| 6.7 | Emails: factura creada, pago recibido, pago fallido | ⬜ |
| 6.8 | Registro via compra (status active sin verificar email) | ⬜ |
| 6.9 | docs/features/billing/admin.md | ⬜ |

---

## Sprint 7 — Support ⬜

> Objetivo: chat asíncrono, conversaciones, filtro IA.

| # | Paso | Estado |
|---|------|--------|
| 7.1 | SupportService: crear/responder conversaciones | ⬜ |
| 7.2 | Mensajes con archivos adjuntos (MinIO) | ⬜ |
| 7.3 | Filtro IA para clasificación (Claude) | ⬜ |
| 7.4 | Frontend: bandeja de conversaciones (admin/agente) | ⬜ |
| 7.5 | Frontend: chat del cliente | ⬜ |
| 7.6 | Emails: ticket creado, respuesta recibida | ⬜ |
| 7.7 | docs/features/support/admin.md + client.md | ⬜ |

---

## Sprint 8 — Tasks ⬜

> Objetivo: tareas del equipo, WOW calls, mantenimiento.

| # | Paso | Estado |
|---|------|--------|
| 8.1 | TasksService: CRUD + asignación + estados | ⬜ |
| 8.2 | Tareas automáticas (post-provisioning) | ⬜ |
| 8.3 | WOW calls (checklist post-alta) | ⬜ |
| 8.4 | Frontend: tablero de tareas (agente) | ⬜ |
| 8.5 | Frontend: mantenimiento mensual | ⬜ |
| 8.6 | Notificaciones: tarea asignada, tarea crítica | ⬜ |
| 8.7 | docs/features/tasks/admin.md + agent.md | ⬜ |

---

## Sprint 9 — Audit + Notifications Full ⬜

> Objetivo: portal de transparencia + sistema de notificaciones completo.
> Incluye deuda técnica de emails (Regla 2: BullMQ).

| # | Paso | Estado |
|---|------|--------|
| 9.1 | AuditService: consultas con filtros | ⬜ |
| 9.2 | Frontend: log de actividad (admin) | ⬜ |
| 9.3 | Frontend: portal de transparencia (cliente) | ⬜ |
| 9.4 | Notificaciones internas: campana con contador | ⬜ |
| 9.5 | Plantillas editables desde dashboard (admin) | ⬜ |
| 9.6 | Centro de notificaciones (admin + cliente) | ⬜ |
| 9.7 | **Migrar envío de emails a BullMQ** — cumplir Regla 2 (>200ms → cola) | ⬜ |
| 9.8 | **Retry para emails fallidos** — DLQ para emails que no se enviaron | ⬜ |
| 9.9 | docs/features/audit/admin.md + client.md | ⬜ |

---

## Sprint 10 — Infrastructure ⬜

> Objetivo: registro de servidores, pools, capacidad.

| # | Paso | Estado |
|---|------|--------|
| 10.1 | InfrastructureService: CRUD servidores + pools | ⬜ |
| 10.2 | Métricas de capacidad (slots usados/libres) | ⬜ |
| 10.3 | Frontend: panel de infraestructura (admin) | ⬜ |
| 10.4 | docs/features/infrastructure/admin.md | ⬜ |

---

## Sprint 11 — Provisioning ⬜

> Objetivo: orquestación del ciclo de vida de servicios.

| # | Paso | Estado |
|---|------|--------|
| 11.1 | ProvisioningService: alta, suspensión, cancelación | ⬜ |
| 11.2 | Plugin: Enhance CP (hosting web) | ⬜ |
| 11.3 | Plugin: Docker engine (Nextcloud, etc.) | ⬜ |
| 11.4 | Flujo: compra → pago → provisioning → task WOW | ⬜ |
| 11.5 | Frontend: servicios del cliente (admin + cliente) | ⬜ |
| 11.6 | docs/features/provisioning/admin.md | ⬜ |

---

## Sprint 12 — Settings + Knowledge Base ⬜

> Objetivo: página de configuración del dashboard + base de conocimiento interna.

| # | Paso | Estado |
|---|------|--------|
| 12.1 | Frontend: página de settings con categorías | ⬜ |
| 12.2 | SettingsController: CRUD settings | ⬜ |
| 12.3 | KnowledgeBaseService: artículos con categorías | ⬜ |
| 12.4 | Frontend: knowledge base (admin + cliente) | ⬜ |
| 12.5 | docs/features/settings/admin.md | ⬜ |

---

## Sprint 13 — Hardening ⬜

> Objetivo: seguridad y rendimiento de producción.
> Incluye edge cases de seguridad diferidos de Sprints anteriores.

| # | Paso | Origen | Estado |
|---|------|--------|--------|
| 13.1 | **Refresh token en httpOnly cookie** — eliminar tokens de localStorage | Edge S3 | ⬜ |
| 13.2 | **Refresh token rotation** — invalidar refresh anterior al emitir nuevo | Edge S1 | ⬜ |
| 13.3 | **Session cleanup job** — cron que desactive sesiones expiradas (`is_active` + `expires_at < now()`) | Edge S1 | ⬜ |
| 13.4 | **Límite de sesiones activas** — max N sesiones por usuario, revocar la más antigua | Edge S1 | ⬜ |
| 13.5 | **RGPD: checkbox en registro** — consentimiento explícito + `client_consents` | Legal | ⬜ |
| 13.6 | **Verificar NEXT_PUBLIC_APP_URL en producción** — validar que no sea localhost en URLs de emails | Edge S2 | ⬜ |
| 13.7 | Rate limiting fino por endpoint | Seguridad | ⬜ |
| 13.8 | CORS restrictivo para producción | Seguridad | ⬜ |
| 13.9 | Health checks completos | Operaciones | ⬜ |
| 13.10 | Graceful shutdown | Operaciones | ⬜ |
| 13.11 | Tests unitarios para lógica crítica (billing, auth) | Calidad | ⬜ |

---

## Sprint 14 — Deploy ⬜

> Objetivo: infraestructura de producción en el dedicado OVH.

| # | Paso | Estado |
|---|------|--------|
| 14.1 | Docker Compose producción | ⬜ |
| 14.2 | Traefik + SSL (Let's Encrypt) | ⬜ |
| 14.3 | MinIO (storage S3) | ⬜ |
| 14.4 | Monitoring: Grafana + Prometheus + Loki | ⬜ |
| 14.5 | Pipeline de deploy (git push → rebuild) | ⬜ |
| 14.6 | Backups automáticos a Cloudflare R2 | ⬜ |

---

## Notas para el agente IA

- **Cada sprint se ejecuta en 1-3 sesiones** según complejidad.
- **Si un paso es muy grande** (ej: BillingService completo), se divide en sub-pasos dentro de la sesión.
- **Antes de cada sprint**: leer DECISIONS.md para la lógica de negocio del módulo.
- **Al cerrar cada sprint**: commit, actualizar este roadmap, escribir admin.md.
- **Si hay ambigüedad en la lógica de negocio**: PREGUNTAR, no inventar.
