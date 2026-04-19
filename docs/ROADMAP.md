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

## Sprint 3.5 — Auth Hardening ✅

> Objetivo: corregir edge cases críticos de Sprints 1-3 antes de construir sobre la base de auth.
> Sin esto, Clients y Billing se construyen sobre cimientos frágiles.

### Backend fixes

| # | Paso | Origen | Estado |
|---|------|--------|--------|
| 3.5.1 | **Email lowercase** — normalizar `dto.email.toLowerCase()` en register, login, forgot, resend | Bug S1 | ✅ |
| 3.5.2 | **Invalidar tokens antiguos** — al generar nuevo token de verificación, marcar los anteriores como `used_at = now()` | Bug S1 | ✅ |
| 3.5.3 | **Invalidar reset tokens antiguos** — al solicitar nuevo reset, invalidar los pendientes del mismo usuario | Bug S1 | ✅ |
| 3.5.4 | **Enviar welcome email** — `verifyEmail()` debe enviar `welcomeTemplate` tras activar al usuario | Bug S2 | ✅ |
| 3.5.5 | **Sanitizar inputs en templates** — escapar `first_name` en plantillas HTML para prevenir inyección | Bug S2 | ✅ |

### Frontend fixes

| # | Paso | Origen | Estado |
|---|------|--------|--------|
| 3.5.6 | **Protección de rutas** — middleware/layout que redirige a `/` si no hay token válido en `/dashboard` y rutas internas | Edge S3 | ✅ |
| 3.5.7 | **Auto-refresh del token** — interceptor en API client que llame a `/auth/refresh` cuando el access token expire (antes de los 15 min) | Edge S3 | ✅ |
| 3.5.8 | **Login "email no verificado"** — mostrar botón "Reenviar verificación" cuando el backend devuelve `pending_verification` | Edge S3 | ✅ |
| 3.5.9 | **Confirmar contraseña en registro** — añadir campo de confirmación con validación visual | Edge S3 | ✅ |
| 3.5.10 | **Fix double-fire verify-email** — evitar que useEffect ejecute la verificación dos veces en React Strict Mode | Edge S3 | ✅ |
| 3.5.11 | **Auto-redirect si ya logueado** — si hay token válido en localStorage y el usuario va a `/`, redirigir a `/dashboard` | Edge S3 | ✅ |
| 3.5.12 | Actualizar docs/features/auth/admin.md con los cambios | DoD | ✅ |

---

## Sprint 4 — Clients ✅

> Objetivo: CRM de clientes. Ficha completa, notas internas, datos de facturación.
> Incluye fundamentos reutilizables: RolesGuard, paginación, auto-creación de perfil.

| # | Paso | Estado |
|---|------|--------|
| 4.0a | RolesGuard: autorización por rol en endpoints | ✅ |
| 4.0b | Auto-creación de ClientProfile al registrar usuario | ✅ |
| 4.0c | Utilidad de paginación reutilizable (PaginatedResult, PaginationDto) | ✅ |
| 4.1 | Prisma: modelo BillingProfile + migración | ✅ |
| 4.2 | ClientsService: CRUD completo + billing profiles | ✅ |
| 4.3 | ClientsController: endpoints (list, get, update, notes, billing) | ✅ |
| 4.4 | DTOs con validación (client, billing profile, paginación) | ✅ |
| 4.5 | Frontend: sidebar/layout del dashboard | ✅ |
| 4.6 | Frontend: tabla de clientes (admin/agente) | ✅ |
| 4.7 | Frontend: ficha de cliente con tabs | ✅ |
| 4.8 | Notificación interna (campana) — placeholder visual | ✅ |
| 4.9 | docs/features/clients/admin.md | ✅ |

---

## Sprint 5 — Products + Role-Aware Dashboard ✅

> Objetivo: catálogo de productos con pricing + dashboard estricto por rol.
> Cada rol ve SOLO los módulos a los que tiene acceso. Cero ambigüedad.

| # | Paso | Estado |
|---|------|--------|
| 5.0 | **Sistema PBAC con CASL** — `@casl/ability` + `@casl/prisma`, ability factory centralizada, guard `@CheckPolicies()`, reemplaza todos los `@Roles()` | ✅ |
| 5.0a | **Sidebar role-aware estricto** — consume PERMISSIONS para filtrar NAV_ITEMS por rol | ✅ |
| 5.0b | **Manejo de 403 en frontend** — componente "Sin permisos" + redirect si el rol no tiene acceso a la ruta | ✅ |
| 5.0c | **Sidebar responsive mobile** — drawer overlay con hamburguesa en <768px | ✅ |
| 5.1 | ProductsService: CRUD + activar/desactivar | ✅ |
| 5.2 | ProductsController: endpoints | ✅ |
| 5.3 | Lógica de pricing: setup + recurrente + ciclos (con campo `currency` preparado) | ✅ |
| 5.4 | **Extras de producto** — CRUD extras obligatorios/opcionales, lógica de activación (ej: dominio gratis con anual) | ✅ |
| 5.5 | **Tipos de producto** — configuración `provisioner_type`, `audit_event_types`, `resource_config`, Docker templates | ✅ |
| 5.6 | Frontend: catálogo de productos (admin) | ✅ |
| 5.7 | Frontend: crear/editar producto con pricing + extras + tipo | ✅ |
| 5.8 | docs/features/products/admin.md | ✅ |

