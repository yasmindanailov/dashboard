# Sprint 12 — Settings (configuración global) · KB diferido

> **Estado:** 🟢 **Settings CÓDIGO-COMPLETO + verde** — **cierre formal CONDICIONADO al smoke manual de Yasmin + merge**. NO movido a `completed/` hasta el cierre real (convención del roadmap).
> **Alcance (decisión Yasmin 2026-06-24):** esta ronda = **Settings**; **Knowledge Base diferido**. Logo de marca = subida real a MinIO.
> **Rama:** `sprint12-settings` (6 commits desde master `9003c51`). **Doctrina:** [ADR-044](../10-decisions/adr-044-settings-extensos.md) + **Amendment A1**. **Contrato:** [`docs/20-modules/settings/contract.md`](../20-modules/settings/contract.md).
> **Trazabilidad por fase:** [`current.md` §Sprint 12](./current.md) (tabla 12.A–12.E) — métricas y commits por fila.

---

## Resumen ejecutivo

Materializa [ADR-044](../10-decisions/adr-044-settings-extensos.md) (planificado para este sprint, hasta hoy un stub): la configuración global de negocio pasa de "vive en la tabla `settings` pero no es editable" a **editable por el superadmin desde `/admin/settings`, con validación + auditoría (R3), y consumida de verdad**. Cierra el gap **MEDIUM-2** de la [auditoría 2026-06-21](../90-meta/audit-2026-06-21.md) (cambios de setting sin validar ni auditar).

El hallazgo técnico que vertebró el sprint: **un bug `{value}` muerto** que hacía que media configuración fuera decorativa. Dos lectores paralelos (`invoice-pdf.getCompanyInfo` y `BillingCalculatorService.getSettingValue`) leían `(value as {value}).value` — un envoltorio que **nunca existió** en la tabla (el seed y `SettingsService` guardan/leen el valor **crudo**). Resultado: siempre `undefined` → siempre el default. Así, aunque editaras el prefijo de factura, el IVA o los períodos de impago, **el código los ignoraba**. Sprint 12 lo corrige en la raíz y rutea esos consumidores por el lector canónico.

Lo entregado por fases:

- **12.A — CRUD admin + validación + auditoría.** Catálogo tipado `core/settings/settings-catalog.ts` (única fuente de QUÉ es editable + CÓMO se valida; validador propio, sin añadir `zod`) + módulo `admin-settings` (`GET /admin/settings` agrupado · `PATCH /:category/:key` → valida contra el catálogo → upsert **crudo** → audita R3 (`entity_type='Setting'`) → invalida la caché de `SettingsService`). Triple-guard superadmin (`Subject.Setting`, ADR-067). DTO con `@Allow()` para el `value` polimórfico.
- **12.B — Marca (logo MinIO) + consumidores.** Esquema canónico `branding.*` (datos de empresa + `primary_color` + `logo_key`) que sustituye a los `general.company_*` huérfanos y al `category:'company'` que el PDF leía sin éxito. Subida de logo a MinIO (`POST/GET /admin/settings/branding/logo`, **PNG/JPG** — los formatos que PDFKit incrusta; `logo_key` es `managed` → el PATCH genérico lo rechaza; reusa `StorageService`). La **factura PDF** lee `branding.*` (crudo) y renderiza el logo (fail-soft) + el color de marca. `billing.payment_due_days` activado (→ `due_date` en `createInvoice`).
- **12.C — Hub frontend.** `/admin/settings` reemplaza el redirect a /plugins por el hub real (sólo superadmin vía `requireRole`): forms por sección dirigidos por la metadata del catálogo (con detección de cambios) + `LogoUploader` (subida multipart vía Server Action — `serverFetch` sólo maneja JSON → `fetch` directo con `readAccessToken`). Patrón coherente con plugins.
- **12.D — Cierre doc.** ADR-044 Amendment A1 + `settings/contract.md` (SET-INV-1..4) + `settings-reference.md` + roadmap.
- **Hub links.** El hub enlaza también **Plantillas de notificaciones** (`/admin/notifications/templates`) y **Registro de errores** (`/admin/error-log`) — ADR-044 lo concibe como la puerta a TODA la configuración, no sólo plugins.
- **12.E — Facturación/Fiscal real (fix del bug raíz).** `BillingCalculatorService.getSettingValue` lee ahora el valor **crudo** → el ciclo de vida de impago deja de estar hardcodeado. Seed + catálogo (grupo Facturación) de las **6 keys reales** que el código consume: `default_tax_rate` (IVA — movido del huérfano `general.*` a su categoría real `billing.*`), `invoice_generation_days` (antelación de la factura de renovación), `max_payment_retries`, `retry_interval_days`, `suspension_days` (margen→suspensión), `cancellation_days` (suspensión→cancelación). Consumidores reales: `billing-lifecycle.worker`, `service-lifecycle.worker`, `billing-calculator`, `billing-invoice`.

---

## Decisiones (Yasmin)

1. **Siguiente paso = Sprint 12** (frente a Stripe / Infra / deuda MEDIUM): tras verificar que 15D.II + hardening/ADR-029 ya estaban en master.
2. **KB diferido**, "para más adelante". Esta ronda = Settings.
3. **Logo = subida real a MinIO** (no URL).
4. **Hub como puerta a toda la config** (respuesta a "¿no falta nada?"): enlazar plantillas de notificaciones + error-log.
5. **Facturación/Fiscal completa** con consumidores backend reales (respuesta a "sé empírico, robusto").

