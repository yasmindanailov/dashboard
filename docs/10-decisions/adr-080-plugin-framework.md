# ADR-080 — Plugin Framework: manifest declarativo, vault de secretos, loader desde DB y circuit breaker canónicos

> **Status:** Active (extiende [ADR-009](./adr-009-estrategia-plugins.md), construye sobre [ADR-077](./adr-077-contrato-provisioner-plugin-v2.md), referenciado por [ADR-070](./adr-070-service-info-sso-acciones-curadas.md))
> **Date:** 2026-05-05
> **Domain:** provisioning, plugins, security, settings, cross-cutting
> **Sprint:** Sprint 15A (Fase A — congelación del framework antes del primer commit funcional)

---

## Contexto

[ADR-009](./adr-009-estrategia-plugins.md) (2026-04) definió la **estrategia** de plugins: el core declara la interface, los plugins viven en `backend/src/plugins/<dominio>/<proveedor>/`, el core los inyecta vía configuración y nunca los importa directamente (Regla R4). [ADR-077](./adr-077-contrato-provisioner-plugin-v2.md) (2026-05-01) congeló el **contrato exacto** `ProvisionerPlugin` v2: 6 métodos, capability flags, shapes, política de versionado.

Sprint 11 (P2.1, cerrado 2026-05-02) materializó el chasis del orquestador con **dos plugins triviales** (`internal`, `manual`) registrados a mano en `ProvisioningModule` vía `multi: true` DI. El registro hardcoded fue **decisión consciente y temporal** — el comentario inline en [`backend/src/core/provisioning/plugin-registry.ts:8-17`](../../backend/src/core/provisioning/plugin-registry.ts) declara textualmente: *"Sprint 15A construye un registry más sofisticado con manifest declarativo. Mientras tanto, este registry simple es suficiente."*

Sprint 15A (P2.2) llega con tres plugins reales en cola inmediata (Sprint 15D ResellerClub, Sprint 15C Enhance CP, Sprint 15E Docker Engine — cubiertos por ADR-070 §"Doctrina de orden"). Todos requieren:

1. **Habilitarse/deshabilitarse sin redeploy** — operación de proveedor caída → admin desactiva el plugin desde UI hasta restablecer.
2. **Almacenar API keys de forma segura** — Enhance CP, ResellerClub y Stripe (futuro 15B) reciben credenciales del proveedor que **NO pueden vivir en `.env` de producción** (acceso amplio devops + ausencia de audit trail + difícil rotación).
3. **Auto-protección contra proveedores caídos** — sin circuit breaker, una caída de Enhance CP martillaría la API externa con cada `getServiceInfo()` de cada cliente, propagaría latencias al dashboard y agotaría rate limits del proveedor.
4. **UI declarativa** — el form de configuración de Enhance CP (api_key + base_url + branch_id) y de ResellerClub (api_key + reseller_id + auth_userid) tienen campos distintos. Hardcoded = imposible de mantener cuando lleguen 5+ plugins. Manifest declarativo = la UI lee el shape de cada plugin y renderiza el form.

ADR-009 §6 anticipó el manifest pero no congeló su firma. ADR-077 cerró el contrato funcional pero no el contrato de **operación** (cómo se instala, cómo se configura, cómo se cifran sus secretos, cómo se aísla un fallo).

> **¿Qué pasaría si NO tomáramos esta decisión?** Cada plugin (15C, 15D, 15E, futuro 15B Stripe) reimplementaría: validación de manifest, almacenamiento de API key, encriptación, UI form, lógica de habilitar/deshabilitar, listener de fallo proveedor. La regla R4 quedaría intacta a nivel de imports pero **erosionada a nivel doctrinal** — cinco plugins con cinco formas distintas de pedir su `api_key` al admin. Sprint 12 (P2.7 Settings + KB) heredaría una capa de plugins con cinco shapes incompatibles y reescribiría el 80% de su UI para unificarlos. Sprint 12.5 (RGPD Portal Transparencia) no podría exponer "qué plugins acceden a qué datos" porque cada plugin tendría su propio formato de declaración. **Es exactamente el antipatrón que ADR-077 §Contexto advierte cuando dice "interfaz emergente vs. interfaz curada"** — pero a nivel de operación en lugar de a nivel de contrato funcional.

---

## Opciones consideradas

### A. Diferir el framework — cada plugin se auto-configura

- Sprint 15A se cancela; Sprint 15C Enhance CP arranca y trae su propio módulo de config + form + storage de API key + manejo de fallo.
- **Pros**: descubrimiento incremental; el primer plugin real define las necesidades reales.
- **Contras**: el segundo plugin (15D ResellerClub) descubre que necesita lo mismo que 15C pero con campos distintos → refactor de 15C para extraer el patrón → Sprint 15A nace tarde y mal. Misma trampa que ADR-077 evitó para el contrato funcional. Y los **secrets en `.env` de producción** quedan como deuda fundacional sin owner.

### B. Reutilizar la tabla `Setting` para todo (config + secrets) — anti-patrón

- `category='plugin.enhance_cp'`, `key='api_key'`, `value='<encrypted_blob>'`, añadir flag `encrypted=bool` al modelo `Setting`.
- **Pros**: cero migraciones nuevas; `SettingsService` ya cacheado.
- **Contras**: **mezcla secrets con settings normales** — los settings se listan en `GET /admin/settings` con paginación y filtros; cualquier endpoint nuevo que pinte settings ve los secrets cifrados con la opacidad de un `encrypted=true` boolean. Audit por fila pierde granularidad (no se distingue cambio de api_key de cambio de prefijo de factura). UI de settings categorizada (Sprint 12) tendría que filtrar manualmente "no muestres rows con `encrypted=true`". **Acoplamiento por casualidad**, no por diseño.

