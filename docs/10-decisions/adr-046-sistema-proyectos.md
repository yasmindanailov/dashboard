# ADR-046 — Sistema de Proyectos (Sprint 22 — supersede WDIFY)

> **Status:** Active (supersedes ADR-022 — implementación Sprint 22)
> **Date:** 2026-04 (Sprint 22 plan) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §44
> **Domain:** products, billing

---

## Contexto

WDIFY (We Do It For You, ADR-022) era un addon con precio fijo vinculado a un solo producto. La práctica reveló que **no cubría casos reales:**

- **Desarrollo personalizado multi-producto** (ej: configurar Nextcloud + migrar email + crear landing) — no encajaba en un addon de precio fijo de un solo producto.
- **Presupuestos formales para clientes potenciales** — el agente necesita enviar una propuesta con alcance, precio y aceptación explícita, antes de cobrar nada.
- **Organización interna de la tecnología del cliente** — un cliente con 5 servicios quiere agruparlos por proyecto ("digitalización", "tienda online") como forma de entender qué tiene contratado.

Hace falta un modelo más flexible: un **proyecto** que orqueste presupuesto + productos + tareas + cliente + pagos, con dos modos (propuesta del agente / agrupación del cliente) compartiendo modelo de datos.

---

## Decisión

### Concepto

Un proyecto es un **orquestador** que vincula entidades existentes — no es un sistema nuevo. Es un wrapper de ventas y gestión sobre lo que ya existe:

```
Proyecto = Presupuesto (quote) + Productos (catalog snapshot) + Tareas + Cliente + Pagos (invoices)
```

### Dos modos en la misma tabla (campo `type`)

| Aspecto | `proposal` (agente crea) | `organizational` (cliente crea) |
|---------|--------------------------|-------------------------------|
| **Quién crea** | Agente / admin | Cliente |
| **Propósito** | Presupuesto formal + desarrollo personalizado | Agrupar servicios activos del negocio |
| **Productos** | Snapshots de precios (no existen aún como servicios) | Referencias a servicios activos |
| **Tiene presupuesto** | Sí, con depósito y factura final | No |
| **Tiene tareas** | Sí (desarrollo, configuración) | No necesariamente |
| **Vista pública** | Sí (link con JWT para no registrados) | No |
| **Ciclo de vida** | 11 estados (draft → active) | Sin ciclo, existe y se edita |

**Convergencia:** Un proyecto `proposal` que llega al final se convierte en lo mismo que un `organizational` del cliente. El proceso de propuesta queda como historial archivado.

### Ciclo de vida del `proposal`

```
  draft ──→ proposal_sent ──→ accepted ──→ deposit_paid ──→ in_progress ──→ completed ──→ paid ──→ active
    │            │                │                                                         │
    │            ▼                ▼                                                         ▼
    │        expired          rejected                                                  cancelled
    ▼
  cancelled
```

| Estado | Significado | Trigger |
|--------|-------------|---------|
| `draft` | Agente construyendo. No visible para cliente | Creación |
| `proposal_sent` | Presupuesto enviado al email del cliente | Agente envía |
| `accepted` | Cliente aceptó. Pendiente de depósito | Cliente pulsa "Aceptar" |
| `deposit_paid` | Depósito recibido. Equipo puede empezar | Pago confirmado |
| `in_progress` | Trabajo activo. Tareas en curso | Agente inicia trabajo |
| `completed` | Trabajo terminado. Pendiente pago final | Agente finaliza |
| `paid` | Factura final pagada. Servicios activándose | Pago confirmado |
| `active` | Servicios activos. Proyecto archivado | Provisioning completado |
| `rejected` | Cliente rechazó la propuesta | Cliente rechaza |
| `expired` | Sin respuesta en plazo configurado | Job automático |
| `cancelled` | Cancelado (por agente o falta de pago) | Manual o automático |

### Items del proyecto (snapshots congelados)

Cada item es **snapshot del producto en el momento de añadirlo**:

| Campo | Propósito |
|-------|-----------|
| `product_id` | Nullable. Del catálogo, o null si es custom |
| `product_name` | Snapshot. Nombre en el momento de crear |
| `description` | Por qué se incluye este producto |
| `unit_price` | Snapshot. Precio congelado |
| `billing_cycle` | Snapshot. Mensual / anual / único |
| `custom_description` | Para items sin product_id (ej: "Configuración ERP — 20h") |
| `service_id` | Solo se rellena cuando se provisiona tras pago del depósito |

**Regla crítica:** los precios **NUNCA se leen del catálogo en vivo**. Se congelan al añadir al proyecto. Si el catálogo cambia después, el presupuesto **no cambia**. Análogo a invariantes de billing (BILL-INV-1).

### Depósito y factura final

- Configurable por proyecto (`deposit_pct`, default 5%).
- Genera `invoice` con `invoice_type = 'deposit'`.
- Se descuenta de la factura final (`invoice_type = 'project_final'`).
- Política de reembolso configurable: `full`, `partial`, `none`.

### Servicios durante el desarrollo

Al pagar el depósito, los `project_items` con `product_id` crean `services` con status `project_development`:

- **Accesibles para el equipo Aelium** (agentes/admin pueden trabajar en ellos).
- **Pendientes para el cliente** (no visibles como servicios activos en su dashboard).
- **Coste de infraestructura:** Aelium lo asume. El depósito contribuye pero no cubre completamente. Los servicios no están en producción todavía.
- Al pagar factura final: status `project_development` → `active`.

### Modificaciones post-aceptación

Cualquier cambio en items o precio después de que el cliente aceptó:

