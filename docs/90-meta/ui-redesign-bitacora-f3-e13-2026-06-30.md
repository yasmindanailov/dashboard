# Bitácora del rediseño UI — F3·E13 (sugerencia IA en soporte) · sesión 2026-06-30

> Registro riguroso de la **vertical F3·E13**: copiloto de IA (Claude/Anthropic)
> que sugiere un **borrador de respuesta** al agente en el composer de soporte.
> Es la vertical F3 "genuinamente nueva" (L-XL). **Rama:** `redesign/f3-ia`
> (desde `origin/master`, independiente). **Estado: A + B + C ✅ (backend);
> D-G pendientes** (otro chat).

## 0. Resumen ejecutivo

E13 materializa el "IA copilot para agentes" (antes Sprint 7.9). El agente pide
a Claude un borrador para el chat/ticket; **nunca se auto-envía** — el agente lo
revisa e inserta. Por su tamaño se ejecuta por fases con checkpoints verdes y
commits independientes. Hechas: **A** (doctrina), **B** (framework IA), **C**
(plugin Anthropic + mock). Pendientes: **D** endpoint, **E** UI admin, **F**
frontend, **G** docs/DoD.

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

## 5. Pendiente (D-G) — para el próximo chat

| Fase | Contenido |
|---|---|
| **D** | Endpoint `POST /support/conversations/:id/ai-suggestion` + **ensamblado de contexto v1** (§4) + CASL `Update.Conversation` + rate-limit R10 + mapear `AiUnavailableError`/`CircuitOpenError` → 503/409 (R7/R14) |
| **E** | UI admin: surface del plugin IA en `/admin/settings/plugins` (extender `AdminPluginsService` para listar/instalar/test-connection del registry IA; el admin activa + pega la `api_key`) |
| **F** | Frontend: panel "Sugerencia" en el composer (gated por `isEnabled`; reusa el patrón de inserción no-destructivo de E12) |
| **G** | Tests (endpoint/plugin real mockeado) + docs (`features/support`, `_events` si aplica, roadmap) + DoD final + boot smoke + retrospectiva |

**Estado git:** rama `redesign/f3-ia` = doctrina `1077461` + B+C `6f1b30d` (+
esta bitácora). Sin push hasta el cierre de esta sesión. **Falta (Yasmin):**
continuar D-G en otro chat; smoke + merge.
