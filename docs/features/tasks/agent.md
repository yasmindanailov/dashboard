# Tasks — Guía del agente

> 📜 **DOCTRINA POST-ADR-079 (2026-05-02)** — Esta guía describe el sistema VIGENTE tras Sprint 8. **Sprint 16 lo refactoriza profundamente** (ADR-079 mergeado): tasks pasa a ser bridge unidireccional read-only desde 5 triggers automáticos; card simple con accionadores inline contextuales; widget en sidebar y dashboard. Cuando Sprint 16 cierre, esta guía se reescribe.

> Módulo: `tasks`
> Última actualización: 2026-05-02 (banner ADR-079)
> Audiencia: agentes del equipo Aelium (`agent_full`, `agent_billing`, `agent_support`).
> Para la vista superadmin / configuración del módulo, ver [`admin.md`](./admin.md).

---

## 1. Tu día a día empieza en `/admin/tasks`

El tablero está partido en **tres tabs**:

| Tab | Qué ves | Cuándo lo usas |
|-----|---------|----------------|
| **Mis** | Tareas asignadas a ti | El 90% del tiempo |
| **Sin asignar** | Cola pública del equipo | Cuando termines tus tareas o tengas capacidad libre |
| **Todas** | Visión transversal | Sólo si eres `agent_full` o superadmin |

Cada tab tiene sus propios contadores honestos. Si en "Mis" ves 5 pendientes, son 5 tareas tuyas; si cambias a "Sin asignar" y ves 12, son 12 de la cola pública (no del total combinado).

**Default del filtro de estado:** `pending`. Para ver completadas o canceladas, cambia el `statusFilter` desde la barra superior.

**Orden:** prioridad descendente → fecha de vencimiento ascendente → fecha de creación ascendente. Las urgentes con vencimiento hoy salen primero.

---

## 2. Tomar una tarea de la cola pública

Las tareas con `assigned_to=null` viven en la tab "Sin asignar". Tienes dos formas de cogerla:

1. **Desde la lista** → click en la tarea → header → botón "Asignarme" (sólo aparece si la tarea está sin asignar).
2. **Desde el detalle** → modificas el campo "Asignado a" y te seleccionas a ti mismo.

La operación es atómica: si otro agente la coge un segundo antes, recibirás un 409 ("Esta tarea ya fue asignada"). Refresca y elige otra.

**No puedes "robar" tareas asignadas a otro agente.** Sólo `agent_full` y `superadmin` pueden reasignar tareas que ya tienen dueño.

**SLA:** la cola pública tiene cron diario (09:00 UTC). Si una tarea sin asignar excede su SLA por tipo (ver §10 de [admin.md](./admin.md)), el superadmin recibe un resumen agregado para que asigne o priorice.

---

## 3. Crear una tarea

Botón "+ Nueva tarea" en el header del tablero. Campos clave:

- **Título** — corto y accionable. "Migrar dominio carla.es a Cloudflare", no "Tema dominio".
- **Tipo** — qué bloque/automatización activa la tarea. Elige el más específico que aplique. Si tienes dudas: `custom_work`.
- **Prioridad** — `urgent` solo si hay impacto de cliente real ahora; `high` si bloquea a otro miembro del equipo; `normal` para el resto.
- **Asignado a** — vacío = cola pública; útil cuando no sabes quién la cogerá. Si va para ti misma, autoasígnate.
- **Cliente + Servicio** (opcional) — si tocas algo de un cliente concreto, vincúlalo. Habilita el bloque adaptativo del detalle con el plan + producto del cliente.
- **Fecha límite** — no aceptamos fechas pasadas (validación en backend).
- **Motivo** (texto libre <=100) — el porqué humano. "Renovación anual cae el 15", "Cliente reporta lentitud DNS".
- **Tags** — multi-select del catálogo + crear inline. Ayuda al filtrado posterior.