1. El estado vuelve a `pending_review`.
2. El cliente recibe notificación.
3. Debe **re-aceptar** antes de continuar.

### Vista pública (pre-registro)

```
1. Agente crea proyecto con email del cliente (ej: info@negocio.com)
2. Se genera JWT firmado (30 días) con project_id + email
3. Email enviado con link: aelium.es/projects/view?token=xxx
4. Cliente ve presupuesto: descripción, productos, tareas, precio total
5. Al aceptar:
   - Si tiene cuenta → login → auto-vincula → paga depósito
   - Si no tiene cuenta → registro con ese email → auto-vinculación
                          (SOLO si email verificado) → paga depósito
```

**Seguridad:** auto-vinculación SOLO ocurre tras verificación de email. Sin verificación = sin acceso al proyecto.

### Tareas del proyecto (1:N independientes)

Un proyecto tiene **N tareas independientes**, cada una asignable a un agente diferente. **No existen subtareas** — el proyecto es el agrupador:

```
Proyecto: "Digitalización Floristería Pérez"
  ├── Tarea 1: "Crear landing web"          → Agente A (o AI Worker futuro)
  ├── Tarea 2: "Configurar Nextcloud"       → Agente B
  └── Tarea 3: "Migrar email a Nextcloud"   → Agente B
```

- Cada tarea es `type = 'project_task'` con `project_id` vinculado (ADR-041).
- Cada tarea tiene su propio `assigned_to`, `status`, `priority`, `due_date`.
- El progreso del proyecto = % de tareas completadas.
- Al completar TODAS las tareas → el agente puede marcar el proyecto como `completed`.
- El cliente ve título, estado, progreso de las tareas — **no** los detalles internos (notas internas, checklist).

### Comunicación del proyecto

**No hay sistema de comunicación propio del proyecto.** El agente actualiza tareas y el cliente ve el progreso (% completado, últimas actualizaciones). Para excepciones: comunicación directa via chat o ticket vinculado (ADR-040 `linked_project_id`).

### Sustitución de WDIFY

- WDIFY como addon **deprecado** (ADR-022).
- Productos `we_do_it` existentes: marcados `is_active: false`. No eliminados (R3 — datos históricos en facturas).
- CTA **"Solicitar desarrollo personalizado"** en página del servicio del cliente → crea proyecto `proposal` vinculado al servicio.
- Categorías de ticket `wdify_progress` y `wdify_feedback` se eliminan (ADR-040).

---

## Consecuencias

- ✅ **Ganamos:**
  - Modelo flexible: cualquier desarrollo custom encaja sin crear addon nuevo cada vez.
  - Trazabilidad completa: propuesta → aceptación → depósito → trabajo → entrega → cobro final → activación.
  - Cliente ve presupuesto antes de pagar (transparencia).
  - **Mismo modelo** sirve para propuestas comerciales y para organizar lo que ya tiene activo.
  - Snapshots congelados garantizan invariante: cliente paga lo que aceptó, no lo que el catálogo diga después.
- ⚠️ **Aceptamos:**
  - Sprint significativo (Sprint 22). Hasta entonces, WDIFY sigue activo en código aunque deprecado.
  - **11 estados** del ciclo `proposal` — complejidad notable. Mitigación: documentación de transiciones permitidas y guardas en código.
  - Coste de infraestructura durante `project_development` lo asume Aelium parcialmente (el depósito no cubre todo). Aceptable como inversión en cliente potencial.
  - Vista pública con JWT 30 días — riesgo si el token se filtra. Mitigación: token expira, auto-vinculación requiere email verificado.
- 🚪 **Cierra:**
  - **No nuevos addons "we_do_it" en el catálogo** (ya cerrado en ADR-022, reforzado aquí).
  - **No subtareas dentro de tareas de proyecto.** Si hace falta granularidad → más tareas, no jerarquía.
  - **No comunicación propia del proyecto.** Reusar chat/ticket con `linked_project_id`.
  - **No leer precios del catálogo en vivo** — siempre del snapshot del item.

---

## Cuándo revisar

- Tras Sprint 22: validar con uso real que los 11 estados son útiles o si algunos se pueden colapsar.
- Si los proyectos `organizational` (creados por cliente) demuestran no usarse → considerar eliminar el modo y dejar solo `proposal`.
- Si surgen demandas de comunicación rica dentro del proyecto (chat dedicado, foro) → revisar — hoy se delega a chat/ticket.
- Cuando AI Workers (Sprint 25) se implementen → revisar `assigned_to` de tareas de proyecto.

---

## Referencias

- **Módulos afectados:** projects (nuevo módulo, stub hoy), tasks (`project_task`), billing (deposit + project_final invoices), products (catalog snapshots), services (`project_development` status), support (`linked_project_id`).
- **Reglas relacionadas:** R1 (módulos por eventos), R3 (audit log), R5 (cálculos en backend), R8 (Outbox para eventos críticos).
- **ADRs relacionados:** ADR-022 (WDIFY — superseded por este), ADR-018 (catálogo dinámico), ADR-026 (estados factura — `deposit` y `project_final` types), ADR-040 (rediseño tickets — `linked_project_id`), ADR-041 (tasks — `project_task`).
- **Glosario:** [Proyecto](../00-foundations/glossary.md), [Snapshot](../00-foundations/glossary.md), [Depósito](../00-foundations/glossary.md).
- **Sprint:** 22 (implementación). Bloqueado parcialmente por: storage (Sprint 14, MinIO para adjuntos en proyectos).
- **Documentación referenciada:** `docs/AI_WORKERS.md` (futuro Sprint 25), `docs/20-modules/projects/contract.md` (cuando se cree).
