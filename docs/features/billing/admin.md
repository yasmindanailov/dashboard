# Billing — Admin Guide

> Módulo: `billing`
> Sprint: 6 (Billing) + 7.5 (Design System)
> Última actualización: Sprint 7.5 (audit completa)

## Resumen

El módulo de facturación gestiona el ciclo de vida completo de las facturas:
creación, cobro, reintentos, suspensión y cancelación automática de servicios por impago.

## Arquitectura

```
BillingService          → Motor de facturación (cálculos, estados, numeración)
SubscriptionService     → Pausar/reanudar/cambiar plan con prorrateo
BillingLifecycleWorker  → Jobs cron (generación, reintentos, suspensión, cancelación)
BillingEmailListener    → Emails transaccionales (created, paid, failed, overdue)
InvoicePdfService       → Generación de PDFs con PDFKit
PaymentProviderInterface → Abstracción para plugins de pago (Stripe, etc.)
```

## Estado de facturas

```
draft → pending → paid
                → overdue → (reintentos) → suspensión → cancelación
                → cancelled
paid → refunded
```

- **draft**: Borrador. Puede editarse.
- **pending**: Enviada al cliente. No editable.
- **paid**: Pagada. Solo permite reembolso.
- **overdue**: Vencida. Reintentos automáticos.
- **cancelled**: Cancelada. Sin efecto.
- **refunded**: Reembolsada.

## Numeración

- Formato: `{PREFIJO}-{AÑO}-{SECUENCIAL}` (ej: `AELIUM-2026-0001`)
- PostgreSQL SEQUENCE por año → sin race conditions
- Prefijo configurable en Settings (`billing.invoice_prefix`) — actualmente hardcoded, configurable en Sprint 12

## Configuración (Settings)

| Clave | Default | Descripción |
|-------|---------|-------------|
| `billing.default_tax_rate` | 21 | IVA por defecto (%) |
| `billing.invoice_prefix` | AELIUM | Prefijo numeración |
| `billing.invoice_generation_days` | 7 | Días antes del vencimiento para generar factura |
| `billing.max_payment_retries` | 3 | Reintentos máximos de cobro |
| `billing.retry_interval_days` | 3 | Días entre reintentos |
| `billing.suspension_days` | 7 | Días tras impago para suspender |
| `billing.cancellation_days` | 30 | Días tras suspensión para cancelar |
| `billing.data_retention_days` | 90 | Días retención datos tras cancelación |

## Seguridad y Control de Acceso (Sprint 6 hardening)

### Estrategia RBAC

La autorización del módulo billing usa dos capas:

1. **CASL (PoliciesGuard)** — Gatekeeper de alto nivel. Verifica que el rol del usuario tiene
   acceso al `Subject.Billing` con la `Action` requerida. Las reglas son **sin condiciones**
   a nivel de guard (no pasan instancia del recurso).

2. **Controller/Service (data isolation)** — Capa de seguridad real. El `userId` se resuelve
   directamente del JWT (`req.user.id`), nunca de query params. El controller filtra
   las queries por `user_id` para roles de cliente.

### Roles con acceso a billing

| Rol | Permisos |
|-----|----------|
| `superadmin` | Todo: CRUD facturas, checkout para cualquier usuario, stats globales |
| `agent_full` | Todo excepto configuración del sistema |
| `agent_billing` | Facturas, pagos, clientes. Sin soporte ni configuración |
| `client` | Solo lectura de sus propias facturas + descarga PDF |

### Acciones por rol en la UI

| Acción | Admin/Agente | Cliente |
|--------|:---:|:---:|
| Ver listado facturas | ✅ (todas) | ✅ (solo suyas) |
| Ver detalle factura | ✅ | ✅ (solo suya) |
| Enviar (finalize) | ✅ | ❌ |
| Cobrar (mark as paid) | ✅ | ❌ |
| Cancelar | ✅ | ❌ |
| Reembolsar | ✅ | ❌ |
| Descargar PDF | ✅ | ✅ |
| Checkout | ✅ (requiere `targetUserId`) | ✅ (self-scoped) |
| Ver stats | ✅ (globales) | ✅ (solo suyas) |

### Data isolation en el controller