**Mapa de permisos por rol (implementado en `core/casl/permissions.ts`):**

| Módulo | superadmin | agent_full | agent_billing | agent_support | client | partner |
|--------|-----------|-----------|--------------|--------------|--------|--------|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Clientes | ✅ | ✅ | ✅ | ✅ (solo lectura) | ❌ | lectura (propios) |
| Productos | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Facturación | ✅ | ✅ | ✅ | ❌ | ✅ (propio) | lectura (clientes) |
| Soporte | ✅ | ✅ | ❌ | ✅ | ✅ (propio) | lectura (clientes) |
| Tareas | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Settings | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Mi perfil | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Partner (comisiones, liquidaciones, tickets, notas) | ✅ gestión | lectura | ❌ | ❌ | ❌ | ✅ (propio) |

**Decisiones de producto (Sprint 5):**
- `hosting_agency` eliminado — partners venden los mismos planes `hosting_web` con descuento
- `we_do_it` es un addon (`is_addon: true`) vinculable a `hosting_web` y `docker_service` (NO aplica a `support_*` ni `custom_service`)
- `custom_service` = proyectos a escala (ERP, CRM), creación manual, engloban múltiples servicios/productos
- `BillingCycle` incluye `monthly`, `quarterly`, `semiannual`, `annual`, `one_time`

**Edge cases resueltos (Sprint 5 — hardening):**
- **EC-1** ✅ Slug duplicado en edición — ahora lanza `ConflictException` con mensaje claro
- **EC-2** ✅ Tipo de producto inmutable — `type` eliminado de `UpdateProductDto`
- **EC-3** ✅ Último pricing no eliminable — activo no puede quedarse sin plans
- **EC-4** ✅ `is_addon`, `is_global_addon`, `requires_existing_product` inmutables — auto-set por tipo, eliminados de `UpdateProductDto`
- **EC-5** ✅ Pricing duplicado por ciclo — validación explícita antes de insertar, `ConflictException` con mensaje
- **EC-6** ✅ `partner_commission_pct` validado — `@Min(0) @Max(100)` en ambos DTOs

**Edge cases pendientes (asignados a sprints futuros):**
- **EC-5.1** (Sprint 7+): CASL conditions no se evalúan automáticamente a nivel de servicio. Cuando se implementen rutas de cliente (`/my-services`, `/my-invoices`), validar `req.user.id === resource.user_id` explícitamente en el service.
- **EC-5.2** (Sprint 6): Eliminar legacy `@Roles()` decorator y `RolesGuard` tras verificar migración completa a `@CheckPolicies()`.
- **EC-5.3** (Sprint 6): `auth-context.tsx` no expone `partner_id`. Añadirlo cuando se implemente el dashboard del partner.
- **EC-5.4** (Sprint 8): Validar restricción de `we_do_it` addon: solo vinculable a `hosting_web` y `docker_service`. Implementar lógica de restricción en `ProductsService.create()`.
- **EC-7** (Sprint 6): Auditar y eliminar cualquier legacy `RolesGuard` que pueda conflictar con CASL `@CheckPolicies()`.
- **EC-8** (Sprint 6): Refresh automático de token expirado durante formularios largos. Redirect a login si refresh falla.
- **EC-9** (Sprint 7+): Confirmación "cambios sin guardar" al navegar fuera de formularios de crear/editar (`beforeunload` + router guard).
- **EC-10** (Sprint 8): UI para campo `features` (JSON) del producto. Los productos de hosting necesitan exponer features al checkout.

---

## Sprint 6 — Billing Engine ✅

> Objetivo: motor de facturación completo, ciclo de vida de suscripciones,
> y abstracción de payment providers (sin implementar Stripe — eso es un plugin).
> Referencia: DECISIONS.md §12, §21, §32, §34.
> **Stripe se implementa en un sprint dedicado a plugins, igual que los provisioners.**

