# ADR-039 — Nota obligatoria en transiciones de estado de conversación

> **Status:** Active
> **Date:** 2026-04 (Sprint 7.B) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §42
> **Domain:** support

---

## Contexto

Antes del Sprint 7.B, resolver, cerrar o reabrir una conversación era una transición silenciosa. El historial mostraba "estado: resolved" sin contexto de **por qué** ni **cómo**. Resultado:

- Cliente recurrente con problema similar → el agente siguiente no sabía qué se intentó antes.
- Auditoría: imposible reconstruir si una resolución fue real o un cierre prematuro.
- Reapertura sin justificación: cliente volvía a abrir un caso resuelto y el agente no sabía si era continuación o caso nuevo.

Hace falta forzar **trazabilidad escrita** en cada transición significativa.

---

## Decisión

### Principio

> Toda transición de estado significativa **debe dejar un registro auditable escrito por el agente.**

### Transiciones que exigen `resolution_note`

| Transición | Quién la dispara | Exigencia |
|------------|------------------|-----------|
| `* → resolved` | Agente (resolver conversación) | **Nota obligatoria:** explica cómo se resolvió. |
| `* → closed` | Agente (cerrar conversación, sin posibilidad de reapertura) | **Nota obligatoria:** explica el motivo del cierre. |
| `* → open` (reabrir) | Agente (reabrir conversación cerrada o resuelta) | **Nota obligatoria:** explica el motivo de la reapertura. |

### Validación a nivel backend

- DTO de update con `@IsString() @MinLength(N) resolution_note` cuando el `status` cambia a uno de los anteriores.
- Si no se proporciona `resolution_note` o es vacío → backend devuelve **`400 Bad Request`** con mensaje claro:
  ```
  "Resolución de conversación requiere nota explicando cómo se resolvió"
  ```

### Efectos colaterales (cascada de side effects)

Al guardar una transición con `resolution_note`:

1. **Mensaje de sistema** se inserta en la conversación con tipo `'system'`:
   ```
   [Sistema · Agente: <nombre>]
   Conversación marcada como resuelta. Nota: <resolution_note>
   ```
   Visible en el thread de mensajes. Auditable junto con el resto del historial.

2. **`ClientNote`** auto-generada vinculada a la conversación (ADR-038):
   - Categoría: `solution` (para resolved/closed) o `general` (para reopened).
   - Body: el `resolution_note`.
   - `conversation_id` + `author_id` + `author_name` populados.

3. **Campos del cleanup** se actualizan:
   - `resolved_at` (timestamp).
   - `resolved_by_id` (agente que resolvió).
   - `resolved_by_name` resuelto en findOne (Sprint 7.H18).

### UI obligatoria

- Botón "Resolver" / "Cerrar" / "Reabrir" abre **modal obligatorio** que pide la nota.
- No se puede skipear. Modal sin botón "Cancelar sin nota" — solo "Cancelar (no transitar)" o "Confirmar (con nota)".

### Buscabilidad

Las notas de resolución son buscables (en filtros de la bandeja de tickets) por su body. Útil para encontrar "¿cómo resolvimos un caso similar antes?".

---

## Consecuencias

- ✅ **Ganamos:**
  - **Trazabilidad obligatoria** en transiciones significativas.
  - Histórico legible: cualquier agente puede leer "qué se hizo antes" en la conversación + en `ClientNote` solution.
  - Auditoría defendible: reapertura sin justificación es imposible.
  - Buscabilidad de soluciones aplicadas previamente.
- ⚠️ **Aceptamos:**
  - Fricción ligera para el agente: una pulsación más en cada transición. Aceptable porque la nota es valor real.
  - Si el agente escribe notas perezosas ("ok", "resuelto") la calidad se degrada. Mitigación: code review humano en sprint dedicado de calidad de notas; futuro: validación con IA que detecte notas vacías.
  - **Sprint 7.H17 / H18 / H23** documentan el flow completo (autoría, sistema messages, reopen). Implementado.
- 🚪 **Cierra:**
  - **No transición de estado silenciosa** en `resolved | closed | open` (post-resuelta). Siempre nota.
  - **No DTO sin `resolution_note`** para esos endpoints. Validación a nivel API.

---

## Cuándo revisar

- Si los agentes empiezan a escribir notas de baja calidad masivamente: añadir validación de longitud mínima más exigente o validación semántica con IA.
- Si surge transición nueva que merece este patrón (ej: `* → archived`): añadirla a la lista.
- Si el flujo lo encuentra molesto en uso real: evaluar si todas las transiciones lo necesitan o solo algunas (ej: `closed` siempre, `resolved` quizás opcional).

---

## Referencias

- **Módulos afectados:** support.
- **ADRs relacionados:** ADR-037 (arquitectura dual), ADR-038 (notas estructuradas — son el destino del side effect), ADR-040 (rediseño tickets — donde aplica también).
- **Glosario:** [Resolución](../00-foundations/glossary.md), [Estado de conversación](../00-foundations/glossary.md), [Nota interna](../00-foundations/glossary.md), [Nota del cliente](../00-foundations/glossary.md).
- **Implementación:** `SupportService.updateConversation()` valida `resolution_note`, crea `Message` system, sincroniza con `ClientNote`. UI: modales `ResolutionModal.tsx` y `DetailResolutionModal.tsx`.
- **Sprint:** Sprint 7.H17 (nota obligatoria), 7.H18 (autoría), 7.H23 (nota al reabrir).
