# Sprint 15A — Plugin Framework ✅

> **Estado:** ✅ Cerrado
> **Cierre:** 2026-05-06 (~3 sesiones de trabajo activo, 4 commits encadenados en rama `sprint15a-plugin-framework`, [PR #31](https://github.com/yasmindanailov/dashboard/pull/31))
> **Identificadores:** P2.2 — cabeza de cola activa post Sprint 13 §13.AUTH según [ADR-070](../../10-decisions/adr-070-service-info-sso-acciones-curadas.md) "Doctrina de orden"
> **ADRs nacidos durante el sprint:** [ADR-080](../../10-decisions/adr-080-plugin-framework.md) (Fase A — Plugin Framework: manifest declarativo + vault de secretos + loader desde DB + circuit breaker tras interface)

---

## Objetivo

Construir el **sistema operativo de los plugins** sobre el contrato funcional congelado por ADR-077: cómo se instalan, configuran, cifran sus secretos, se aíslan ante fallos del proveedor y se exponen al admin para gestionarlos sin redeploy. Sin Sprint 15A, los Sprints 15D / 15C / 15E / futuro 15B Stripe pagarían un coste de ~30% reimplementando boilerplate (storage de credenciales, UI Settings, validación de config, protección de proveedor caído).

> **Doctrina canónica:** Sprint 11 cerró el contrato funcional (qué hacen los plugins). Sprint 15A cierra el contrato de operación (cómo se gobiernan). Los plugins reales solo declaran 6 métodos + manifest.

---

## Lo que entregó

### Fase A — ADR-080 Plugin Framework (commit `b460c70`)

**Doc-only.** Antes de cualquier código funcional, congelación de la doctrina:

- **Manifest declarativo** (JSON-Schema 7 subset acotado): `slug`, `version`, `manifestVersion`, `label`, `description`, `docsUrl`, `settingsCategory`, `configSchema`, `secretsSchema`, `testConnectionMethod`. Validado por Ajv backend, renderizado por `@rjsf/core` frontend.
- **PK natural `slug`** en `plugin_installs` (NO UUID) — ruptura consciente de la convención. 3 razones: el slug ES la identidad por contrato (ADR-077 §1), cardinalidad acotada ~15 plugins, 3NF correcto.
- **`SecretVaultService` AES-256-GCM** con `ENCRYPTION_KEY` env var dedicada (32 bytes hex) + `key_version` para rotación futura diferida.
- **Loader desde DB**: DB es activación, DI es disponibilidad. Reload runtime via evento `plugin.config_changed`.
- **CircuitBreaker tras interface**: implementación casera ~200 LOC; encapsulada para migración futura a `opossum` sin tocar call-sites. Aplicado SOLO a `getServiceInfoWithCache` + `executeActionWithCacheInvalidation` (NO `provision`/`deprovision` — anti-patrón "blanket protection").
- **5 eventos canónicos**: `plugin.installed`, `plugin.config_changed`, `plugin.uninstalled` (reservado), `plugin.circuit_opened`, `plugin.circuit_closed`.
- **3 decisiones críticas tras crítica honesta:** PK natural slug, breaker acotado a 2 wrappers, `@rjsf/core` con tema DS custom (descartando `json-schema-to-zod` y builder casero).

> **Patrón replicado del Sprint 8 D.0 / Sprint 11 11.A**: ADR redactado antes del primer commit funcional → cero ambigüedad inter-fase. Las 11 fases que siguieron se construyeron literalmente desde el ADR.

### Fases B-D — Cimientos backend (commit `d884eb9`)

Base de datos + tipos + cripto en una unidad lógica:

**Fase B — `PluginManifest` en types.ts (§12):**
- Subset acotado JSON-Schema 7 (`type=object`, primitivos + format/enum/pattern, NO `additionalProperties=true`, NO recursión).
- 4 categorías canónicas (`provisioner`/`payment`/`notification`/`ai`).
- `ProvisionerPlugin` ahora exige `readonly manifest: PluginManifest`.
- Plugins triviales `internal` + `manual` declaran su manifest (i18n keys).
- Contract spec ampliado con 2 invariantes nuevas: slug coincide manifest.slug + JSON-Schema válido + secretsSchema separado.

**Fase C — `SecretVaultService` AES-256-GCM:**
- `core/security/secret-vault.service.ts` + `security.module.ts` global.
- Bootcheck fail-fast: `ENCRYPTION_KEY` = 64 hex chars (32 bytes).
- IV per-secret (12 bytes random NIST GCM) + tag 16 bytes integridad.
- `key_version` desde v1, flujo de rotación documentado pero diferido.
- `encryptRecord`/`decryptRecord` para shapes Jsonb por campo.
- `SecretVaultError` semántico (`KEY_VERSION_MISMATCH` / `DECRYPT_FAILED`).
- `.env.example` (root + backend) actualizados con `openssl rand -hex 32`.

**Fase D — Persistencia `plugin_installs`:**
- Migración Prisma `20260505140000_sprint15a_plugin_installs` con `slug` PK natural VarChar(80) + `enabled` + `config` Jsonb + `secrets` Jsonb + `key_version` int + audit columns + index `(enabled)`.
- Bootstrap rows `internal` + `manual` (`enabled=true`) embebidas en SQL para no romper services huérfanos al deploy.
- Seed canónico `seedPluginInstalls` idempotente enchufado entre `seedSettings` y `seedNotificationTemplates`. Preserva `enabled` si admin lo cambió entre runs.

**Cobertura final B-D:** **224/224 unit verde** (+22 vs base post-Sprint 13: 18 secret-vault + 2 manifest invariants × 2 plugins triviales).

### Fases E-F — Loader desde DB + Circuit breaker (commit `c2ad4f5`)

Comportamiento dinámico runtime:

**Fase E — Refactor `PluginRegistryService`:**
- Separa `validatedPlugins` (DI + contrato, una vez al boot, **inmutable** durante la vida del proceso) de `activePlugins` (validados ∩ enabled=true en DB, **recargable** runtime).
- Inyecta `PrismaService` (PrismaModule global, sin imports adicionales).
- `onModuleInit` async lee `plugin_installs` y filtra.
- `@OnEvent('plugin.config_changed')` recarga `activePlugins` sin re-validar el contrato.
- Plugin enabled=true en DB pero no registrado vía DI → log ERROR sin romper boot (R7 + degradación elegante).
- `getOrThrow` mensaje distintivo: `'validated but not enabled in plugin_installs'` vs `'not registered via DI or failed contract validation'`.
- Añade invariante `manifest.slug === plugin.slug` (ADR-080 §1).
- Añade `listAvailableSlugs()` + `getAvailable(slug)` para que la UI admin liste TODOS los disponibles aunque estén disabled.

**Fase F — Circuit breaker:**
- `core/provisioning/circuit-breaker.ts`: interface `CircuitBreaker` + impl casera `HouseCircuitBreaker` ~200 LOC (closed/open/half-open + threshold 5/60s + reset 30s).
- `CircuitBreakerRegistry` lazy-creates breakers por nombre canónico `<plugin_slug>:<operation>`.
- `CircuitOpenError` semántico para que el orquestador distinga circuito abierto de fallo real.
- Aplicado SOLO en wrappers `getServiceInfoWithCache` (lectura barata repetida) y `executeActionWithCacheInvalidation` (UX directa). NO envuelve `provision`/`deprovision` por **anti-patrón blanket protection** (ADR-080 §5).
- `getServiceInfo` con circuito open → fallback `unknown` cacheado 30s.
- `executeAction` con circuito open → fail-fast `action.circuit_open`.
- Listener `NotificationsPluginCircuitListener` + 3 plantillas notification seedeadas (internal+email opened, internal closed) siguiendo patrón canónico ADR-078 / Sprint 13.

**Cobertura final E-F:** **240/240 unit verde** (+16 circuit-breaker spec con tiempo determinista mock).

### Fase G — REST `/admin/plugins` + Ajv + audit (commit `22ef66b`)

Capa REST canónica:

- **`AdminPluginsService`**:
  - `list()` — todos los plugins disponibles con manifest + estado.
  - `findOne(slug)` — detalle con secrets enmascarados como `'***'`/null.
  - `update(slug, dto)` — Ajv valida config + secrets contra schemas del manifest. Cifra secrets nuevos. **Parcial-update**: secrets omitidos se preservan cifrados.
  - `testConnection(slug)` — invoca `plugin.getStatus()` con service sintético. Solo si manifest.testConnectionMethod=`getStatus`.
  - Audit `logChange` con secrets enmascarados como `<set>`/`<cleared>` (R3 — secrets NUNCA en plaintext en `audit_change_log`).
  - Emit canónico: `plugin.config_changed` + `plugin.installed` (primera vez).
  - Reset breakers asociados al plugin cuando config/secrets cambian.

- **`AdminPluginsController`** REST `/admin/plugins/*` con triple guard (JwtAuthGuard + AdminOnlyGuard + PoliciesGuard).

- **`Subject.Plugin`** añadido a CASL como admin-puro (mismo patrón ADR-067 que `NotificationTemplate`/`Job`). agent_full lo bloquea explícitamente con `inverted: true`.

- **Ajv 8.18.0 + ajv-formats 3.0.1** promovidos a deps prod directas.

- **Tests** `admin-plugins.service.spec.ts`: **15/15 verde** cubriendo list/findOne/update/testConnection + parcial-update preserving secrets + Ajv validation errors + audit masking + reset breakers.

### Fases H-I — Frontend admin (commit `e0aa9b0`)

UI completa para que el superadmin gestione plugins desde el navegador:

**Fase H — Cimientos:**
- `@rjsf/core@^6.5.2` + `@rjsf/utils` + `@rjsf/validator-ajv8` (peerDep `react >=18` cumple con React 19.2.4). ~80KB en bundle admin-only.
- Tipos canónicos en `lib/api.ts`: `AdminPluginListItem`, `AdminPluginDetail`, `PluginManifest`, `PluginJsonSchema`, `PluginCircuitState`, `AdminPluginUpdateBody`.
- `_shared/plugins/PluginStatusBadge.tsx`: render canónico del estado combinando enabled + circuit_state. Mapping: open→Caído, half-open→Recuperando, enabled→Activo, disabled→Deshabilitado.
- `_shared/plugins/PluginCard.tsx`: card del listado con label + description + categoría + version + status badge.
- `_shared/plugins/rjsf-theme/`: tema DS canónico para `@rjsf/core` mapeando widgets al subset acotado del manifest (string→DSTextWidget routea formats uri/email/password al type HTML, boolean→DSCheckboxWidget, number/integer→DSNumberWidget, enum→DSSelectWidget). Encapsulado en `aeliumDsWidgets`.
- `_actions.ts` con cookies httpOnly Modelo A (ADR-078): `updatePluginAction`, `togglePluginAction`, `testConnectionAction`. Result canónico extrae `INVALID_PLUGIN_CONFIG`/`INVALID_PLUGIN_SECRETS` del 400.

**Fase I — Páginas:**
- `/admin/settings/plugins` Server Component: lista cards via `serverFetch('/admin/plugins')`. Empty state si lista vacía + error state si serverFetch falla.
- `/admin/settings/plugins/[slug]` Server Component: carga detalle. 404 → notFound. Header con metadata + PluginStatusBadge.
- `_components/PluginConfigForm.tsx` Client Component:
  - Section toggle enabled (separado del save de config — patrón "panic button").
  - Section configuración con `<Form>` rjsf + tema DS + validator-ajv8 (mismo Ajv que el backend usa — coherencia validación cliente↔server).
  - Section credenciales con form custom (NO rjsf — necesita lógica "deja vacío para preservar valor existente"). Inputs type=password con autoComplete=new-password.
  - Action bar: Guardar + Probar conexión + feedback inline.
- `/admin/settings/page.tsx`: redirect a `/admin/settings/plugins` (Sprint 12 P2.7 lo reemplazará por hub con categorías).
- Permission `Plugin` añadido a `lib/permissions.ts`: AppModule type union, SIDEBAR_PERMISSIONS.superadmin, routeRequiredModules.

### Fase J.1 — E2E REST (incluido en commit J)

`tests/e2e/admin-plugins.spec.ts`: **7 tests** verde cubriendo:
1. Superadmin lista plugins → ve `internal` + `manual` con manifest + circuit_state.
2. Superadmin lee detalle `/admin/plugins/internal` → manifest + secrets enmascarados.
3. Superadmin PATCH enabled=false → audit fila + registry recarga.
4. Superadmin PATCH enabled=true → restaura.
5. Superadmin POST test-connection sobre plugin con `testConnectionMethod=null` → 400.
6. agent_full GET `/admin/plugins` → 403 (Subject.Plugin admin-puro).
7. agent_full PATCH `/admin/plugins/:slug` → 403.

### Fase J.2 — E2E circuit breaker DIFERIDA (decisión profesional)

**Tras revisión crítica**: J.2 requiere un plugin mock que falle controladamente N veces (~150 LOC de infra de test). Las transiciones del breaker ya están **exhaustivamente cubiertas en unit (16/16 verde)** con tiempo determinista mock.

**Decisión canónica**: diferir J.2 a Sprint 15C/D/E donde habrá un plugin real para fallar de verdad. El E2E genuino llegará con la primera caída simulada de Enhance CP / ResellerClub / Docker Engine.

### Fase K — Documentación canónica (incluida en commit K)

- [ADR-080](../../10-decisions/adr-080-plugin-framework.md) — fuente de verdad arquitectónica.
- [`docs/30-data/plugin-installs.md`](../../30-data/plugin-installs.md) — schema canónico del modelo nuevo.
- [`docs/features/provisioning/admin-plugins.md`](../../features/provisioning/admin-plugins.md) — operativa diaria del superadmin (4 flujos canónicos + auditoría + errores comunes).
- [`docs/20-modules/_events.md` §🔌 plugin.*](../../20-modules/_events.md) — 5 eventos + 3 listeners nuevos en consolidado.
- [`docs/20-modules/provisioning/contract.md`](../../20-modules/provisioning/contract.md) — sección Admin Plugin Framework + actualización de Pendientes.
- [`docs/00-foundations/glossary.md`](../../00-foundations/glossary.md) — 3 términos canónicos nuevos: Plugin Manifest, Secret Vault, Circuit Breaker.

---

## Métricas finales

| Métrica | Valor |
|---------|-------|
| Sesiones de trabajo activo | ~3 |
| Commits | 8 (`b460c70` ADR + `d884eb9` B-D + `c2ad4f5` E-F + `22ef66b` G + `e0aa9b0` H-I + `8134784` J-K cierre + Amendment A1: `cad735b` CI key + `95659fb` audit UUID) |
| LOC añadidas backend | ~3,000 código + ~540 tests |
| LOC añadidas frontend | ~1,400 |
| Tests unit nuevos | +57 (18 vault + 11 registry + 16 breaker + 15 admin-plugins) |
| Tests E2E nuevos | +7 (admin-plugins REST) |
| Cobertura backend final | **255/255 unit verde** (vs 198 base post-Sprint 13) |
| Migración Prisma | 1 (`plugin_installs` con bootstrap rows) |
| Eventos canónicos nuevos | 5 (`plugin.*`) |
| Listeners nuevos | 1 (`NotificationsPluginCircuitListener` con 2 handlers) |
| Plantillas notification seedeadas | 3 (opened internal+email, closed internal) |
| Subjects CASL nuevos | 1 (`Plugin` admin-puro) |
| Deps backend nuevas | 2 (ajv 8.18.0, ajv-formats 3.0.1) |
| Deps frontend nuevas | 3 (@rjsf/core, @rjsf/utils, @rjsf/validator-ajv8 — todos 6.5.2) |

---

## Amendment A1 — Bugs detectados en CI post-cierre (2026-05-06)

Tras marcar el PR como ready-for-review, los 3 shards E2E de CI fallaron en el primer run. Dos bugs reales se detectaron y arreglaron antes del merge a master, sin reabrir el sprint (mismo patrón canónico que ADR-079 Amendments / Sprint 16).

### A1.1 — `ENCRYPTION_KEY` en `ci.yml` con 62 chars en lugar de 64 (commit `cad735b`)

**Síntoma**: 3/3 shards E2E fallan con backend NO arrancando — `Error: ENCRYPTION_KEY must be exactly 64 hex characters`.

**Causa raíz**: el valor heredado de Sprint 13 §13.AUTH (`0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd`) era 62 hex chars. Pasaba con el regex laxo de aquel sprint donde no había validador estricto. Sprint 15A introdujo `SecretVaultService` con bootcheck fail-fast `/^[0-9a-fA-F]{64}$/` (ADR-080 §3) — el backend NO arranca con valor mal formado, los shards fallan en el step `webServer.start` de Playwright.

**Fix**: 4 × `0123456789abcdef` = 64 hex chars exactos en `ci.yml`. Comentario doctrinal añadido inline (NUNCA usar este valor en prod, generar con `openssl rand -hex 32`).

**Lección lateral**: el bootcheck fail-fast de Sprint 15A actuó como auditor retroactivo — descubrió un valor degradado que llevaba meses en CI sin consumidor estricto. **El bootcheck es la inversión correcta**.

### A1.2 — `audit_change_log.entity_id` UUID estricto incompatible con slug (commit `95659fb`)

**Síntoma**: shards 2 y 3 pasan tras fix A1.1, pero shard 1 sigue rojo en 1 test (`superadmin PATCH enabled=false → registry recarga + audit fila`).

**Causa raíz**: `AdminPluginsService.update` pasaba `entity_id: slug` (string `'manual'`) a `audit.logChange`. La columna `audit_change_log.entity_id` es `@db.Uuid` estricto en Postgres (todas las entidades del sistema usan UUID PK). Postgres rechaza el INSERT con `invalid input syntax for type uuid: "manual"`. **El bug no salió en unit tests porque mockean `audit.logChange`** — solo se materializa contra Postgres real.

**Fix canónico (sin migración)**:
- Derivar UUID v5 determinístico del slug usando un namespace fijo congelado (`a8f1c4d2-3b5e-4f6a-9c2d-1e7b3f8a5c9d`).
- Implementación RFC 4122 §4.3 nativa con `node:crypto` (~15 LOC) — evita el problema ESM↔CJS de `uuid@14` con ts-jest.
- El slug real se preserva en `changes_before.slug` / `changes_after.slug` para búsquedas humanas.
- Spec E2E adaptado para filtrar por `changes_after->>'slug'` en lugar de `entity_id`.

**Decisión arquitectónica**: descarté cambiar el schema de `audit_change_log.entity_id` a `VarChar` por impacto cross-cutting (todas las entidades audit usarían string en lugar de UUID — refactor mayor). El UUID v5 namespace-based es la solución canónica para entidades con PK natural slug. Si en el futuro llegan más Subjects admin-puro con identidad natural (ej. config slugs), reusar el mismo patrón con namespace propio.

### Lección crítica del Amendment

**Los unit tests con mock de `audit.logChange` no detectan incompatibilidades de schema SQL**. Un E2E contra Postgres real es la única forma. La cobertura unit (255/255) era completa funcionalmente pero ciega a este tipo de bug. **Doctrina canónica reforzada**: cualquier `audit.logChange` con `entity_type` nuevo + `entity_id` no-UUID requiere E2E que toque la DB real (no solo mock).

### Estado final

- 5/5 checks CI pasan (Backend + Frontend + 3 shards E2E).
- Smoke local manual completado por Yasmin OK (login superadmin + lista plugins + toggle + 403 agent_full).
- `git log master..sprint15a-plugin-framework`: 7 commits encadenados (5 originales + 2 fixes Amendment).

---

## Lecciones aprendidas

### 1. ADR-first sigue siendo la decisión correcta

Patrón replicado de Sprint 8 D.0 + Sprint 11 11.A: redactar el ADR antes del primer commit funcional eliminó la ambigüedad inter-fase. Las 3 decisiones críticas (PK natural slug, breaker acotado, `@rjsf/core`) emergieron de la crítica honesta del ADR ANTES de tocar código — corregirlas después habría costado refactor cross-archivo.

### 2. PK natural cuando la identidad ES inmutable por contrato

Romper la convención UUID PK del schema fue **el cambio menos arriesgado** porque ADR-077 ya había congelado el slug como readonly inmutable. Las 3 razones canónicas (3NF, joins más rápidos, identidad funcional ya garantizada) > 1 razón de convención (consistency con resto del schema). Documentar el rationale inline en el modelo Prisma + en ADR-080 §2 + en `docs/30-data/plugin-installs.md` cierra el debate para futuros mantainers.

### 3. Separar validación inmutable de activación mutable

El refactor del `PluginRegistryService` (E.1) introdujo un patrón canónico replicable: **lo que depende del código se calcula una vez al boot; lo que depende de DB se recarga runtime**. El listener `@OnEvent('plugin.config_changed')` solo re-filtra el set activo desde `validatedPlugins` cacheado. Sin esta separación, cada PATCH del admin habría re-ejecutado todas las validaciones del contrato (~5 por plugin) — innecesario.

### 4. Anti-patrón "blanket protection"

La crítica honesta sobre el alcance del circuit breaker (ADR-080 §5) previno una decisión obvia pero incorrecta. Aplicar breaker a `provision`/`deprovision` "para uniformidad" habría creado dos circuitos competidores con BullMQ retry, contaminando métricas de fiabilidad. La doctrina canónica de los 3 criterios (idempotente + frecuente + propagable a UX) acota el patrón a donde realmente gana.

### 5. `@rjsf/core` con tema DS = decisión correcta para 5+ plugins

`json-schema-to-zod` (~3KB) + builder casero (~30 min/plugin) parecía punto medio razonable, pero garantizaba divergencia visual sutil entre forms escritos en sesiones distintas. `@rjsf/core` (~80KB en admin-only) con tema DS custom (~2h una vez) resuelve UX uniforme + cero JSX por plugin nuevo. La crítica re-evaluada **antes** de implementar evitó el coste de refactor con 2 plugins ya escritos.

### 6. Ajv en backend + frontend = una sola fuente de validación

Coherencia crítica para forms dinámicos: el mismo schema valida cliente↔server. Sin esto, el admin podría enviar payloads que pasan client-side pero el backend rechaza con 400 — UX rota. `@rjsf/validator-ajv8` usa el mismo Ajv 8.x que el backend.

### 7. E2E circuit breaker = candidato natural a deuda controlada

Diferir J.2 fue la decisión profesional correcta tras evaluar coste vs cobertura. Los unit tests del breaker (16/16) cubren transiciones, sliding window, error code extraction, idempotencia eventos. Un E2E con plugin mock añadiría ~150 LOC de infra solo para reproducir lo que el unit ya garantiza. El E2E genuino llegará con un plugin real (Sprint 15C/D/E) sin coste extra de mock.

### 8. Pausa controlada vs continuidad

A mitad de Fase E (post commit Fases A-D), Yasmin pidió pausar para revisar el PR. La estrategia canónica de "limpia el working tree y guarda el plan en el TODO" permitió reanudar 1 día después sin pérdida de contexto: el TODO tenía detalles autocontenidos (qué archivo tocar, qué invariantes preservar, qué tests añadir). Patrón replicable para sprints largos.

### 9. Unit con mock no detecta incompatibilidades de schema SQL (Amendment A1.2)

Los 15/15 tests unit de `AdminPluginsService` mockean `audit.logChange` y nunca tocan Postgres real. El bug de `entity_id` UUID estricto solo se materializa contra DB real — por eso saltó en CI E2E (shard 1) y no en local unit. **Doctrina canónica reforzada**: cualquier `audit.logChange` con `entity_type` nuevo + `entity_id` no-UUID requiere E2E que toque la DB real. Aplicable a futuros sprints (Sprint 15C/D/E/B) que añadan Subjects admin-puro con identidad natural.

---

## Pendientes generados

- **Fase J.2 diferida** a Sprint 15C/D/E (deuda controlada documentada en contract.md §9 + esta retrospectiva).
- **Sprint 12 (P2.7 Settings + KB)** hereda la página `/admin/settings/plugins` — el redirect actual `/admin/settings → /plugins` se reemplazará por hub con categorías (`brand`, `numbering`, `kb`, `plugins`).
- **Sprint 15C/D/E/B (futuro)** — plugins reales que consumen el framework. Cada uno solo declara 6 métodos del contrato + manifest. Estimación 15D/15C cae de "2-3 sesiones cada uno" a probablemente "1.5 sesiones" gracias al framework heredado.
- **Rotación de `ENCRYPTION_KEY`** — flujo documentado en ADR-080 §3 pero diferido a sub-sprint condicionado (trigger: filtración sospechada / compliance audit / política interna).

---

## Referencias

- [ADR-080](../../10-decisions/adr-080-plugin-framework.md) — Plugin Framework canónico (manifest + vault + loader DB + circuit breaker + 5 eventos).
- [ADR-077](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) — Contrato funcional `ProvisionerPlugin` v2 (Sprint 11).
- [ADR-070](../../10-decisions/adr-070-service-info-sso-acciones-curadas.md) — Doctrina de orden P2.
- [ADR-067](../../10-decisions/adr-067-roles-y-permisos-granulares.md) — Patrón Subject admin-puro replicado.
- [Sprint 11 retrospectiva](./sprint-11-provisioning.md) — chasis canónico sobre el que Sprint 15A construyó.
- PR #31 GitHub — historial completo de commits + revisión.
