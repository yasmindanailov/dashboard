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
6. **Regla 15**: al tocar un módulo, verificar que todos sus archivos cumplen los límites de ARCHITECTURE.md Regla 15. Si no cumplen, refactorizar ANTES de añadir lógica nueva.
7. **Design System**: toda interfaz nueva usa exclusivamente los componentes de `components/ui/` y sigue `DESIGN_SYSTEM.md` + `UI_SPEC.md`. Ver ARCHITECTURE.md Regla 16.

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
- ~~**EC-5.4** (Sprint 8): Validar restricción de `we_do_it` addon~~ — **DEPRECADO** (§44): WDIFY reemplazado por módulo Projects (Sprint 22).
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
| 7.0.1 | **Admin checkout: UI selector de cliente** — cuando rol es admin, mostrar selector de usuario destino antes de proceder | EC-BILL-02 | ✅ |
| 7.0.2 | **Admin checkout: validar `targetUserId` obligatorio** — el admin no puede crear servicios para sí mismo; debe seleccionar un cliente destino | EC-BILL-01 | ✅ |
| 7.0.3 | **Validar perfil de facturación contra `targetUserId`** — en checkout admin, el `billing_profile_id` debe pertenecer al cliente destino, no al admin | EC-BILL-03 | ✅ |
| 7.0.4 | **IVA se recalcula al editar items de factura** — `updateInvoice` debe recalcular subtotal, tax_amount y total cuando se modifican items | EC-BILL-07 | ✅ |
| 7.0.5 | **Descuento anual aplicado en checkout** — aplicar `discount_percentage` del plan anual al calcular el precio en el servicio y factura | EC-CHKOUT-04 | ✅ |

**Support — Core:**

| # | Paso | Estado |
|---|------|--------|
| 7.1 | SupportService: crear/responder conversaciones, CASL, DTOs, ownership enforcement, stats, SLA tracking | ✅ |
| 7.2 | **WebSocket con Socket.io** — namespace `/support`, JWT auth, rooms (conversation/agent/user), event bridge | ✅ |
| 7.3 | **Chat en tiempo real** — widget flotante, typing indicators, read receipts, WS + REST fallback | ✅ |
| 7.3.1 | **Arquitectura dual Chat + Tickets** — schema (type/category/escalated_from_id), DTOs separados, endpoints `/chats` y `/tickets`, escalación chat→ticket, bandeja de tickets (Gmail-like) | ✅ |
| 7.3.2 | **Panel chat agente** — 3 columnas (lista chats / conversación RT / contexto cliente), WS, notas internas, escalación, resolución | ✅ |
| 7.10 | Frontend: bandeja de tickets admin — stats, filtros categoría/estado/prioridad, paginación, modal nuevo ticket | ✅ |
| 7.11 | Frontend: detalle de conversación — vista detalle, mensajes, notas internas, controles admin | ✅ |
| 7.12 | Emails: conversación creada, respuesta de agente, asignación de conversación | ✅ |
| 7.13 | docs/features/support/admin.md | ✅ |

**Support — Hardening (bugs y edge cases de la auditoría):**

| # | Paso | Origen | Estado |
|---|------|--------|--------|
| 7.H1 | **Fix mensaje duplicado** — ChatWidget envía por WS + REST; gateway también persiste. Resultado: mensaje guardado 2 veces. **Solución:** widget solo envía por WS, REST solo como fallback si WS falla | EC-1, EC-2 | ✅ |
| 7.H2 | **Guard de escalación única** — `escalateToTicket()` no verifica si el chat ya fue escalado. Añadir check de `escalated_to` existente | EC-3 | ✅ |
| 7.H3 | **Cleanup typing on disconnect** — en `handleDisconnect`, broadcast `typing:stop` a todas las rooms del usuario desconectado para limpiar indicador | EC-7 | ✅ |
| 7.H4 | **Comportamiento post-escalación** — definir qué pasa si un cliente escribe en un chat `resolved` por escalación: ¿se reabre el chat o se redirige al ticket? Implementar guard | EC-6 | ✅ |
| 7.H5 | **Página [id] diferenciada por tipo** — mostrar categoría + badge escalación para tickets, botón "⬆ Escalar" para chats, link al ticket/chat vinculado si existe | EC-8 | ✅ |
| 7.H6 | **DTO `type` redundante** — hacer `type` opcional en `ConversationListQueryDto` ya que el controller lo fuerza. Evitar conflicto si el frontend lo envía | EC-9 | ✅ |
| 7.H7 | **Sorting de chats para agente** — priorizar `waiting_agent` (tu turno) sobre `open` en la lista de chats del panel de agente | EC-5 | ✅ |
| 7.H8 | **Panel agente: indicador asignación** — distinguir visualmente chats asignados al agente actual vs sin asignar vs asignados a otro | EC-10 | ✅ |
| 7.H9 | **Unread count separado por tipo** — `getUnreadCount()` debe filtrar por `type`. Widget solo cuenta chats, bandeja solo tickets | EC-11 | ✅ |
| 7.H10 | **Stats filtrados en UI** — el dashboard de stats debe mostrar indicadores separados para chats y tickets, no mezclados | EC-4 | ✅ |
| 7.H11 | **Nomenclatura §9 → §43** — actualizar §9 de DECISIONS.md para alinear con §43: "Conversaciones" → "Tickets", "Casos" → obsoleto | INC-1 | ✅ |
| 7.H12 | **Chat directo sin formulario** — usuario logueado abre chat al escribir su primer mensaje, sin pedir asunto ni cuerpo previo. Se auto-genera subject | UX | ✅ |
| 7.H13 | **Nombres en mensajes** — mostrar nombre del sender (cliente y agente) sobre cada burbuja, tanto en widget, panel agente, y página [id] | UX | ✅ |
| 7.H14 | **Indicador "última vez en línea"** — en el header del chat widget, mostrar cuándo fue la última respuesta de un agente en la conversación activa | UX | ✅ |
| 7.H15 | **Historial soporte en ficha cliente** — tab "Soporte" en la ficha del cliente con listado de chats y tickets, clickable a detalle | UX | ✅ |
| 7.H16 | **Notas del cliente en panel agente** — en la columna derecha del panel de chats, mostrar las notas internas del cliente como contexto para el agente | UX | ✅ |
| 7.H17 | **Nota de resolución obligatoria** — al resolver, cerrar, o escalar, el agente debe escribir una nota explicando la resolución. Se guarda en `resolution_note` y como mensaje de sistema. Buscable | UX/BL | ✅ |
| 7.H18 | **Autoría en notas de resolución** — `resolved_by_id` + `resolved_by_name` resuelto en findOne. La nota del sistema muestra quién resolvió | UX | ✅ |
| 7.BF1 | **Fix "Cargando contexto..." eterno** — reset de `clientContext` al cambiar chat, error state para chats sin usuario o API fallida | BUG | ✅ |
| 7.H19 | **Notas estructuradas del cliente** — modelo `ClientNote` con categoría (conversation/solution/billing/technical/general), autoría, vinculación a conversación, pin, auto-creación al enviar nota interna | ARCH | ✅ |
| 7.H20 | **Widget CTA "Empezar conversación"** — reemplaza input inferior con botón CTA superior. Scroll en lista de conversaciones. Placeholder para Support Inside | UX | ✅ |
| 7.H21 | **Nombre del cliente en detalle ticket/chat** — `client_name` + `client_email` resueltos en `findOne`. Badge con link a ficha del cliente en el header | UX | ✅ |
| 7.H22 | **Sync bidireccional de notas** — resolution notes → ClientNote(solution), notas legacy → ClientNote(general), internal messages → ClientNote(conversation). Ficha de cliente con filtros por categoría, pin, fecha formateada, autor, link a conversación origen | ARCH | ✅ |
| 7.H23 | **Nota obligatoria al reabrir** — backend exige `resolution_note` para status `open` (reopen). Mensaje de sistema incluye motivo. ClientNote(general) auto-creada | UX/BL | ✅ |
| 7.H24 | **Coherencia acciones panel chat** — topbar: ✓ Resolver + 🔒 Cerrar. Sidebar: 👤 Ver perfil + ⬆ Escalar. Sin duplicados entre zonas. Eliminado "Ver detalle completo" por contraproducente | UX | ✅ |
| 7.BF2 | **Fix badge duplicado "Escalado desde chat"** — oculta la categoría `escalated_chat` cuando ya hay link de escalación dedicado | BUG | ✅ |
| 7.H25 | **Página de detalle canónica con sidebar** — `/support/[id]` ahora tiene layout 2 columnas: conversación + sidebar de contexto del cliente (perfil, servicios, notas, acciones). Acciones reorganizadas: topbar = resolver/cerrar, sidebar = ver perfil/ir a chats | UX/ARCH | ✅ |