**Tarea recurrente:** marca `is_recurring` y especifica `recurrence_day` (1-31). Para recurrencias mensuales operativas reales, prefiere usar Support Inside cuando aplique (Fase D).

---

## 4. Trabajar una tarea

Al abrir el detalle ves:

- **Header**: título + badges (status, priority, type) + botones contextuales (`Iniciar`, `Completar`, `Cancelar`).
- **Bloque adaptativo** según el tipo:
  - `contact_client` con servicio → "Datos del cliente y plan" (servicio + plan + ciclo + status).
  - `maintenance` / `maintenance_management` → checklist completable con progreso N/M.
  - `support_ticket` → sidebar "Ticket origen" con link al ticket.
- **Card "Notas internas"** persistente — añadir nota dispara POST inmediato (no se acumula localmente).
- **Sidebar derecha**: cliente, servicio, tags, fecha límite, fecha de creación, asignación.

**Cambiar el estado:**
- `pending → in_progress` → botón "Iniciar". Marca que estás trabajando ahora.
- `in_progress → completed` → ver §5.
- `pending|in_progress → cancelled` → botón "Cancelar". Necesita confirmación.

**No puedes editar tareas terminales** (`completed`, `cancelled`, `not_completed_in_time`). Si necesitas registrar una corrección, crea una tarea nueva.

---

## 5. Completar una tarea — los 3 caminos

### 5.1 Tareas simples (`custom_work`, `contact_client`, `project_task`, `support_setup`)

Botón "Completar" → modal simple:
- **Notas internas** (opcional pero recomendado) — qué hiciste.
- Confirmar.

Si pones `clientNotes` y la tarea no es maintenance, el cliente recibirá email + campana con el copy canónico de "tarea completada".

### 5.2 Tareas de mantenimiento (`maintenance`, `maintenance_management`)

Botón "Completar y notificar" → exige checklist:

1. Marca cada item del checklist según lo hayas hecho.
2. Los items con `is_required=true` están resaltados — **si dejas alguno sin marcar, el sistema rechaza el cierre** y los pinta en rojo.
3. Items opcionales no bloquean (decisión Sprint 8.B.5).
4. Añade nota interna con resumen.
5. Confirmar.

Lo que pasa por debajo:
- Se persiste un `maintenance_log` con tu resumen.
- Se cierra la tarea.
- Se crea automáticamente una `ClientNote` que aparecerá en el timeline del cliente.
- El cliente recibe email + campana con el resumen mensual del mantenimiento.

### 5.3 Tareas de ticket de soporte (`support_ticket`)

Estas tareas nacen automáticamente al asignar un ticket. Botón "Completar" → modal en **modo bridge**:

- **Acción del ticket**:
  - `Resolver` — el ticket queda en `resolved` (cliente puede reabrirlo en X días).
  - `Cerrar` — el ticket pasa a `closed` definitivo.
- **Nota de resolución** (obligatoria) — qué solucionaste. Se publica al cliente.

Al confirmar:
1. La tarea se cierra.
2. El ticket se transiciona según tu elección.
3. El cliente recibe la notificación canónica de support (NO de tasks — evitamos doble email).

**Cancelar una tarea bridge libera el ticket** (lo deja sin agente asignado). Otro agente puede tomarlo. La UI te avisa con un toast contextual.

---

## 6. Notas internas + timeline del cliente

Cada nota interna que añades a una tarea:
- Se guarda con `task_id` FK física.
- Aparece en la timeline del cliente (`/admin/clients/:id` tab Notas) con badge "Tarea origen" + título + tipo de la tarea.
- Su autor es tu usuario (FK física `client_notes.author`).

**Buena práctica:** escribe la nota como si fuese leída en 6 meses por otro agente. Contexto + qué hiciste + por qué.

---

## 7. Crons que afectan tus tareas

