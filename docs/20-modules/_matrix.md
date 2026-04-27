# Matriz de integraciones — Módulos backend

> **Mapa explícito de cómo se conectan los módulos.**
> Resuelve el problema histórico de "los sistemas se conectan en algún punto y no es coherente".

> **Última auditoría:** abril 2026 (commits ~`8c4d893`).

---

## Estado general

**Cumplimiento de Regla R1 (módulos no se llaman directamente entre sí, solo vía eventos):** ✅ **100%**

Auditoría exhaustiva confirmó:
- **0 imports cross-módulo** entre `backend/src/modules/*/`
- Todas las inyecciones cross-módulo aparentes son **sub-services del mismo dominio** (R15: división por tamaño, no acoplamiento entre dominios)
- Comunicación entre dominios distintos: **100% por eventos** (`EventEmitter2`) o **lectura via Prisma** (data isolation por servicio)

---

## Matriz de dependencias

Filas = módulo origen. Columnas = módulo destino. Celda = tipo de relación.

| Origen → Destino | auth | clients | products | billing | support | tasks | dashboard | notifications | audit | error-log | partner | core |
|------------------|------|---------|----------|---------|---------|-------|-----------|---------------|-------|-----------|---------|------|
| **auth** | (sub R15) | — | — | — | — | — | — | — | write `audit_access_log` (DC.8 — directo, no via AuditService) | — | — | prisma, settings, email, casl |
| **clients** | read users | (sub R15) | — | read invoices | — | — | — | — | — | — | — | prisma, casl |
| **products** | — | — | (sub R15) | — | — | — | — | — | — | — | — | prisma, casl |
| **billing** | read users | read billing_profiles | read products, product_pricing | (sub R15) | — | — | — | dispatchToUser via `BillingEmailListener` | — | — | — | prisma, settings, email, casl, **outbox**, **storage**, **jobs** |
| **support** | read users | read client_notes | — | read services | (sub R15) | — | — | — | — | — | — | prisma, settings, email, casl |
| **tasks** | read users | — | — | — | — | — | — | dispatchToUser via `TasksEmailListener` | — | — | — | prisma, casl |
| **dashboard** | read users | read clients data | — | read invoices, services | read conversations | read tasks | — | — | — | — | — | prisma |
| **notifications** | read users (resolver recipients + superadmins) | — | — | — | — | — | — | (sub R15) | — | — | — | prisma, **email**, **jobs** |
| **audit** | — | — | — | — | — | — | — | — | (sub R15) | — | — | prisma |
| **error-log** | — | — | — | — | — | — | — | emite `system.error` → `notifications-system-error.listener` (Sprint 9.5) | — | (sub R15) | — | prisma, **events** |
| **partner** | (stub) | (stub) | (stub) | (stub) | (stub) | (stub) | (stub) | — | — | — | (stub) | — |

### Leyenda
- **`read X`**: el módulo origen lee tabla `X` del módulo destino vía Prisma. Lectura legítima — los módulos son aggregates, no microservicios estrictos.
- **`(sub R15)`**: relación INTRA-módulo (sub-services por Regla 15). No es acoplamiento entre dominios.
- **`(stub)`**: módulo definido pero sin implementación.
- **`—`**: sin relación directa.
- **`core`**: servicios globales (PrismaService, SettingsService, EmailService, CaslAbilityFactory, **OutboxService**, **StorageService**, **JobsModule**, **AuditService**, **events** EventEmitter2). Todos los módulos los usan; no es acoplamiento problemático.

> **Sprint 9 (2026-04-27) + Sprint 9.5 (2026-04-28) cambios estructurales:**
> - `audit/`, `notifications/`, `error-log/` salieron de stub a implementación real.
> - `notifications` es @Global y consumido por `BillingEmailListener` + `TasksEmailListener` + 3 listeners operativos (`outbox.event_failed`, `dlq.job_failed`, `system.error`).
> - `audit` es @Global; `AuditInterceptor` registrado APP-wide intercepta endpoints decorados con `@AuditAccess('Resource')`.
> - `error-log.service` emite `system.error` → consumido por `notifications-system-error.listener` (Sprint 9.5) con guard anti-loop hard si `module` proviene del dominio notifications.
> - Sprint 9.5 añade endpoints cliente `/notifications/*` + admin `/admin/notifications/templates`, `NotificationsRetentionCron`, `NotificationBell` Topbar, página admin de plantillas.
> - Los 3 módulos cumplen R1 (comunicación vía eventos cuando aplica) y R15 (todos sus archivos <300 líneas).