**Support — Chat anónimo (Landing):**

| # | Paso | Estado |
|---|------|--------|
| 7.4.1 | **Guest token generation** — generar `guest_session_token` (hash SHA-256 de session + timestamp), almacenar en cookie HttpOnly | ✅ |
| 7.4.2 | **DTO y endpoint de chat anónimo** — `POST /support/chats/guest` con `guest_name`, `guest_email` (opcional), `body`. Sin JWT, validar por guest token | ✅ |
| 7.4.3 | **Rate limiting para anónimos** — throttle en endpoint guest: máx 3 chats/hora por IP, máx 10 mensajes/minuto por sesión | ✅ |
| 7.4.4 | **Gateway: auth fallback para guest** — en `handleConnection`, si no hay JWT válido, aceptar guest_session_token con permisos reducidos (solo su chat) | ✅ |
| 7.4.5 | **Frontend widget: modo guest** — detectar si no hay JWT, mostrar formulario nombre/email antes del primer mensaje. Reutilizar mismo `ChatWidget` | ✅ |
| 7.5.1 | **Vinculación por email** — al registrarse un usuario con email que coincide con `guest_email` de chats existentes, ejecutar migración automática: `user_id = nuevo_user.id`, limpiar campos guest | ✅ |
| 7.5.2 | **Vinculación manual por agente** — en panel de chat, botón "Vincular a cliente" que permite buscar un cliente y asociar el chat huérfano (sin email) | ✅ |
| 7.5.3 | **Cleanup de sesiones expiradas** — cron job para limpiar chats guest sin actividad en >30 días (configurable en settings) | ✅ |

**Support — Operaciones:**

| # | Paso | Estado |
|---|------|--------|
| 7.6.1 | **Modelo de datos horario** — nueva tabla `support_schedule` o campo JSON en Settings: días de la semana + franjas horarias + timezone | ⬜ |
| 7.6.2 | **Lógica backend** — middleware en gateway y controller: si fuera de horario, respuesta automática "Estamos fuera de horario, te responderemos a las X:XX" | ⬜ |
| 7.6.3 | **Widget: indicador horario** — mostrar estado "🟢 En línea" / "🔴 Fuera de horario" en el header del widget + mensaje informativo | ⬜ |
| 7.7 | **Archivos adjuntos** — integración MinIO para mensajes con archivos. Upload desde widget y panel agente. Preview inline para imágenes | ⬜ (bloqueado: Sprint 14 MinIO) |

**Support — Ticket UX Enhancement (Sprint 7.6):**

> Objetivo: transformar la experiencia de tickets de chat-bubbles a email-style profesional.
> Bloqueado parcialmente por Storage (MinIO) para adjuntos.

| # | Paso | Dependencia | Estado |
|---|------|-------------|--------|
| 7.6.1 | **Rich text editor (TipTap)** — componente `RichEditor` en Design System: negrita, cursiva, listas, headings, color de texto, enlaces. Sanitización HTML en backend (DOMPurify). Migration path: mensajes plaintext existentes renderean como `<p>` | DS Sprint 7.5 | ⬜ |
| 7.6.2 | **Mensajes email-style para tickets** — reemplazar burbujas por bloques tipo Gmail: header con nombre+fecha, cuerpo HTML renderizado, separador entre mensajes. Solo para `type=ticket` — chats mantienen burbujas | 7.6.1 | ⬜ |
| 7.6.3 | **Adjuntos en mensajes** — upload de imágenes y documentos desde el editor. Preview inline para imágenes, link de descarga para docs. Límites: 10MB/archivo, tipos permitidos configurables | Sprint 14 MinIO, 7.6.1 | ⬜ |
| 7.6.4 | **Subject editable por agente** — permitir al agente modificar el subject del ticket para reflejar mejor el contenido tras la primera respuesta | — | ⬜ |

**Support — IA (bloqueado por Sprint 15):**

| # | Paso | Estado |
|---|------|--------|
| 7.8 | **Filtro IA chat** — agente IA para clientes sin Support Inside: recibe contexto del cliente, intenta resolver, escala a humano si no puede. Transparente: "Estás siendo atendido por IA" | ⬜ |
| 7.9 | **Copilot IA agente** — panel lateral con sugerencias de respuesta generadas con contexto del cliente + documentación interna + voz de Aelium | ⬜ |

**Support — Pendientes de otros módulos:**

| # | Paso | Dependencia | Estado |
|---|------|-------------|--------|
| 7.SI.1 | **Badge Support Inside en chat** — verificar si el cliente tiene Support Inside activo y mostrar badge en widget, panel agente y lista de chats. Skip filtro IA si tiene SI | Módulo Support Inside | ⬜ |
| 7.SI.2 | **Página Support Inside del cliente** — zona en dashboard: plan actual, canales disponibles, servicios con slot, historial de valor, medios de contacto | Módulo Support Inside | ⬜ |

**Support — Refactorización Regla 15 (backend ✅, frontend ⬜):**

> Backend del módulo support ya refactorizado: `support.service.ts` (1054→90 fachada + 4 sub-servicios), `support.gateway.ts` (526→232 + auth helper).
> Falta refactorizar el frontend del módulo.

| # | Paso | Estado |
|---|------|---------|
| 7.R15.1 | **`chats/page.tsx` (907→77 líneas)** — extraído: `types.ts` (56), `useChatPanel.ts` (238), `ChatList.tsx` (109), `ChatConversation.tsx` (188), `ChatClientContext.tsx` (274), `ResolutionModal.tsx` (107). Build ✅ | ✅ |
| 7.R15.2 | **`ChatWidget.tsx` (671→155 líneas)** — extraído a `ChatWidget/`: `types.ts` (41), `useChatWidget.ts` (205), `GuestForm.tsx` (87), `ConversationList.tsx` (75), `ChatMessages.tsx` (123), `index.tsx` (155). Build ✅ | ✅ |
| 7.R15.3 | **`support/page.tsx` (557→102 líneas)** — extraído: `types.ts` (64), `useTicketInbox.ts` (134), `TicketStatsCards.tsx` (37), `TicketList.tsx` (132), `NewTicketModal.tsx` (216). Build ✅ | ✅ |
| 7.R15.4 | **`support/[id]/page.tsx` (733→88 líneas)** — extraído: `types.ts` (62), `useConversationDetail.ts` (158), `ConversationHeader.tsx` (134), `ConversationMessages.tsx` (176), `ConversationSidebar.tsx` (151), `DetailResolutionModal.tsx` (108). Build ✅ | ✅ |
| 7.R15.5 | **`billing/checkout/page.tsx` (570→233 líneas)** — extraído: `types.ts` (62), `useCheckout.ts` (157), `StepConfirm.tsx` (133). Build ✅ | ✅ |
| 7.R15.6 | **`layout.tsx` (394→79 líneas)** — extraído: `Sidebar.tsx` (179), `Topbar.tsx` (74). Build ✅ | ✅ |
| 7.R15.7 | **`clients/[id]/page.tsx` (683→243 líneas)** — extraído: `types.ts` (55), `ClientSupportTab.tsx` (78), `ClientNotesTab.tsx` (158). Build ✅ | ✅ |
| 7.R15.8 | **`products/page.tsx` (323→282 líneas)** — extraído: `types.ts` (42). Build ✅ | ✅ |
| 7.R15.9 | **`products/new/page.tsx` (347→296 líneas)** — extraído: `constants.ts` (62). Build ✅ | ✅ |

---

## Sprint 7.5 — Design System Foundation ⬜

> Objetivo: establecer las bases visuales del dashboard antes de construir más módulos.
> Documento de referencia: docs/DESIGN_SYSTEM.md.
> Todo módulo nuevo debe usar estos componentes. Todo módulo existente se migra progresivamente.

**Fase 1 — Tokens y componentes base:**

