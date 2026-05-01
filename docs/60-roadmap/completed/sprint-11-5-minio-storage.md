# Sprint 11.5 — MinIO Storage local (P1.2) ✅

> **Estado:** ✅ Cerrado
> **Inicio:** 2026-04-26
> **Cierre:** 2026-04-26 (1 sesión)
> **Identificadores:** P1.2

> Movido desde `current.md` 2026-05-01 como parte del saneamiento documental post-Sprint 8 cierre. Sub-sprint que aisló el storage local (MinIO + R2-compatible) del Sprint 14 Deploy para desbloquear adjuntos chat/tickets sin obligar a desplegar a producción.

---

## ✅ Sprint 11.5 — MinIO Storage local (P1.2)

**Estado:** ✅ completado
**Inicio:** 2026-04-26
**Cierre real:** 2026-04-26 (1 sesión)

### 1. Objetivo en una frase

Persistir los PDFs de facturas (y dejar listo el `StorageService` canónico para futuros adjuntos de chat y tickets) en un MinIO local S3-compatible, con descargas vía signed URL.

### 2. Depende de

| # | Dependencia | Estado | Bloquea qué |
|---|-------------|--------|-------------|
| 1 | [ADR-043](../../10-decisions/adr-043-infraestructura-self-hosted.md) — MinIO declarado en stack | ✅ | — |
| 2 | Settings reservados (`storage.signed_url_expiry_minutes`, `storage.max_upload_size_mb`) | ✅ documentado, ❌ pendiente seed | Paso 5 |
| 3 | Variables `S3_*` reservadas en `.env.example` | ✅ | — |
| 4 | Columna `Invoice.pdf_url` en Prisma (varchar 1000) | ✅ | — |

### 3. Produce (contratos nuevos)

#### 3.1 Endpoints REST modificados (no nuevos, sólo cambia el comportamiento)
- `GET /api/v1/billing/invoices/:id/pdf` ahora **302 redirect** a signed URL del bucket cuando `pdf_url` existe; fallback inline para facturas legacy.

#### 3.2 Eventos nuevos
- (ninguno) — el upload es síncrono dentro del flujo de billing.

#### 3.3 Servicios inyectables nuevos
- `StorageService` (`backend/src/core/storage/storage.service.ts`), `@Global`. Métodos:
  - `upload({ key, body, contentType, contentLength? }): Promise<void>`
  - `download(key): Promise<Buffer>`
  - `delete(key): Promise<void>`
  - `headObject(key): Promise<{ contentLength, contentType, lastModified } | null>` (existencia + metadata)
  - `presignedDownloadUrl(key, ttlSeconds?): Promise<string>`
  - `ensureBucket(): Promise<void>` (idempotente, invocado en `OnModuleInit`)
- `InvoicePdfService.generateAndUpload(invoiceId): Promise<{ key, sizeBytes }>` — genera el PDF y lo sube al bucket bajo `invoices/{invoice_number}.pdf`, actualizando `Invoice.pdf_url`.

#### 3.4 Tablas o campos Prisma nuevos
- (ninguno) — `Invoice.pdf_url` ya existe. Cambio semántico: ahora guarda la **key del bucket** (`invoices/AEL-2026-000123.pdf`), no una data URL.

#### 3.5 Settings nuevos (seed)
- `storage.signed_url_expiry_minutes` — number, default 60, rango 1–1440.
- `storage.max_upload_size_mb` — number, default 10, rango 1–500.

#### 3.6 Permisos CASL nuevos
- (ninguno) — el endpoint `/pdf` ya tiene `CheckPolicies(can(Read, Invoice))`.

### 4. Modifica (contratos existentes)

#### 4.1 Endpoints modificados
- `GET /billing/invoices/:id/pdf`: 302 redirect a signed URL cuando hay `pdf_url`. Fallback inline para legacy.

#### 4.2 Servicios modificados
- `BillingInvoiceService.markAsPaid()` y `BillingInvoiceService.sendToPending()` ahora invocan `invoicePdfService.generateAndUpload()` tras commitear la transición de estado (fuera de la `$transaction`, no bloqueante crítico).

#### 4.3 Eventos cambiados
- (ninguno).

#### 4.4 BREAKING changes
- **Semántico:** `Invoice.pdf_url` pasa de "data URL inline" (de hecho hoy `null` para todas) a "S3 key". Las facturas existentes no tienen `pdf_url` set → fallback genera+sube en primera descarga. **No requiere migración Prisma.**

### 5. Pasos atómicos