### C. Tabla `plugin_installs` dedicada + vault de secretos + manifest + circuit breaker (elegida)

- Modelo nuevo `plugin_installs` (slug PK + enabled bool + config Jsonb plano + secrets Jsonb cifrado + key_version int + installed_at + installed_by + updated_at + updated_by).
- `SecretVaultService` AES-256-GCM con `ENCRYPTION_KEY` env var dedicada (32 bytes hex), IV per-secret, `key_version` para rotación futura.
- `PluginManifest` declarativo en `core/provisioning/types.ts` con `config_schema` (JSON-Schema 7) + `secrets_schema` separado.
- `PluginRegistryService` lee `plugin_installs` al boot, filtra `enabled=true`, recarga en runtime al recibir `plugin.config_changed`.
- `CircuitBreaker` interface + implementación casera ~80 LOC tras la interface (encapsulación para migración futura a `opossum` sin tocar call-sites). Aplicado en `getServiceInfoWithCache` y `executeActionWithCacheInvalidation`.
- 4 eventos canónicos nuevos: `plugin.installed`, `plugin.config_changed`, `plugin.uninstalled`, `plugin.circuit_opened`/`plugin.circuit_closed`.
- **Pros**: separación correcta de responsabilidades (settings normales vs. plugin installs vs. secrets); rotación de claves soportada; UI declarativa desde manifest; circuit breaker desacoplado de plugins (los plugins NUNCA lo invocan — el wrapper sí). Compatible con migración futura a marketplace público.
- **Contras**: 1 migración Prisma + 1 servicio nuevo (`SecretVaultService`) + refactor del `PluginRegistryService` existente. Sprint 15A pasa de 1-2 sesiones (estimación inicial backlog) a **2-3 sesiones reales** por la página `/admin/settings/plugins` completa.

---

## Decisión

**Opción C — Plugin Framework canónico con tabla dedicada, vault de secretos, manifest declarativo, loader desde DB y circuit breaker tras interface.**

A continuación se especifica la firma exhaustiva de cada componente.

---

### 1. Manifest declarativo

```typescript
/**
 * PluginManifest — declaración estática que cada plugin expone para que
 * el orquestador, la UI admin y el portal RGPD entiendan su forma sin
 * inspeccionar código.
 *
 * Vive en `core/provisioning/types.ts` (extiende contrato ADR-077).
 * Cualquier plugin v2 expone `readonly manifest: PluginManifest`.
 */
export interface PluginManifest {
  /** Slug canónico (snake_case o kebab-case, ver [ADR-077 Amendment A2](./adr-077-contrato-provisioner-plugin-v2.md#amendments)). Idéntico a `ProvisionerPlugin.slug`. */
  readonly slug: string;

  /** Versión semver del plugin (NO del contrato — eso es contractVersion). */
  readonly version: string;

  /** Etiqueta visible i18n key (ej. "plugin.enhance_cp.label"). */
  readonly label: string;

  /** Descripción corta i18n key. */
  readonly description: string;

  /** URL a documentación del plugin (admin.md correspondiente). */
  readonly docsUrl: string;

  /** Categoría de settings donde aparece (Sprint 12 P2.7). */
  readonly settingsCategory: 'provisioner' | 'payment' | 'notification' | 'ai';

  /**
   * JSON-Schema 7 del shape de `config` (campos NO secretos).
   * El orquestador valida contra esto en PATCH /admin/plugins/:slug.
   * El frontend renderiza el form dinámico desde aquí.
   */
  readonly configSchema: JsonSchema7;

  /**
   * JSON-Schema 7 del shape de `secrets` (campos cifrados).
   * Separado de configSchema para que la UI marque visualmente los campos
   * sensibles + el portal RGPD declare qué credenciales del proveedor maneja.
   */
  readonly secretsSchema: JsonSchema7;

  /**
   * Endpoint relativo del propio plugin para test-connection.
   * Si null, el botón "Probar conexión" se oculta.
   */
  readonly testConnectionMethod: 'getStatus' | 'custom' | null;
}

/** JSON-Schema 7 (subset acotado). Permite ramas: type, properties, required, format, description (i18n key), enum, default. */
export type JsonSchema7 = {
  type: 'object';
  properties: Record<string, JsonSchema7Property>;
  required?: readonly string[];
  additionalProperties?: false;
};

export type JsonSchema7Property = {
  type: 'string' | 'number' | 'boolean' | 'integer';
  description?: string; // i18n key
  format?: 'uri' | 'email' | 'password' | 'uuid';
  enum?: readonly (string | number)[];
  default?: string | number | boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
};
```

**Validación canónica**: `Ajv` (peer-dep ya en backend) compila el schema una vez al boot por plugin. PATCH valida payload con `ajv.validate(schema, payload)`. Errores → 400 con `code='INVALID_PLUGIN_CONFIG'` + `details: ajv.errors`.

---

### 2. Modelo de datos

**Decisión sobre la PK**: `slug` como **PK natural** (NO UUID). Rompe conscientemente la convención del resto del schema (`id String @id @default(dbgenerated("gen_random_uuid()"))`) por tres razones canónicas:

