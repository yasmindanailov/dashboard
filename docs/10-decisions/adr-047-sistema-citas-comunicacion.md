# ADR-047 — Sistema de citas (referencias estructuradas en mensajes)

> **Status:** Active (planificada — implementación Sprint 24)
> **Date:** 2026-04 (Sprint 24 plan) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §47
> **Domain:** support, ui

---

## Contexto

Las conversaciones de soporte (chats y tickets, ADR-037) **pierden contexto** porque no hay forma de referenciar entidades del sistema (productos, proyectos, servicios, notas) directamente en los mensajes. El agente describe textualmente:

> "Te escribo sobre tu Hosting Web Pro de tienda.com, el que renueva el 15 de mayo, y específicamente sobre la tarea de mantenimiento que dejé abierta el otro día..."

El cliente lee 3 párrafos para entender de qué se habla y **no puede hacer clic** para ir al servicio o a la tarea. Si el agente menciona el nombre exacto del producto y luego el catálogo se renombra, el mensaje queda obsoleto pero la referencia textual no se actualiza.

Hace falta un sistema de **referencias estructuradas** (citas) embebidas en los mensajes — análogo a las menciones `@usuario` en Slack o las cards de Notion.

---

## Decisión

### Concepto

Una **cita** (citation) es una **referencia estructurada** a una entidad del sistema, embebida dentro de un mensaje de chat o ticket. Se renderiza como una card interactiva con información básica + link de navegación.

### Modelo de datos

Campo `references` (jsonb) en tabla `messages`:

```json
[
  {
    "type": "service",
    "id": "uuid-del-servicio",
    "snapshot": {
      "name": "Hosting Web — Plan Pro",
      "status": "active"
    }
  },
  {
    "type": "project",
    "id": "uuid-del-proyecto",
    "snapshot": {
      "name": "Digitalización Floristería Pérez",
      "status": "in_progress"
    }
  }
]
```

El **snapshot** se guarda al insertar el mensaje. La resolución actual se hace al renderizar (ver "Resolución" abajo).

### Tipos de referencia soportados

| Tipo | Quién puede citar | Info en la card |
|------|-------------------|-----------------|
| `service` | Cliente (sus propios) + Agente | Nombre, producto, estado |
| `product` | Cliente + Agente | Nombre, precio, categoría |
| `project` | Cliente (sus propios) + Agente | Nombre, estado, % progreso |
| `note` | Solo agente | Resumen, categoría, autor |

### Permisos

- **Cliente**: solo puede citar entidades **propias** (sus servicios, sus proyectos).
- **Agente**: puede citar **cualquier entidad del cliente con el que está conversando** (sus servicios, sus proyectos, sus notas).
- **Validación en backend** al insertar el mensaje — no se puede citar lo que no se debe.

### Resolución de referencias

Al cargar mensajes:
1. Backend lee los `references` del mensaje.
2. Para cada referencia: intenta cargar la entidad actual.
3. Si existe → enriquece la card con datos actuales (nombre, estado, progreso).
4. Si NO existe (eliminada, anonimizada, fuera de permisos) → muestra el snapshot original con badge **"No disponible"**.

**Por qué snapshot + resolución:**
- El **snapshot** garantiza que el mensaje conserva contexto histórico aunque la entidad cambie de nombre o se elimine.
- La **resolución actual** permite mostrar info viva (estado actualizado, progreso reciente) sin recalcular el mensaje.

### UX

- Botón **"📎 Adjuntar referencia"** en el input de mensajes.
- Selector con búsqueda filtrada por tipo (service / product / project / note).
- La referencia se renderiza como **card clickable** dentro del mensaje (no como texto plano).
- Al hacer clic, **navegación directa a la entidad** (deep linking — ej: `/dashboard/services/<id>`).

### Integración con tickets enriquecidos (ADR-040)

Aunque ADR-040 introduce `linked_service_id` y `linked_project_id` a nivel de **conversación entera**, las citas son a nivel de **mensaje individual**:

- Vinculación de conversación → "este ticket es sobre este servicio" (estructural, una sola entidad principal).
- Cita en mensaje → "menciono este servicio y este proyecto" (varias en cada mensaje, contexto local).

Ambos coexisten sin solaparse.

---

## Consecuencias

- ✅ **Ganamos:**
  - Mensajes navegables — el cliente hace clic en la card y va a la entidad.
  - Contexto preservado: snapshot conserva el "qué se discutió" aunque las cosas cambien.
  - Card viva con resolución actual — info útil al momento de leer el mensaje viejo.
  - Reducción de fricción en soporte: el agente no describe textualmente, cita.
- ⚠️ **Aceptamos:**
  - Complejidad de validación de permisos (cliente solo cita lo suyo, agente cita lo del cliente conversado) — bug común si no se centraliza.
  - Resolución en cada lectura → posible sobrecarga si los mensajes citan muchas entidades. Mitigación: caching corto (Redis) por entidad.
  - Snapshot + resolución duplica info — si snapshot dice "Plan Pro" y entidad actual es "Plan Premium" tras rename, la card muestra ambos. Aceptable: muestra evolución, no es bug.
- 🚪 **Cierra:**
  - **No menciones textuales como sustituto** — la UX debe encaminar a usar el botón de cita para entidades soportadas.
  - **No editar el snapshot** del mensaje pasado. Inmutable como el resto del audit log (R3).

---

## Cuándo revisar

- Tras Sprint 24: validar con uso real qué tipos de cita se usan (service y project son seguros, note y product pueden ser ruido).
- Si surgen tipos nuevos relevantes (invoice, task, ticket cruzado) → ampliar enum `type` con ADR.
- Si la performance se degrada por resolución repetida → introducir batching o cache más agresivo.
- Si las citas de `note` exponen información sensible al cliente por bug → revisar permisos urgentemente.

---

## Referencias

- **Módulos afectados:** support (citas dentro de mensajes), services / products / projects / notes (entidades citables).
- **Reglas relacionadas:** R3 (audit log inmutable — snapshot del mensaje no se edita), R5 (validación en backend), R12 (permisos).
- **ADRs relacionados:** ADR-037 (arquitectura dual chat + tickets — donde viven los mensajes), ADR-038 (notas estructuradas — citables como `note`), ADR-040 (rediseño tickets — `linked_service_id`/`linked_project_id` a nivel conversación, complementario a este ADR), ADR-046 (proyectos — citables como `project`).
- **Glosario:** [Cita](../00-foundations/glossary.md), [Snapshot](../00-foundations/glossary.md), [Mensaje](../00-foundations/glossary.md).
- **Sprint:** 24 (implementación). Bloqueado por: nada — el modelo de datos (`references` jsonb) se puede añadir sin dependencias bloqueantes.
