# ADR-057 — Agentes IA: filtro de chat y copilot del agente

> **Status:** Active (planificada — Sprint 15)
> **Date:** 2026-04 · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §29
> **Domain:** support, cross-cutting

---

## Contexto

Aelium quiere usar IA para **dos casos de uso operativos** distintos:

1. **Filtro de chat para clientes sin Support Inside.** El cliente abre un chat con una pregunta común (¿cómo reseteo mi contraseña? ¿dónde veo mi factura?) — la IA responde directamente sin escalar a un agente humano. Si la IA no puede, escala.
2. **Copilot para agentes humanos durante el trabajo.** El agente ve sugerencias de respuesta en su voz natural mientras chatea con clientes, y puede preguntar al copilot "¿dónde voy para hacer X?" o "¿qué pasos sigue Y?".

Ambos comparten infraestructura (LLM provider, base de conocimiento) pero **tienen reglas, contextos y límites distintos**. Sin diseño explícito:

- **El filtro responde algo incorrecto** y rompe la confianza del cliente (sin saber que era IA).
- **El copilot responde sin contexto** y le hace perder tiempo al agente.
- **La IA toma acciones** que el agente o el cliente no autorizaron.
- **El modelo se elige al azar** y el coste se dispara o la calidad cae.

Hace falta separar conceptualmente ambos agentes, definir qué contexto reciben, qué nivel de autonomía tienen, y cómo se configura el modelo.

---

## Decisión

### Agente IA #1 — Filtro de chat (clientes SIN Support Inside)

**Cuándo se activa:**
- **Solo cuando el cliente NO tiene Support Inside** (los clientes con plan pagan por agente humano).
- Cuando el cliente abre un chat desde su dashboard o desde la landing.

**Comportamiento:**
- Intenta resolver el problema **antes de escalar a agente humano**.
- **Escala inmediatamente cuando el cliente lo solicita** ("quiero hablar con una persona") — sin límite de intentos.
- **Escala cuando no puede resolver** (heurística: 3 intentos sin satisfacción del cliente, o pregunta fuera de su scope).

**Contexto que recibe:**
- Datos del cliente (perfil, NIF, plan).
- Servicios contratados (lista + estado).
- Historial de la conversación actual.
- **Base de conocimiento interna** (artículos técnicos, FAQs, políticas).
- **No tiene acceso a APIs externas en tiempo real** (no consulta Stripe, no consulta Hetzner — solo lo que ya está en el sistema).

**Nivel de autonomía (Nivel 1 inicial):**
- **Solo genera texto sugerido** que se envía al cliente como mensaje de chat.
- **Sin acciones en el sistema** — no crea tareas, no cambia configuración, no factura nada.
- Los niveles 2 y 3 (navegar dashboard, ejecutar acciones) son futuro — mismo plugin, se amplía cuando aplique.

### Agente IA #2 — Copilot del agente humano

**Cuándo se activa:**
- **Disponible siempre para el agente** — independientemente del plan del cliente que está atendiendo.
- Visible como panel lateral en chats y tickets.

**Dos contextos de uso:**

1. **Durante el chat con el cliente:**
   - Sugiere respuestas en la **voz de Aelium** (tono, terminología canónica, evita errores comunes).
   - El agente puede: **Usar · Editar · Ignorar**. Nunca responde sin aprobación del agente.
2. **Asistencia general al agente:**
   - Responde preguntas del agente sobre el sistema: "¿dónde veo las facturas vencidas?", "¿cómo provisiono manualmente este servicio?".
   - Le indica dónde ir, qué pasos seguir, qué consultar.
   - **Como una persona al lado** que conoce el sistema y el contexto del cliente actual.

**Contexto que recibe:**
- **Ficha completa del cliente** (todo lo que ve el agente).
- Historial de soporte completo.
- Base de conocimiento.
- **Notas internas** sobre el cliente (a diferencia del filtro, que no las ve).
- Slots activos del cliente.

**Nivel de autonomía (Nivel 1 inicial):**
- **Solo genera texto y orientación.**
- **Sin acciones en el sistema.**
- Niveles 2 y 3 (ejecutar acciones via permisos del agente) — futuro.

### Configuración de modelos

- El modelo se configura **globalmente en Settings → Plugins → AI Providers**.
- **No se puede cambiar por conversación individual** — coherencia operativa.
- Se puede configurar un modelo distinto **para cada rol**:
  - **Filtro de chat del cliente:** modelo más rápido y económico (ej: Sonnet recomendado).
  - **Copilot del agente:** modelo más preciso y contextual (ej: Opus recomendado).
- **Cambiar de proveedor de IA = activar otro plugin.** Sin tocar código (R4 + ADR-009).

### Base de conocimiento interna

- **Solo el superadmin puede editar.**
- Contiene: artículos técnicos · políticas de empresa · FAQs · notas de producto.
- **Acceso de lectura:**
  - Agente IA filtro (para responder al cliente).
  - Agente IA copilot (para asistir al agente).
  - Agentes humanos (consulta directa).
- Estructura: artículos con frontmatter (categoría, tags), buscables por similitud semántica.

