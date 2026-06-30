# Bitácora del rediseño UI — F3·E13 (sugerencia IA en soporte) · sesión 2026-06-30

> Registro riguroso de la **vertical F3·E13**: copiloto de IA (Claude/Anthropic)
> que sugiere un **borrador de respuesta** al agente en el composer de soporte.
> Es la vertical F3 "genuinamente nueva" (L-XL). **Rama:** `redesign/f3-ia`
> (desde `origin/master`, independiente). **Estado: A + B + C + D + E + F + G ✅
> — vertical CÓDIGO-COMPLETA** (pendiente solo del smoke visual + merge de Yasmin).

## 0. Resumen ejecutivo

E13 materializa el "IA copilot para agentes" (antes Sprint 7.9). El agente pide
a Claude un borrador para el chat/ticket; **nunca se auto-envía** — el agente lo
revisa e inserta. Por su tamaño se ejecuta por fases con checkpoints verdes y
commits independientes. Hechas: **A** (doctrina), **B** (framework IA), **C**
(plugin Anthropic + mock), **D** (endpoint + grounding v1), **E** (UI admin del
plugin IA en `/admin/settings/plugins`), **F** (botón "Sugerencia IA" en el
composer de chat + ticket), **G** (voz del borrador + E2E + docs/DoD +
retrospectiva). **Vertical CÓDIGO-COMPLETA.**

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

## 6. Fase E — UI admin del plugin IA (✅ back + front, verde)

El admin activa el proveedor IA, pega la `api_key` y prueba la conexión desde
**`/admin/settings/plugins`** — el mismo panel que los provisioners, reutilizando
toda la infra ADR-080 (Amendment D: `plugin_installs` + SecretVault + `PluginManifest`).

**Backend — `AdminPluginsService` gana un resolver unificado provisioner+IA:**
- `resolvePlugin(slug)` → unión etiquetada `{kind:'provisioner'|'ai', slug, manifest, …}`
  (provisioner primero, luego `AiProviderRegistry`). `requirePlugin` lanza 404.
- **Métodos type-agnósticos** (operan sobre `{slug, manifest}`): `list()` (añade los
  slugs IA tras los provisioners), `findOne()`, `update()` (Ajv + cifrado + audit R3 +
  emit `plugin.config_changed`), `onModuleInit` (precompila también los manifests IA).
  El **emit recarga ambos registries** (`PluginRegistryService` ignora el slug IA;
  `AiProviderRegistry` lo activa) → encender `anthropic` no toca los 4/4 provisioners.
- **Ramas por `kind`:** `update()` resetea breakers de provisioning **solo** para
  provisioners; `testConnection()` para IA arma el `AiProviderRuntimeContext`
  (config + secrets descifrados, R12) y llama `ai.testConnection(ctx)` → `{ok,detail}`
  mapeado a `{success,message}`. `getOperationalOverview`/`reconcileAll` quedan
  provisioner-only (la UI los omite para IA; 404 defensivo si se invocan).
- `AdminPluginsModule` importa `AiModule`. `JsonSchema7Property` gana `title?` (i18n,
  additivo) para etiquetas del form. Manifest Anthropic gana `title` en config + secret.

**Frontend — el panel manifest-driven ya renderiza el plugin IA sin tocar el form:**
- `PluginConfigForm` (rjsf desde el manifest) muestra config (modelo/max_tokens) +
  credenciales (`api_key`) + toggle + "Probar conexión" **out-of-the-box**.
- Gateado lo provisioner-céntrico para IA: `AdminPluginDetailLayout` omite el
  `<PluginOperationalOverview>` (servicios/reconciliación/drifts) y la página omite el
  `reconcileSlot` cuando `settingsCategory==='ai'`. Copy del toggle adaptado a IA.
  i18n `plugin.anthropic.*` (label/description/config/secret). Header de la lista
  generalizado ("Plugins", provisioning + IA).

**Verificación (DoD):** typecheck + lint:check (back+front) verdes · **+6 unit**
(`admin-plugins.service.spec`: list incluye IA / findOne / update enable+cifra api_key
sin reset de breakers / rechazo Ajv / testConnection arma ctx / sin api_key) → suite
back **1520** + front **94** verdes · **boot smoke**: `AdminPluginsController` mapeado,
`Validated 1/1 AI provider(s): [anthropic]`, provisioners **4/4** intactos,
`successfully started`, sin `UnknownDependenciesException`; probe `GET /admin/plugins`
→ **401** (ruta viva + guard activo).