| # | Paso | Estado |
|---|------|--------|
| 6.1 | **BillingService core** — crear factura (draft→pending), calcular importes (subtotal, IVA, descuento, total) | ✅ |
| 6.2 | **Numeración secuencial** — PostgreSQL SEQUENCE por año (`invoice_number_seq_YYYY`), prefijo/sufijo configurables. **Regla: nunca saltos en numeración (obligación Hacienda).** Facturas erróneas se cancelan, no se eliminan | ✅ |
| 6.3 | **PaymentProvider interface** — abstracción `createPayment()`, `handleWebhook()`, `refund()`, `getStatus()`. Campo `payment_provider` como string libre (misma filosofía que `provisioner`). Sin plugin concreto — placeholder `manual` para testing | ✅ |
| 6.4 | **Ciclo de cobro** — worker: generar factura X días antes del vencimiento, intentar cobro en fecha, reintentos configurables (X días entre reintentos, Y reintentos máx), transición a `overdue` | ✅ |
| 6.5 | **Suspensión y cancelación automática** — worker/cron: impago → suspensión (X días), suspensión → cancelación (Y días), retención de datos (Z días). Todo configurable por producto | ✅ |
| 6.6 | **Prorrateo** — cálculo transparente cambio mensual↔anual: precio diario × días no consumidos = crédito. Preview visible al cliente antes de confirmar | ✅ |
| 6.7 | **Pausar suscripción** — endpoint + lógica reactivación, misma mecánica que suspensión (servicio congelado X días configurables) | ✅ |
| 6.8 | **Período de gracia** — configurable por producto, días de margen antes del primer intento de cobro tras vencimiento | ✅ |
| 6.9 | **Facturas manuales** — el admin puede crear facturas a mano para casos especiales | ✅ |
| 6.10 | **Configuración fiscal (Settings)** — IVA %, formato numeración facturas, días antelación generación, reintentos cobro, días suspensión/cancelación defaults | ✅ |
| 6.11 | **Selección perfil facturación en checkout** — vincular servicio a perfil, lógica factura simplificada (sin NIF) vs completa (con NIF/CIF) | ✅ |
| 6.12 | **Generación PDF de facturas** — plantilla configurable con logo y datos empresa desde Settings | ✅ |
| 6.13 | **Frontend: checkout dashboard** — catálogo público → seleccionar producto → elegir ciclo → elegir perfil facturación → confirmar. Sin pago real hasta plugin Stripe | ✅ |
| 6.14 | Frontend: lista de facturas (admin + cliente con filtros role-based) | ✅ |
| 6.15 | Frontend: detalle de factura + descarga PDF autenticada | ✅ |
| 6.16 | Emails billing: `invoice.created`, `invoice.paid`, `invoice.failed`, `invoice.overdue` | ✅ |
| 6.17 | docs/features/billing/admin.md + client.md | ✅ |
| 6.18 | **Hardening de seguridad** — userId extraído del JWT (no query param), data isolation por rol (admin ve todo, cliente solo lo suyo), ownership enforcement en detail/PDF, validación finalize (items > 0, total > 0), CASL: `Read.Product` para clientes | ✅ |

**Decisiones de arquitectura (Sprint 6):**
- `payment_provider` es string libre en schema (igual que `provisioner`) — no enum
- El checkout crea un `Service` en estado `pending` y una `Invoice` en estado `draft`
- Sin plugin de pago activo, el admin marca manualmente la factura como `paid` → el servicio se activa
- El worker de cobro delegará al `PaymentProvider` activo cuando exista el plugin
- **La factura nunca se elimina** — solo cambia de estado (obligación Hacienda España: retención 10 años, sin saltos en numeración)
- **Data isolation**: el controller filtra por `user_id` del JWT para roles no-admin
- **Admin checkout**: puede crear servicio para otro usuario via `targetUserId`
- **Relación User↔Invoice** en schema Prisma: `include: { user }` disponible para resolver nombre del cliente
- **PDF fallback**: si no hay billing profile, muestra nombre + email del usuario como "Factura simplificada"
- **UI role-aware**: Enviar/Cobrar/Cancelar/Reembolsar ocultos para rol `client` (solo PDF visible)
- **Checkout "sin perfil"**: muestra nombre + email del usuario, no "Sin perfil" genérico
- **CASL strategy**: conditions removidas del guard; data isolation en controller/service (ver admin.md)

**Items movidos a otros sprints:**
- ~~Integración Stripe~~ → Sprint Plugins (nuevo, post-Sprint 14)
- ~~Webhooks Stripe~~ → Sprint Plugins
- ~~Registro via compra desde landing~~ → Sprint 18 (Landing Integration)

---

## Sprint 7 — Billing Hardening + Support ⬜

> Objetivo: cerrar edge cases de billing operacionales antes de Support. Chat asíncrono, conversaciones, filtro IA.

**Billing hardening (al inicio del sprint, antes de Support):**

| # | Paso | Origen | Estado |
|---|------|--------|--------|
| 7.0.1 | **Admin checkout: UI selector de cliente** — cuando rol es admin, mostrar selector de usuario destino antes de proceder | EC-BILL-02 | ⬜ |
| 7.0.2 | **Admin checkout: validar `targetUserId` obligatorio** — el admin no puede crear servicios para sí mismo; debe seleccionar un cliente destino | EC-BILL-01 | ⬜ |
| 7.0.3 | **Validar perfil de facturación contra `targetUserId`** — en checkout admin, el `billing_profile_id` debe pertenecer al cliente destino, no al admin | EC-BILL-03 | ⬜ |
| 7.0.4 | **IVA se recalcula al editar items de factura** — `updateInvoice` debe recalcular subtotal, tax_amount y total cuando se modifican items | EC-BILL-07 | ⬜ |
| 7.0.5 | **Descuento anual aplicado en checkout** — aplicar `discount_percentage` del plan anual al calcular el precio en el servicio y factura | EC-CHKOUT-04 | ⬜ |

**Support:**