```typescript
// userId siempre del JWT — nunca de query params
const userId = (req as any).user?.id;
const userRole = (req as any).user?.role?.slug;

// Admin ve todo, cliente ve solo lo suyo
const isAdmin = ['superadmin', 'agent_full', 'agent_billing'].includes(userRole);
const filters = isAdmin ? {} : { user_id: userId };
```

## Ciclo de cobro automático

1. **Generación** (02:00 diario): Crea facturas para servicios cuyo vencimiento está dentro de X días
2. **Detección vencidas** (01:00 diario): Facturas `pending` con `due_date` pasada → `overdue`
3. **Reintentos** (cada 6h): Facturas `overdue` con `next_retry_at` pasada y reintentos disponibles
4. **Suspensión** (03:00 diario): Servicios con facturas agotadas + X días → `suspended`
5. **Cancelación** (04:00 diario): Servicios suspendidos > Y días → `cancelled`
6. **Despausa** (05:00 diario): Servicios pausados con `pause_max_date` pasada → `active`

## Checkout

### Flow
```
Producto → Pricing → Billing Profile → Confirm
         → Service (pending) + Invoice (draft)
```

### Perfil de facturación en checkout
- Si el cliente tiene perfiles de facturación, puede seleccionar uno.
- Si no tiene ningún perfil, se usa su nombre + apellidos + email como factura simplificada.
- La opción "sin perfil" muestra los datos del usuario, no un texto genérico.
- Ref: DECISIONS.md §32, §34

### Checkout como admin
- El admin **debe** especificar `targetUserId` (el cliente destino).
- El admin no puede crear servicios para sí mismo vía checkout.
- La validación del `billing_profile_id` se hace contra el `targetUserId`, no contra el admin.
- Pendiente Sprint 7.0.1-7.0.3: UI selector de cliente + validaciones backend.

### Precios e IVA
- Los precios de los productos se almacenan **sin IVA** (neto).
- Al crear la factura, el sistema añade el IVA (21% por defecto, configurable en settings).
- El PDF muestra: Subtotal → IVA (21%) → Total.
- El checkout muestra el total con IVA incluido en la confirmación.

## Factura vinculada al usuario

Cada factura tiene:
- `user_id` — FK al usuario (siempre presente, relación directa en schema)
- `billing_profile_id` — FK al perfil de facturación (opcional)

### En el PDF:
- Si hay billing profile → muestra datos completos del perfil (nombre, NIF, dirección)
- Si no hay billing profile → fallback al nombre + email del usuario + indicación "Factura simplificada"

### En la vista de detalle:
- Siempre muestra el **CLIENTE** (nombre + email del usuario)
- Debajo muestra el **PERFIL DE FACTURACIÓN** si existe

## Factura simplificada vs completa

- **Simplificada**: Sin NIF/CIF del cliente (compras personales < €400)
- **Completa**: Con NIF/CIF (empresas, derecho a deducción)
- Se determina automáticamente por el perfil de facturación seleccionado
- Si el cliente no tiene NIF → factura simplificada (DECISIONS.md §34)

## Endpoints principales

- `GET /billing/invoices` — Listar facturas (paginado, filtros por estado)
- `GET /billing/invoices/stats` — Estadísticas para dashboard
- `GET /billing/invoices/:id` — Detalle con user, billing_profile e items
- `POST /billing/invoices` — Crear factura manual
- `PATCH /billing/invoices/:id` — Editar factura draft
- `PATCH /billing/invoices/:id/finalize` — draft → pending (valida items > 0 y total > 0)
- `PATCH /billing/invoices/:id/pay` — Marcar como pagada
- `PATCH /billing/invoices/:id/cancel` — Cancelar (nunca delete)
- `PATCH /billing/invoices/:id/refund` — Reembolsar
- `GET /billing/invoices/:id/pdf` — Descargar PDF
- `POST /billing/checkout` — Checkout completo
- `GET /billing/proration/preview` — Preview de prorrateo
- `PATCH /subscriptions/:id/pause` — Pausar servicio
- `PATCH /subscriptions/:id/resume` — Reanudar servicio

## Dominio en checkout

- El campo dominio en el checkout es **opcional por defecto**.
- Cada producto puede definir `requires_domain = true` en su configuración (Bloque 3 — Reglas de negocio).
- La validación de dominio obligatorio se implementa en Sprint 11 (Provisioning).
- Sin dominio propio → el cliente elige subdominio: `[nombre].cloud.aelium.net`
- Ref: DECISIONS.md §6, §14