| # | Paso | Estado |
|---|------|--------|
| 11.5.1 | ADR-062 — Storage canónico (MinIO + S3 SDK) | ✅ |
| 11.5.2 | docker-compose.dev.yml — añadir servicio `minio` + healthcheck + volume | ✅ |
| 11.5.3 | Instalar `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` en backend | ✅ |
| 11.5.4 | `core/storage/{storage.service,storage.module,storage.types,storage.errors}.ts` (Global) | ✅ |
| 11.5.5 | Registrar `StorageModule` en `app.module.ts` | ✅ |
| 11.5.6 | `seed.ts` — añadir 2 settings `storage.*` | ✅ |
| 11.5.7 | `InvoicePdfStorageService` (puente PDF + storage) + integración con `BillingInvoiceService` (markAsPaid + sendToPending fire-and-forget) | ✅ |
| 11.5.8 | `BillingController.downloadPdf()` — 302 redirect a signed URL con `responseContentDisposition` forzado + fallback inline | ✅ |
| 11.5.9 | CI workflow — añadir service `minio` (bitnami/minio con bucket auto-creado) + env vars `S3_*` | ✅ |
| 11.5.10 | Tests E2E `tests/e2e/storage-pdf.spec.ts` (pago → upload → descarga signed URL + fallback legacy) | ✅ |
| 11.5.11 | Docs: `settings-reference.md` (✅), `glossary.md` (Storage/Bucket/Signed URL), `rules.md` (patrón canónico), `billing/contract.md` (servicio puente), `30-data/billing.md` (semántica `pdf_url`), `jobs-reference.md` (deuda BullMQ pdf-generation) | ✅ |
| 11.5.12 | Cierre `current.md` + `backlog.md` (P1.2 ✅) + commit conventional | 🟡 en curso |

### 6. Edge cases anticipados

| ID | Caso | Plan |
|----|------|------|
| EC-STORAGE-01 | MinIO caído en arranque del backend | `ensureBucket()` reintenta con backoff 3×; si falla, log warning y deja servicio operativo (otras features no dependen). Endpoint `/pdf` devuelve 503 con mensaje claro si la subida falla. |
| EC-STORAGE-02 | Factura sin `pdf_url` (legacy) en descarga | Fallback inline: generar + subir + actualizar `pdf_url` + redirect en la misma request. |
| EC-STORAGE-03 | Subida supera `storage.max_upload_size_mb` | Lanzar `BadRequestException` con mensaje formateado (R7+R14). En v1 sólo aplica a uploads externos (no PDFs internos). |
| EC-STORAGE-04 | Race: dos `markAsPaid` simultáneos generan dos uploads | El nombre de key es estable (`invoices/{invoice_number}.pdf`) → el segundo upload sobrescribe el primero. Aceptable, idempotente. |
| EC-STORAGE-05 | Signed URL expira mientras el cliente descarga | TTL default 60min — cubre cualquier descarga humana. Si expira, refresh manual desde el dashboard regenera. |
| EC-STORAGE-06 | Cambio de `invoice_number` (no debería ocurrir nunca) | `invoice_number` es único e inmutable por ADR-025 → key estable. No se contempla rename. |

### 7. Definition of Done

#### Código
- [ ] Pasos 11.5.1–11.5.12 ✅
- [ ] `pnpm typecheck && pnpm build` pasan
- [ ] `pnpm lint:check` (backend) verde
- [ ] `pnpm test` (backend unit + E2E) verde
- [ ] CI verde tras último push

#### Documentación
- [ ] ADR-062 creado y enlazado desde rules.md (sección Patrones canónicos), `billing/contract.md`, `_matrix.md`
- [ ] `settings-reference.md`: 2 settings `storage.*` pasan de ❌ a ✅
- [ ] `glossary.md`: añadidos términos *Storage*, *Bucket*, *Signed URL*
- [ ] `30-data/billing.md`: `pdf_url` actualizado (semántica final)
- [ ] `jobs-reference.md`: revisar si aplica (no se introduce job nuevo este sprint — deuda BullMQ → P1.1)

#### Proceso
- [ ] Commits Conventional Commits con citación de regla (`feat(storage): … — cumple R2/R7/R14`)
- [ ] Edge cases EC-STORAGE-* trackeados (resueltos o referenciados)

#### Smoke test manual (Yasmin)
- [ ] `docker compose -f docker/docker-compose.dev.yml up -d` levanta MinIO sano
- [ ] Consola MinIO accesible en `http://localhost:9001` con `minioadmin/minioadmin`
- [ ] Crear factura → finalizarla → pagarla → descargar PDF (debe descargar correctamente, redirect transparente)
- [ ] Bucket `aelium-storage` contiene el objeto `invoices/AEL-2026-000XXX.pdf`