| # | Paso | Estado |
|---|------|--------|
| 7.1 | SupportService: crear/responder conversaciones | ⬜ |
| 7.2 | **WebSocket con Socket.io** — namespaces `/chat`, `/notifications`, `/admin` | ⬜ |
| 7.3 | **Chat en tiempo real** — typing indicators, read receipts, escalación chat→async con contexto | ⬜ |
| 7.4 | **Chat anónimo (landing)** — guest_name + guest_email + guest_session_token hasheado | ⬜ |
| 7.5 | **Vinculación chat anónimo** — al registrarse con mismo email, vincular conversaciones | ⬜ |
| 7.6 | **Horario de atención** — configurable en settings (días + franjas), mensaje fuera de horario | ⬜ |
| 7.7 | Mensajes con archivos adjuntos (MinIO) | ⬜ |
| 7.8 | **Filtro IA chat** — agente IA para clientes sin Support Inside (Claude plugin), escala si lo pide | ⬜ |
| 7.9 | **Copilot IA agente** — panel lateral con sugerencias de respuesta en la voz de Aelium | ⬜ |
| 7.10 | Frontend: bandeja de conversaciones (admin/agente) | ⬜ |
| 7.11 | Frontend: chat del cliente (dashboard) | ⬜ |
| 7.12 | Emails: ticket creado, respuesta recibida | ⬜ |
| 7.13 | docs/features/support/admin.md + client.md | ⬜ |

---

## Sprint 8 — Tasks ⬜

> Objetivo: tareas del equipo, WOW calls, mantenimiento.

| # | Paso | Estado |
|---|------|--------|
| 8.1 | TasksService: CRUD + asignación + estados | ⬜ |
| 8.2 | Tareas automáticas (post-provisioning) | ⬜ |
| 8.3 | WOW calls (checklist post-alta) | ⬜ |
| 8.4 | **Support Inside** — configuración de planes (Básico/Medium/Pro), asignación de slots a servicios | ⬜ |
| 8.5 | **Support Inside** — página del cliente (plan, slots activos, historial de valor) | ⬜ |
| 8.6 | **Support Inside** — cancelación cascada de slots, recurrencia mantenimiento (aniversario) | ⬜ |
| 8.7 | **We Do It For You** — addon por producto, genera tarea con nota del cliente | ⬜ |
| 8.8 | Frontend: tablero de tareas (agente) | ⬜ |
| 8.9 | Frontend: mantenimiento mensual | ⬜ |
| 8.10 | Notificaciones: tarea asignada, tarea crítica | ⬜ |
| 8.11 | docs/features/tasks/admin.md + agent.md | ⬜ |

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
| 9.5 | **Plantillas editables desde dashboard** (admin) — editor visual con variables (`{{client.name}}`, `{{invoice.amount}}`), preview, por evento y canal (DECISIONS.md §11) | ⬜ |
| 9.6 | Centro de notificaciones (admin + cliente) | ⬜ |
| 9.7 | **Migrar envío de emails a BullMQ** — cumplir Regla 2 (>200ms → cola) | ⬜ |
| 9.8 | **Retry para emails fallidos** — DLQ para emails que no se enviaron | ⬜ |
| 9.9 | **Outbox Pattern worker** — polling cada 5s, dispatch via EventEmitter2, retry, failed→alerta | ⬜ |
| 9.10 | **Error Log UI** — dashboard admin con filtros por severity/módulo, marcar como resuelto | ⬜ |
| 9.11 | docs/features/audit/admin.md + client.md | ⬜ |

---

## Sprint 10 — Infrastructure ⬜

> Objetivo: registro de servidores, pools, capacidad.

| # | Paso | Estado |
|---|------|--------|
| 10.1 | InfrastructureService: CRUD servidores + pools | ⬜ |
| 10.2 | **Detección automática de capacidad** — RAM, CPU, disco al registrar servidor | ⬜ |
| 10.3 | Métricas de capacidad (slots usados/libres) | ⬜ |
| 10.4 | **Docker templates** — UI admin para crear/editar plantillas YAML | ⬜ |
| 10.5 | Frontend: panel de infraestructura (admin) | ⬜ |
| 10.6 | docs/features/infrastructure/admin.md | ⬜ |

---

## Sprint 11 — Provisioning ⬜

> Objetivo: orquestación del ciclo de vida de servicios.