1. **El slug ES la identidad.** [ADR-077 §1](./adr-077-contrato-provisioner-plugin-v2.md) declara `ProvisionerPlugin.slug` como `readonly` e inmutable. Añadir un UUID encima sería un identificador artificial que duplica la identidad funcional ya garantizada por contrato.
2. **3rd Normal Form aplicado correctamente.** Tablas con cardinalidad acotada (~15 plugins de por vida) y *natural key* inmutable se modelan canónicamente con PK natural. UUID es la solución a "no tengo identidad natural" — aquí sí la tengo.
3. **Joins más rápidos.** `services.plugin_slug → plugin_installs.slug` con tipo string nativo evita la indirección UUID + 16 bytes/fila + 1 índice secundario.

La convención UUID PK del resto del schema no es dogma — es la solución por defecto cuando no hay identidad natural. Forzarla aquí sería *cargo cult coding*.

```prisma
model PluginInstall {
  /** Slug canónico (snake_case o kebab-case, ver [ADR-077 Amendment A2](./adr-077-contrato-provisioner-plugin-v2.md#amendments)). PK natural — coherente con manifest.slug. */
  slug         String   @id @db.VarChar(80)

  /** Si está habilitado para uso por el orquestador. */
  enabled      Boolean  @default(false)

  /**
   * Config plano (NO secretos). Validado contra manifest.configSchema.
   * Ej. { base_url: "https://...", branch_id: "uk-1" }.
   */
  config       Json     @default("{}")

  /**
   * Secrets cifrados — Jsonb con shape:
   *   {
   *     api_key: { ciphertext: <base64>, iv: <base64>, tag: <base64> },
   *     ...
   *   }
   * Cada secret con su IV propio. Tag GCM para integridad.
   */
  secrets      Json     @default("{}")

  /**
   * Versión de la clave (ENCRYPTION_KEY) usada para cifrar `secrets`.
   * Permite rotación: cuando se rota la key, los secrets se descifran
   * con key_version=N y se re-cifran con key_version=N+1.
   * Default 1 — primera versión de la clave.
   */
  key_version  Int      @default(1)

  installed_at DateTime @default(now()) @db.Timestamptz()
  installed_by String?  @db.Uuid
  updated_at   DateTime @default(now()) @updatedAt @db.Timestamptz()
  updated_by   String?  @db.Uuid

  @@index([enabled])
  @@map("plugin_installs")
}
```

**Seed idempotente**: `internal` y `manual` se seedean con `enabled=true`, `config={}`, `secrets={}`. Es el **único** estado bootstrap válido — sin estos plugins triviales habilitados, los servicios `internal` y `manual` quedarían huérfanos (su plugin no se cargaría).

---

### 3. SecretVaultService — encriptación canónica

```typescript
/**
 * `core/security/secret-vault.service.ts` — única fuente de cifrado en backend.
 *
 * Algoritmo: AES-256-GCM (autenticated encryption, NIST-approved).
 * Clave: ENCRYPTION_KEY env var (32 bytes hex, validado al boot — fail-fast).
 * IV: 12 bytes random per-secret (NIST recomendación GCM).
 * Tag: 16 bytes (default GCM) para integridad.
 *
 * Doctrina:
 *   - El servicio es lo único que toca la clave maestra. Cualquier otro
 *     módulo recibe los secretos descifrados como string en memoria.
 *   - Cifrado fail-loud: si Ajv rechaza el shape de retorno de decrypt(),
 *     el servicio lanza error en lugar de devolver basura.
 *   - Rotación: encrypt() guarda key_version actual; decrypt(blob, key_version)
 *     resuelve qué clave usar (Sprint 15A v1: única clave activa; rotación
 *     elegante diferida a sub-sprint cuando sea necesario).
 */
@Injectable()
export class SecretVaultService implements OnModuleInit {
  private readonly key: Buffer;
  readonly currentKeyVersion = 1;

  constructor(private readonly config: ConfigService) {
    const hex = this.config.getOrThrow<string>('ENCRYPTION_KEY');
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error(
        'ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate: openssl rand -hex 32',
      );
    }
    this.key = Buffer.from(hex, 'hex');
  }

  /** Cifra un string. Devuelve blob serializable (base64 partes). */
  encrypt(plaintext: string): EncryptedSecret {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      ciphertext: ct.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      key_version: this.currentKeyVersion,
    };
  }

  /** Descifra un blob. Throw si tag GCM no valida (manipulación detectada). */
  decrypt(blob: EncryptedSecret): string {
    if (blob.key_version !== this.currentKeyVersion) {
      throw new Error(
        `Secret encrypted with key_version=${blob.key_version}, current=${this.currentKeyVersion}. Rotation needed.`,
      );
    }
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(blob.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(blob.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}

export interface EncryptedSecret {
  ciphertext: string; // base64
  iv: string; // base64 (12 bytes)
  tag: string; // base64 (16 bytes)
  key_version: number;
}
```

**Política de rotación** (diferida a sub-sprint condicionado, **NO** parte de Sprint 15A):

- Trigger: filtración sospechada, política RGPD interna, primer compliance audit.
- Mecanismo futuro: `ENCRYPTION_KEY_NEXT` env var coexiste con `ENCRYPTION_KEY`; cron `secret-rotate` lee blobs con `key_version=N`, descifra con clave N, re-cifra con clave N+1, persiste. Cuando 100% rotado, `ENCRYPTION_KEY` se reemplaza por el valor de `ENCRYPTION_KEY_NEXT` y la var `_NEXT` se elimina.
- Sprint 15A v1: una sola clave activa, `key_version=1`. El código está preparado pero el flujo de rotación se documenta y se difiere.

