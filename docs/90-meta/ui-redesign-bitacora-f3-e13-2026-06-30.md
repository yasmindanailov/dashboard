# Bitácora del rediseño UI — F3·E13 (sugerencia IA en soporte) · sesión 2026-06-30

> Registro riguroso de la **vertical F3·E13**: copiloto de IA (Claude/Anthropic)
> que sugiere un **borrador de respuesta** al agente en el composer de soporte.
> Es la vertical F3 "genuinamente nueva" (L-XL). **Rama:** `redesign/f3-ia`
> (desde `origin/master`, independiente). **Estado: A + B + C + D ✅ (backend);
> E-G pendientes** (otro chat).

## 0. Resumen ejecutivo

E13 materializa el "IA copilot para agentes" (antes Sprint 7.9). El agente pide
a Claude un borrador para el chat/ticket; **nunca se auto-envía** — el agente lo
revisa e inserta. Por su tamaño se ejecuta por fases con checkpoints verdes y
commits independientes. Hechas: **A** (doctrina), **B** (framework IA), **C**
(plugin Anthropic + mock), **D** (endpoint + grounding v1). Pendientes: **E** UI
admin, **F** frontend, **G** docs/DoD.

## 1. Decisiones (Yasmin, 2026-06-30)

1. **Alcance** = sugerencia IA en el composer de soporte (el buscador IA de
   dominios va aparte/v1.1).
2. **Arquitectura** = **subsistema IA paralelo** (vs. generalizar el framework
   de provisioners). El framework ADR-080 está acoplado a `ProvisionerPlugin`;
   la IA **no** es un provisioner. El subsistema IA reusa la infraestructura
   ADR-080 (`plugin_installs` + `SecretVaultService` + shape `PluginManifest`
   con `settingsCategory:'ai'` + UI `/admin/settings/plugins`), con **contrato,
   DI token y registry propios** — **sin tocar** el registry de provisioners
   (cero riesgo a hosting/dominios). → **ADR-080 Amendment D**.
3. **Modelo** = `claude-opus-4-8` por defecto (config con enum
   opus-4-8/sonnet-4-6/haiku-4-5; mandato del skill `claude-api`: no degradar
   por coste — es decisión del operador).
4. **Mock-first** = stub determinista sin `api_key` (dev/tests sin red ni coste);
   llamada real a Claude cuando hay key configurada.
5. **Grounding v1 (Fase D, decidido 2026-06-30):** ver §4.

## 2. Fase A — Doctrina (commit `1077461`)

- **ADR-080 Amendment D**: tipo de plugin `ai` como subsistema paralelo;
  contrato `AiProviderPlugin v1` (`generateReplySuggestion` + `testConnection`);
  AI-INV-1 (la IA nunca pasa por el orquestador de provisioning),
  AI-INV-2 (un proveedor IA activo a la vez); seed `plugin_installs` anthropic
  `enabled=false`.
- **support/contract.md §Sugerencia IA**: endpoint
  `POST /support/conversations/:id/ai-suggestion` (staff-only,
  `Update.Conversation` + rate-limit R10, contexto server-side R5, nunca
  auto-envía).

## 3. Fases B + C — Backend (commit `6f1b30d`, verde)

**Framework (`core/ai/`):**
- `types.ts` — contrato `AiProviderPlugin v1` + token `AI_PROVIDER_PLUGINS` +
  shapes `AiSuggestionInput`/`AiSuggestionResult`/`AiProviderRuntimeContext`.
- `AiProviderRegistry` — espejo mínimo de `PluginRegistryService`: valida
  (contrato v1 + slug + `manifest.slug` + `settingsCategory==='ai'`) + activa
  desde `plugin_installs.enabled` + reload en `plugin.config_changed` + AI-INV-2.
- `AiSuggestionService` — resuelve el proveedor activo, descifra secrets
  (`SecretVaultService`, R12) y envuelve la llamada en circuit breaker R11
  (`HouseCircuitBreaker` reutilizado). `AiUnavailableError`.

**Plugin Anthropic (`plugins/ai/anthropic/`):**
- `@anthropic-ai/sdk@0.107.0`. `messages.create` (sin `temperature`/`top_p` —
  400 en 4.8; sin thinking → rápido). Narrowing `block.type==='text'`.