| # | Paso | Origen | Estado |
|---|------|--------|--------|
| 11.1 | ProvisioningService: alta, suspensión, cancelación | Core | ⬜ |
| 11.2 | Plugin: Enhance CP (hosting web) | Plugin | ⬜ |
| 11.3 | Plugin: Docker engine (Nextcloud, etc.) | Plugin | ⬜ |
| 11.4 | **Subdominios cliente** — UI selección subdominio + validación disponibilidad + proxy | UX | ⬜ |
| 11.5 | **Collabora shared** — instancia compartida para Nextcloud, variable `COLLABORA_URL` | Plugin | ⬜ |
| 11.6 | Flujo: compra → pago → provisioning → task WOW | Core | ⬜ |
| 11.7 | **Métricas Docker cliente** — bloques infra (CPU, RAM, disco, uptime) + bloques custom por producto | UX | ⬜ |
| 11.8 | **Acciones cliente** — reiniciar contenedor, ver credenciales, ver transparencia | UX | ⬜ |
| 11.9 | Frontend: servicios del cliente (admin + cliente) | UX | ⬜ |
| 11.10 | docs/features/provisioning/admin.md | Docs | ⬜ |
| 11.11 | **Validar addon requiere producto base activo** — checkout rechaza addon si no hay servicio base activo | EC-PROD-01 | ⬜ |
| 11.12 | **Validar Support Inside requiere producto activo previo** — checkout rechaza contratación sin servicio | EC-CHKOUT-02 | ⬜ |
| 11.13 | **Validar domain único en checkout** — comprobar que el subdominio/dominio no esté ya en uso | EC-CHKOUT-03 | ⬜ |

---

## Sprint 12 — Settings + Knowledge Base ⬜

> Objetivo: página de configuración del dashboard + base de conocimiento interna.

| # | Paso | Origen | Estado |
|---|------|--------|--------|
| 12.1 | Frontend: página de settings con categorías (facturación, soporte, infra, notif, plugins, marca, usuarios) | Core | ⬜ |
| 12.2 | SettingsController: CRUD settings | Core | ⬜ |
| 12.3 | **Gestión de plugins** — UI dinámica desde manifest.json, activar/desactivar, formulario config (API keys, modo) | Core | ⬜ |
| 12.4 | **Editor de marca** — logo, colores, datos empresa, **plantilla PDF facturas personalizable** (DECISIONS.md §12) | Core | ⬜ |
| 12.5 | **Gestión de agentes** — crear, editar, desactivar, asignar rol | Core | ⬜ |
| 12.6 | **Mi perfil** — el usuario edita sus propios datos (nombre, teléfono, idioma, timezone, contraseña) | Core | ⬜ |
| 12.7 | **Prefijo/sufijo de numeración configurable** — leer de settings en `generateInvoiceNumber()` en vez de hardcoded `AELIUM-` | EC-SET-02 | ⬜ |
| 12.8 | **due_date de factura desde settings** — leer `billing.days_before_due` en checkout y worker, en vez de hardcoded 7 días | EC-BILL-08 | ⬜ |
| 12.9 | **Categorías con orden configurable** — campo `order` en `product_categories` + UI drag/drop o input numérico | EC-PROD-05 | ⬜ |
| 12.10 | KnowledgeBaseService: artículos con categorías y tags | Core | ⬜ |
| 12.11 | Frontend: knowledge base (admin + integración con IA agentes) | Core | ⬜ |
| 12.12 | docs/features/settings/admin.md | Docs | ⬜ |

---

## Sprint 12.5 — Portal de Transparencia RGPD ⬜

> Objetivo: cumplimiento RGPD. Portal de transparencia para el cliente.
> Referencia: DECISIONS.md §13 — Portal de transparencia del cliente.

| # | Paso | Estado |
|---|------|--------|
| 12.5.1 | Frontend: zona de transparencia del cliente (historial accesos, cambios, integraciones) | ⬜ |
| 12.5.2 | **Integrations Registry** — catálogo de integraciones con descripción pública visible al cliente | ⬜ |
| 12.5.3 | **Consentimientos** — UI opt-in/opt-out por categoría, validación antes de enviar a integraciones | ⬜ |
| 12.5.4 | **Editor de textos legales** — política de privacidad, ToS editables desde el dashboard | ⬜ |
| 12.5.5 | Exportación de datos del cliente (portabilidad RGPD) | ⬜ |
| 12.5.6 | Solicitud de eliminación de cuenta (genera tarea interna → anonimización) | ⬜ |
| 12.5.7 | **Retención automática** — cron jobs: notif 90d, conv 2a, audit 2a, outbox 7d, metrics 30d | ⬜ |
| 12.5.8 | docs/features/transparency/admin.md + client.md | ⬜ |

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
| 13.12 | **Audit trail global** — interceptor que registre cambios (old vs new) + actor en `audit_change_log` | Edge S4 | ⬜ |
| 13.13 | **Notas internas como tabla** — migrar de texto plano a `client_notes(user_id, author_id, content, created_at)` | Edge S4 | ⬜ |
| 13.14 | **XSS: sanitizar notas internas** — `escapeHtml` en inputs de texto libre del CRM | Edge S4 | ⬜ |
| 13.15 | **Cache de roles en ClientsService** — cachear `clientRole.id` en memoria | Edge S4 | ⬜ |
| 13.16 | **Escapar wildcards en búsqueda** — sanitizar `%` y `_` en strings de search antes de Prisma ILIKE | Edge S4 | ⬜ |
| 13.17 | **Validación de NIF/CIF/NIE** — regex de formato español en billing profiles | Edge S4 | ⬜ |
| 13.18 | **Client self-service billing** — endpoints para que el cliente gestione sus propios perfiles | Edge S4 | ⬜ |
| 13.19 | **Loading screen global** — eliminar el flash del login al redirigir a dashboard | Edge S3.5 | ⬜ |
| 13.20 | **2FA obligatorio para todos los agentes** — forzar 2FA en agent_support y agent_billing además de superadmin | EC-AUTH-06 | ⬜ |
| 13.21 | **Protección contra escalada de rol vía API** — validar en DTO/service que no se puede asignar superadmin | EC-AUTH-05 | ⬜ |
| 13.22 | **Permisos granulares agent_support vs agent_billing** — separar en CASL permisos de soporte y billing para agentes | EC-CASL-02 | ⬜ |
| 13.23 | **CASL: documentar patrón de ownership sin conditions** — helper de verificación de pertenencia, guía para devs | EC-CASL-01 | ⬜ |
| 13.24 | **Draft con 0 items bloqueado** — validar en `updateInvoice` que no se pueda dejar factura sin items | EC-BILL-06 | ⬜ |
| 13.25 | **Cambio de perfil en servicio: efecto en próxima factura** — guardar el cambio como `pending_profile_id` y aplicar en siguiente ciclo | EC-BILL-04 | ⬜ |
| 13.26 | **Proteger borrado de billing profile con facturas vinculadas** — validar existencia antes de permitir DELETE | EC-BILL-05 | ⬜ |
| 13.27 | **Cliente no ve drafts propios** — filtrar `status != draft` en listado de facturas del cliente | EC-BILL-11 | ⬜ |
| 13.28 | **Email verificado requerido para checkout** — guard que comprueba `status != pending_verification` en billing endpoints | EC-CHKOUT-01 | ⬜ |

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

