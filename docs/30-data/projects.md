# Projects — Schema (Sprint 22)

> **Dominio:** sistema de Proyectos. Reemplaza WDIFY ([ADR-022](../10-decisions/adr-022-wdify-deprecado-proyectos.md)).
> **Módulo:** projects (no existe aún — Sprint 22).
> **Sprint origen:** Sprint 22 (proyectos) + Sprint 23 (`linked_*_id` en conversations) + Sprint 24 (`references` en messages).
> **Estado:** ⬜ no implementado.
> **ADRs:** [046](../10-decisions/adr-046-sistema-proyectos.md) (sistema proyectos) · [022](../10-decisions/adr-022-wdify-deprecado-proyectos.md) (WDIFY deprecado, superseded por ADR-046).

---

## Resumen

Un proyecto es un **orquestador** que vincula entidades existentes:

```
Proyecto = Presupuesto (quote) + Productos (catalog snapshot) + Tareas + Cliente + Pagos (invoices)
```

**Dos modos** (campo `type`):
- **`proposal`** — agente crea presupuesto formal con desarrollo personalizado. 11 estados de ciclo de vida.
- **`organizational`** — cliente agrupa servicios activos. Sin ciclo, existe y se edita.

---

## Resumen de tablas

### Tablas nuevas

| Tabla | Estado | Propósito |
|-------|--------|-----------|
| `projects` | ⬜ | Proyecto: propuesta de desarrollo o agrupador organizativo |
| `project_items` | ⬜ | Líneas del presupuesto. Snapshots congelados |
| `project_agents` | ⬜ | Equipo asignado al proyecto (lead + collaborators) |
| `project_history` | ⬜ | Historial inmutable de cambios y eventos del proyecto |

### Extensiones a tablas existentes

| Tabla | Campo añadido | Tipo | Notas |
|-------|---------------|------|-------|
| `tasks` | `project_id` | uuid NULLABLE FK → `projects(id)` | Tareas del proyecto. Mutuamente excluyente con `service_id` durante desarrollo |
| `invoices` | `project_id` | uuid NULLABLE FK → `projects(id)` | Depósito o factura final del proyecto |
| `invoices` | `invoice_type` | enum NOT NULL DEFAULT `'standard'` | `standard` · `deposit` · `project_final` |
| `conversations` | `linked_service_id` | uuid NULLABLE FK → `services(id)` | Sprint 23 — ticket vinculado a servicio |
| `conversations` | `linked_project_id` | uuid NULLABLE FK → `projects(id)` | Sprint 23 — ticket vinculado a proyecto |
| `services` | enum `status` añade `project_development` | enum | Servicio provisionado durante desarrollo del proyecto (no visible al cliente) |
| `messages` | `references` | jsonb NULLABLE DEFAULT `NULL` | Sprint 24 — array de citas: `[{ type, id, snapshot }]` ([ADR-047](../10-decisions/adr-047-sistema-citas-comunicacion.md)) |

---

## Tabla: `projects` ⬜

**Enum `ProjectType`:** `proposal` · `organizational`