---

### 4. PluginRegistryService — loader desde DB

Refactor sobre el archivo existente [`backend/src/core/provisioning/plugin-registry.ts`](../../backend/src/core/provisioning/plugin-registry.ts):

```typescript
@Injectable()
export class PluginRegistryService implements OnModuleInit {
  private readonly plugins = new Map<string, ProvisionerPlugin>();

  constructor(
    @Inject(PROVISIONER_PLUGINS) private readonly registered: ProvisionerPlugin[],
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly logger: Logger,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reloadFromDb();
    this.events.on('plugin.config_changed', () => void this.reloadFromDb());
  }

  /**
   * Lee `plugin_installs` y filtra: solo los `enabled=true` cuyo slug
   * coincide con un plugin registrado en NestJS DI quedan en el map.
   *
   * Plugin registrado en DI pero `enabled=false` → fuera del map.
   * Plugin en DB `enabled=true` pero NO registrado en DI → log error,
   *   servicio queda huérfano, orquestador lo deja en `pending`.
   */
  private async reloadFromDb(): Promise<void> {
    const installs = await this.prisma.pluginInstall.findMany({
      where: { enabled: true },
    });
    const enabledSlugs = new Set(installs.map((i) => i.slug));

    this.plugins.clear();
    for (const plugin of this.registered) {
      if (!this.passesValidation(plugin)) continue;
      if (!enabledSlugs.has(plugin.slug)) continue;
      this.plugins.set(plugin.slug, plugin);
    }

    for (const slug of enabledSlugs) {
      if (!this.plugins.has(slug)) {
        this.logger.error(
          `Plugin "${slug}" enabled in DB but not registered via DI — services will hang in 'pending'.`,
        );
      }
    }
    this.logger.log(`Active plugins: [${[...this.plugins.keys()].join(', ')}]`);
  }
}
```

**Doctrina canónica del loader**:

- DI sigue siendo la fuente de **disponibilidad** (qué clases existen). DB es la fuente de **activación** (cuáles aplican).
- Reload runtime sin reiniciar — `plugin.config_changed` lo dispara desde el endpoint admin.
- Race condition: si dos admins editan simultáneamente, el último gana (audit registra ambos cambios). No se requiere lock distribuido para Sprint 15A — el coste operativo (Redis lock + retry) supera el riesgo real.
- Boot fail-soft: un plugin malformado no rompe el boot. Logueo error + sigue. Coherente con R7.

---

### 5. CircuitBreaker tras interface

```typescript
/**
 * `core/provisioning/circuit-breaker.ts` — protege wrappers cross-cutting.
 *
 * Estados:
 *   - closed:     normal. Cuenta fallos. ≥5 fallos en 60s → transición a open.
 *   - open:       rechaza llamadas con `ProvisionerPluginError(NETWORK_ERROR, retriable=true)`.
 *                 Tras 30s → transición a half-open.
 *   - half-open:  permite UNA llamada de prueba. Si OK → closed. Si KO → open (reset 30s).
 *
 * Encapsulado tras interface para migración futura a `opossum` sin
 * tocar call-sites (Sprint 15A casero suficiente para 5-7 plugins).
 */
export interface CircuitBreaker {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getState(): CircuitBreakerState;
}

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';
```

**Eventos canónicos** emitidos al cambiar de estado:

- `plugin.circuit_opened` — payload `{ plugin_slug, reason, opened_at, last_error_code }`. Listener `notifications-on-plugin-circuit-opened` envía notif `internal` + `email` a superadmin.
- `plugin.circuit_closed` — payload `{ plugin_slug, closed_at, downtime_seconds }`. Listener registra audit y notif `internal` resolución.

**Aplicación canónica — doctrina del patrón**:

El circuit breaker se aplica EXCLUSIVAMENTE a operaciones que cumplen los **3 criterios canónicos**: (a) idempotentes, (b) frecuentes y (c) propagables a UX en tiempo real.

- ✅ `getServiceInfoWithCache` → **envuelto**. Lectura repetida y barata (cada apertura de `/dashboard/services/[id]`, cada cron de reconciliación). Si el proveedor cae, sin breaker se martillean N requests/segundo, agotando el rate limit del proveedor y propagando latencia al dashboard.
- ✅ `executeActionWithCacheInvalidation` → **envuelto**. Acción del cliente final que merece feedback inmediato — fail-fast con "proveedor no disponible" es mejor UX que esperar 30s a un timeout.
- ❌ `provision()` y `deprovision()` → **NO envueltos**. Son one-shot del orquestador con retry policy propia en BullMQ (`provisioning-dispatch` con backoff `[30s, 90s, 270s]` → DLQ). Meter breaker encima crea **dos circuitos competidores**: el segundo intento de BullMQ podría rebotar contra el breaker abierto y fallar artificialmente, contaminando la métrica de fiabilidad del proveedor. Además son operaciones raras (una vez por checkout) y aisladas en cola async — no cumplen criterio (b) ni (c).

> **Anti-patrón a evitar**: *blanket protection* — aplicar breaker a todo "para que sea simétrico". Cada wrapper resuelve un problema distinto; mezclarlos esconde dónde está el fallo cuando algo se rompa.

---

### 6. Eventos canónicos del framework