## Sprint 15 — Plugins ⬜

> Objetivo: implementar los plugins de integración uno por uno.
> Cada plugin tiene su propia especificación, API keys, y configuración.
> Referencia: DECISIONS.md §4, §28, §34.
> **Cada plugin se trabaja en detalle — no se generalizan entre sí.**

| # | Paso | Estado |
|---|------|--------|
| 15.1 | **Plugin framework** — `manifest.json` standard, loader dinámico, Settings UI auto-generada desde manifest | ⬜ |
| 15.2 | **Plugin: Stripe** — payment provider. `createPayment()`, `handleWebhook()`, `refund()`. Stripe Checkout / Payment Intents. Webhook signature verification | ⬜ |
| 15.3 | **Plugin: Stripe Connect** — para partners con cuenta conectada. Comisiones automáticas vía split payments | ⬜ |
| 15.4 | **Plugin: Enhance CP** — provisioner hosting web. Create account, suspend, unsuspend, terminate. API + credenciales | ⬜ |
| 15.5 | **Plugin: ResellerClub** — provisioner dominios. Registro, transferencia, renovación. Buscador de disponibilidad | ⬜ |
| 15.6 | **Plugin: Docker Engine** — provisioner contenedores. Deploy desde template YAML, start/stop/restart, métricas, logs | ⬜ |
| 15.7 | **Plugin: Manual** — provisioner de fallback. Genera tarea para el agente en vez de provisionar automáticamente | ⬜ |
| 15.8 | **Plugin: Claude AI** — provider IA. Chat filter, copilot agente, sugerencias. Swappable por otro LLM en el futuro | ⬜ |
| 15.9 | docs/features/plugins/admin.md (uno por plugin) | ⬜ |

**Principios del sistema de plugins:**
- Cada plugin vive en `/src/plugins/<category>/<name>/`
- Cada plugin expone un `manifest.json` con: nombre, versión, categoría, config schema, descripción
- La UI de Settings → Plugins se genera dinámicamente desde los manifests
- Los plugins se activan/desactivan desde Settings sin reiniciar el servidor
- Las API keys y configuraciones se almacenan cifradas (AES-256-GCM, ARCHITECTURE.md §9)
- Solo un plugin activo por categoría (un payment provider activo, un AI provider activo, etc.)
- Los provisioners sí pueden tener múltiples activos (uno por tipo de producto)

---

## Notas para el agente IA

- **Cada sprint se ejecuta en 1-3 sesiones** según complejidad.
- **Si un paso es muy grande** (ej: BillingService completo), se divide en sub-pasos dentro de la sesión.
- **Antes de cada sprint**: leer DECISIONS.md para la lógica de negocio del módulo.
- **Al cerrar cada sprint**: commit, actualizar este roadmap, escribir admin.md.
- **Si hay ambigüedad en la lógica de negocio**: PREGUNTAR, no inventar.

---

## Sprint 16 — i18n + Multi-Currency ⬜

> Objetivo: internacionalización del dashboard y soporte multi-moneda.
> La base de datos ya almacena `language` y `timezone` por usuario.
> Los campos `currency` se irán preparando desde Sprint 5 (productos) y Sprint 6 (facturas).

| # | Paso | Estado |
|---|------|--------|
| 16.1 | Integrar `next-intl` — estructura de mensajes ES/EN | ⬜ |
| 16.2 | Extraer todos los strings hardcodeados del frontend a archivos de traducción | ⬜ |
| 16.3 | Selector de idioma en Settings del usuario | ⬜ |
| 16.4 | Backend: respuestas de error en idioma del usuario (`Accept-Language` o campo `language`) | ⬜ |
| 16.5 | Multi-currency: helper de formateo (`formatCurrency(amount, currency)`) | ⬜ |
| 16.6 | Ajustar billing/invoices para respetar `currency` del perfil de facturación | ⬜ |
| 16.7 | docs/features/i18n/admin.md | ⬜ |