---

## Métricas finales

| Métrica | Valor |
|---|---|
| Fases | 12.A + 12.B + 12.C + 12.D + hub-links + 12.E |
| Commits | **6** en `sprint12-settings` (`29d2b5a` · `a3672e5` · `14629cb` · `cf8ffca` · `ff4ee14` · `f2b01d8`) |
| Cobertura unit final | **89 suites · 1248 passed + 12 skipped** (+24 vs baseline `9003c51` `1224`) |
| Boot smoke | **4/4 plugins** (módulo nuevo `AdminSettingsModule` + dev watch recompila limpio) |
| Settings editables nuevos | `branding.*` (9) + `billing.*` ciclo de vida (6) + general/support/notifications/DNS catalogados |
| Doc | ADR-044 Amendment A1 · `settings/contract.md` (nuevo) · `settings-reference.md` · `current.md`/`backlog.md` |
| Endpoints nuevos | `GET /admin/settings` · `PATCH /admin/settings/:category/:key` · `GET`/`POST /admin/settings/branding/logo` |

---

## Lecciones heredables (L28–L30)

Continúa la numeración de 15D.II (terminó en L27).

- **L28 — un setting "que existe" puede estar muerto.** Tener la fila seedeada + un consumidor no garantiza que se honre: dos lectores (`invoice-pdf`, `billing-calculator`) leían un envoltorio `{value}` inexistente → siempre el default. El canónico es **crudo** (`SettingsService.get/getNumber/...`). Al tocar settings, **verificar empíricamente** que el consumidor lee el shape correcto, no asumir por la presencia del seed. (Sprint 12.B/12.E.)
- **L29 — catalogar sólo lo que existe + se consume.** El catálogo es la fuente de verdad de la UI; un campo editable sin consumidor backend es una mentira para el admin. Por eso quedaron fuera `data_retention_after_suspension_days` (sin consumidor) y el `tax_config` rico (requiere modelo de cálculo). Los nombres de ADR-044 (`invoice_advance_days`/`grace_period_days`/…) eran **aspiracionales** y NO coincidían con las keys reales del código (`invoice_generation_days`/`suspension_days`/…) — los canónicos son los del código.
- **L30 — el almacenamiento crudo + validación-por-catálogo desacopla back y front.** El mismo catálogo valida en el backend (antes de persistir) y pinta el formulario tipado en el frontend (vía `GET /admin/settings`). Un solo sitio donde declarar tipo/rango/editable; el front no replica reglas. La auditoría R3 + la invalidación de caché van en el punto único de escritura (`persist`).

---

## Diferido (consciente, documentado)

- **Knowledge Base** — decisión Yasmin (fase original del Sprint 12).
- **Branding en el footer de los emails** — el render de notificaciones (Handlebars por-plantilla) no tiene layout/footer común → tocaría el hot path.
- **Logo vectorial (SVG/WEBP)** en el PDF — PDFKit sólo incrusta PNG/JPG.
- **Fiscal rico (`tax_config`)** — IRPF / autónomo vs empresa / recargo de equivalencia → requiere cambiar el modelo de cálculo (`billing-calculator` aplica hoy un único % de IVA).
- **Formato de numeración** más allá del prefijo — integridad legal sin saltos (ADR-025) lo hace arriesgado como template configurable.
- **Secciones no catalogadas** — infra margins (sin seed, van con Sprint 10), plantilla PDF.
- **Subida de logo como job persistente** + validación de imagen (dimensiones) — v-next.

---

## Commits

- **12.A** `29d2b5a` — CRUD admin + catálogo + validación + audit.
- **12.B** `a3672e5` — editor de marca (logo MinIO) + branding.* en facturas + fix `{value}` en PDF/prefijo.
- **12.C** `14629cb` — hub admin + editor de marca con logo.
- **12.D** `cf8ffca` — cierre doc (ADR-044 A1 + contract + reference + roadmap).
- **hub links** `ff4ee14` — enlaces a plantillas de notif + error-log.
- **12.E** `f2b01d8` — sección Facturación/Fiscal real (fix raíz `getSettingValue` + 6 keys del ciclo de vida).

---

## DoD del Sprint 12 (Settings)

- [x] `pnpm --dir backend typecheck` + `lint:check` verdes.
- [x] `pnpm --dir backend test` — **1248 unit + 12 skipped · 89 suites**.
- [x] Boot smoke **4/4 plugins** (módulo nuevo + dev watch recompila limpio).
- [x] `pnpm --dir frontend typecheck` + `lint:check` (`--max-warnings=0`) verdes.
- [x] Doc al día: ADR-044 A1 + `settings/contract.md` + `settings-reference.md` + roadmap + memoria.
- [ ] **Smoke manual (Yasmin):** editar un setting → persiste + entrada en `audit_change_log`; subir logo → se ve en el PDF de una factura; valor inválido → rechazado; rol no-superadmin → 403.
- [ ] **Merge** del PR.

---

## Gate de cierre pendiente (qué falta para `completed/`)

1. **Smoke manual** de Yasmin en el dashboard (ver DoD). *(Nota: los settings nuevos salen vacíos hasta el primer guardado o un `pnpm --dir backend seed` idempotente — los consumidores caen al default mientras tanto.)*
2. Merge del PR → mover este doc a `completed/sprint-12-settings.md` + actualizar `current.md`/`backlog.md`.