| # | Paso | Estado |
|---|------|--------|
| 7.5.D1 | **Tokens CSS** — crear `tokens.css` con todas las variables de diseño (colores, spacing, radii, shadows, tipografía). Importar globalmente. Eliminar valores hardcodeados | ✅ |
| 7.5.D2 | **Button** — componente reutilizable con variantes (primary, secondary, ghost, danger), tamaños (sm, md, lg), loading state | ✅ |
| 7.5.D3 | **Input + Select + SearchInput + Textarea** — componentes de formulario con label, error, helper text. Select con options array. SearchInput con icono, clear, loading. Textarea con char counter | ✅ |
| 7.5.D4 | **Badge + StatusDot** — badges semánticos sin emojis. StatusDot para estados en línea/fuera de horario | ✅ |
| 7.5.D5 | **Card** — container estándar. Variantes: default, interactive (hover effect) | ✅ |
| 7.5.D6 | **Modal** — overlay, título, body, footer. Close on ESC + click outside. Confirmación para acciones destructivas | ✅ |
| 7.5.D7 | **Table** — headers, rows, sorting, empty state integrado. Skeleton loading | ✅ |
| 7.5.D8 | **Toast** — notificaciones efímeras: success, error, warning, info. Auto-dismiss | ✅ |
| 7.5.D9 | **EmptyState + Skeleton** — estados vacíos y loading placeholders | ✅ |
| 7.5.D10 | **Avatar + Tooltip + Dropdown** — componentes complementarios | ✅ |
| 7.5.D10b | **Pagination + StatsCard + AlertBanner** — componentes de layout y navegación para migración de páginas | ✅ |
| 7.5.D10c | **UI_SPEC.md** — especificación completa de interfaz: 4 roles, 6 principios UX, 6 tipos de página, reglas de contenido, 12 patrones de interacción, especificación de 13 páginas. Fuente de verdad para layout. | ✅ |
| 7.5.D10d | **StatusTabs** — tabs con contadores de estado para list pages. Variantes semánticas (success/warning/danger). Reemplaza StatsCards en listados (UI_SPEC §3.2). Exportado + preview + build ✅ | ✅ |
| 7.5.D10e | **Breadcrumb** — ya existía en DS (creado en D10b). Navegación jerárquica con chevron separators. Build ✅ | ✅ |
| 7.5.D10f | **Tabs** — ya existía en DS (creado en D10). Tabs de contenido con counters opcionales. Build ✅ | ✅ |

**Fase 2 — Migración de páginas existentes:**

> Cada página se migra al design system según UI_SPEC.md §5: eliminar `style={{}}`, aplicar anatomía de tipo de página, empty states con tono Aelium, jerarquía de acciones.