**Enum `ProjectStatus` (solo aplica a `proposal`; `organizational` siempre `active`):**
`draft` · `proposal_sent` · `accepted` · `pending_review` · `deposit_paid` · `in_progress` · `completed` · `paid` · `active` · `rejected` · `expired` · `cancelled`

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `type` | enum `ProjectType` | NOT NULL | `proposal` o `organizational` |
| `status` | enum `ProjectStatus` | NOT NULL, DEFAULT `'draft'` | Solo aplica a `proposal`. `organizational` siempre `active` |
| `name` | varchar(300) | NOT NULL | Título del proyecto |
| `description` | text | NULLABLE | Descripción rica: qué se hará, por qué, cómo |
| `client_id` | uuid | NULLABLE, FK → `users(id)` | Nullable si `proposal` pre-registro |
| `client_email` | varchar(255) | NULLABLE | Email del cliente (para envío de propuesta sin cuenta) |
| `assigned_agent_id` | uuid | NULLABLE, FK → `users(id)` | Agente principal asignado |
| `created_by` | uuid | NOT NULL, FK → `users(id)` | Agente/admin que creó. Cliente si `organizational` |
| `deposit_pct` | decimal(5,2) | NOT NULL, DEFAULT `5.00` | % de depósito configurable |
| `deposit_refund_policy` | enum | NOT NULL, DEFAULT `'partial'` | `full` · `partial` · `none` |
| `deposit_invoice_id` | uuid | NULLABLE, FK → `invoices(id)` | Factura del depósito |
| `final_invoice_id` | uuid | NULLABLE, FK → `invoices(id)` | Factura final |
| `total_amount` | decimal(10,2) | NOT NULL, DEFAULT `0` | Suma de `project_items.unit_price`. Cache calculado |
| `valid_until` | timestamptz | NULLABLE | Fecha de expiración de la propuesta |
| `accepted_at` | timestamptz | NULLABLE | |
| `completed_at` | timestamptz | NULLABLE | |
| `cancelled_at` | timestamptz | NULLABLE | |
| `cancellation_reason` | text | NULLABLE | |
| `public_token` | varchar(500) | NULLABLE | JWT firmado para vista pública (30 días, [ADR-046](../10-decisions/adr-046-sistema-proyectos.md)) |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_projects_client_id` — en `client_id`
- `idx_projects_status` — en `status`
- `idx_projects_assigned_agent` — en `assigned_agent_id`
- `idx_projects_type` — en `type`

**Notas de decisión:**
- Vista pública con JWT — auto-vinculación al registrar el cliente solo si email verificado.
- `total_amount` se recalcula al añadir/eliminar `project_items` (trigger o callback en code).

---

## Tabla: `project_items` ⬜

Líneas del presupuesto. **Cada item es snapshot congelado del producto** ([ADR-046](../10-decisions/adr-046-sistema-proyectos.md)).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `project_id` | uuid | NOT NULL, FK → `projects(id)` ON DELETE CASCADE | |
| `product_id` | uuid | NULLABLE, FK → `products(id)` | Del catálogo. `null` si item custom |
| `product_name` | varchar(200) | NOT NULL | ⚠️ snapshot — nombre en el momento de añadir |
| `description` | text | NULLABLE | Explicación de por qué se incluye |
| `unit_price` | decimal(10,2) | NOT NULL | ⚠️ snapshot — precio congelado |
| `billing_cycle` | enum | NULLABLE | `monthly` · `annual` · `one_time`. Null si custom sin ciclo |
| `is_custom` | boolean | NOT NULL, DEFAULT `false` | True si no viene del catálogo |
| `custom_description` | text | NULLABLE | Para items custom (ej: "Configuración ERP — 20h") |
| `service_id` | uuid | NULLABLE, FK → `services(id)` | Se rellena al provisionar tras pago del depósito |
| `order_index` | integer | NOT NULL, DEFAULT `0` | Orden de presentación |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_project_items_project` — en `project_id`

**Regla crítica:** los precios **NUNCA** se leen del catálogo en vivo. Se congelan al añadir al proyecto. Si el catálogo cambia, el presupuesto **no cambia** ([ADR-046](../10-decisions/adr-046-sistema-proyectos.md)). Análogo a invariantes de billing (BILL-INV-3).

---

## Tabla: `project_agents` ⬜

Agentes asignados a un proyecto (equipo de trabajo).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `project_id` | uuid | NOT NULL, FK → `projects(id)` ON DELETE CASCADE | |
| `agent_id` | uuid | NOT NULL, FK → `users(id)` | |
| `role` | enum | NOT NULL, DEFAULT `'collaborator'` | `lead` · `collaborator` |
| `assigned_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `assigned_by` | uuid | NOT NULL, FK → `users(id)` | |

**Índices:**
- UNIQUE `(project_id, agent_id)`

---

## Tabla: `project_history` ⬜

Historial inmutable de cambios de estado y eventos del proyecto. **Solo INSERT** (análogo al schema `audit`).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `project_id` | uuid | NOT NULL, FK → `projects(id)` ON DELETE CASCADE | |
| `event_type` | varchar(100) | NOT NULL | `status_change` · `item_added` · `item_removed` · `agent_assigned` · `agent_removed` · `proposal_sent` · `accepted` · `deposit_paid` · `completed` |
| `old_value` | text | NULLABLE | Valor anterior (ej: estado anterior) |
| `new_value` | text | NULLABLE | Valor nuevo |
| `actor_id` | uuid | NULLABLE, FK → `users(id)` | `null` si fue job automático |
| `actor_name` | varchar(200) | NULLABLE | ⚠️ desnormalizado |
| `note` | text | NULLABLE | Nota opcional del actor |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_project_history_project` — en `project_id`
- `idx_project_history_created` — en `created_at`