**Notas de compatibilidad base (preparar en sprints previos):**
- Sprint 5: campo `currency` en tabla `products` (default `EUR`)
- Sprint 6: campo `currency` en tabla `invoices` y `invoice_items`
- Sprint 12: selector de idioma en la página de Settings
- NO hardcodear `€` ni `EUR` — usar siempre el helper de formateo

---

## Sprint 17 — Promotions & Discounts ⬜

> Objetivo: sistema de promociones (upsell/crossell) y códigos de descuento.
> Referencia: DECISIONS.md §25, §30. DATABASE_SCHEMA.md BLOQUE 9.
> Dependencias: Sprint 5 (products), Sprint 6 (billing).

| # | Paso | Estado |
|---|------|--------|
| 17.1 | PromotionsService: CRUD reglas de promoción (upsell/crossell) | ⬜ |
| 17.2 | Condiciones de promoción — AND lógico, 5 tipos (`has_product`, `plan_is`, etc.) | ⬜ |
| 17.3 | Mensajes por ubicación (checkout, post-checkout, notification, banner) con variables | ⬜ |
| 17.4 | Motor de evaluación — trigger → condiciones → incentivo → rotación | ⬜ |
| 17.5 | Visualizaciones por cliente — max views, dismissed, accepted | ⬜ |
| 17.6 | **Códigos de descuento** — CRUD, límites (total, por cliente, por ciclo, por producto) | ⬜ |
| 17.7 | Contadores atómicos SQL para `uses_count` (sin race conditions) | ⬜ |
| 17.8 | Cola BullMQ `promotions` — evaluate-rules, expire-promotions, apply-discount | ⬜ |
| 17.9 | Frontend: gestión de promociones (admin) | ⬜ |
| 17.10 | Frontend: gestión de códigos de descuento (admin) | ⬜ |
| 17.11 | Frontend: banners/modales de promoción en dashboard del cliente | ⬜ |
| 17.12 | docs/features/promotions/admin.md | ⬜ |

---

## Sprint 18 — Landing Integration ⬜

> Objetivo: conectar la landing page con el dashboard.
> Referencia: DECISIONS.md §16. 5 funciones de integración.
> Dependencias: Sprint 6 (billing), Sprint 7 (support), Sprint 11 (provisioning), Sprint 15 (plugins).

| # | Paso | Estado |
|---|------|--------|
| 18.1 | **API catálogo público** — endpoint sin auth para productos/precios (landing consume) | ⬜ |
| 18.2 | **Buscador de dominios** — endpoint proxy a ResellerClub, validación, precios | ⬜ |
| 18.3 | **Checkout desde landing** — flujo compra sin cuenta → registro + pago + provisioning | ⬜ |
| 18.4 | **Webchat landing** — widget que conecta al sistema de soporte (chat anónimo) | ⬜ |
| 18.5 | **Formulario de contacto** — genera conversación asíncrona en el dashboard | ⬜ |
| 18.6 | Frontend landing: integración de APIs (catálogo, buscador, checkout, webchat) | ⬜ |
| 18.7 | docs/features/landing-integration/admin.md | ⬜ |

---

## Sprint 19 — Partner Module ⬜

> Objetivo: módulo partner completo (Fase 2). 7 sesiones de trabajo.
> Referencia: PARTNER_ARCHITECTURE.md, PARTNER_DECISIONS.md, PARTNER_SCHEMA.md.
> Dependencias: Sprint 6 (billing: invoice.paid), Sprint 7 (support: conversations lectura), Sprint 9 (notifications), Sprint 15 (plugins: Stripe Connect).

| # | Paso | Estado |
|---|------|--------|
| 19.1 | **Schema y migraciones** — 9 tablas nuevas + campos nullable en users/services/invoices/products | ⬜ |
| 19.2 | **Onboarding y auth** — registro partner, PartnerGuard, PartnerClientGuard, aprobación admin | ⬜ |
| 19.3 | **Dashboard partner (lectura)** — endpoints GET (clientes, servicios, facturas, soporte), métricas inicio | ⬜ |
| 19.4 | **Comisiones** — worker `generate-commission` al escuchar `invoice.paid`, cálculo por invoice_item | ⬜ |
| 19.5 | **Liquidaciones** — job mensual `generate-monthly-payouts`, workers SEPA + Stripe Connect, retry | ⬜ |
| 19.6 | **Comunicación** — tickets bidireccionales + notificaciones unidireccionales + notas inmutables | ⬜ |
| 19.7 | **Desvinculaciones** — flujo completo (solicitud → aceptar/rechazar → escalación → forzar) | ⬜ |
| 19.8 | **Vinculación cuentas** — partner + cliente del mismo usuario, aprobación admin, descuento | ⬜ |
| 19.9 | **Suspensión por inactividad** — job `check-partner-client-status`, config en settings | ⬜ |
| 19.10 | Frontend: dashboard completo del partner (6 secciones) | ⬜ |
| 19.11 | Frontend: gestión de partners (superadmin) — lista, aprobar, rechazar, suspender | ⬜ |
| 19.12 | Frontend: indicador "Aelium · Partner con [Agencia]" en dashboard del cliente del partner | ⬜ |
| 19.13 | docs/features/partner/admin.md + partner.md + client.md | ⬜ |