### Plugin pattern (R4)

Ambos agentes IA viven como **plugin independiente** en `backend/src/plugins/ai/`. Patrón análogo a payment providers (ADR-031) y provisioners (ADR-021):

```typescript
interface AIProviderInterface {
  readonly name: string;       // 'anthropic-claude', 'openai-gpt', ...
  readonly label: string;
  generateChatResponse(context: ChatContext): Promise<AIResponse>;
  generateAgentSuggestion(context: AgentContext): Promise<AIResponse>;
  isHealthy(): Promise<boolean>;
}
```

Cambiar de Anthropic a OpenAI = activar otro plugin sin tocar el módulo support.

### Costos y rate limiting

- **Por sesión / cliente:** límite configurable de tokens consumidos (`ai.client_token_budget_daily`) para evitar coste descontrolado.
- **Por copilot:** sin límite por agente (la productividad lo justifica), monitoring para detectar uso anómalo.
- Circuit breaker (ADR-055) aplicado a la API del LLM provider — si la API cae, las sugerencias se desactivan sin romper el chat.

### Auditoría

Toda interacción con IA se registra:
- **Filtro de chat:** los mensajes generados quedan en `messages` como cualquier mensaje, con `sender_type='ai'` (distinto de `client` o `agent`). El cliente ve un badge "Asistente AI" — **transparencia obligatoria** (no engañar al cliente).
- **Copilot:** las sugerencias se loggean (no en `messages`, en `ai_copilot_suggestions`) — qué se sugirió, qué hizo el agente (use / edit / ignore). Útil para evaluar calidad del modelo.

---

## Consecuencias

- ✅ **Ganamos:**
  - **Filtro reduce carga del agente** humano para preguntas comunes — capacidad operativa multiplicada.
  - **Copilot acelera al agente** — menos tiempo redactando respuestas, más tiempo resolviendo.
  - **Plugin pattern** permite cambiar provider sin tocar negocio.
  - **Modelos distintos por rol** optimizan coste/calidad.
  - **Niveles de autonomía** crecen sin reescribir — empieza conservador (solo texto), evoluciona.
- ⚠️ **Aceptamos:**
  - **El filtro puede equivocarse** y dar respuesta incorrecta. Mitigación: badge "Asistente AI" visible, escalación inmediata si cliente lo pide, base de conocimiento curada por el superadmin.
  - **Coste de tokens variable** — un cliente charlatán dispara la factura del LLM. Mitigación: budget diario configurable.
  - **Privacidad:** la ficha del cliente y notas internas se envían al LLM provider externo. Mitigación: datos pseudonimizados cuando sea posible; documentar en RGPD (ADR-010) qué datos se procesan con IA.
  - **Dependencia del LLM provider** — si Anthropic/OpenAI cae, IA no responde. Mitigación: circuit breaker + degradación elegante (chat sigue funcionando con agente humano si el filtro IA cae).
  - **Voz de Aelium aprendida** del prompt — necesita curado constante para no derivar.
- 🚪 **Cierra:**
  - **No IA respondiendo sin transparencia** — el cliente siempre sabe cuándo habla con IA vs humano.
  - **No copilot tomando acción autónoma** sin aprobación del agente (Nivel 1).
  - **No modelo configurable por conversación** — siempre global.

---

## Cuándo revisar

- Tras Sprint 15 (implementación inicial) → medir tasa de escalación del filtro (objetivo: <30% de chats escalan a humano).
- Si el coste del LLM se vuelve significativo → reevaluar modelos / cuantización / proveedor.
- Si surgen quejas de clientes engañados por IA (creyeron que era humano) → reforzar UX de transparencia.
- Si el copilot se usa poco (los agentes lo ignoran) → revisar calidad de sugerencias o relevancia del contexto.
- Cuando los modelos avancen (Claude 5, GPT-5) → reevaluar viabilidad de Nivel 2 (acciones autónomas con guardrails).

---

## Referencias

- **Módulos afectados:** support (chat con filtro IA), agentes (copilot integrado en su UI), settings (configuración global), audit (registros de uso).
- **Reglas relacionadas:** R4 (plugins — IA como plugin), R10 (rate limiting — token budget), R12 (encriptación — credenciales del provider IA), R3 (audit log).
- **ADRs relacionados:** ADR-009 (estrategia plugins), ADR-021 (provisioners — patrón análogo), ADR-031 (payment providers — patrón análogo), ADR-034 (Support Inside — clientes con plan no pasan por filtro), ADR-037 (chat vs ticket — filtro IA solo en chat, no en ticket), ADR-044 (settings — config del provider), ADR-055 (resiliencia — circuit breaker en API LLM), ADR-010 (RGPD — datos enviados al LLM).
- **Glosario:** [Filtro IA](../00-foundations/glossary.md), [Copilot](../00-foundations/glossary.md), [Base de conocimiento](../00-foundations/glossary.md), [Nivel de autonomía](../00-foundations/glossary.md).
- **Sprint:** 15 (implementación inicial — filtro + copilot Nivel 1).
- **Plugin path:** `backend/src/plugins/ai/anthropic/` (cuando se implemente).
