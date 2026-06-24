# ADR-044 — Configuración global extensa (settings) por secciones

> **Status:** Active (implementado parcialmente — Sprint 12: backend CRUD + marca/logo + consumidores; ver Amendment A1)
> **Date:** 2026-04 (decisión inicial) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §17
> **Domain:** cross-cutting

---

## Contexto

Aelium tiene **muchas variables de negocio configurables**: días de antelación de facturación, número de reintentos de cobro, márgenes de seguridad por servidor, plantillas de notificación, plantilla de PDF de facturas, claves API de plugins, etc.

Las opciones eran:

- **Variables de entorno (.env)** → cómodo para devs, inviable para que el admin cambie días de antelación sin redeploy.
- **Constants en código** → cualquier ajuste = cambio de código + deploy.
- **Tabla `settings` en DB con UI** → el admin controla todo desde el dashboard, sin pedir a devs.

Las dos primeras opciones encajan para secrets puros (claves criptográficas, JWT secrets), pero no para reglas de negocio que el admin ajusta según la operativa.

Hace falta una **página de configuración del superadmin** organizada por secciones, donde toda la lógica de negocio configurable vive.

---

## Decisión

### Página de configuración (solo superadmin)

Una página `/dashboard/settings` accesible solo para `superadmin`. Toda la lógica de negocio configurable vive aquí, organizada por **secciones temáticas**:

```
FACTURACIÓN
  Días de antelación para generar factura de renovación        → billing.invoice_advance_days
  Número máximo de reintentos de cobro fallido                 → billing.payment_retry_max
  Días entre reintentos                                        → billing.payment_retry_interval_days
  Días de margen antes de suspender por impago                 → billing.grace_period_days
  Días hasta cancelación tras suspensión                       → billing.cancellation_after_suspension_days
  Días de retención de datos del servicio tras suspensión      → billing.data_retention_after_suspension_days
  Formato de numeración de facturas (prefijo · sufijo · vars)  → billing.invoice_number_format
  Configuración fiscal (IVA · tipo de autónomo/empresa)        → billing.tax_config

INFRAESTRUCTURA
  Margen de seguridad por tipo de recurso (RAM · CPU · Disco)  → infra.safety_margin_*

SOPORTE Y TAREAS
  Días de alerta antes de fin de mes (tareas críticas)         → support.maintenance_critical_threshold_days

NOTIFICACIONES
  Activar/desactivar cada evento por canal                     → notifications.enabled_*
  Editar plantillas de email con variables                     → notifications.templates.*
  Configurar canales activos                                   → notifications.channels.*

PLUGINS
  Activar/desactivar plugins                                   → plugins.enabled_*
  Configurar cada plugin activo (API keys · modo test/prod)    → plugins.config.*

MARCA
  Logo · colores · datos de empresa para facturas              → branding.*
  Plantilla PDF de facturas                                    → branding.invoice_pdf_template

USUARIOS Y ROLES
  Gestión de agentes (crear · editar · desactivar)             → (no setting — entidad separada)
  Asignación de roles
```

### Modelo de datos

Tabla `settings`:
- `key` (string, único, kebab-case con prefijo de sección, ej: `billing.invoice_advance_days`).
- `value` (jsonb — flexible para int, string, bool, arrays, objetos).
- `description` (texto interno para el admin — qué controla esto).
- `updated_at`, `updated_by`.

### Caching

Settings se leen frecuentemente (en cada cron, en cada request de billing, etc.). Para evitar hits constantes a la DB:

- **Cache Redis con TTL 1 minuto** (ADR-007).
- **Invalidación inmediata** al editar desde la UI (no esperar al TTL).
- Lectura típica: `SettingsService.get('billing.invoice_advance_days')` → cache hit ~99%.

### Validación

Cada setting tiene **schema de validación** (zod o equivalente) — no se permite guardar valores incoherentes:
- Tipos: int, string, bool, enum, etc.
- Rangos: `payment_retry_max ≥ 0`, `safety_margin_* entre 50 y 100`, etc.
- Defaults: si la fila no existe en la tabla, usar default hardcoded.

### Settings no editables vs editables