| Evento | Payload | Productor | Consumidor |
|--------|---------|-----------|------------|
| `plugin.installed` | `{ slug, installed_by, installed_at }` | `AdminPluginsService.install` | audit |
| `plugin.config_changed` | `{ slug, changed_by, changed_at, secrets_modified: bool }` | `AdminPluginsService.update` | `PluginRegistryService.reloadFromDb`, audit |
| `plugin.uninstalled` | `{ slug, uninstalled_by, uninstalled_at }` | `AdminPluginsService.uninstall` | audit |
| `plugin.circuit_opened` | `{ plugin_slug, reason, opened_at, last_error_code }` | `CircuitBreaker` | `notifications-on-plugin-circuit-opened`, audit |
| `plugin.circuit_closed` | `{ plugin_slug, closed_at, downtime_seconds }` | `CircuitBreaker` | audit, notifications |
| `plugin.reconcile_completed` | `{ plugin_slug, trigger: 'cron' \| 'manual', services_processed, drifts_detected, errors, duration_ms, completed_at /* ISO */ }` | cron de reconciliación del plugin (Enhance: `EnhanceReconciliationCron.emitReconcileCompleted`; patrón heredable a todo plugin con `supports_reconciliation`) tras cada pasada cron L3 o `reconcile-all` manual | `AuditOnPluginReconcileCompletedListener` (→ `audit_change_log` `Plugin`/`reconcile_completed`, `user_id=null`); el admin overview operativo lo lee como "última reconciliación hace Xh" — estado observado, no inferido |