- **Mock-first**: sin `api_key` → stub determinista (referencia el último
  mensaje del cliente). Voz de marca D11 en el system prompt.
- `manifest` (`settingsCategory:'ai'`, configSchema model/max_tokens, secretsSchema
  api_key) + `AnthropicAiModule` (provee+exporta).

**Composición (`modules/ai/`):** factory `AI_PROVIDER_PLUGINS` (R4 — `core/ai`
nunca importa el plugin concreto; mismo patrón que `ProvisioningModule`) +
registro en `AppModule`. Seed `anthropic` enabled=false (ADR-080 D.3).

**Verificación:** typecheck + lint:check + **5 unit** (`ai-suggestion.service.spec`:
registry valida/activa + stub mock-first + guardas) + suite completa **1395** +
**boot smoke**: `AnthropicAiModule`/`AiModule` init, `Validated 1/1 AI provider(s):
[anthropic]`, `Active AI provider(s): []` (correcto: inactivo hasta habilitar),
provisioners **4/4** intactos, `successfully started`. Sin `UnknownDependenciesException`.

## 4. Grounding v1 — qué contexto ensambla la Fase D (decidido 2026-06-30)

> **El rigor de un LLM = grounding** (darle los hechos para que afirme, no
> adivine). El prompt fija el tono; los datos fijan la exactitud. Hoy
> `AiSuggestionInput` solo lleva `messages`+`locale`+`instructions`.

**Decisión Yasmin: v1 = transcript + servicios + facturación + datos básicos del
cliente**, ensamblado **server-side (R5)** desde el `user_id` de la conversación
(reusa lo que el panel del agente ya reúne, `getConversationClientContextAction`
→ cliente + servicios + notas). Cubre ~80% de tickets con grounding real
reusando código existente.

- **Servicios** (`services` + `ServiceInfo` ADR-070): plan, estado, dominio,
  expiración, NS — para soporte técnico.
- **Facturación** (`invoices`): pendientes, próxima renovación, importe.
- **Cliente**: nombre, idioma, antigüedad, tier Support Inside/SLA (E8/E9).
- ⚠️ **Notas internas** (`client_notes`): como *contexto* de la IA, **nunca**
  volcadas al borrador del cliente (coherente con SUPP-INV-3).

**Materialización (Fase D):** extender `AiSuggestionInput` con un bloque
`context` (servicios/facturación/cliente, datos minimizados) que el endpoint
puebla desde el `user_id`; el plugin lo inyecta en el user-prompt.

**Diferido a v1.1+ (anotado para rigor, no se hace en v1):**
- **RAG sobre Knowledge Base** (hoy diferida, Sprint 12) + **macros E12** como
  grounding — la mayor palanca de rigor; con **`citations`** de la API → la IA
  cita la fuente. **Structured outputs** (`{sugerencia, confianza, falta_info}`).
  **Tool use** (lookups vivos). **Prompt caching** del contexto estable.
- **RGPD/PII a un tercero**: todo lo enviado sale a Anthropic → **minimización
  de datos** + kill-switch/consentimiento (setting). Es rigor *y* cumplimiento.

## 5. Fase D — Endpoint + grounding v1 (✅ backend, verde)