**Revisión adversarial (3 dimensiones, foco regresión provisioner):** 1 hallazgo
confirmado (**medium**, lo destaparon 2 dimensiones independientes), corregido:
al habilitar el plugin IA, `PluginRegistryService.reloadActivation()` logueaba un
**ERROR espurio** ("enabled in DB but not registered via DI … services will hang in
'pending'") porque consultaba `plugin_installs WHERE enabled` sin filtrar y veía
`anthropic` (que es IA). **Fix:** degradado a **WARN** informativo, sin afirmar
"pending" y reconociendo que el slug puede ser de otro subsistema — **sin acoplar el
registry de provisioners a los slugs de IA** (respeta AI-INV-1: la IA nunca pasa por
ese registry). +test guard (`plugin-registry.spec`: slug foráneo habilitado → WARN, no
ERROR). Suite back **1520** verde. _(Las gates lo perdieron porque el seed deja
`anthropic` enabled=false; solo aparece al habilitarlo — el flujo central de E.)_

**Smoke en vivo (end-to-end, esta sesión):** login superadmin (2FA vía Mailpit) →
`GET /admin/plugins` muestra `anthropic cat=ai enabled=false` → `PATCH enabled=true` →
`test-connection` (sin api_key) → "Falta la API key de Anthropic" → cliente crea chat →
`POST /support/conversations/:id/ai-suggestion` (staff) → borrador **stub** correcto
referenciando el último mensaje del cliente. Fase D + E verificadas funcionando.

## 7. Fase F — Botón "Sugerencia IA" en el composer (✅ back + front, verde)

El agente pide un borrador desde el composer (chat **y** ticket); se inserta de
forma **no-destructiva** (mismo patrón que las macros E12) para que lo revise y
edite — **nunca se auto-envía**. Gateado por `isEnabled` (sin proveedor IA
activo, el botón no aparece).

**Backend (mínimo):** `SupportAiSuggestionService.isEnabled()` → `AiSuggestionService`
· facade `aiSuggestionEnabled()` · **`GET /support/ai-suggestion/enabled`** (staff-only:
`Read.Conversation` + `ADMIN_ROLES`) → `{ enabled }`.

**Frontend:**
- `_shared/support/_actions.ts`: `generateAiSuggestionAction(id, instructions?)`
  (POST el endpoint Fase D) + `getAiSuggestionEnabledAction()` (fail-safe a `false`).
- **`AiSuggestionButton`** (`_shared/support/`): botón DS "Sugerencia IA" → genera →
  `onInsert(borrador)` + toast; loading "Generando…"; errores (503) como toast.
- **Composer de chat** (`ChatConversation` + `useChatPanel` + page): botón junto a
  las macros, `onInsert=handleInsertReply`, gated `aiEnabled`.
- **Composer de ticket** (`ConversationMessages` + `useConversationDetail` + admin
  page): `composerTools` nuevo con el botón. El hook resuelve `aiEnabled` **solo si
  staff** (`isAdmin`) → el portal cliente (que comparte hook/componente) nunca lo ve;
  el endpoint además es staff-only (doble defensa).

**Verificación (DoD):** typecheck + lint:check (back+front) verdes · **+3 unit**
(`support-ai-suggestion.spec`: isEnabled delega · `AiSuggestionButton.test`: genera+inserta
/ error no inserta) → suite back **1521** + front **96** verdes · **boot smoke**: ruta
`GET /support/ai-suggestion/enabled` mapeada · `Active AI provider(s): [anthropic]` ·
provisioners **4/4** · `successfully started`; probe sin auth → **401** (ruta viva + guard).

**Revisión adversarial (3 dimensiones: gating staff / correctitud-UX / consistencia):**
1 hallazgo confirmado (**medium**, high-confidence), corregido: **race de closure** —
`handleInsertReply` leía el borrador de un *snapshot* del closure; como la generación IA
es asíncrona (segundos, a diferencia de las macros síncronas E12), si el agente tecleaba
durante la espera, al insertar se **perdía lo escrito**. **Fix:** *functional updater*
(`onMessageChange(prev => …)`) en ambos composers → lee el borrador más reciente
(prop ampliado a `Dispatch<SetStateAction<string>>`; los callers ya pasan el setter de
`useState`). Verde tras el fix (typecheck+lint+**96**). **Sin** hallazgos de gating
(el cliente nunca ve el botón) ni de auto-envío (solo inserta en el borrador).

## 8. Fase G — voz del borrador + E2E + cierre (✅)

### 8.1 Voz del borrador — "más humana, menos robótica, rigurosa" (commit `66fa694`)

Petición Yasmin (2026-06-30): la respuesta IA debía ser **más humana, menos
robótica y rigurosa con el contexto real del cliente; cercana, simple y amena**.
Se reescribió el `SYSTEM_PROMPT` del plugin Anthropic anclándolo en la [voz de
marca canónica](../40-reference/aelium-documento-de-marca.md) (§Voz + §Personalidad):
voz del mejor especialista — cercano, competente, honesto; tutea; frases cortas;
humaniza en los márgenes; **lista explícita de frases-robot prohibidas**
("Estimado cliente", "Lamentamos los inconvenientes", "Procederemos a gestionar"…).

**Rigor (lo más crítico para un SaaS de cobro):** se endureció el uso del
grounding v1 con tres reglas que nacieron de fallos reales detectados en la
validación: **(1) fuente-por-dato** — cada cifra (importe/precio/fecha) sale de SU
campo del contexto; el importe de una factura pendiente NO es el precio de la
renovación (que dos cifras coincidan no autoriza a deducir una de la otra);
**(2) no inventar causas** — una hipótesis técnica se marca como tal, nunca como
hecho; **(3) SLA como plazo humano** ("te escribo hoy mismo"), no como cifra
cruda ni cláusula contractual.

**Validación empírica (panel de jueces multi-lente, 4 rondas).** En vez de pelear
con el live-test (2FA/Mailpit frágil), se validó el prompt con un **workflow**:
agentes Claude (mismo modelo `opus-4-8` que el plugin) siguen el system-prompt
sobre 6 escenarios con grounding sintético (incl. **dato ausente** y **cliente
enfadado**) → borradores → **panel de 3 lentes** (calidez-humana / rigor-datos /
marca-simplicidad) los puntúa y propone mejoras. Trayectoria:

| Ronda | Cambio | overall | rigor | humano/cercanía | frases-robot | datos inventados |
|---|---|---|---|---|---|---|
| v1 | reescritura voz de marca | 4.5 | 4.33 | 4.92 | 0 | **2** (factura→renovación, GRAVE) |
| v2 | + regla fuente-por-dato | 4.75 | **4.83** | 4.92 | 0 | 0 |
| v3 | + anti-redundancia/1-pregunta/SLA + 2 escenarios límite | 4.61 | 4.39 | 4.78 | 0 | 1 (especula causa) |
| **v4** | + no-inventar-causas + SLA humano | 4.56 | 4.39 | **5.0** | **0** | residual (gusto) |

**Convergencia confirmada en v4:** los jueces ya **oscilan 180°** entre rondas en
cuestiones de gusto (v3 "el SLA en horas es frío" ↔ v4 "usa el SLA, 'hoy mismo'
es vago") — firma del régimen de ruido. Seguir iterando sería sobreajustar a
paneles estocásticos. Los **dos fallos de correctitud reales** (transponer cifras;
especular causas) quedaron cerrados; voz humana/cercanía a tope. **Lección
heredable (L-IA-1):** un panel de jueces LLM sirve para detectar fallos de
correctitud (alta señal) pero converge en ruido para el gusto fino — parar cuando
los jueces empiezan a contradecirse entre rondas, no perseguir el último 0.1.

### 8.2 E2E — cadena real con el SDK mockeado (Fase G)

`backend/test/integration/ai-suggestion.e2e-spec.ts` (4 tests, **sin infra**:
Prisma+SecretVault `useValue`, SDK Anthropic `jest.mock`). Ejercita la **cadena
real** end-to-end que los unit specs no cubren (mockean el colaborador
`AiSuggestionService`): `SupportAiSuggestionService → AiSuggestionService →
AiProviderRegistry → AnthropicAiPlugin → SDK`. Verifica:
1. **Ruta API real (SDK mockeado):** el grounding ensamblado (nombre/servicio/
   dominio/facturación) **llega al prompt** + el system-prompt es la voz de marca;
   y la **PII del cliente (email/teléfono/NIF) NO sale a Anthropic** (la minimiza
   el código real, no el mock) — aserción RGPD end-to-end sobre el argumento real
   de `messages.create`.
2. **Mock-first:** proveedor activo sin `api_key` → stub determinista, **cero**
   llamadas de red.
3. **Sin proveedor activo** (install disabled) → `isEnabled()` false + `503
   AI_UNAVAILABLE`, sin tocar el SDK.
4. **Modelo configurable** + `truncated` mapeado desde `stop_reason=max_tokens`.

### 8.3 Docs + DoD

- **Docs:** `support/contract.md` §Sugerencia IA (estado D→G + endpoint
  `GET /ai-suggestion/enabled` + voz del borrador) · `current.md` ▶TRACK ACTIVO
  (F3·E13 ✅ código-completo) · esta bitácora (§8 cierre + retrospectiva).
- **DoD verde:** back typecheck + lint:check (completo, incl. `test/`) + **1521**
  unit + **E2E 4/4** · front typecheck + lint + **96** unit. Sin cambios de
  `@Module`/firmas en G (solo string del prompt + test nuevo) → boot smoke ya
  cubierto en D/E/F (`Active AI provider(s): [anthropic]`, provisioners 4/4).

### 8.4 Estado git + lo que falta (Yasmin)

**Rama `redesign/f3-ia`** = … + **Fase D `55294e8`** + 2 merges de master
(`abb37d2`,`678c33d`) + **Fase E `d2c4fdb`** + **Fase F `0cb515b`** + **doctrina
Amendment D `1077461`** + **B+C `6f1b30d`** + **bitácora/grounding `954d892`** +
**voz del prompt `66fa694`** + **Fase G E2E/docs (este commit)**.

**Falta (Yasmin):** smoke **visual** del botón (chat/ticket → "Sugerencia IA" →
borrador insertado, con la `api_key` real ya configurada y verificada) + **merge**
de la vertical (PR #147). El núcleo está código-completo y verde.
