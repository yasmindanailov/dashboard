# ADR-040 — Rediseño de tickets (Sprint 23 — plan)

> **Status:** Active (planificada — implementación en Sprint 23)
> **Date:** 2026-04 (Sprint 7.B planning) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §46
> **Domain:** support, ui

---

## Contexto

ADR-037 estableció la arquitectura dual chat + tickets, pero en Sprint 7 ambos compartían **la misma interfaz de mensajes** (burbujas en `[id]/page.tsx`). Resultado:

1. **Falta de diferenciación percibida.** Cliente y agente no notan que un ticket es distinto de un chat más allá de la sección donde llega.
2. **UI de chat optimizada para mensajes cortos** y rápida lectura — inadecuada para cuerpos largos típicos de tickets (el cliente describe su problema en 3 párrafos, captura adjunta).
3. **Falta features esenciales de un sistema de tickets profesional:** SLA visible, vinculación a servicios/proyectos, etiquetas, adjuntos, ordenamiento por columnas.

Sprint 7.B documentó el plan de rediseño para Sprint 23. Este ADR formaliza la decisión.

---

## Decisión

### Diferenciación radical de UX

| Aspecto | **Chat** (sin cambios) | **Tickets** (rediseñado) |
|---------|----------------------|--------------------------|
| Modelo mental | WhatsApp | Email / Jira |
| UI de mensajes | Burbujas compactas, scroll rápido | **Bloques completos: cabecera (autor + fecha) + cuerpo + footer (acciones)** por respuesta |
| Tempo | Segundos | Horas/días |
| Sidebar | Contexto del cliente | Contexto del cliente **+ metadata del ticket** (SLA, servicio vinculado, proyecto vinculado, tags) |
| Acciones | Resolver, cerrar, escalar | + **Vincular servicio/proyecto** + **tags** + **SLA** + **adjuntar archivos** |
| Vista lista | Panel en vivo (3 columnas — chat) | **Bandeja tipo inbox** con columnas ordenables y filtros |

### Features nuevos del ticket

#### 1. UI thread-based
- Cada respuesta es un **bloque** con header (autor + fecha) + body (cuerpo HTML/markdown) + footer (acciones).
- Visualmente distinto al chat (que sigue siendo burbujas).
- Migration path: mensajes plaintext existentes se renderizan como `<p>` plano dentro del bloque.

#### 2. Sidebar enriquecida
Además del contexto del cliente (perfil, servicios, notas), muestra:
- **SLA tracking** — `sla_response_target` y `sla_resolution_target` con indicador visual (verde/ámbar/rojo).
- **Servicio vinculado** — `linked_service_id` (FK opcional a `services`).
- **Proyecto vinculado** — `linked_project_id` (FK opcional a `projects`, ADR-046).
- **Tags** del ticket.

#### 3. Vinculación a entidades
Tabla `Conversation` añade campos:
- `linked_service_id` (UUID, nullable, FK a `services`).
- `linked_project_id` (UUID, nullable, FK a `projects` cuando exista).
- Configurables al crear o editar el ticket.
- En la sidebar hay accesos directos a la entidad vinculada.

#### 4. Tags / etiquetas
Tabla nueva `conversation_tags`:
```prisma
model ConversationTag {
  id              String  @id @default(uuid()) @db.Uuid
  conversation_id String  @db.Uuid
  tag             String  // texto libre, ej: "urgente", "facturación"
  created_at      DateTime @default(now())
  @@unique([conversation_id, tag])
  @@map("conversation_tags")
}
```
- Filtrables en bandeja.
- Sugerencias autocompletadas a partir de tags ya usados.

#### 5. SLA tracking
- Campos `sla_response_target` y `sla_resolution_target` en `Conversation` (timestamps).
- Calculados al crear según el plan del cliente (Support Inside SLAs si aplica) o defaults.
- Indicador visual:
  - **Verde:** dentro del SLA con margen.
  - **Ámbar:** acercándose al límite.
  - **Rojo:** SLA incumplido.