Materializa [ADR-080 D.5](../10-decisions/adr-080-plugin-framework.md#d5-endpoint-de-consumo-módulo-support)
y el grounding §4. **Sin push hasta cierre de sesión.**

**Contrato IA (additivo):**
- `core/ai/types.ts` — `AiSuggestionInput` gana `context?: AiClientContext`
  (bloque fáctico minimizado: `client` / `services` / `billing`). Opcional →
  chat guest (sin `user_id`) llega sin contexto. No bumpea el contrato v1.

**Plugin Anthropic:**
- `renderContext()` antepone el bloque "DATOS DE CONTEXTO" al transcript en el
  user-prompt; el system-prompt ahora manda apoyarse en esos datos (y no
  inventar fuera de conversación + contexto). Stub mock-first inalterado en
  comportamiento (no necesita contexto).

**Módulo support (R5 server-side):**
- `SupportAiSuggestionService` (sub-service R15) — arma:
  1. **transcript** = mensajes `client`/`agent` **no internos** (SUPP-INV-3,
     filtrado en la propia query) → roles `customer`/`agent`, cap 40 msgs.
  2. **locale** = `users.language`.
  3. **grounding v1** = lecturas Prisma directas y **minimizadas** (R1, mismo
     patrón de lectura legítima que el resto de support; RGPD — sin email/NIF):
     servicios persistidos (estado/dominio/expiración, sin `cancelled`/
     `terminated`), facturas pendientes (`pending`+`overdue` → count/importe),
     próxima renovación (`min next_due_date` futura), datos básicos del cliente
     (nombre/idioma/año de alta/tier SI+SLA).
  - Mapea `AiUnavailableError`→`503 AI_UNAVAILABLE` y `CircuitOpenError`→
    `503 AI_CIRCUIT_OPEN` (R7/R14). _(503 para ambos: HTTP-correcto para
    "no disponible/transitorio"; el "/409" del apunte original no encaja con
    semántica de breaker.)_
- `SupportService.generateAiSuggestion()` (fachada) → delega.
- Endpoint **`POST /support/conversations/:id/ai-suggestion`** (controller):
  `Update.Conversation` + **staff-only reforzado** (`ADMIN_ROLES`, igual que
  `updateConversation`: el cliente también tiene `Update.Conversation` sobre lo
  propio) + `@Throttle({ ttl:60s, limit:10 })` por IP + `@HttpCode(200)` +
  `AiSuggestionRequestDto { instructions? }`. Respuesta `{ suggestion, model, truncated? }`.
- `SupportModule` importa `AiModule` (exporta `AiSuggestionService`) + provee el
  sub-service. **Sin ciclo** (`AiModule` no depende de support).

**Decisiones de la Fase D (interpretación fiel a la doc):**
- Grounding = **resumen persistido** (lo que el panel del agente ya reúne vía
  `getConversationClientContextAction` → `GET /services` summary, sin
  `getServiceInfo` live). NS/métricas live → v1.1.
- Rate-limit por **IP** (única opción limpia con el `ThrottlerGuard` global;
  per-agente exige tracker per-user en el guard global → v1.1).

**Verificación (DoD):** typecheck + lint:check verdes · **+7 unit**
(`support-ai-suggestion.service.spec`: transcript sin notas internas / roles /
grounding minimizado + whitelist anti-PII / fallback `product.name` + suscripción
no-activa / multi-moneda omite importe / 503 AI_UNAVAILABLE / 503 AI_CIRCUIT_OPEN)
→ suite **1402** verde · **boot smoke**: `Nest application successfully started`,
ruta `POST /support/conversations/:id/ai-suggestion` mapeada, `Validated 1/1 AI
provider(s): [anthropic]`, provisioners **4/4** intactos, sin
`UnknownDependenciesException`.

**Revisión adversarial (9 agentes, 3 dimensiones):** 6 hallazgos → 3 confirmados,
todos LOW, los 3 corregidos: (1) suma de importe pendiente **multi-moneda** ahora
solo se afirma si todas comparten moneda (si no, solo `pendingCount`) — protege el
rigor del grounding; (2)+(3) tests reforzados (whitelist anti-PII agnóstica a la
forma + casos fallback/no-activa/multi-moneda). Sin hallazgos de correctitud
graves, RGPD, IDOR ni DI.

**Docs:** `support/contract.md` §4 (+lectura `invoices`) + §5 (estado
implementado + errores) · `api-errors.md` §503 (`AI_UNAVAILABLE`/`AI_CIRCUIT_OPEN`).

## 6. Pendiente (E-G) — para el próximo chat

| Fase | Contenido |
|---|---|
| **E** | UI admin: surface del plugin IA en `/admin/settings/plugins` (extender `AdminPluginsService` para listar/instalar/test-connection del registry IA; el admin activa + pega la `api_key`) |
| **F** | Frontend: panel "Sugerencia" en el composer (gated por `isEnabled`; reusa el patrón de inserción no-destructivo de E12) |
| **G** | Tests E2E (endpoint con plugin real mockeado) + docs (`features/support` sección "Sugerencia IA", `_events` si aplica, roadmap) + DoD final + retrospectiva |

**Estado git:** rama `redesign/f3-ia` = doctrina `1077461` + B+C `6f1b30d` +
bitácora `954d892` + **Fase D (esta sesión, sin commitear aún)**. **Falta
(Yasmin):** revisar/commitear D; continuar E-G en otro chat; smoke + merge.