> **Nota (Sprint 15C.II Fase F.2 — [ADR-083 Amendment A6.1](adr-083-plugin-enhance-cp-specifics.md#amendments)):** `plugin.reconcile_completed` se añadió como rollup por pasada de reconciliación (complemento agregado de `service.reconciled_external_change`, que registra cada drift individual a nivel `Service`). Admin-only por naturaleza — no toca `audit_access_log` ni flags GDPR. NB: `plugin.reconcile_triggered_manually` **no** está en esta tabla porque no es un evento del bus — es un `action` de `audit_change_log` que `AdminPluginsService.reconcileAll` escribe síncronamente (registra "quién gatilló el manual"; el "qué resultado" lo registra `reconcile_completed`).

Registrados en [`docs/20-modules/_events.md`](../20-modules/_events.md) en cierre del Sprint (Fase K).

---

### 7. UI admin — `/admin/settings/plugins`

**Sprint 15A entrega la página completa** (decisión Yasmin 2026-05-05). Sprint 12 (P2.7 Settings + KB) hereda la página y añade otras categorías (marca, numeración, KB) sin tocar la lógica de plugins.

Estructura:

- `/admin/settings/plugins` — Server Component lista (cards con label + version + status badge + circuit state).
- `/admin/settings/plugins/[slug]` — detalle. Form dinámico construido desde `manifest.configSchema` + `manifest.secretsSchema` con **`@rjsf/core`** (industry standard, usado por Mozilla / Hashicorp / Stripe). Botón **Probar conexión** llama a `POST /admin/plugins/:slug/test-connection`. Audit history compact (últimos 5 cambios).

**Decisión `@rjsf/core` vs builder casero vs `json-schema-to-zod`** (tras revisión crítica 2026-05-05):

| Opción | Bundle (admin-only) | Mantenimiento por plugin nuevo | Riesgo divergencia visual |
|--------|---------------------|--------------------------------|---------------------------|
| `@rjsf/core` (elegida) | ~80 KB | 0 — solo declarar manifest | Cero — un único renderer |
| Builder casero | 0 KB | ~30 min de JSX por plugin | Alto — 5+ forms divergen en sesiones distintas |
| `json-schema-to-zod` | ~3 KB | ~30 min de JSX por plugin | Medio — solo unifica validación |

Para Aelium (5-7 plugins en horizonte 6-12 meses, voz de marca exigente, página admin-only sin clientes B2C), 80 KB en `/admin/*` es irrelevante; el coste real es la dep peer en sí. El builder casero garantiza divergencia sutil entre forms (espaciado, labels, mensajes de validación) escritos en sesiones distintas — es la trampa profesional clásica.

**Plan de integración**: tema custom Design System (~2h) en `frontend/app/_shared/plugins/rjsf-theme/` que mapee los widgets de `@rjsf/core` a los componentes DS canónicos (`Input`, `Select`, `SearchInput`, `Textarea`, `Button` de `frontend/components/ui/`). Sprints 15B/C/D/E/G heredan el tema sin tocar JSX de forms.

CASL: `Subject='Plugin'`, exclusivo `superadmin` (coherente con `NotificationTemplate` y `Job` — patrón ADR-067).

Server Actions con cookies httpOnly Modelo A (ADR-078).

---

### 8. Política de versionado del framework

- `PluginManifest` v1 (Sprint 15A) — esta firma.
- Cambios futuros que rompan `PluginManifest` requieren **ADR específico** + bump v2 + período de coexistencia.
- `ProvisionerPlugin.contractVersion` (ADR-077) y `PluginManifest.version` son **independientes**: un plugin puede subir su `manifest.version` sin tocar `contractVersion`.

---

## Consecuencias

- ✅ **Ganamos:**
  - Sprints 15D / 15C / 15E / futuro 15B Stripe heredan TODO el framework. Cada plugin real solo escribe los 6 métodos del contrato + el manifest. Estimación 15D/15C cae de "2-3 sesiones cada uno" a probablemente "1.5 sesiones".
  - Secrets en DB cifrados AES-256-GCM con tag de integridad. Filtración de DB sin la `ENCRYPTION_KEY` = blobs ilegibles.
  - Resiliencia automática contra proveedor caído. Sin trabajo extra del plugin.
  - Audit RGPD completo: cada cambio de config + cada apertura de circuito queda en `audit_change_log`.
  - UI declarativa: añadir un plugin nuevo no requiere tocar el frontend.
  - Sprint 12 hereda página plugins y solo añade categorías encima (no la reescribe).
- ⚠️ **Aceptamos:**
  - 1 migración Prisma + 1 servicio cripto + refactor del registry. Sprint 15A pasa de 1-2 a 2-3 sesiones reales.
  - Ajv como dep peer (ya en backend para validación REST de DTOs — verificar; si no, añadir).
  - **`@rjsf/core`** como nueva dep frontend (~80 KB en bundle admin-only). Aceptada conscientemente: a cambio se gana renderer único + cero divergencia visual entre forms de plugins. Tema custom DS (~2h) requerido en `frontend/app/_shared/plugins/rjsf-theme/`.
  - **PK natural `slug` en `plugin_installs`** rompe la convención UUID PK del resto del schema. Aceptado conscientemente: el slug ES la identidad por contrato ADR-077, y la cardinalidad acotada (~15 plugins) hace inaplicable la justificación de UUID.
  - Disciplina: cualquier dev con acceso a DB ve los blobs cifrados pero NO la clave. Si la `ENCRYPTION_KEY` se filtra, los secrets se filtran. Mitigación: env var en hosting con permisos restringidos + rotación documentada.
- 🚪 **Cierra:**
  - **NO** se aceptan API keys de plugins en `.env` de producción. La única vía de configuración es `/admin/settings/plugins`.
  - **NO** se mezclan plugin secrets con la tabla `Setting` general.
  - **NO** se llama a un proveedor con circuit breaker abierto.

---

## Amendments

### Amendment B (2026-05-09) — campo opcional `productConfigSchema` en `PluginManifest`

> **Justificado por:** Sprint 15C Fase 15C.E.2 (Frontend acciones curadas — gap descubierto en review Fase 15C.E del PR #44). El plugin `enhance_cp` (Sprint 15C Fase C) ya valida en runtime que `Product.provisioner_config.enhance_plan_id` sea entero ≥1 (`extractEnhancePlanId` en [`enhance.plugin.ts:958-969`](../../backend/src/plugins/provisioners/enhance_cp/enhance.plugin.ts#L958-L969)), pero **el form admin de productos (`/admin/products/new` + `/admin/products/[id]/edit`) no expone ningún campo para editar `provisioner_config`**. Resultado: cualquier producto Enhance creado vía UI quedaba con `provisioner_config: null` → `INVALID_PAYLOAD: enhance_plan_id missing` al provisionar el primer cliente real. **Bloqueante operativo end-to-end** (sin esto ningún producto Enhance es contratable). Para cerrar el gap manteniendo la doctrina manifest-declarativo de Sprint 15A se formaliza un campo opcional `productConfigSchema?: JsonSchema7` en `PluginManifest`.
> **Sprint:** 15C Fase 15C.E.2 (mergeado).
> **Compatibilidad:** Hacia atrás. NO bumpea `manifestVersion` — sigue `'v1'`. El campo es **opcional**. Plugins existentes (`internal`, `manual`) no lo declaran y conservan comportamiento previo (sub-form ausente en el UI). NO requiere migración de datos. NO toca `Product.provisioner_config` (jsonb existe desde Sprint 6).

#### B.1. Cambio canónico en `PluginManifest` (§1 shape)

Se añade un campo opcional al shape canónico:

```typescript
export interface PluginManifest {
  // ... campos existentes (slug, version, manifestVersion, label, description,
  //                       docsUrl, settingsCategory, configSchema,
  //                       secretsSchema, testConnectionMethod) ...

  /**
   * Schema declarativo del shape de `Product.provisioner_config` para
   * productos que provisionan a través de este plugin. Renderizado por
   * `@rjsf/core` en el form admin de productos cuando el admin selecciona
   * este `provisioner` slug.
   *
   * Opcional. Plugins triviales (`internal`, `manual`) lo omiten — sus
   * servicios no requieren config per-producto. El form admin esconde
   * la sección sub-form si el manifest del provisioner seleccionado lo
   * omite o si declara `properties: {}`.
   *
   * Diferencia clave vs `configSchema`:
   *   - `configSchema` configura la INSTALACIÓN del plugin (1 fila por
   *     plugin en `plugin_installs`). Audiencia: superadmin desde
   *     `/admin/settings/plugins/[slug]`.
   *   - `productConfigSchema` configura cada PRODUCTO que provisiona vía
   *     el plugin (1 fila por producto en `products.provisioner_config`).
   *     Audiencia: admin de productos desde `/admin/products/...`.
   *
   * Validación:
   *   - Form-side via Ajv (UX): @rjsf/core valida + bloquea submit si no cumple.
   *   - Runtime defense-in-depth: el plugin valida `productConfig` en
   *     `provision()` y lanza `ProvisionerPluginError('INVALID_PAYLOAD', false)`
   *     si el shape no coincide. La validación form-side es UX — el plugin
   *     NUNCA confía en el form (R7).
   */
  readonly productConfigSchema?: JsonSchema7;
}
```

Ejemplo `enhance_cp` (Sprint 15C Fase 15C.E.2):

```typescript
const ENHANCE_PRODUCT_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    enhance_plan_id: {
      type: 'integer',
      minimum: 1,
      description: 'plugin.enhance_cp.product_config.enhance_plan_id',
    },
  },
  required: ['enhance_plan_id'],
  additionalProperties: false,
} as const;

const ENHANCE_MANIFEST: PluginManifest = {
  // ... campos existentes ...
  productConfigSchema: ENHANCE_PRODUCT_CONFIG_SCHEMA,
};
```

#### B.2. Test contract genérico (§7) — invariante nueva

```typescript
// backend/src/plugins/provisioners/plugin-contract.spec.ts
it('manifest.productConfigSchema (si declarado) es JsonSchema7 válido', () => {
  const schema = plugin.manifest.productConfigSchema;
  if (schema === undefined) return; // OK: plugins sin config per-producto.

  expect(schema.type).toBe('object');
  expect(schema.additionalProperties).not.toBe(true);
  if (schema.required) {
    for (const requiredKey of schema.required) {
      expect(schema.properties[requiredKey]).toBeDefined();
    }
  }
});
```

#### B.3. Plugins existentes — sin actualización requerida

| Plugin | Declara `productConfigSchema` | Razón |
|---|---|---|
| `internal` | NO | Servicios sin proveedor externo (ej. Support Inside) — no hay config per-producto. |
| `manual` | NO | El admin gestiona la activación a mano vía Task — no hay config declarativa. |
| `enhance_cp` | **SÍ** (Sprint 15C Fase 15C.E.2) | Cada producto hosting Enhance referencia un `enhance_plan_id` distinto. |
| `resellerclub` (futuro Sprint 15D) | TBD | Posiblemente con `tld` + `years` u otros — decisión propia del plugin RC. |
| `docker_engine` (futuro Sprint 15E) | TBD | Image + ports + envs — schema más rico. |

#### B.4. Frontend — patrón canónico de consumo

Form admin productos hereda el patrón Sprint 15A plugin install UI:

```typescript
// frontend/app/admin/products/new/page.tsx — SC
const plugins = await serverFetch<AdminPluginListItem[]>('/admin/plugins');
return <NewProductForm initialPlugins={plugins} />;

// frontend/app/admin/products/new/_components/NewProductForm.tsx — CC
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { aeliumDsWidgets } from '../../../../_shared/plugins/rjsf-theme';

const selectedPlugin = plugins.find((p) => p.slug === provisioner);
const schema = selectedPlugin?.manifest?.productConfigSchema;

{schema && (
  <Form
    schema={schema as RJSFSchema}
    formData={provisionerConfig}
    widgets={aeliumDsWidgets}
    validator={validator}
    onChange={(e) => setProvisionerConfig(e.formData ?? {})}
    uiSchema={{ 'ui:submitButtonOptions': { norender: true } }}
    showErrorList={false}
  />
)}
```

R4 intacto: el form admin NO importa el plugin — solo lee el manifest serializado vía REST.

#### B.5. Doctrina de adición de campos opcionales a `PluginManifest`

Este Amendment establece el patrón canónico para extender `PluginManifest` sin breaking change:

1. ADR específico (o transversal) que justifique el campo nuevo.
2. Amendment a este ADR-080 con: shape extendido + impacto en `AdminPluginsService` (si valida) + invariante test contract + plugins existentes (typically sin cambios si el campo es opcional).
3. Compatible hacia atrás → NO bumpea `manifestVersion`.
4. Frontend lee el campo del manifest serializado (cero hardcoding por slug).
5. Documentar en backlog si se difiere validación backend Ajv.

Cualquier campo nuevo NO opcional o que rompa el shape requiere bump a `manifestVersion: 'v2'` + ADR específico + path de migración.

#### B.6. Deuda explícita generada

| Ref | Item | Cuándo abordar |
|---|---|---|
| **DC-AJV-PRODUCT-CONFIG** | Validar `Product.provisioner_config` contra `manifest.productConfigSchema` con Ajv en `AdminProductsService` (paralelo al patrón `AdminPluginsService.validateConfigCache`). Hoy la única defensa es el plugin runtime — suficiente para Fase 15C.E.2 (admin escribe el JSON, no cliente externo). | Cuando llegue plugin con schema rico (RC tld+years o docker image+ports), o si admin reporta error tardío vs validación inmediata UX. |

---

### Amendment C (2026-05-12) — campo opcional `serviceInfoCacheTtlSeconds` en `PluginManifest` (Sprint 15C.II Fase F.3)

> **Justificado por:** Sprint 15C.II Fase F.3 (GAP-15CII-G4) + [ADR-083 Amendment A7.4](./adr-083-plugin-enhance-cp-specifics.md#amendments). El TTL del cache L1 `service_info` (§5) era un único valor: el `setting` global `provisioning.service_info_ttl_seconds` (default 60s). Distintos proveedores tienen distinta tolerancia a la latencia/coste de re-fetch (un panel que cambia rápido quiere TTL bajo; uno estable, alto) — la **recomendación del autor del plugin** debe poder viajar en el manifest, sin obligar al operador a tunear un setting global por plugin. Sigue el patrón canónico B.5 ("doctrina de adición de campos opcionales a `PluginManifest`").
> **Sprint:** 15C.II Fase F.3 (mergeado).
> **Compatibilidad:** Hacia atrás. NO bumpea `manifestVersion` — sigue `'v1'`. El campo es **opcional**. Plugins existentes (`internal`, `manual`, `enhance_cp`) no lo declaran → usan el setting global / default exactamente como hoy. NO requiere migración.

#### C.1. Cambio canónico en `PluginManifest` (§1 shape)

```typescript
export interface PluginManifest {
  // ... campos existentes (slug, version, manifestVersion, label, description,
  //                       docsUrl, settingsCategory, configSchema, secretsSchema,
  //                       testConnectionMethod, productConfigSchema?) ...

  /**
   * Recomendación del autor del plugin para el TTL (segundos) del cache L1
   * `service_info` (resultado de `getServiceInfo()`, ver [ADR-077 §5](./adr-077-contrato-provisioner-plugin-v2.md)).
   * Opcional — si ausente, se usa el setting global `provisioning.service_info_ttl_seconds`
   * (default 60s). El runtime aplica un *sanity floor* de 5s (`Math.max(...,5)`):
   * un valor menor martillaría al proveedor. Es una recomendación, no un
   * mandato — el operador siempre puede override con el setting.
   */
  readonly serviceInfoCacheTtlSeconds?: number;
}
```

#### C.2. Impacto en runtime

`ProvisioningService.resolveServiceInfoTtl(plugin)` — precedencia **`manifest.serviceInfoCacheTtlSeconds` > setting global `provisioning.service_info_ttl_seconds` > 60s**, con *sanity floor* de **5s** aplicado en runtime (`Math.max(Math.floor(ttl), 5)` — un plugin puede declarar `2` y el runtime lo sube a `5`). El valor resuelto se pasa a `getServiceInfoWithCache(..., { ttlSeconds })`. `AdminPluginsService` no lo valida con Ajv (es un entero del manifest, no input externo) — el contract test (§7) solo exige "entero positivo si declarado". `enhance_cp` no lo declara.

#### C.3. Plugins existentes — actualización

- `internal`, `manual`, `enhance_cp`: no declaran `serviceInfoCacheTtlSeconds` → comportamiento idéntico al actual (setting global / 60s).
- Plugins futuros (15D/15E/15G): lo declaran si el panel del proveedor tiene una cadencia de cambio distinta del default (RC: TLD/registrar muta poco → TTL alto; Docker: métricas de contenedor mutan rápido → TTL bajo).

---

## Cuándo revisar

- **Si llega un plugin que necesita config dinámica per-cliente** (ej. cada cliente tiene su propia api_key de Stripe Connect). El framework actual asume **config global por plugin**. Revisión: añadir tabla `plugin_install_overrides` con `(slug, scope, scope_id, secrets)` o ADR específico.
- **Si `@rjsf/core` se queda corto para campos avanzados** (uploaders de certificados, editores de JSON anidado, validación cross-field compleja). Mitigación dentro del propio framework: extender el tema DS con widgets custom registrados a `@rjsf/core` antes de saltar a otra librería.
- **Si la `ENCRYPTION_KEY` necesita rotación real** — Sprint 15A v1 difiere el flujo. Cuando llegue trigger (compliance audit, sospecha filtración, política interna), redactar ADR específico que detalle migración de blobs `key_version=N` a `key_version=N+1`.
- **Si el circuit breaker casero se queda corto** — más de 10 plugins, métricas Prometheus, fallback functions complejos. Migrar a `opossum` detrás de la misma interface (call-sites no se tocan).
- **Si llega marketplace público de plugins de terceros** — manifest se queda corto: necesita `signature`, `permissions`, `data_access_scope` para portal RGPD, `pricing`. ADR específico.

---

## Referencias

- **Módulos afectados:**
  - `provisioning` — `PluginRegistryService` refactor + `plugin-utils.ts` con circuit breaker.
  - `core/security` (nuevo) — `SecretVaultService`.
  - `admin-plugins` (nuevo módulo) — endpoints REST + service + listener.
  - `notifications` — listener `notifications-on-plugin-circuit-opened`.
  - `audit` — consume `plugin.*` events.
- **Reglas relacionadas:** R0 (ADR para decisiones arquitectónicas), R3 (audit log inmutable), R4 (plugins no se importan desde core), R7 (errores semánticos), R10 (rate limiting / cooldowns), R12 (secretos no en metadata cliente).
- **ADRs relacionados:**
  - [ADR-009](./adr-009-estrategia-plugins.md) — estrategia plugin pattern.
  - [ADR-017](./adr-017-audit-log-inmutable.md) — audit log inmutable.
  - [ADR-021](./adr-021-provisioners.md) — interface mínima provisioners.
  - [ADR-067](./adr-067-granularidad-casl-rol-staff.md) — CASL granularidad.
  - [ADR-070](./adr-070-service-info-sso-acciones-curadas.md) — `getServiceInfo` / `getSsoUrl` / `executeAction`.
  - [ADR-077](./adr-077-contrato-provisioner-plugin-v2.md) — contrato canónico congelado.
  - [ADR-078](./adr-078-auth-server-side-cookies-httponly.md) — Server Actions con cookies httpOnly Modelo A.
- **Glosario:** [Plugin](../00-foundations/glossary.md), [Provisioner](../00-foundations/glossary.md), [Plugin Manifest] (a añadir en Fase K), [Secret Vault] (a añadir en Fase K), [Circuit Breaker] (a añadir en Fase K).
- **Sprints:**
  - **Sprint 15A (P2.2)** — implementación canónica de este ADR.
  - Sprint 15D / 15C / 15E / 15B (futuro) — consumen el framework.
  - Sprint 12 (P2.7) — hereda la página `/admin/settings/plugins` y añade categorías encima.
  - Sprint 12.5 (P2.8) — usa `manifest.secretsSchema` para portal RGPD declaración de credenciales del proveedor.