#### 6. Adjuntos
- Subida de archivos a **MinIO** (cuando se implemente storage — Sprint 14).
- Tipos permitidos: imágenes (capturas), documentos (logs, PDFs).
- Límite: 10 MB por archivo, 5 archivos por mensaje (configurable).
- Preview inline para imágenes, link de descarga para docs.
- Tabla `message_attachments` con `message_id`, `s3_key`, `filename`, `mime_type`, `size_bytes`.

#### 7. Lista rediseñada
Bandeja de tickets con:
- **Columnas ordenables:** estado, prioridad, agente asignado, categoría, última actividad, SLA.
- **Filtros:** estado, prioridad, categoría, agente, tags, vinculado a servicio/proyecto.
- **Búsqueda full-text** sobre subject + body.

### Deprecación de categorías WDIFY

Como parte de este rediseño, las categorías WDIFY se eliminan:
- `wdify_progress` → **eliminada** (trazabilidad de desarrollo vive en proyectos, ADR-046).
- `wdify_feedback` → **eliminada** (feedback vía chat o proyecto).
- Tickets existentes con estas categorías se migran a `support_technical`.

### Principio de diseño

> El **chat** es para **operar en tiempo real**.
> Los **tickets** son para **investigar, documentar y resolver**.
> Cada sistema tiene su UI optimizada para su propósito.

### Estado actual de implementación

- **Pendiente Sprint 23.** Hoy chats y tickets comparten UI de mensajes.
- **Bloqueado parcialmente por Sprint 14** (MinIO) — adjuntos no se pueden hacer hasta tener storage.
- **Bloqueado parcialmente por Sprint 22** (Proyectos) — vinculación `linked_project_id` requiere que el módulo Proyectos exista.
- **Rich text editor** (TipTap) para tickets es Sprint 7.6.1 (separado, anterior a este).

---

## Consecuencias

- ✅ **Ganamos:**
  - Diferenciación clara entre chat y ticket en UX.
  - Sistema de tickets a la altura de competidores profesionales.
  - SLA visible permite gestionar expectativas y priorizar.
  - Vinculación a servicios/proyectos cierra el círculo cliente↔soporte↔producto.
- ⚠️ **Aceptamos:**
  - Sprint significativo (Sprint 23). Hasta entonces, los tickets siguen con UI de chat.
  - Bloqueado en parte por otros sprints (MinIO, Proyectos).
  - Migración de tickets WDIFY a `support_technical` requiere data migration.
- 🚪 **Cierra:**
  - **No volver a UI única para chat y ticket.** Diferenciación radical y permanente.

---

## Cuándo revisar

- Tras Sprint 23: validar con uso real que los nuevos features (SLA, tags, adjuntos) son valor real y no overhead.
- Si métricas muestran que clientes/agentes se sienten más cómodos con un sistema u otro: ajustar.
- Si surge un tipo de conversación que no encaja en chat ni ticket → ADR para nuevo tipo (no extender ninguno de los dos).

---

## Referencias

- **Módulos afectados:** support, products (Support Inside SLAs feeding sla_*_target), projects (cuando exista, vinculación).
- **ADRs relacionados:** ADR-037 (arquitectura dual — base de este rediseño), ADR-022 (WDIFY deprecado), ADR-038 (notas estructuradas), ADR-039 (nota obligatoria), ADR-046 (Sistema de Proyectos — para `linked_project_id`).
- **Glosario:** [Ticket](../00-foundations/glossary.md), [Chat](../00-foundations/glossary.md).
- **Sprint:** 23 (rediseño de tickets), bloqueado parcialmente por 14 (MinIO) y 22 (Proyectos).
- **Migration path:** tickets `wdify_*` → `support_technical` mediante data migration al ejecutar Sprint 23.