## Componentes DS utilizados (Sprint 7.5)

### Lista de facturas (`/dashboard/billing`)
| Componente | Uso |
|------------|-----|
| `ListPage` | Layout con título role-aware, acción, statusTabs, filterBar, pagination |
| `StatusTabs` | Tabs con contadores: Todas, Pendientes, Pagadas, Vencidas, Canceladas |
| `FilterBar` | Container para SearchInput |
| `SearchInput` | Búsqueda por número de factura |
| `Table` | Tabla paginada, skeleton, empty state, bulk selection, row click |
| `Badge` | Estado factura (success/warning/danger/neutral/info) |
| `Button` | Enviar, Cobrar, Cancelar, PDF (por fila) |
| `HelpTip` | Tooltip en “Vencimiento” (solo clientes) |
| `AlertBanner` | Banner “Mostrando facturas de un cliente específico” |
| `Pagination` | Paginación estándar |
| `BulkActionBar` | Cobrar + Descargar PDF + Cancelar en lote |
| `Modal` | Confirmación de acciones bulk (§4.2) |
| `useToast` | Feedback de todas las acciones CRUD + bulk |

### Detalle de factura (`/dashboard/billing/:id`)
| Componente | Uso |
|------------|-----|
| `DetailPage` | Layout con breadcrumb DS |
| `Badge` | Estado + “Manual” indicator |
| `Card` | Perfil de facturación + información de pago |
| `Button` | Enviar, Cobrar, Reembolsar, Cancelar, PDF |
| `HelpTip` | Tooltip en “Vencimiento” (solo clientes) |
| `useToast` | Feedback de acciones |

### Checkout (`/dashboard/billing/checkout`)
| Componente | Uso |
|------------|-----|
| `FormPage` | Layout con breadcrumb + step indicator |
| `SearchInput` | Búsqueda de clientes (admin) |
| `Card` | Contenedores por step |
| `Badge` | Producto + ahorro |
| `Button` | CTAs + confirm con loading |
| `AlertBanner` | Info + error |
| `Skeleton` | Loading de productos |

## Bulk Actions (§4.11)

| Acción | Confirmación | Feedback |
|--------|-------------|----------|
| Cobrar seleccionadas | Modal (§4.2) | Toast resumen (`N cobradas` + `M fallaron`) |
| Cancelar seleccionadas | Modal (§4.2) | Toast resumen |
| Descargar PDF | Sin modal | Toast info (“Descargando N PDF...”) |

## Feedback UX (§4)

| Acción | Feedback | Tipo |
|--------|----------|------|
| Enviar (finalize) | Toast success | `useToast` |
| Cobrar (pay) | Toast success | `useToast` |
| Cancelar | Toast success | `useToast` |
| Reembolsar | Toast success | `useToast` |
| Acción error red | Toast error | `useToast` |
| Checkout error | AlertBanner persistente | `AlertBanner` |
| Validación checkout (sin cliente) | Error inline | `setError` |

## Edge cases documentados

Ver `docs/edge_cases.md`:
- §6.1: Search sin debounce (cada keystroke dispara fetch)
- §6.3: Bulk PDF ejecuta N descargas simultáneas (navegador puede bloquear)
- §1.3: `meta.page` puede ser stale en `executeBulk`
- §3.1: Catches silenciosos en `loadInvoices` y `loadStats`
- §12.1: `ADMIN_ROLES` duplicado inline (no importa de constantes)
- §12.2: `InvoiceDetail` y `InvoiceItem` interfaces duplicadas
- §12.4: Checkout error usa AlertBanner en vez de Toast (inconsistencia)

## Ref

- DECISIONS.md §32 (Billing profiles)
- DECISIONS.md §34 (Factura simplificada vs completa)
- DECISIONS.md §37 (Infraestructura de pagos)
- UI_SPEC.md §5.4 (Facturación — especificación de página)
- UI_SPEC.md §5.9 (Checkout — especificación de página)
- DESIGN_SYSTEM.md (componentes DS)
- edge_cases.md (análisis exhaustivo Sprint 7)
