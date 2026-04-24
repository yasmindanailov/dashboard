# Clients Module — Documentación de administración

> Módulo: `clients`
> Sprint: 4 (Clients) + 7 (Support tabs) + 7.5 (Design System)
> Estado: ✅ Completo
> Última actualización: Sprint 7.5

---

## Resumen

El módulo Clients es el CRM del dashboard. Gestiona la ficha completa del cliente: datos de contacto, perfiles de facturación, notas estructuradas, historial de soporte, y contexto del negocio. Es accesible solo para admin y agentes.

---

## Endpoints de la API

| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/clients` | admin, agent_full, agent_billing, agent_support | Lista paginada con búsqueda |
| GET | `/clients/:id` | admin, agent_full, agent_billing, agent_support | Ficha completa del cliente |
| PATCH | `/clients/:id` | admin, agent_full, agent_billing | Actualizar perfil del cliente |
| POST | `/clients/:id/notes` | admin, agent_full, agent_billing, agent_support | Añadir nota estructurada |
| GET | `/clients/:id/notes` | admin, agent_full, agent_billing, agent_support | Listar notas estructuradas (paginado, filtro por categoría) |
| GET | `/clients/:id/billing-profiles` | admin, agent_full, agent_billing | Listar perfiles de facturación |
| POST | `/clients/:id/billing-profiles` | admin, agent_full, agent_billing | Crear perfil de facturación |
| PATCH | `/clients/billing-profiles/:id` | admin, agent_full, agent_billing | Actualizar perfil |
| DELETE | `/clients/billing-profiles/:id` | admin, agent_full, agent_billing | Eliminar perfil (no el default) |
| PATCH | `/clients/:id/billing-profiles/:profileId/default` | admin, agent_full, agent_billing | Marcar como predeterminado |

---

## Páginas del frontend

| Ruta | Función | Tipo (UI_SPEC) |
|------|---------|----------------|
| `/dashboard/clients` | Lista paginada con búsqueda en tiempo real | ListPage (§2.4) |
| `/dashboard/clients/:id` | Ficha del cliente con tabs | DetailPage (§2.5) |

---

## Componentes DS utilizados (Sprint 7.5)

### List page (`/dashboard/clients`)
| Componente DS | Uso |
|---------------|-----|
| `ListPage` | Layout con título, subtitle con conteo, filterBar, pagination |
| `FilterBar` | Container para search + filtros |
| `SearchInput` | Búsqueda debounced (300ms) por nombre o email |
| `Select` | Filtro por estado (activo, pendiente, bloqueado, inactivo) |
| `Table` | Tabla paginada con skeleton loading, empty state, selección bulk |
| `Avatar` | Iniciales del cliente en la columna de nombre |
| `Badge` | Estado del cliente (success/warning/danger/neutral) |
| `Pagination` | Paginación con total, página actual, páginas totales |
| `BulkActionBar` | Barra flotante para acciones masivas (exportar) |
| `useToast` | Feedback de exportación bulk |

### Detail page (`/dashboard/clients/:id`)
| Componente DS | Uso |
|---------------|-----|
| `DetailPage` | Layout con breadcrumb DS y tabs |
| `useToast` | Feedback de acciones CRUD (nota guardada, error de carga) |

---

## Tabs de la ficha de cliente

| Tab | Contenido | Componentes DS |
|-----|-----------|----------------|
| Resumen | Datos de cuenta + perfil (tipo, teléfono, dirección, etc.) | — |
| Facturación | Perfiles de facturación (personal, autónomo, empresa) | — |
| Soporte | Historial de chats y tickets del cliente | `Badge`, `EmptyState` |
| Notas | Notas estructuradas con categoría, filtro y pin | `useToast` |

---

## Notas estructuradas (Sprint 7)

Las notas del cliente evolucionaron de texto plano a un sistema categorizado:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `category` | Enum | `general`, `billing`, `technical`, `commercial` |
| `is_pinned` | Boolean | Nota destacada (borde izquierdo brand) |
| `body` | Text | Contenido de la nota |
| `created_by` | UUID | Agente que la creó |

Filtrable por categoría y visualizable como timeline invertido (más reciente arriba).

---

## Reglas de negocio de billing profiles

- Un cliente puede tener múltiples perfiles: personal, autónomo, empresa.
- **NIF/CIF obligatorio** para autónomo y empresa.
- **Nombre de empresa obligatorio** para tipo empresa.
- El primer perfil creado se marca como predeterminado automáticamente.
- No se puede eliminar el perfil predeterminado (hay que cambiar el default primero).
- Las facturas se asocian al perfil predeterminado al hacer checkout.

---

## Seguridad

| Mecanismo | Implementación |
|-----------|----------------|
| Autenticación | JwtAuthGuard en todos los endpoints |
| Autorización | PoliciesGuard (CASL) + data isolation por rol |
| Agent support | Solo lectura (list, get, notes). No puede editar perfil ni billing. |
| ParseUUIDPipe | Validación de IDs en params |

---

## Feedback UX (Sprint 7.5 — §4)

| Acción | Feedback | Componente |
|--------|----------|------------|
| Cargar cliente (error) | Toast error | `useToast` |
| Cargar soporte (error) | Toast error | `useToast` |
| Guardar nota (éxito) | Toast success | `useToast` |
| Guardar nota (error red) | Toast error | `useToast` |
| Lista vacía (sin resultados) | EmptyState con búsqueda | `Table` empty built-in |
| Sin chats/tickets | EmptyState dedicado | `EmptyState` |

---

## Edge cases documentados

Ver `docs/edge_cases.md`:
- §5.1: `loadStructuredNotes` no estabilizado con `useCallback`
- §5.3: State zombie `error`/`noteSuccess` tras migración a Toast
- §6.1: Search con debounce correcto (patrón referencia para otros módulos)

---

## Ref

- DECISIONS.md §32 (Billing profiles)
- DECISIONS.md §34 (Factura simplificada vs completa)
- UI_SPEC.md §5.1 (Clientes — especificación de página)
- DESIGN_SYSTEM.md (30 componentes DS)
- edge_cases.md (análisis exhaustivo Sprint 7)