**Notas de decisión:**
- Solo INSERT. Cualquier cambio del proyecto genera entrada aquí.
- Distinto del schema `audit.*` ([audit.md](./audit.md)) — este es específico del proyecto (orientado a workflow), aquel es global del cliente.

---

## Diagrama de relaciones (projects)

```
projects
  ├── project_items (1:N)             ← snapshots congelados de productos
  │     └── product_id (opcional) → products
  │     └── service_id (opcional) → services (al provisionar)
  ├── project_agents (N:M)            ← equipo de trabajo (lead + collaborators)
  ├── project_history (1:N)           ← inmutable
  ├── tasks (1:N via project_id)      ← tareas del proyecto (tasks.md)
  ├── deposit_invoice_id → invoices   ← invoice_type='deposit'
  └── final_invoice_id → invoices     ← invoice_type='project_final'

conversations (tickets — Sprint 23)
  ├── linked_service_id → services
  └── linked_project_id → projects

messages (Sprint 24)
  └── references (jsonb) ← citas a service / product / project / note (snapshot inmutable)
```

---

## Ciclo de vida del `proposal` (visual)

```
  draft ──→ proposal_sent ──→ accepted ──→ deposit_paid ──→ in_progress ──→ completed ──→ paid ──→ active
    │            │                │                                                         │
    │            ▼                ▼                                                         ▼
    │        expired          rejected                                                  cancelled
    ▼
  cancelled
```

Ver [ADR-046](../10-decisions/adr-046-sistema-proyectos.md) para semántica de cada estado y triggers.

---

## Servicios durante el desarrollo

Al pagar el depósito, los `project_items` con `product_id` crean `services` ([billing.md](./billing.md)) con `status = 'project_development'`:

- **Accesibles para el equipo** Aelium (agentes/admin pueden trabajar).
- **Pendientes para el cliente** (no visibles como servicios activos en su dashboard).
- **Coste de infra:** Aelium lo asume parcialmente. El depósito contribuye pero no cubre completamente.
- Al pagar factura final: `project_development` → `active`.

---

## Cross-references

- **Apuntan aquí:**
  - `tasks.project_id` → `projects` ([tasks.md](./tasks.md))
  - `invoices.project_id` → `projects` ([billing.md](./billing.md))
  - `conversations.linked_project_id` → `projects` ([support.md](./support.md))
  - `messages.references` (jsonb) → snapshots a `projects` ([support.md](./support.md))
- **ADRs:** [046](../10-decisions/adr-046-sistema-proyectos.md) (supersede ADR-022), [022](../10-decisions/adr-022-wdify-deprecado-proyectos.md) (WDIFY deprecado), [040](../10-decisions/adr-040-rediseno-tickets.md) (rediseño tickets — `linked_project_id`), [047](../10-decisions/adr-047-sistema-citas-comunicacion.md) (citas).
- **Sustitución de WDIFY:**
  - Productos `we_do_it` existentes en catálogo: `is_active = false`. No se eliminan (R3).
  - CTA "Solicitar desarrollo personalizado" en página del servicio del cliente → crea proyecto `proposal` vinculado al servicio.
  - Categorías de ticket `wdify_progress` y `wdify_feedback` se eliminan ([ADR-040](../10-decisions/adr-040-rediseno-tickets.md)).
- **Settings consumidos:** ninguno específico todavía documentado (sprint pendiente).
- **Errores API futuros:** ninguno específico documentado todavía.
- **AI Workers (Sprint 25 — futuro):** las tareas `project_task` podrán asignarse a un AI Worker. El proyecto sigue funcionando igual.