| # | Paso | Estado |
|---|------|--------|
| 7.5.D11 | **Dashboard shell** — Sidebar, Topbar y Layout migrados a CSS modules. **Topbar:** Cmd+K trigger (izquierda, desktop), botón soporte con panel de canales (solo clientes §P3), perfil con Dropdown DS (Mi perfil, Config, Cerrar sesión), notificaciones con badge slot. **Sidebar:** inline styles→CSS module, SVG icons stroke 1.5, collapse toggle. **Layout:** CSS module, eliminado `<style>` tag inline. **Fixes:** Dropdown DS corregido para no forzar 32×32 en triggers custom (nueva clase `.triggerCustom`). 3 tokens añadidos a globals.css (`--space-2_5`, `--shadow-xl`, `--transition-normal`). Build ✅ | ✅ |
| 7.5.D12 | **Página de clientes** — migrada: Table, Badge, SearchInput, Pagination, Avatar. Eliminados style={{}}, SVG search icon manual. 241→175 líneas | ✅ |
| 7.5.D13 | **Página de productos** — migrada: Table, Badge, SearchInput, Select, Pagination, Button, Card, Tooltip. Grid manual→Table. 309→224 líneas | ✅ |
| 7.5.D14 | **Página de billing** — migrada: Table, Badge, SearchInput, Select, Pagination, Button, StatsCard, AlertBanner. Eliminados emojis (📄💰⏳🔴🔍), colores hardcodeados (#635BFF). 317→200 líneas | ✅ |
| 7.5.D15 | **Página de soporte (tickets)** — migrada: page.tsx (111→90), TicketStatsCards (43→27 vía StatsCard), TicketList (143→110 vía Badge+Card+EmptyState+Skeleton+Pagination), NewTicketModal (227→146 vía Modal+Input+Select+Textarea+Button+SearchInput) | ✅ |
| 7.5.D16 | **Panel de chats** — migrado: page.tsx (85→75 vía CSS module), ChatList (116→116 vía SearchInput+Badge+StatusDot+Skeleton+EmptyState), ChatConversation (201→159 vía Button+EmptyState+CSS module), ChatClientContext (291→161 vía Avatar+Card+Button+SearchInput+Skeleton), ResolutionModal (115→88 vía Modal+Textarea+Button), GuestLinkingPanel extraído (69 líneas). CSS module: `chats.module.css` (610 líneas). Zero inline styles. Build ✅ | ✅ |
| 7.5.D16b | **Layout Components** — creados: `PageHeader` (48 líneas, §3.5), `FilterBar` (46 líneas, §3.4), `ListPage` (79 líneas, §2.4), `DetailPage` (109 líneas, §2.5). CSS modules con tokens. Barrel export actualizado. Responsive stacking en mobile (max-width 639px). ARIA roles en tabs de DetailPage. Build ✅ | ✅ |
| 7.5.D17 | **SupportPanel (§3.9)** — eliminado ChatWidget bubble flotante. Creado `SupportPanel` como sidebar panel (380px, slide-in derecha, overlay dimmed). Trigger: botón "Chat en vivo" del panel de canales del Topbar (D11). Reutiliza `useChatWidget` (WebSocket, REST fallback, guest mode). 4 archivos nuevos: `SupportPanel.tsx` (140L), `PanelChat.tsx` (95L), `PanelConversationList.tsx` (65L), `PanelGuestForm.tsx` (71L). CSS module `SupportPanel.module.css` (322L). Zero inline styles, zero hex. Cierre: ✕ + overlay + ESC. Mobile: fullscreen. Topbar `onOpenSupportPanel` prop + Layout state lifting. Build ✅ | ✅ |
| 7.5.D19 | **Limpieza global de emojis** — eliminados todos los emojis del frontend. Dashboard `page.tsx`: `👋` eliminado. `ClientNotesTab.tsx`: `📌`/`📍` → SVG pin icon con color DS. `ConversationSidebar.tsx`: `📌` → `▪` text. `constants.ts` (products): 6 emojis (`🌐🔗🐳🛡️🛠️📐`) → cadena vacía (SVGs en D24). `Topbar.tsx` + `StatusDot.tsx`: emojis en comentarios limpiados. Zero emojis en todo el frontend. Build ✅ | ✅ |
| 7.5.D20 | **Aplicar UI_SPEC a list pages** — 4 list pages migradas a `ListPage` + `FilterBar`. StatusTabs en Billing y Support. Select en Clientes y Productos. Backend extendido con `groupBy`. Build ✅ | ✅ |
| 7.5.D21 | **Aplicar UI_SPEC a detail pages** — 3 detail pages migradas a `DetailPage` (§2.5). Clientes (265→136), Productos (220→181), Billing (318→177). Build ✅ | ✅ |
| 7.5.D22 | **Sub-componentes legacy + patrones §4** — **ClientNotesTab**: reorganizado (body primero, metadata abajo), pin badge eliminado → borde izquierdo brand sutil, hex (#16A34A, #DC2626, #FFFBEB, #FDE68A) → tokens DS (--success, --danger), 24 inline (tokens). **ClientSupportTab**: hex StatusBadge eliminado → Badge DS, EmptyState añadido, 87→90L, hex 4→0, inline 12→9. **TicketList**: CSS module creado (80L), inline 15→2 (solo priority.color dinámico). **TicketStatsCards.tsx**: eliminado (dead code, 0 imports). **NewTicketModal**: ya migrado en D15 (15 inline con tokens, 0 hex, DS components). Build ✅ | ✅ |
| 7.5.D23 | **Checkout migration (§2.6, §5.9)** — **Layout:** `FormPage` (Breadcrumb DS + h1). **DS components:** `<SearchInput>` (client search), `<Card>` (step containers), `<Button loading>` (CTAs + confirm), `<Badge>` (product + savings), `<AlertBanner>` (info + error), `<Skeleton>` (product loading). CSS module `checkout.module.css` (192L). **StepConfirm.tsx:** `<Card>` summary, `<Button loading>`, `<AlertBanner>` callouts. hex 79→0. Build ✅ | ✅ |
| 7.5.D24 | **Form pages migration (§2.6, §5.6)** — **Nuevo componente:** `FormPage` layout (Breadcrumb DS + h1 + sticky actions). Registrado en barrel export. **Layout:** cada form section en su propia `<Card>`. **DS components:** `<Input>`, `<Select>`, `<Textarea>`, `<Button loading>`, `<AlertBanner>`, `<Skeleton>`. CSS module `productForm.module.css` (155L). **new/page.tsx:** Breadcrumb > Productos > Nuevo. Cards: Identidad, Pricing, Provisioning, Ciclo de vida. **edit/page.tsx:** Breadcrumb > Productos > [Nombre] > Editar. Skeleton loading. hex 7→0. Build ✅ | ✅ |
| 7.5.D24.5 | **Layout coherence gaps** — **P0: DetailPage → Breadcrumb DS.** Eliminado `backHref`+`backLabel` props + `BackIcon` SVG + `.backLink` CSS. Sustituido por `breadcrumb: BreadcrumbItem[]` + `<Breadcrumb>` DS (idéntico a FormPage). 3 pages actualizadas: clients/[id], products/[id], billing/[id]. **Width unificado:** ListPage, DetailPage, FormPage = **1200px** (antes: 1200/1000/800). `.wide` variant → 1400px. **FormPage actions:** eliminados `sticky`, `background`, `border-top`. **CSS cleanup:** productForm.module.css stripped 160→120L (removidas clases redundantes con DS). checkout.module.css stripped 210→125L. **UI_SPEC §2.5** actualizado: Breadcrumb usa DS component. **§2.6** actualizado: actions sin background/sticky. **§2.8** añadido: Layout Width System (1200px uniforme, prohibiciones explícitas). Build ✅ | ✅ |
| 7.5.D25 | **Support detail migration (§2.5, §4.2, §4.4)** — **Layout:** `DetailPage` con `<Breadcrumb>` DS (Soporte > [Subject] o Chats > [Subject]). **CSS module:** `conversationDetail.module.css` (290L). **page.tsx:** Skeleton loading (§4.4) para ambas columnas + estado not-found. 2 columnas responsivas (messages + sidebar). **ConversationHeader:** inline badges → `<Badge variant>`, raw `<select>` → `<Select size="sm">`, raw buttons → `<Button variant="secondary">`. 19 hex → 0. **ConversationMessages:** 27 hex → 0, bubble clases con variantes (mine/theirs/internal), `<Button loading>` para enviar. **ConversationSidebar:** custom cards → `<Card>`, loading text → `<Skeleton>`, 32 hex → 0. **DetailResolutionModal:** custom overlay → `<Modal size="sm">`, `<Textarea>`, `<Button loading>`. 13 hex → 0. **types.ts:** `STATUS_CONFIG` refactored: `{color, bg}` → `{variant: BadgeVariant}`. **Total:** 94 hex → 0, 74 inline → ~8 (spacing tokens only). Build ✅ | ✅ |
| 7.5.D26 | **Dashboard Overview (§2.3)** — **Backend:** `DashboardModule` con `GET /api/v1/dashboard/overview`. Discriminated union: 4 response types (`AdminOverview`, `ClientOverview`, `AgentOverview`, `PartnerOverview`). Cada uno con Prisma `$transaction` optimizada. **Stats por rol (§2.3 tabla):** Admin: clientes activos, ingresos totales, facturas vencidas, tickets abiertos. Cliente: servicios activos, factura pendiente (€), próx. renovación, tickets abiertos. Agente: chats esperando, tickets sin responder, tareas hoy. Partner: clientes referidos, comisiones del mes, próx. liquidación. **Frontend:** Tipo `OverviewStats` (discriminated union). 4 componentes stats: `AdminStats`, `ClientStats`, `AgentStats`, `PartnerStats`. Greeting contextual por hora + rol. Alertas role-aware. Quick actions role-aware. CSS: `.statsGrid` (4 cols) + `.statsGridThree` (3 cols). Zero hex, zero Tailwind. 1200px (§2.8). Build frontend ✅ + backend ✅ | ✅ |
| 7.5.D26.5 | **Role-text coherence audit (§P6)** — Auditoría exhaustiva de textos/información por rol en todo el dashboard. **UI_SPEC actualizado:** Nuevas secciones P6.1 (Matriz de contenido adaptativo — 17 reglas por página×rol), P6.2 (Tono por rol — derivado del documento de marca), P6.3 (5 Prohibiciones de texto). **7 fixes aplicados:** (1) **Topbar:** eliminado "Tu plan: Básico" hardcodeado → "Plan de soporte activo" (P6.3 regla 1). (2) **Topbar:** fix dead link `/dashboard/catalog` → `/dashboard/billing/checkout` (P6.3 regla 2). (3) **Topbar:** "Configuración" solo visible si rol tiene permiso `Setting` (P6.1). (4) **Billing:** columna "Cliente" oculta para no-admin (P6.3 regla 3). (5) **Billing:** tab "Canceladas" solo para admin (P6.3 regla 5). (6) **Support:** CTA "Abrir ticket" oculto para agent_support/agent_billing — agentes responden, no abren (P6.3 regla 4). CTA text: admin="Nuevo ticket para cliente", client="Nueva conversación". (7) **Overview:** título sección "Alertas" → "Novedades" para client/partner (P6.2 tono). EmptyState messages role-specific. **Checkout:** título/breadcrumb role-aware: admin="Crear servicio para cliente", client="Contratar servicio". Build ✅ | ✅ |
| 7.5.D26.6 | **Cross-module referrer + Conversation display titles** — **1. ContextBackLink (P6.1):** Nuevo componente DS `<ContextBackLink>` — lee `?from=` y `?fromLabel=` de la URL, renderiza "← Volver a {label}" encima del breadcrumb. Solo visible para non-client roles (agent/admin/partner). Integrado automáticamente en `DetailPage` layout con `<Suspense>`. CSS: `.backLink` → texto terciario, hover → brand. **Links wired:** `ConversationSidebar` → "Ver perfil" + "Ver notas" ahora incluyen `?from=/support/{id}&fromLabel=TK-00042 · Subject`. `ClientSupportTab` → click ticket incluye `?from=/clients/{id}&fromLabel=Perfil de {nombre}`. **2. Ticket sequence_number:** Migración DB: `ALTER TABLE conversations ADD COLUMN sequence_number INT UNIQUE`. PostgreSQL SEQUENCE `conversation_ticket_seq` para auto-increment atómico. Asignado en las 3 rutas de creación: `createTicket`, `createTicketForClient`, `escalateToTicket`. Backfill de tickets existentes. **3. Display titles (`getDisplayTitle`):** Tickets → `TK-00042 · Subject`. Chats genéricos → `{ClientName} · 23 abr`. Chats con subject real → `{ClientName} · Subject`. User relation añadida al query de listado. Aplicado en: `TicketList`, breadcrumb detail page. **Schema:** `Conversation.user` relation + `sequence_number` field. Build frontend ✅ + backend ✅ | ✅ |
| 7.5.D27 | **Auth pages migration (§5.13)** — **Layout: Split-screen `AuthLayout`** — Aurora Digital (55%) + Form (45%). `GradientMesh` montado 1 vez en layout compartido. Logo SVG real (`/brand/logo-blue-black.svg`) en card glassmorphism + slogan fadeIn. Mobile: panel form + logo arriba. **CSS module `auth.module.css`** (330L): 24 clases: `.authRoot` (grid 55fr/45fr), `.auroraPanel`, `.formPanel`, `.brandCard` (glassmorphism), `.heading`, `.formStack`, `.fieldGroup`, `.authInput` (focus: brand ring), `.submitButton` (hover: translateY), `.alert` (danger/success/info), `.passwordWrapper`, `.passwordToggle`, `.passwordChecks`, `.successContainer`. Zero hex, zero Tailwind. **5 páginas migradas:** Login (credentials → 2FA → redirect, `AnimatePresence`), Register (form → verify success, password checks §4.6), Forgot (email → success, anti-enumeration), Reset (Suspense + token → new password → success), Verify (auto-verify on mount + Suspense). **Metrics:** ~105 inline → 0, ~28 hex → 0, ~1151L → ~880L. Regla 15 cumplida: sub-componentes EyeIcon, PasswordCheck extraídos. **Brand:** Logo SVGs copiados a `/public/brand/`. Responsive @media 1024px. Build ✅ | ✅ |
| 7.5.D27.1 | **Auth quality hardening** — 6 fixes post-migración (3 críticos + 3 importantes). **Críticos:** (1) `ContextBackLink`: `<a>` → `<Link>` de Next.js — preserva SPA navigation (evita full page reload). Añadido `aria-label`. (2) `DetailPage`: import duplicado de React unificado (`ReactNode` + `Suspense` → 1 línea). (3) `globals.css`: 4 nuevos tokens semánticos `--danger-border`, `--success-border`, `--warning-border`, `--info-border` — eliminan los 3 `rgba()` literales que quedaban en `auth.module.css`. **Importantes:** (4) Login `?expired=true`: lee query param y muestra `alertInfo` "Tu sesión ha expirado" (§4.3). Añadido `Suspense` wrapper para `useSearchParams`. (5) DRY: extraído `auth-components.tsx` con `EyeIcon` + `PasswordCheck` — eliminadas ~90 líneas duplicadas en 3 archivos (login, register, reset). (6) Backend `sequence_number`: los 3 métodos de creación de tickets (`createTicket`, `createTicketForClient`, `escalateToTicket`) ahora refetch con `findUniqueOrThrow` tras asignar el SEQUENCE — la response al frontend incluye `sequence_number` para display inmediato. Logs mejorados: `TK-00042` en vez de UUID. Build frontend ✅ + backend ✅ | ✅ |
| 7.5.D28 | **Ayuda contextual (§4.12)** — **Nuevo componente `HelpTip`** (ⓘ icon + Tooltip multiline 240px). **Tooltip DS extendido:** prop `multiline` para wrapping. **StatsCard/Table:** `label`/`header` type widened `string → ReactNode`. **5 HelpTips aplicados:** (1) Overview ClientStats: "Factura pendiente" → explicación de cobro automático. (2) Overview ClientStats: "Próxima renovación" → explicación de fecha de aniversario. (3) Billing list: columna "Vencimiento" → explicación de cobro. (4) Billing detail: meta "Vencimiento" → explicación con método de pago. (5) Checkout: "setup" fee → "coste único de activación". **Guards:** todos condicionados a `!isAdmin` (solo clientes). Tono Aelium: breve, claro, sin tecnicismos. Máx 2-3 por página. Build ✅ | ✅ |
| 7.5.D29 | **Undo toast (§4.9)** — **Toast DS extendido:** nuevo método `toastUndo(variant, message, onUndo, duration?)` en contexto. **Undo UI:** botón "DESHACER" glassmorphism (`rgba(255,255,255,0.15)` + border) + barra de countdown animada (CSS `@keyframes countdown`, width 100%→0%). **Duración:** 8s por defecto (vs 5s estándar). **Timer cleanup:** `useRef<Map>` de timers, cleanup on unmount + on undo click. **ToastItem:** componente interno extraído para separar lógica de undo. Al hacer click en "Deshacer": ejecuta callback `onUndo()` + dismiss inmediato del toast. **DS Preview actualizado:** 3 demos interactivos — cerrar ticket (undo→reabierto), archivar conversación (undo→restaurada), marcar leído (undo→no leído). **Barrel export:** `toastUndo` añadido a `ToastContextValue`. Build ✅ | ✅ |
| 7.5.D29.1 | **Hardening pass §4 — Toast, Modal, CSS compliance** — **confirm() → Modal DS (§4.2):** 2 `confirm()` nativos eliminados: (1) Product detail delete → `deleteModalOpen` + `<Modal>` con botón "Eliminar definitivamente". (2) Product edit pricing delete → `deletePricingId` + `<Modal>`. **Toast §4.3 aplicado en 5 páginas:** (1) `products/[id]` — toggle status, delete + catch error. (2) `products/[id]/edit` — save, add pricing, delete pricing + catch errors. (3) `products/page` — toggle status + catch error. (4) `billing/page` — finalize/pay/cancel + catch error. (5) `billing/[id]` — finalize/pay/cancel/refund + catch error. **Total: 12 catch vacíos → toast('error') con mensaje.** **Product detail CSS module:** nuevo `productDetail.module.css` — ~50 inline `style={{}}` → clases semánticas (`.headerRow`, `.contentGrid`, `.sectionTitle`, `.detailsGrid`, `.listRow`, `.configStack`, etc.). **Overview inline cleanup:** 8 `style={{}}` → CSS module classes (`.sectionBody`, `.skeletonCard`, `.alertLink`, `.emptyIconSuccess`). **DS Preview:** añadidos `AlertBanner` (4 variantes) + `HelpTip` (3 demos) a la página de preview. Build ✅ | ✅ |
| 7.5.D30 | **Command Palette (§4.10)** — **Nuevo componente `CommandPalette`** (CSS Module + 280L TSX). **Activación:** `Cmd+K` / `Ctrl+K` global (event listener en layout) + click en Topbar search trigger. **UI:** overlay blur 4px + palette 560px con searchbar, secciones, keyboard nav, footer hints. **Secciones role-aware:** (1) **Recientes** — últimas 5 navegaciones (localStorage `aelium_cmd_recent`), icon reloj. (2) **Navegar** — Dashboard, Clientes, Productos, Facturación, Tickets, Chat, Settings (filtrado por PBAC `canAccess`). Diferentes labels por rol: client → "Mis facturas"/"Soporte", admin → "Facturación"/"Tickets". (3) **Acciones rápidas** — Nuevo producto (admin), Nuevo ticket (todos), Contratar servicio (client). Icon brand. **Búsqueda:** filtrado por label + description + keywords (ej: "facturas", "pagos", "cobros" → Facturación). **Keyboard nav:** `↑↓` navegar, `Enter` ejecutar, `Esc` cerrar. Active item highlight + scroll into view. **History:** `addRecent(label, href)` persiste en localStorage, max 5 entries, deduplica por href. **Integración:** `layout.tsx` → state `cmdPaletteOpen`, `useCallback` open/close, `Topbar` → prop `onOpenCommandPalette`. **Barrel:** registrado en `ui/index.ts`. Build ✅ | ✅ |
| 7.5.D30.1 | **Command Palette v2 (deferred)** — Mejoras para cuando haya volumen de datos: (1) **API search** — búsqueda debounced (300ms) de clientes por nombre/email, facturas por número (INV-xxxxx), tickets por ID/asunto. Requiere endpoint `/api/search?q=` global. (2) **Fuzzy matching** — algoritmo subsequence con scoring (reemplaza `includes()`). Highlight de letras matcheadas en resultados. (3) **Scope prefixes** — `@` clientes, `#` facturas/tickets, `>` acciones, `/` páginas. (4) **Loading skeleton** — estado de carga durante búsqueda API. (5) **ARIA completo** — `role="listbox"`, `role="option"`, `aria-activedescendant`. **Trigger:** Sprint 9+ cuando haya 50+ clientes en producción. | ⏳ |
| 7.5.D31 | **Bulk actions (§4.11)** — **Table DS extendido:** nuevas props `selectable`, `selectedIds: Set`, `onSelectionChange`. Checkbox column con `appearance: none` custom + `:checked` + `:indeterminate` states (CSS puro). Header checkbox: select all / deselect all con `useRef` + `indeterminate` DOM property. Row highlight `--brand-subtle` al seleccionar. Skeleton checkbox en loading. Click propagation: `e.stopPropagation()` para no triggear `onRowClick`. **Nuevo componente `BulkActionBar`** — barra flotante fixed bottom-center con slide-up animation. Muestra: count badge + action buttons (children) + "Deseleccionar". `role="toolbar"` + `aria-label`. **Integrado en 3 páginas:** (1) **Billing** (admin): "Cobrar seleccionadas" + "Descargar PDF" + "Cancelar" → bulk con loop `for...of` + contadores ok/fail → toast resumen. Acciones destructivas ("Cobrar"/"Cancelar") → Modal confirmación §4.2. (2) **Products**: "Activar/Desactivar" bulk toggle. (3) **Clients**: "Exportar" (placeholder para implementación backend). **Support:** diferido — ticket list es card-based (no Table). **Barrel:** `BulkActionBar` registrado en `ui/index.ts`. Build ✅ | ✅ |
| 7.5.D32 | **Auditoría final** — Scan automatizado 9 criterios § 4 en TODAS las páginas. **Resultados: 8/9 PASS.** ① Colores literales: 0 ✅ ② Tailwind suelto: **4 archivos legacy** (ClientNotesTab, ClientSupportTab, checkout×2) documentados para Sprint 8, **2 archivos corregidos** (product edit + new → CSS module). ③ Emojis: 0 ✅ ④ Modal §4.2: 4 modals DS, 0 `confirm()`/`alert()` ✅ ⑤ Loading: Skeleton+Button loading en todos ✅ ⑥ EmptyState: 4 pages ✅ ⑦ Toast: ToastProvider layout, 0 silent catch, 8 pages integradas ✅ ⑧ Validación forms: todos validados ✅ ⑨ Regla 15: 39/39 archivos ✅. **Correcciones realizadas:** `productForm.module.css` extendido (+5 classes), product edit (12 TW→CSS module), product new (15 TW→CSS module), dead emoji code eliminado. **30 componentes DS** registrados en barrel. Build ✅ | ✅ |

> **Regla §4 — Checklist de calidad para cada D de migración:**
> Todo D de migración (D22-D27) DEBE verificar antes de marcar ✅:
> - [x] §4.2: Acciones destructivas usan Modal DS (no `confirm()` nativo) — 0 nativos, 7 `<Modal>` DS
> - [x] §4.3: Toast success/error después de cada acción CRUD — 48 toast calls, 0 silent CRUD catches
> - [x] §4.4: Skeleton para carga inicial, Button loading para acciones — Skeleton en 8 pages, `loading={}` en 22 Buttons
> - [x] §4.5: Errores de red → Toast, errores de validación → AlertBanner campo — 3 silent catches corregidos (client detail)
> - [x] §4.7: Transiciones funcionales (hover, modales, tabs) con tokens — 80+ `transition:` con `--transition-fast/base/normal`
> - [x] §4.8: Empty states con icono + texto empático + CTA — 7 `<EmptyState>` DS en 5 pages

| 7.5.D32.1 | **Documentación de cierre Sprint 7.5** — (1) **`edge_cases.md`**: análisis exhaustivo línea a línea de 39 archivos. 28 edge cases documentados (0 P0, 3 P1, 12 P2, 13 P3). Categorías: race conditions, token security, error handling, stale state, UX, a11y, type safety, performance. (2) **`features/` update**: 5 feature docs actualizados con tablas DS por página, matrices de feedback UX (§4), edge cases cruzados, y referencias actualizadas. (3) **`SESSION_RULES.md`**: actualizado a Sprint 7.5, añadido workflow DS obligatorio (10 puntos), tabla de documentos con `edge_cases.md` y `AI_WORKERS.md`. (4) **`DESIGN_SYSTEM.md`**: versión 2.3, registro de 30 componentes completo (añadidos FormPage, StatusTabs, HelpTip, CommandPalette, BulkActionBar, NoPermission), referencia a `edge_cases.md`. Coherencia verificada entre todos los docs. | ✅ |

---

## Sprint 8 — Tasks 🔄

> Objetivo: tareas del equipo, WOW calls, mantenimiento.
> Organizado en 5 fases (A→E) según dependencias entre items.
> Ref: DECISIONS.md §7 (Support Inside), §10 (Tareas), §11 (Notificaciones), §44 (Projects).
> Ref: DATABASE_SCHEMA.md Bloque 6. UI_SPEC.md §5.15 (list), §5.16 (detail).

### Fase A — Schema + fixes base

| # | Paso | Estado |
|---|------|--------|
| 8.1 | TasksService: CRUD + asignación + estados + TasksController (REST API con CASL) | 🔄 |
| 8.1b | **Schema:** modelos `task_checklist_completions` + `maintenance_logs` + `product_checklist_items` + `service_checklist_items` (DATABASE_SCHEMA.md Bloque 6). Migración Prisma | ⬜ |
| 8.1c | **Schema:** campo `task_id` nullable FK en `client_notes` (§5.16 paso 6c: "ClientNote auto-creada linked to task"). Migración Prisma | ⬜ |
| 8.1d | **Backend:** Completar maintenance → crear `maintenance_log` + persistir ambas notas (client + internal) en la tarea + crear `ClientNote` con `task_id` (§10 líneas 400-408, §5.16 líneas 1811-1814) | ⬜ |
| 8.14 | **Backend:** Endpoint listar agentes (`GET /api/v1/users?role=agent*`). Necesario para Select agente en frontend tasks + soporte | ⬜ |

### Fase B — Frontend core

| # | Paso | Estado |
|---|------|--------|
| 8.8 | Frontend: tablero de tareas — ListPage (§5.15) + DetailPage (§5.16) + NewTaskModal + TaskTable | 🔄 |
| 8.8b | **Frontend:** Select agente — asignar/reasignar en List (filtro, §5.15 línea 1670/1707) + Detail (sidebar, §5.16 línea 1785/1832). Admin only. Depende de 8.14 | ⬜ |
| 8.8c | **Frontend:** Bloques adaptativos por tipo de tarea en detail — maintenance→checklist, wow_call→datos cliente, custom_work→notas, project_task→link proyecto (§5.16 líneas 1788-1795). Depende de 8.1b | ⬜ |
| 8.8d | **Frontend DS compliance:** emojis→SVG (Regla D1), SearchInput patrón DS para cliente en modal (como NewTicketModal), nombre cliente=link (patrón ConversationSidebar), card servicio en sidebar (§5.16) | ⬜ |
| 8.8e | **Frontend:** ClientNotesTab — enlace "Ver tarea origen" cuando nota tiene `task_id` (patrón existente con `conversation_id` → "Ver conversación origen"). Depende de 8.1c | ⬜ |

### Fase C — Automatización

| # | Paso | Estado |
|---|------|--------|
| 8.2 | **Tareas automáticas:** listener `service.provisioned` → crear `wow_call` si es primer producto del cliente. Plazo 24h. Auto-asignación al agente del cliente (§10 línea 380/384) | ⬜ |
| 8.3 | **WOW calls:** checklist post-alta. Depende de 8.1b (product_checklist_items) | ⬜ |
| 8.12 | **Job CRON:** marcar tareas con `due_date` pasada como `not_completed_in_time` (§10 línea 398). Emitir evento `task.overdue` | ⬜ |
| 8.10 | **Notificaciones:** listeners para `task.assigned`, `task.overdue`, `maintenance.completed`, `maintenance.critical` (§11 líneas 449-452) | ⬜ |

### Fase D — Support Inside (módulo separado)

| # | Paso | Estado |
|---|------|--------|
| 8.4 | **Support Inside** — Schema + Service: `support_inside_config`, `support_inside_subscriptions`, `support_inside_slots`. Configuración de planes (Básico/Medium/Pro), asignación de slots a servicios (§7) | ⬜ |
| 8.5 | **Support Inside** — página del cliente (plan, slots activos, historial de valor, canales disponibles) (§7 líneas 275-281) | ⬜ |
| 8.6 | **Support Inside** — cancelación cascada de slots, recurrencia mantenimiento (anniversary_day), job CRON generación mensual (§7 líneas 267-273) | ⬜ |
| 8.7 | ~~**We Do It For You**~~ — **DEPRECADO**: reemplazado por módulo Projects (Sprint 22). El CTA "Solicitar desarrollo personalizado" en la página del servicio crea un proyecto, no un addon | ~~⬜~~ |
| 8.9 | Frontend: vista mantenimiento mensual — calendario/timeline de tareas recurrentes por anniversary_day. Depende de 8.6 | ⬜ |
| 8.13 | **Job CRON:** alerta tarea crítica — maintenance sin completar X días antes de fin de mes (§7 líneas 272-273). X configurable en settings. Emitir `maintenance.critical` | ⬜ |

### Fase E — Cierre

| # | Paso | Estado |
|---|------|--------|
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
| 13.29 | **Catálogo del dashboard** — página `/dashboard/catalog` con features comparativas, planes, badge "Más popular". Alimentado por `features` JSON del producto. El checkout se mantiene transaccional — el catálogo es para exploración. Depende de Sprint 8 (EC-10: UI features) | UX-CLIENT | ⬜ |
| 13.30 | **Redis adapter Socket.io** — instalar `@socket.io/redis-adapter` para preparar HA multi-instancia. Cambio de ~10 líneas en gateway. Requisito para escalar horizontalmente | ESCALA | ⬜ |
| 13.31 | **Auditoría N+1 queries** — revisar todos los listados (support, clients, invoices) y eliminar queries N+1 con `include` de Prisma o `$queryRaw`. Hot paths: lista de conversaciones, ficha de cliente, lista de facturas | ESCALA | ⬜ |
| 13.32 | **Cursor-based pagination en messages** — reemplazar `OFFSET` por cursor (`WHERE created_at < ? LIMIT N`) en la tabla de mensajes. Es la tabla con mayor crecimiento | ESCALA | ⬜ |
| 13.33 | **Caching Redis para hot paths** — cachear catálogo de productos (TTL 5min), perfiles de cliente frecuentes (TTL 30s), settings (TTL 1min). Invalidación por clave | ESCALA | ⬜ |
| 13.34 | **Archival strategy para messages** — definir política de archivado para mensajes de conversaciones cerradas >6 meses. Tabla `messages_archive` con mismo schema. Job mensual | ESCALA | ⬜ |

**Refactorización Regla 15 — Módulos completados:**

> Los siguientes módulos fueron construidos antes de establecer la Regla 15 (ARCHITECTURE.md).
> Cada archivo que supera su límite debe dividirse en sub-servicios/sub-componentes.
> Ref: ARCHITECTURE.md Regla 15.

| # | Archivo | Líneas → Límite | Acción | Estado |
|---|---------|----------------|--------|--------|
| 13.R15.1 | `auth.service.ts` (585 → 300) | Extraído: `auth-login.service.ts`, `auth-register.service.ts`, `auth-token.service.ts`, `auth-recovery.service.ts`. Fachada en `auth.service.ts` (80L). Build ✅ | ✅ |
| 13.R15.2 | `billing.service.ts` (518 → 300) | Extraído: `billing-invoice.service.ts` (296L), `billing-checkout.service.ts` (117L). Fachada en `billing.service.ts` (67L). `billing-calculator.service.ts` preexistente. Build ✅ | ✅ |
| 13.R15.3 | `billing-lifecycle.worker.ts` (380 → 150) | Dividido: `billing-lifecycle.worker.ts` (168L — invoice generation, overdue, retry) + `service-lifecycle.worker.ts` (139L — auto-suspend, auto-cancel, pause expiration). Build ✅ | ✅ |
| 13.R15.4 | `billing-email.listener.ts` (210 → 150) | Dividir por evento: `billing-invoice-email.listener.ts` + `billing-payment-email.listener.ts` | ⬜ |
| 13.R15.5 | `billing.controller.ts` (210 → 200) | Reducir comentarios, extraer helpers de validación | ⬜ |
| 13.R15.6 | `products.service.ts` (436 → 300) | Extraído: `products-catalog.service.ts` (115L — pricing, categories). `products.service.ts` reducido a 223L. Build ✅ | ✅ |
| 13.R15.7 | `clients.service.ts` (396 → 300) | Extraído: `clients-billing.service.ts` (111L — billing profiles). `clients.service.ts` reducido a 185L. Remediado catch silencioso en addNote (Regla 14). Build ✅ | ✅ |
| 13.R15.8 | `permissions.ts` (362 → 300) | **Excepción documentada**: archivo declarativo CASL (definiciones de rol), no lógica de negocio. Splitting reduciría cohesión | ⏸️ |
| 13.R15.9 | `checkout/page.tsx` (570 → 300) | Completado en Sprint 7.R15.5: extraído `types.ts`, `useCheckout.ts`, `StepConfirm.tsx`. Build ✅ | ✅ |
| 13.R15.10 | `layout.tsx` (394 → 300) | Completado en Sprint 7.R15.6: extraído `Sidebar.tsx`, `Topbar.tsx`. Build ✅ | ✅ |
| 13.R15.11 | `page.tsx` landing (350 → 300) | Extraer secciones a componentes: `HeroSection.tsx`, `FeaturesSection.tsx`, `PricingSection.tsx` | ⬜ |
| 13.R15.12 | `products/page.tsx` (323 → 300) | Completado en Sprint 7.R15.8: extraído `types.ts`. Build ✅ | ✅ |
| 13.R15.13 | `products/new/page.tsx` (347 → 300) | Completado en Sprint 7.R15.9: extraído `constants.ts`. Build ✅ | ✅ |
| 13.R15.14 | `GradientMesh.tsx` (294 → 200) | Extraer lógica WebGL a hook `useGradientMesh.ts` | ⬜ |
| 13.R15.15 | `support-email.listener.ts` (187 → 150) | Condensar templates inline a imports de `email-templates/` | ⬜ |

> **Excepciones Regla 15 documentadas (no son lógica de negocio):**
> - `permissions.ts` (362L) — Configuración declarativa CASL
> - `product.dto.ts` (348L) — Definiciones DTO + validadores
> - `invoice-pdf.service.ts` (325L) — Templates HTML inline

> **CSS compliance (Sprint 8.1 inline migration):**
> 40+ inline styles migrados a CSS Modules en 5 archivos de soporte + billing.
> Archivos nuevos: `NewTicketModal.module.css`, `billing.module.css`.
> Archivos extendidos: `conversationDetail.module.css`, `TicketList.module.css`.


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

## Sprint 22 — Projects ⬜

> Objetivo: sistema de proyectos que reemplaza WDIFY. Dos modos: propuesta (agente→cliente) y organizador (cliente agrupa productos).
> Referencia: DECISIONS.md §44.
> Dependencias: Sprint 8 (tasks), Sprint 11 (provisioning), Sprint 6 (billing).

**Fase 1 — Modelo y CRUD:**

| # | Paso | Estado |
|---|------|--------|
| 22.1 | **Schema y migraciones** — tablas `projects`, `project_items`, `project_history`, `project_agents`. Campo `project_id` nullable en `tasks` e `invoices`. Enum `invoice_type`: `standard`, `deposit`, `project_final` | ⬜ |
| 22.2 | **ProjectsService CRUD** — crear, editar, listar, detalle. Validaciones por `type` (`proposal` vs `organizational`) | ⬜ |
| 22.3 | **Project items** — CRUD de líneas: snapshot de producto (nombre, precio, ciclo) + items custom sin catálogo. Cálculo de total | ⬜ |
| 22.4 | **Asignación de agentes** — assigned_agent + collaborators. Historial de asignaciones en `project_history` | ⬜ |
| 22.5 | **Frontend admin: CRUD proyectos** — crear, editar items, asignar agentes, descripción rica | ⬜ |

**Fase 2 — Ciclo de vida (propuestas):**

| # | Paso | Estado |
|---|------|--------|
| 22.6 | **Estado machine** — `draft → proposal_sent → accepted → deposit_paid → in_progress → completed → paid → active`. Transiciones con validación y `project_history` | ⬜ |
| 22.7 | **Vista pública** — endpoint con JWT token (30 días). Página readonly del presupuesto sin login. Descripción, productos, tareas, precio | ⬜ |
| 22.8 | **Aceptación y registro** — flujo: aceptar → login/registro con email vinculado → auto-vinculación (solo si email verificado) → pago depósito | ⬜ |
| 22.9 | **Depósito** — invoice tipo `deposit`. Porcentaje configurable por proyecto (`deposit_pct`, default 5%). Se descuenta de factura final | ⬜ |
| 22.10 | **Provisioning para equipo** — al pagar depósito, los `project_items` con `product_id` crean `services` con status `project_development`. Accesibles para agentes, pendientes para cliente | ⬜ |
| 22.11 | **Modificaciones post-aceptación** — cambio en items tras aceptación vuelve estado a `pending_review`. Cliente debe re-aceptar | ⬜ |
| 22.12 | **Expiración** — configurable `valid_until` por proyecto. Job que expira propuestas sin respuesta | ⬜ |

**Fase 3 — Finalización y activación:**

| # | Paso | Estado |
|---|------|--------|
| 22.13 | **Integración con tareas** — tareas del proyecto via `tasks.project_id`. Progreso visible al cliente (% completado) | ⬜ |
| 22.14 | **Finalización** — agente marca como `completed`. Se genera factura final (total - depósito). Cliente ve notificación | ⬜ |
| 22.15 | **Pago y activación** — al pagar factura final, `services` pasan de `project_development` → `active`. Proyecto → `active` | ⬜ |
| 22.16 | **Cancelación y reembolso** — política de depósito configurable: `full`, `partial`, `none`. Estado → `cancelled` | ⬜ |

**Fase 4 — Organizador del cliente:**

| # | Paso | Estado |
|---|------|--------|
| 22.17 | **Proyectos del cliente** — el cliente crea proyectos tipo `organizational` para agrupar sus servicios activos. CRUD simple | ⬜ |
| 22.18 | **CTA "Solicitar desarrollo personalizado"** — botón en la página del servicio. Crea proyecto `proposal` vinculado a ese servicio. Genera tarea para agente | ⬜ |
| 22.19 | **Frontend cliente: mis proyectos** — lista, detalle, progreso de propuestas activas, organización de servicios | ⬜ |
| 22.20 | **Notificaciones** — propuesta enviada, aceptada, depósito pagado, tarea actualizada, proyecto completado, pago requerido | ⬜ |
| 22.21 | docs/features/projects/admin.md + client.md | ⬜ |

---

## Sprint 23 — Tickets Redesign ⬜

> Objetivo: diferenciar tickets del chat visualmente y funcionalmente. UI de threads, sidebar enriquecida, vinculación a entidades.
> Referencia: DECISIONS.md §46.
> Dependencias: Sprint 7 (support base), Sprint 22 (projects: vinculación).

| # | Paso | Estado |
|---|------|--------|
| 23.1 | **UI thread-based** — cada respuesta en un ticket es un bloque completo (cabecera + cuerpo + footer) en vez de burbujas de chat. Visualmente distinto | ⬜ |
| 23.2 | **Sidebar enriquecida para tickets** — perfil cliente + servicios + notas (igual que chat) + metadata del ticket: SLA, servicio vinculado, proyecto vinculado, tags | ⬜ |
| 23.3 | **Vinculación a entidades** — al crear/editar ticket, poder linkar a un servicio o proyecto del cliente. Campos `linked_service_id`, `linked_project_id` en `conversations` | ⬜ |
| 23.4 | **Tags/etiquetas** — tabla `conversation_tags`. CRUD. Filtro en lista de tickets | ⬜ |
| 23.5 | **Lista de tickets rediseñada** — columnas ordenables: estado, prioridad, agente, categoría, última actividad, SLA. Filtros combinables | ⬜ |
| 23.6 | **SLA tracking** — campos `sla_response_target`, `sla_resolution_target` en conversación. Indicador visual de cumplimiento | ⬜ |
| 23.7 | **Deprecar categorías WDIFY** — eliminar `wdify_progress` y `wdify_feedback` de ticket categories. Migrar tickets existentes a `support_technical` | ⬜ |
| 23.8 | **Adjuntos** — subida de archivos en tickets (MinIO). Soporte para screenshots, logs, documentos | ⬜ |
| 23.9 | Frontend: página de ticket rediseñada (thread + sidebar) | ⬜ |
| 23.10 | Frontend: lista de tickets rediseñada (bandeja tipo inbox) | ⬜ |
| 23.11 | docs/features/support/tickets.md | ⬜ |

---

## Sprint 24 — Citation System ⬜

> Objetivo: poder citar productos, proyectos, y notas en la comunicación (chat y tickets). Rich embeds inline.
> Referencia: DECISIONS.md §47.
> Dependencias: Sprint 22 (projects), Sprint 23 (tickets redesign).

| # | Paso | Estado |
|---|------|--------|
| 24.1 | **Modelo de referencias** — campo `references` (jsonb) en tabla `messages`. Array de `{ type: 'product'|'project'|'service'|'note', id: uuid, snapshot: {} }` | ⬜ |
| 24.2 | **Backend: resolver referencias** — al cargar mensajes, enriquecer snapshots con datos actuales (nombre, estado, precio). Fallback si la entidad fue eliminada | ⬜ |
| 24.3 | **Frontend: selector de referencias** — botón "Adjuntar referencia" en input de mensajes. Busca por tipo (productos, proyectos, servicios, notas del cliente) | ⬜ |
| 24.4 | **Frontend: render de cards** — las referencias se renderizan como cards clickables inline en el mensaje. Info básica: nombre, tipo, estado, link | ⬜ |
| 24.5 | **Permisos** — el cliente solo puede citar sus propios productos/proyectos. El agente puede citar cualquier entidad del cliente activo | ⬜ |
| 24.6 | **Navegación** — al hacer clic en una referencia, tanto agente como cliente navegan a la entidad (producto, proyecto, nota). Deep linking | ⬜ |
| 24.7 | docs/features/support/citations.md | ⬜ |

---

## Sprint 25 — AI Workers ⬜

> Objetivo: integrar OpenClaw como asistente IA para tareas de desarrollo simples (landings, sitios estáticos).
> Referencia: docs/AI_WORKERS.md (especificación completa).
> Dependencias: Sprint 8 (tasks), Sprint 15 (plugins), Sprint 22 (projects).

| # | Paso | Estado |
|---|------|--------|
| 25.1 | **Plugin framework para ai-workers** — nueva categoría de plugin con manifest (capabilities, config) | ⬜ |
| 25.2 | **Campos en tasks** — `assigned_type`, `ai_worker_id`, `ai_session_id` | ⬜ |
| 25.3 | **Tabla task_artifacts** — artefactos vinculados a tareas, con status y review | ⬜ |
| 25.4 | **Integración OpenClaw** — docker-compose service, API client, webhook receiver | ⬜ |
| 25.5 | **BullMQ job ai.task.execute** — orquestación: enviar a OpenClaw, recibir resultado, actualizar tarea | ⬜ |
| 25.6 | **Frontend: asignar tarea a IA** — botón condicional en detalle de tarea, selección de worker | ⬜ |
| 25.7 | **Frontend: preview de artefactos** — iframe para HTML, lista de archivos, estados approve/reject | ⬜ |
| 25.8 | **Frontend: filtro IA en lista de tareas** — badge IA, filtro por assigned_type | ⬜ |
| 25.9 | **Flujo completo** — asignar → OpenClaw genera → agente revisa → aprueba/rechaza → despliegue via ProvisioningService | ⬜ |
| 25.10 | docs/features/ai-workers/admin.md | ⬜ |

---

## Orden de ejecución recomendado

```
FASE 1 — CORE (Sprints 0-14, orden secuencial estricto)
  Sprint 0  Scaffolding                    ✅
  Sprint 1  Auth                           ✅
  Sprint 2  Notifications Core             ✅
  Sprint 3  Auth Frontend Polish           ✅
  Sprint 3.5 Auth Hardening               ✅
  Sprint 4  Clients                        ✅
  Sprint 5  Products + PBAC                ✅
  Sprint 6  Billing Engine                 ✅
  Sprint 7  Support                        ⬜ (en progreso)
  Sprint 8  Tasks + Support Inside         🔄  ← Fase A-B en progreso, depende de 7
  Sprint 9  Audit + Notifications Full     ⬜  ← depende de 2
  Sprint 10 Infrastructure                 ⬜  ← independiente
  Sprint 11 Provisioning                   ⬜  ← depende de 10, 5, 6
  Sprint 12 Settings + Knowledge Base      ⬜  ← depende de la mayoría
  Sprint 12.5 RGPD                         ⬜  ← depende de 9, 4
  Sprint 13 Hardening + Escalabilidad      ⬜  ← último antes de deploy
  Sprint 14 Deploy                         ⬜  ← cierra Fase 1

FASE 2 — MÓDULOS DE NEGOCIO (priorizado por valor de negocio)

  Prioridad A — Go to market:
    Sprint 15 Plugins                      ⬜  ← pago (Stripe) + provisioning automático
    Sprint 18 Landing Integration          ⬜  ← cara pública, checkout, webchat landing

  Prioridad B — Operaciones de negocio:
    Sprint 22 Projects                     ⬜  ← flujo de ventas presencial, propuestas (dep: 8+11)
    Sprint 21 CRM Completeness            ⬜  ← gestión completa de clientes (dep: 11)
    Sprint 23 Tickets Redesign            ⬜  ← soporte profesional (dep: 7+22)
    Sprint 24 Citation System             ⬜  ← comunicación contextual (dep: 22+23)
    Sprint 25 AI Workers                  ⬜  ← asistente IA para tareas (dep: 8+15+22)

  Prioridad C — Crecimiento:
    Sprint 17 Promotions & Discounts      ⬜  ← upsell, crossell (dep: 5+6)
    Sprint 20 Referral System             ⬜  ← adquisición orgánica (dep: 6)
    Sprint 19 Partner Module              ⬜  ← canal de ventas B2B (dep: 15)

  Prioridad D — Internacionalización:
    Sprint 16 i18n + Multi-Currency       ⬜  ← solo si se abren mercados internacionales
```

### Justificación del orden (Fase 2)

**¿Por qué Plugins (15) antes que todo?**
Sin Stripe no hay cobros. Sin provisioners no hay servicios automáticos. Es el requisito técnico mínimo para operar.

**¿Por qué Landing (18) segundo?**
Sin cara pública no hay captación online. Webchat + checkout desde landing = primer canal de adquisición.

**¿Por qué Projects (22) antes que CRM (21)?**
Tu modelo de negocio es: ir a negocios → proponer tecnología → crear proyecto → vender. Projects es tu herramienta de venta principal. CRM es complementario.

**¿Por qué Tickets Redesign (23) después de Projects (22)?**
Los tickets necesitan vinculación a proyectos y servicios. Sin proyectos, los tickets no tienen contexto que vincular.

**¿Por qué AI Workers (25) en Prioridad B?**
OpenClaw es una herramienta operativa que acelera el trabajo del agente. No es crecimiento ni internacionalización — es eficiencia del equipo.

**¿Por qué Promotions/Referrals/Partners al final?**
Son features de crecimiento. Primero necesitas clientes. Luego los retienes y haces crecer.

**¿Por qué i18n último?**
Solo importa si vendes fuera de España. Es inversión prematura hasta que haya tracción en mercado local.

