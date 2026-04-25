# ADR-036 — Configuración del chat (horarios, mensajes, comportamiento)

> **Status:** Active
> **Date:** 2026-04 (origen) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §22
> **Domain:** support, settings

---

## Contexto

El chat de soporte tiene comportamientos que deben adaptarse al negocio sin requerir redeploy:

- **Horario de atención:** los agentes no están 24/7. El chat debe comportarse distinto fuera de horario.
- **Tiempo máximo de respuesta:** SLA visible al cliente para gestionar expectativas.
- **Mensaje de bienvenida:** primer texto que ve el cliente al abrir el chat. Se ajusta por marketing.
- **Comportamiento de IA:** cuándo escala a humano, cuántas vueltas de IA antes de escalar automáticamente.

Sin configuración:

- El chat dice "cerrado" fuera de horario, ignorando que el cliente sabe leer "última vez online hace 30 min".
- Cambiar el SLA visible obliga a redeploy.
- El mensaje de bienvenida hardcoded no permite A/B testing ni adaptación temporal (campañas).

---

## Decisión

### Settings configurables en categoría `support`

| Key | Tipo | Default | Descripción |
|-----|------|---------|-------------|
| `chat.enabled` | boolean | true | Toggle global del chat (panic switch para mantenimiento) |
| `chat.welcome_message` | string | "Hola, ¿en qué te ayudamos?" | Texto que ve el cliente al abrir el chat |
| `chat.business_hours` | json | (ver abajo) | Horario configurable por días |
| `chat.response_time_target_minutes` | int | 30 | SLA visible al cliente: "Respondemos en menos de 30 min en horario laboral" |
| `chat.show_last_seen_outside_hours` | boolean | true | Si fuera de horario, muestra "Última vez en línea hace X" en lugar de "Cerrado" |
| `chat.ai_max_turns_before_human` | int | 3 | Cuántos intercambios IA-cliente antes de ofrecer escalado a humano automáticamente (sin que el cliente lo pida) |

#### `chat.business_hours` — formato JSON

```json
{
  "timezone": "Europe/Madrid",
  "schedule": {
    "mon": [{ "from": "09:00", "to": "18:00" }],
    "tue": [{ "from": "09:00", "to": "18:00" }],
    "wed": [{ "from": "09:00", "to": "18:00" }],
    "thu": [{ "from": "09:00", "to": "18:00" }],
    "fri": [{ "from": "09:00", "to": "15:00" }],
    "sat": [],
    "sun": []
  }
}
```

- **Formato libre** que soporta múltiples franjas por día (ej: 9-13 y 15-19).
- Día sin entradas → cerrado.
- Editable desde dashboard cuando exista UI de settings.

### Comportamiento del chat según horario

#### En horario laboral
- Chat activo. Cliente envía mensaje → llega al agente o filtro IA.
- SLA visible: "Respondemos en menos de 30 min."

#### Fuera de horario (si `show_last_seen_outside_hours = true`)
- Chat sigue **disponible para escribir** (no cerrado).
- Indicador: "Última vez en línea hace X horas" (calculado del último mensaje de un agente).
- Mensaje del cliente queda en cola → se atiende en próximo horario laboral.
- Si tiene Support Inside → se respeta el SLA del plan (ADR-034).

#### Fuera de horario (si `show_last_seen_outside_hours = false`)
- Chat **cerrado**. Mensaje: "Estamos fuera de horario. Volvemos a las HH:MM."
- Cliente puede dejar mensaje (se trata como ticket asíncrono).

### Escalación IA → humano

- **Cliente puede pedir agente humano en cualquier momento.** Sin límite de intentos previos.
- **Si la IA no resuelve tras `ai_max_turns_before_human` turnos** → ofrece automáticamente "¿Quieres que te conecte con un agente humano?"

### Comportamiento del bot fuera de horario

- Filtro IA puede seguir activo fuera de horario (es bot, no se cansa).
- Si el cliente solicita humano → se le informa: "Te conectaré con un agente cuando vuelvan a las HH:MM. Mientras puedes contarme tu situación y la dejaré preparada."

---

## Consecuencias

- ✅ **Ganamos:**
  - Configuración sin redeploy. Cambiar horario, SLA visible, mensaje de bienvenida es operación de admin.
  - "Última vez en línea" comunica honestidad — el cliente entiende que somos humanos con horario.
  - Panic switch (`chat.enabled = false`) para mantenimiento sin tocar código.
- ⚠️ **Aceptamos:**
  - Configuración requiere UI de settings construida (Sprint pendiente).
  - El formato de `business_hours` JSON es libre — validación en backend al guardar.
  - **Estado actual:** los settings están definidos en este ADR pero **no implementados** todavía. La UI de chat hoy usa defaults razonables hardcoded. Pendiente sprint dedicado.
- 🚪 **Cierra:**
  - **Sin "chat cerrado" abrupto.** Por defecto, el chat acepta mensajes 24/7 (cola asíncrona fuera de horario). Cambiar este default requiere ADR.

---

## Cuándo revisar

- Cuando se construya la UI de settings: validar que estos settings sean configurables en una sola página de "Configuración del soporte".
- Si surge demanda de horarios diferentes por agente / equipo: ampliar schema (no solo global).
- Si el SLA visible se incumple sistemáticamente → bajarlo o reorganizar el equipo.

---

## Referencias

- **Módulos afectados:** support, settings (consume keys `support.chat.*`).
- **ADRs relacionados:** ADR-034 (Support Inside con SLAs por plan), ADR-037 (arquitectura dual), ADR-057 (filtro IA).
- **Glosario:** [Chat](../00-foundations/glossary.md), [Conversación](../00-foundations/glossary.md).
- **Implementación pendiente:** lectura de settings en `SupportChatService` y `ChatWidget`. Hoy se usan defaults hardcoded.