| Cron | UTC | Qué hace contigo |
|------|-----|------------------|
| `tasks-overdue` | `02:00` | Si una tarea tuya excede `due_date + 7 días` (config), la marca `not_completed_in_time` y te llega email. Es terminal — no puedes recuperarla. |
| `tasks-unassigned-overdue` | `09:00` | Si tareas en cola pública exceden SLA, el superadmin recibe resumen. No te afecta directo. |
| `maintenance-critical` | `08:00` | Si servicios con mantenimiento contratado llevan >60 días sin `maintenance_log`, superadmin recibe alerta. Te puede tocar tarea nueva. |
| `maintenance-monthly` | `06:00` (diario) | Si gestionas Support Inside, este cron crea tu `maintenance_management` mensual cuando un slot cumple su `anniversary_day`. La tarea nace en cola pública (sin asignar). |

> **Ojo con `tasks-overdue`:** si ves tareas pasando a `not_completed_in_time`, no es un bug — es la presión operativa de la doctrina ADR-041. Si tu vencimiento está apretado pero la tarea sigue siendo válida, **cambia la `due_date` antes** de que el cron la marque, o cancela y crea una nueva con plan realista.

---

## 8. Tickets de soporte y tareas (bridge ADR-074)

Si trabajas tickets en `/admin/support`, esto te concierne:

- **Asignar un ticket = crear una tarea bridge** automáticamente. Verás la tarea aparecer en tu tab "Mis".
- **Cerrar el ticket directamente desde `/admin/support`** ya no es el flujo canónico. La pill "Trabajando en tarea →" en el `ConversationHeader` te lleva a la tarea bridge.
- **Cerrar el ticket pasa por la tarea** (modal bridge §5.3).
- **Reabrir un ticket** crea una tarea nueva (no reutiliza la antigua).
- **Desasignar un ticket** cancela la tarea bridge correspondiente con flag interno para evitar el ciclo.

---

## 9. Si algo va mal

| Síntoma | Qué pasa | Qué hacer |
|---------|----------|-----------|
| "No puedo editar esta tarea" | Está en estado terminal (`completed`/`cancelled`/`not_completed_in_time`) | Crea una nueva. No reabrimos terminales (TASK-INV-2). |
| "Me sale 409 al asignarme" | Otro agente la cogió un segundo antes | Refresca el listado y elige otra. |
| "Marqué el checklist y no me deja completar" | Hay items requeridos sin marcar | Mira los pintados en rojo. Items opcionales no bloquean. |
| "Cancelé la task bridge y el ticket sigue 'in_progress'" | Bug — debería liberarse. | Ver `/admin/support/tickets/:id` y desasigna manualmente. Reportar. |
| "Mi tarea pasó sola a `not_completed_in_time`" | El cron `tasks-overdue` la marcó vencida | Es comportamiento canónico. Crea una nueva con plan realista o pide al admin que ajuste `tasks.overdue_to_failure_days`. |

---

## 10. Lo que NO puedes hacer (boundaries)

- ❌ Editar tareas asignadas a otro agente (salvo que seas `agent_full` o superadmin).
- ❌ Crear o borrar tags del catálogo (solo `agent_full` y superadmin desde `/admin/task-tags`).
- ❌ Disparar manualmente los crons (solo superadmin con `Manage.Job`).
- ❌ Reabrir tareas terminales.
- ❌ Cerrar un ticket de soporte ignorando su task bridge — la doctrina ADR-074 unifica el cierre en la tarea.

---

## 11. Referencias rápidas

- Vista admin del módulo: [`admin.md`](./admin.md)
- Edge cases canónicos: [`docs/60-roadmap/current.md` §6 Sprint 8](../../60-roadmap/current.md)
- ADRs vivos del módulo: [041](../../10-decisions/adr-041-sistema-tareas.md), [067](../../10-decisions/adr-067-granularidad-casl-rol-staff.md), [072](../../10-decisions/adr-072-tareas-sin-asignar-cola-publica.md), [073](../../10-decisions/adr-073-tipos-flexibles-tasks-reason-tags.md), [074](../../10-decisions/adr-074-ticket-task-bridge.md)