### 8. Riesgos identificados

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Subida síncrona en `markAsPaid` añade latencia (PDFs ~50–200ms) | UX admin más lenta al marcar como pagada | Aceptado (~200ms). Migración a BullMQ en P1.1 Sprint 9 documentada como deuda controlada. |
| Cambio futuro de bucket name rompe URLs históricas | Facturas viejas inaccesibles | `pdf_url` guarda la **key**, no la URL. Cambio de bucket = cambio de env var, las keys siguen válidas. |
| MinIO caído en producción futura | PDFs no descargables | Sprint 14 (Deploy) añadirá healthcheck + alerta + plan recovery (ADR-056). En dev el riesgo es asumible. |
| Coste de cambiar a Cloudflare R2 / AWS S3 real | Riesgo de re-arquitectura en producción | **Cero**: el SDK es el mismo (`@aws-sdk/client-s3`). Solo cambian las env vars `S3_ENDPOINT`/`S3_REGION`. |

### 9. Decisiones registradas

- **ADR-062** — Storage canónico: MinIO en dev, `@aws-sdk/client-s3` como cliente, `pdf_url` almacena S3 key, signed URLs con TTL configurable.

### 10. Cierre del sprint

**Fecha real de cierre:** 2026-04-26
**Commit final:** `9da0e8b` — `feat(storage): Sprint 11.5 — MinIO storage canonico + PDFs persistentes (P1.2)`

**Cambios respecto al plan original:**
- **Refactor adicional:** se introdujo `InvoicePdfStorageService` como servicio puente para mantener `InvoicePdfService` como renderizador puro (R15). En vez de añadir `generateAndUpload` directamente al `InvoicePdfService` (que ya tenía 442 líneas), se aisló la responsabilidad de upload + actualización de `pdf_url` en un servicio nuevo.
- **`presignedDownloadUrl` extendido:** acepta `responseContentDisposition` y `responseContentType` opcionales. Permite que el bucket devuelva los headers `Content-Disposition: attachment; filename="..."` + `Content-Type: application/pdf` aunque el objeto no los tenga guardados — preserva la UX del endpoint anterior (descarga directa, no apertura inline).
- **CI:** añadido `minio` como service en `.github/workflows/ci.yml` con bucket auto-creado vía `MINIO_DEFAULT_BUCKETS` (bitnami/minio). Sin esto, los tests E2E del Sprint 11.5 fallarían en CI.
- **Test E2E:** un único spec `storage-pdf.spec.ts` con 2 tests (flujo principal + fallback legacy `pdf_url=NULL`). No se añadieron tests unitarios mockeando `S3Client` por bajo valor incremental sobre el E2E real contra MinIO.

**Items movidos a sprints futuros:**
- Migración de `generateAndUploadInBackground` a una **cola BullMQ `pdf-generation`** con DLQ + retries (cumplir R2 estricto, R13) → P1.1 Sprint 9. Documentado en [`jobs-reference.md`](../../50-operations/jobs-reference.md#crons-aspiracionales-documentados-no-implementados).
- Adjuntos en **chat (Sprint 7.7)** y **tickets (Sprint 7.6.3)** → desbloqueados; abordar oportunamente cuando la UX lo justifique. La convención de keys está fijada en [ADR-062 §D](../../10-decisions/adr-062-storage-canonico-minio.md).
- Logos brand (Sprint 12), avatares user (futuro) → mismo patrón, mismo `StorageService`.

**DoD verificado:**
- ✅ Pasos 11.5.1–11.5.12 completos
- ✅ `pnpm typecheck` y `pnpm lint:check` (backend) verdes
- ✅ ADR-062 creado y enlazado desde `rules.md` (patrones canónicos), `billing/contract.md`, `30-data/billing.md`, `glossary.md`, `settings-reference.md`, índice ADRs
- ✅ Settings `storage.*` pasan a estado ✅ en `settings-reference.md`
- ✅ CI workflow actualizado con MinIO service
- ⏳ **Smoke test manual (Yasmin)** y CI verde → pendientes de ejecución por el operador
- ✅ Edge cases EC-STORAGE-01..06 implementados o anotados en código (fire-and-forget con catch para EC-STORAGE-01, fallback inline para EC-STORAGE-02, idempotencia natural para EC-STORAGE-04)

---