---

## Sub-services internos por Regla R15

División de servicios grandes por dominio. **NO es acoplamiento cross-módulo**, es organización del mismo módulo.

| Módulo | Service principal (fachada) | Sub-services |
|--------|----------------------------|--------------|
| **auth** | `AuthService` | `AuthLoginService`, `AuthRegisterService`, `AuthTokenService`, `AuthRecoveryService` |
| **billing** | `BillingService` | `BillingInvoiceService`, `BillingCheckoutService`, `BillingCalculatorService` |
| **clients** | `ClientsService` | `ClientsBillingService` |
| **products** | `ProductsService` | `ProductsCatalogService` |
| **support** | `SupportService` | `SupportChatService`, `SupportTicketService`, `SupportMessageService`, `SupportQueryService` |

> Implementación: el service principal queda como **fachada** que delega; sub-services contienen la lógica. Resultado de refactores en Sprint 7 y posteriores.

---

## Lectura cross-módulo (vía Prisma)

Algunos módulos leen tablas de otros módulos directamente con `prisma.<tabla>.findX()`. Esto **es aceptable** como patrón aggregator, pero conviene documentarlo:

### Lecturas legítimas
| Quién lee | Qué lee | Por qué |
|-----------|---------|---------|
| billing | `users` | Obtener email/nombre del destinatario al emitir factura |
| billing | `products`, `product_pricing` | Calcular precios en checkout |
| billing | `billing_profiles` | Adjuntar datos fiscales a factura |
| clients | `users` | Listar clientes (un cliente es un user con rol=client) |
| clients (vía ClientsBillingService) | `invoices` | Mostrar histórico de facturas en ficha del cliente |
| support | `users` | Resolver nombre/email del remitente del mensaje |
| support | `services` | Mostrar contexto de qué servicio tiene contratado el cliente que reporta |
| support | `client_notes` | Mostrar notas internas del cliente al agente en panel de chat |
| dashboard | `users`, `invoices`, `services`, `conversations`, `tasks` | Calcular stats agregadas |
| tasks | `users` | Resolver `assigned_to` y `created_by` |

### Riesgos potenciales
- **clients → users (lectura completa):** debería filtrar a `role=client` para no exponer otros roles. Pendiente verificar (deuda menor).
- **tasks → users:** no valida que `assigned_to` existe antes de aceptar. Edge case **EC-FOO-01** (pendiente).
- **auth, billing → audit_access_log:** escritura directa al log de auditoría. Funcionalmente correcto pero conceptualmente debería pasar por un `AuditService` centralizado (futuro Sprint).

---

## Escrituras cross-módulo

**Auditadas: cero violaciones serias.** Cada módulo escribe en sus tablas propias.

Únicas excepciones:
- **billing escribe en `services`** (estado: `pending → active → suspended → cancelled`). Esto es legítimo: el ciclo de vida de un servicio está dirigido por el ciclo de billing (impagos suspenden, pagos reactivan). Billing es **co-propietario funcional** del estado de Service.
- **auth y billing escriben en `audit_access_log`** y `audit_change_log`. Aceptable hoy; centralización pendiente.

---

## Comunicación por eventos

**Patrón principal de comunicación entre dominios distintos.** Detalles completos en [`_events.md`](./_events.md).

Resumen de flujos cross-módulo vía eventos:

```
auth.registered          ─────► support-guest-link.listener (vincular chats anónimos previos)

billing emits...
  invoice.created      ─┐
  invoice.paid          ├─────► billing-email.listener (notificar al cliente por email)
  invoice.failed        │
  invoice.overdue      ─┘

support emits...
  conversation.created ─┐
  conversation.assigned ├─────► support-email.listener (emails al cliente/agente)
  message.created      ─┘└────► support-websocket.listener (push al WS)

(Eventos huérfanos — emitidos sin listener actual:
 auth.* (7 eventos), service.* (4), task.* (3), checkout.completed)
```