---

## Sprint 20 — Referral System ⬜

> Objetivo: sistema de referidos para clientes normales (no partners).
> Referencia: DECISIONS.md §36. DATABASE_SCHEMA.md BLOQUE 13.
> Dependencias: Sprint 6 (billing: facturas + créditos).

| # | Paso | Estado |
|---|------|--------|
| 20.1 | **Schema y migraciones** — 3 tablas: referral_codes, referrals, referral_credits | ⬜ |
| 20.2 | Auto-generación de `referral_code` al crear cuenta de cliente | ⬜ |
| 20.3 | Registro via enlace de referido — detectar código, estado `pending` | ⬜ |
| 20.4 | Activación al primera compra — estado `active`, descuento primer pedido | ⬜ |
| 20.5 | Job mensual `generate-monthly-credits` — buscar referrals activos, generar crédito | ⬜ |
| 20.6 | Job `apply-referral-discount` — aplicar créditos pendientes en próxima factura | ⬜ |
| 20.7 | Job diario `check-referral-status` — detectar referidos sin servicios → inactive | ⬜ |
| 20.8 | Expiración de créditos — configurable en settings (`referrals.credit_expiry_months`) | ⬜ |
| 20.9 | 4 settings configurables (crédito mensual, descuento %, límite, activo sí/no) | ⬜ |
| 20.10 | Frontend: sección referidos en perfil del cliente (enlace, historial, créditos) | ⬜ |
| 20.11 | Frontend: gestión referidos (admin) — estadísticas globales, configuración | ⬜ |
| 20.12 | docs/features/referrals/admin.md + client.md | ⬜ |

---

## Sprint 21 — CRM Completeness ⬜

> Objetivo: completar funcionalidades del CRM que quedaron fuera del Sprint 4.
> Referencia: DECISIONS.md §15.
> Dependencias: Sprint 4 (clients), Sprint 11 (provisioning: servicios activos).

| # | Paso | Estado |
|---|------|--------|
| 21.1 | **Organización de servicios** — carpetas + etiquetas del cliente (3 tablas) | ⬜ |
| 21.2 | **Alertas proactivas CRM** — dominio expira, factura vence, inactividad Nextcloud | ⬜ |
| 21.3 | **Onboarding del cliente** — flujo post-registro, tarea WOW automática 24h | ⬜ |
| 21.4 | **Ficha cliente: tab Servicios** — lista de servicios activos del cliente (estado, producto, fecha renovación, badge slot) | ⬜ |
| 21.5 | **Ficha cliente: tab Facturas** — tabla paginada de facturas del cliente con filtros y link a detalle | ⬜ |
| 21.6 | Frontend: carpetas/etiquetas en panel de servicios del cliente | ⬜ |
| 21.7 | Frontend: alertas proactivas en ficha del cliente (admin/agente) | ⬜ |
| 21.8 | docs/features/crm/admin.md | ⬜ |

---

## Orden de ejecución recomendado

```
FASE 1 — CORE (Sprints 0-14)
  Sprint 0  Scaffolding                    ✅
  Sprint 1  Auth                           ✅
  Sprint 2  Notifications Core             ✅
  Sprint 3  Auth Frontend Polish           ✅
  Sprint 3.5 Auth Hardening               ✅
  Sprint 4  Clients                        ✅
  Sprint 5  Products + PBAC                ✅
  Sprint 6  Billing Engine                 ✅
  Sprint 7  Support                        ⬜
  Sprint 8  Tasks + Support Inside         ⬜
  Sprint 9  Audit + Notifications Full     ⬜
  Sprint 10 Infrastructure                 ⬜
  Sprint 11 Provisioning                   ⬜
  Sprint 12 Settings + Knowledge Base      ⬜
  Sprint 12.5 RGPD                         ⬜
  Sprint 13 Hardening                      ⬜
  Sprint 14 Deploy                         ⬜

FASE 2 — PLUGINS + EXPANSIÓN (Sprints 15-21, orden flexible)
  Sprint 15 Plugins                        ⬜  (después de Sprint 14 — requiere Settings + Deploy)
  Sprint 16 i18n + Multi-Currency          ⬜  (después de Sprint 14)
  Sprint 17 Promotions & Discounts         ⬜  (después de Sprint 6)
  Sprint 18 Landing Integration            ⬜  (después de Sprint 15)
  Sprint 19 Partner Module                 ⬜  (después de Sprint 15: Stripe Connect)
  Sprint 20 Referral System                ⬜  (después de Sprint 6)
  Sprint 21 CRM Completeness              ⬜  (después de Sprint 11)
```

