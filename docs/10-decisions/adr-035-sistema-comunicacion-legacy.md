# ADR-035 — Sistema de comunicación (versión inicial — legacy)

> **Status:** Superseded by ADR-037 (Sprint 7.B — Arquitectura dual chat + tickets)
> **Date:** 2026-04 (origen) · 2026-04-26 (migración + supersede)
> **Original:** DECISIONS.md §9
> **Domain:** support

---

## Contexto

Versión inicial del modelo de comunicación entre Aelium y sus clientes, definido al principio del proyecto. Establecía los **canales** disponibles (chat, asíncrono, email, teléfono, WhatsApp), distinguía **chat tiempo real** de **conversaciones asíncronas**, y describía cómo escalar de uno a otro.

La nomenclatura usaba indistintamente "conversaciones asíncronas" y "Casos" para lo que el sistema final llama **Tickets**.

---

## Decisión original (legacy)

### Canales

| Canal | Disponibilidad |
|-------|----------------|
| Webchat (tiempo real) | Todos los clientes |
| Conversación asíncrona (tipo email interno) | Todos los clientes |
| Email | Todos los clientes |
| Teléfono | Todos los clientes |
| WhatsApp | Solo Support Inside Medium y Pro |

### Chat en tiempo real

- Tecnología: WebSockets con Socket.io.
- Disponible en landing (anónimos y clientes) y en dashboard (clientes logueados).
- **Chat anónimo en landing:** solicita nombre y email mínimo.
  - Si el anónimo se registra después con el mismo email → historial vinculado automáticamente.
  - Si no dejó email → conversación queda huérfana, el agente puede vincularla manualmente.

### "Conversaciones asíncronas" / "Casos"

- Se creaban si un chat se complicaba o alargaba.
- Se llamaban "Casos" en algunos sitios y "conversaciones asíncronas" en otros — **inconsistencia detectada**.

### Filtro IA para clientes sin Support Inside

```
Cliente escribe en chat
         ↓
IA intenta resolver (con contexto del cliente)
Visible: "Estás siendo atendido por IA"
         ↓
Resuelto?      → chat cerrado
No resuelto?   → escala a agente
Se alarga?     → agente escala a "caso" / conversación asíncrona
```

---

## Por qué se supersedió

En Sprint 7.B se rediseñó el sistema con dos motivos:

1. **Nomenclatura inconsistente.** "Conversaciones asíncronas", "Casos", "tickets" se usaban indistintamente. Se decidió un nombre canónico: **Ticket**.
2. **Modelo dual explícito.** Aunque chat y ticket comparten tabla `conversations`, su UX, propósito y cadencia son distintos. Tratarlos como "conversación con un campo `type`" sin diferenciar profundamente la UI generaba confusión.

ADR-037 formaliza la **arquitectura dual** con principios explícitos, escalación documentada (chat → ticket con `escalated_from_id`), categorías de ticket definidas (`support_general`, `support_billing`, `support_technical`, `escalated_chat`), y endpoints REST separados.

ADR-038 añade encima notas estructuradas del cliente categorizadas (Sprint 7.B).
ADR-039 añade nota obligatoria en transiciones de estado.

---

## Estado actual

- **Conceptos válidos heredados:**
  - Canales (chat, email, teléfono, WhatsApp con Support Inside).
  - WebSocket con Socket.io.
  - Chat anónimo en landing con vinculación posterior.
  - Filtro IA para clientes sin Support Inside (concepto, ADR-057).

- **Conceptos reemplazados / renombrados:**
  - "Conversación asíncrona" / "Caso" → **Ticket** (ADR-037).
  - Lógica unificada en `Conversation` con `type: chat|ticket` se mantiene, pero la UX diferenciada se formaliza.

- **Conceptos eliminados:**
  - Categorías WDIFY (`wdify_progress`, `wdify_feedback`) deprecadas (ADR-022, ADR-040).

---

## Cuándo revisar

Esta decisión está superseded. Las revisiones del modelo actual se hacen en ADR-037, ADR-038, ADR-039, ADR-040.

---

## Referencias

- **ADRs relacionados:** ADR-037 (supersede este), ADR-022 (WDIFY deprecado), ADR-038 (notas estructuradas), ADR-039 (nota obligatoria), ADR-040 (rediseño tickets), ADR-057 (filtro IA), ADR-034 (Support Inside con WhatsApp).
- **Glosario:** [Conversación](../00-foundations/glossary.md), [Chat](../00-foundations/glossary.md), [Ticket](../00-foundations/glossary.md).
- **Documento legacy:** DECISIONS.md §9.

---

## Notas de revisión

> **2026-04-26:** ADR creado durante migración F2 con Status `Superseded by ADR-037`. Se documenta el modelo original para que cualquiera que vea código antiguo o doc histórica con términos como "Casos" entienda que se llamó así antes pero el nombre canónico actual es "Ticket". La trazabilidad importa.