- **No editables (env vars):** secrets criptográficos (`JWT_SECRET`, `ENCRYPTION_KEY`, `SENTRY_DSN`, `DATABASE_URL`).
- **Editables (tabla settings):** reglas de negocio, plantillas, márgenes, configuración de plugins (no las claves — solo activación).
- **Mixto:** `plugins.config.stripe.api_key` → guardado en tabla pero **encriptado** con AES-256-GCM (ADR-015) ya que es credencial.

### Auditoría

Todo cambio de setting genera entrada en `audit_change_log` (R3, ADR-017): qué key cambió, valor anterior, valor nuevo, quién, cuándo. Las settings inmutables del `audit_log` aplican aquí también.

---

## Consecuencias

- ✅ **Ganamos:**
  - El admin ajusta la operativa sin pedir cambios técnicos ni deploy.
  - Cambios visibles inmediatamente (cache invalida al guardar).
  - Toda configuración de negocio en **un único lugar predecible**.
  - Auditoría completa de cambios de configuración.
- ⚠️ **Aceptamos:**
  - Riesgo de admin confuso → settings mal configurados rompen la operativa (ej: `payment_retry_max = 0` desactiva todos los reintentos). Mitigación: validación + descripción clara + valores recomendados visibles.
  - Cache puede servir setting stale durante hasta 1 minuto si la invalidación falla. Mitigación: invalidación se ejecuta en la misma request de UPDATE — fallo aquí es excepcional.
  - Crece la responsabilidad del superadmin — necesita conocer qué settings existen y qué rompen. Mitigación: documentación viva en `docs/50-operations/settings-reference.md` (futuro F5).
- 🚪 **Cierra:**
  - **No constants de negocio en código.** Si algo se ajusta operativamente, vive en settings.
  - **No editar settings en producción sin confirmación.** UI con confirm explícito para los críticos (numeración de facturas, períodos de gracia).

---

## Cuándo revisar

- Cuando la cantidad de settings supere lo manejable visualmente (>50) → considerar agruparlos en sub-páginas o introducir búsqueda.
- Si el admin se equivoca cambiando settings → considerar **versionado de configuración** (rollback al valor previo).
- Si surge necesidad multi-tenant (Aelium B vendiendo el dashboard a otra empresa) → settings dejan de ser globales y necesitan scoping. Hoy: monoinquilino, no aplica.

---

## Referencias

- **Módulos afectados:** todos los que tienen reglas configurables (billing, infrastructure, notifications, support, tasks, partner). Productor: módulo `settings` (no existe aún — stub).
- **Reglas relacionadas:** R3 (audit log inmutable — cambios de settings), R12 (encriptación de credenciales — claves de plugins).
- **ADRs relacionados:** ADR-007 (observabilidad — settings cacheados), ADR-015 (encriptación), ADR-017 (audit log), ADR-031 (payment providers — config de plugins), ADR-042 (notifications — plantillas).
- **Glosario:** [Setting](../00-foundations/glossary.md), [Plugin](../00-foundations/glossary.md).
- **Implementación:** módulo `admin-settings` (CRUD admin) + catálogo `core/settings/settings-catalog.ts` (Sprint 12, Amendment A1). Contrato del módulo: [`docs/20-modules/settings/contract.md`](../20-modules/settings/contract.md). Catálogo de settings seedeados: [`docs/50-operations/settings-reference.md`](../50-operations/settings-reference.md).

---

## Amendment A1 (2026-06-24) — Implementación Sprint 12 (backend CRUD + marca/logo)

Primera materialización del ADR. Decisiones de implementación:

- **Catálogo como fuente de verdad** (`backend/src/core/settings/settings-catalog.ts`): un único catálogo tipado declara QUÉ settings son editables por el superadmin desde `/admin/settings` y CÓMO se validan (tipo + rango/enum/longitud). El backend valida contra él antes de persistir; el frontend lo consume vía `GET /admin/settings` para pintar el formulario tipado por sección. Los settings NO catalogados (`auth.*`, `jobs.*`, `storage.*`, `audit.*`, secrets) NO se exponen al PATCH admin — operativos/sensibles, sólo seed/código.
- **Validación propia, sin dependencia nueva** (NO se añadió zod, no estaba en deps): `coerceAndValidateSetting` cubre `string`/`number`/`boolean`/`enum`/`color`/`string[]` con coerción + límites; en error → `BadRequestException` con mensaje humano.
- **Almacenamiento CRUDO = canónico (y corrección de bug).** `settings.value` guarda el valor crudo (el shape que lee `SettingsService.get/getNumber/getBoolean/getJson`). Se documenta y corrige una convención muerta paralela: `billing-calculator.getSettingValue` e `invoice-pdf.getCompanyInfo` leían `(value as {value}).value` (envoltorio) → siempre `undefined` → siempre caían al default (p.ej. el prefijo de factura era 'AELIUM', ignorando el `invoice_prefix='AEL'` seedeado). Sprint 12 rutea esos consumidores por `SettingsService`.
- **CRUD admin** = `GET /admin/settings` (agrupado por sección + valor actual) + `PATCH /admin/settings/:category/:key`. Triple-guard superadmin (`JwtAuthGuard + AdminOnlyGuard + PoliciesGuard` sobre `Subject.Setting`, ADR-067). Cada cambio audita en `audit_change_log` (R3, `entity_type='Setting'`) e invalida la caché de `SettingsService` en la misma operación. **Cierra el gap MEDIUM-2 de la auditoría 2026-06-21** (cambios de setting sin validar ni auditar).
- **Esquema canónico de marca `branding.*`** (`company_name/email/nif/address/city/postal_code/country`, `primary_color`, `logo_key`). Sustituye a los `general.company_*` huérfanos (sin consumidor — retirados del seed) y al `category:'company'` que el PDF leía sin éxito. La factura PDF (`invoice-pdf.service`) lee `branding.*` y renderiza el logo + el color primario.
- **Logo en MinIO** (ADR-062; `branding.logo_key` es un setting `managed` → el PATCH genérico lo rechaza): `POST /admin/settings/branding/logo` (multipart, **PNG/JPG** — los formatos que PDFKit incrusta; valida tamaño vs `storage.max_upload_size_mb`; borra el anterior best-effort) + `GET /admin/settings/branding/logo` (URL firmada para el preview).
- **`billing.payment_due_days` activado**: estaba seedeado pero inerte; `createInvoice` deriva `due_date` de él cuando el DTO no la fija (`due_date` pasa a opcional).
- **Sección Facturación completa (fix del bug raíz)**: `BillingCalculatorService.getSettingValue` leía el mismo envoltorio `{value}` muerto → **todo el ciclo de vida de impago estaba de facto hardcodeado** a sus defaults. Corregido (lee crudo) + seedeadas + catalogadas las **6 keys reales** que el código consume: `default_tax_rate` (IVA — movido del huérfano `general.*` a su categoría real `billing.*`), `invoice_generation_days` (antelación de la factura de renovación), `max_payment_retries`, `retry_interval_days`, `suspension_days` (margen antes de suspender) y `cancellation_days` (suspensión → cancelación). Ahora son editables y se honran de verdad en `billing-lifecycle.worker` / `service-lifecycle.worker`. *(Los nombres ADR-044 `invoice_advance_days`/`grace_period_days`/… eran aspiracionales y no coincidían con el código; canónicos = las keys reales.)*

### Diferido (follow-ups conscientes)
- **Fiscal rico (`tax_config`)**: IRPF / autónomo vs empresa / recargo de equivalencia — requiere cambiar el modelo de cálculo (`billing-calculator` aplica hoy un único % de IVA). v1 expone el IVA por defecto editable.
- **Formato de numeración** más allá del prefijo: la integridad legal (sin saltos, ADR-025) hace arriesgado un template configurable; sólo el prefijo es editable.
- **`data_retention_after_suspension_days`**: sin consumidor en código → no se cataloga (no se crean settings muertos).
- **Branding en el footer de los emails**: el render de notificaciones (Handlebars por-plantilla) no tiene layout/footer común → inyectarlo tocaría el hot path de notificaciones. Diferido.
- **Logo vectorial (SVG/WEBP)** en el PDF: PDFKit sólo incrusta PNG/JPG.
- **Subida del logo como job persistente** + validación de imagen más rica (dimensiones): v-next.
- **Secciones no catalogadas** (infra margins sin seed, fiscal `tax_config`, plantilla PDF) siguen vía seed/código hasta que se categuen.
- **Knowledge Base** (parte original del Sprint 12) **diferido** por decisión de Yasmin (2026-06-24).