---

## Acoplamientos sospechosos

**Ninguno crítico** detectado en la auditoría.

Lista de "atención" (mejoras incrementales, no bloqueantes):

| # | Síntoma | Causa | Plan |
|---|---------|-------|------|
| A1 | `clients` lee tabla `users` sin filtrar por rol | El "cliente" es un `User` con `role.slug = 'client'`. Sin filtro explícito, listings podrían incluir agentes. | Validar filtro existe en `ClientsService.findAll()`. Issue menor. |
| A2 | Servicios escriben directo a `audit_access_log` | No hay `AuditService` centralizado. | Crear `AuditService` cuando se priorice módulo audit. |
| A3 | 15 eventos huérfanos (sin listener) | Features incompletas o decididas-pero-no-implementadas. | Documentar caso por caso en cada `contract.md`. |
| A4 | `Tasks.assigned_to` no valida existencia de User | El módulo Tasks está parcialmente implementado (Sprint 8 WIP). | Cierre de Sprint 8 debe añadir validación. |

---

## Módulos completamente aislados

Estos módulos no aparecen en la matriz principal como origen ni destino (más allá de core):

| Módulo | Estado | Comunicación |
|--------|--------|--------------|
| ~~audit~~ | ✅ **implementado Sprint 9 Fase E** — ver matriz principal | `AuditService.logAccess` via `AuditInterceptor` + endpoint cliente `/audit/access`. Cron retención 730 días |
| ~~notifications~~ | ✅ **implementado Sprint 9 Fase D MVP** — ver matriz principal | @Global, multicanal (`EmailChannel` + `InAppChannel`), plantillas Handlebars, cola `notifications-dispatch` |
| ~~error-log~~ | ✅ **implementado Sprint 9 Fase F** — ver matriz principal | Persistido por `GlobalExceptionFilter` (5xx HTTP) + `ErrorLogService.log()` desde jobs/listeners. Endpoint admin `/admin/error-log` |
| promotions | stub | Listener de `invoice.created` para aplicar descuentos retroactivos |
| infrastructure | stub | Gestión de servidores físicos / VMs |
| knowledge-base | stub | Self-service docs para clientes |
| provisioning | stub | Listener de `invoice.paid` → activar servicio externo (Docker, Enhance) |

---

## Matriz inversa: "quién depende de mí si toco X"

> Lista útil cuando vas a modificar un módulo y quieres saber el impacto.

| Si tocas... | Estos módulos pueden romperse |
|-------------|-------------------------------|
| **auth (User schema)** | clients, billing, support, tasks, dashboard (todos leen `users`) |
| **billing (Invoice/Service)** | clients (lee invoices), dashboard (lee invoices y services), support (lee services) |
| **products (Product/Pricing)** | billing (lee products en checkout), dashboard (futuro) |
| **support (Conversation/Message)** | dashboard (lee conversations) |
| **tasks (Task)** | dashboard (lee tasks) |
| **dashboard** | nadie (es módulo de solo lectura) |

> **Si tocas un módulo del que dependen otros**, ejecuta los tests E2E completos (`pnpm test:e2e`). Cubre login + checkout + soporte que tocan los acoplamientos transversales.

---

## Cómo se mantiene esta matriz

- **Trigger de actualización:** cualquier cambio en imports, inyecciones o accesos cross-módulo.
- **Forma:** edición directa de este archivo + commit que cite la modificación.
- **Validación futura (no implementada):** un script de CI que escanea `backend/src/modules/` y compara con esta matriz, fallando si hay drift.

---

## Documentos relacionados

- [`README.md`](./README.md) — Cómo usar la carpeta `20-modules/`
- [`_events.md`](./_events.md) — Catálogo único de eventos del sistema
- [`_template-contract.md`](./_template-contract.md) — Plantilla canónica
- [`docs/00-foundations/rules.md`](../00-foundations/rules.md) — Reglas R1-R16, especialmente R1 y R15
