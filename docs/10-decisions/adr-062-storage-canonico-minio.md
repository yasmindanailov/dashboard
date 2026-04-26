# ADR-062 — Storage canónico: MinIO + `@aws-sdk/client-s3` + key-based `pdf_url`

> **Status:** Active
> **Date:** 2026-04-26
> **Domain:** infrastructure, billing, cross-cutting

---

## Contexto

[ADR-043](./adr-043-infraestructura-self-hosted.md) declaró MinIO como componente del stack self-hosted: *"MinIO en Docker (S3-compatible) — Storage para PDFs, logos, assets"*. Pero no fijaba **el cliente concreto**, **la convención de naming de keys**, ni **el patrón de descarga** (proxy del backend vs. signed URL).

Tres consumidores reales esperan storage:

1. **Sprint 11.5 (este sprint):** `InvoicePdfService` genera PDFs y hoy los devuelve en cada request — re-generación ineficiente, sin persistencia. La columna `Invoice.pdf_url` existe en Prisma (`varchar(1000)`, NULLABLE) pero está sin uso real.
2. **Sprint 7.7 (bloqueado):** adjuntos en chat (`messages.attachments` jsonb).
3. **Sprint 7.6.3 (bloqueado):** adjuntos en tickets (mismo campo).

Adicionalmente, [ADR-058](./adr-058-integracion-landing.md) y futuros plugins (Stripe receipts, ResellerClub assets) podrían necesitar storage.

Sin un patrón canónico, cada consumidor reinventaría: cliente diferente, naming inconsistente, descarga acoplada al proceso del backend (memoria, ancho de banda).

---

## Opciones consideradas

### Cliente

1. **`minio` (paquete oficial)**
   - Pros: API simple específica para MinIO; zero overhead.
   - Contras: lock-in con MinIO; migrar a S3/R2/Wasabi exige reescribir consumos.
2. **`@aws-sdk/client-s3` v3 modular** ✅ elegido
   - Pros: estándar de industria; funciona contra **cualquier S3-compatible** (MinIO, AWS S3, Cloudflare R2, Wasabi); presigner oficial; tree-shakeable.
   - Contras: API más verbosa, peso ~600 KB; curva inicial.
3. **`@google-cloud/storage` o equivalente**
   - Descartado: lock-in con GCS, no S3-compatible.

### Naming de keys

1. **UUID por objeto** (`a1b2c3d4-…`)
   - Pros: cero colisiones, oculta números secuenciales.
   - Contras: imposible inferir el contenido sin DB; debug penoso.
2. **Path semántico** (`invoices/AEL-2026-000123.pdf`) ✅ elegido
   - Pros: legible, debug trivial, idempotente (mismo invoice_number → misma key → sobrescribe limpiamente), agrupable por prefijo.
   - Contras: expone numeración. Mitigado: el bucket nunca se sirve público; sólo signed URLs con TTL.
3. **Hash del contenido**
   - Descartado: cada regeneración del PDF cambia bytes (timestamps internos de PDFKit) → keys explotando.

### Patrón de descarga

1. **Proxy del backend** (`GET /pdf` → backend lee del bucket → stream al cliente)
   - Pros: control absoluto, headers custom, autorización post-CASL trivial.
   - Contras: backend mueve los bytes (ancho de banda × clientes), no escala.
2. **302 redirect a signed URL** ✅ elegido
   - Pros: el bucket sirve directo al cliente; backend libre. Funciona idéntico contra MinIO/S3/R2.
   - Contras: la URL expira; control de acceso vía TTL (default 60 min). Pero el endpoint sigue verificando CASL antes del redirect — sin auth no se obtiene URL.

### Almacenamiento de la URL en DB

1. **`pdf_url` guarda URL completa firmada**
   - Descartado: la URL caduca, queda inválida en DB; cambio de bucket rompe.
2. **`pdf_url` guarda la S3 key** (`invoices/AEL-2026-000123.pdf`) ✅ elegido
   - Pros: portable entre buckets/providers, signed URLs se generan al vuelo.
   - Contras: el nombre de columna es ligeramente engañoso (`pdf_url` → ahora es key). Mitigado: documentado en `30-data/billing.md`.

---

## Decisión

### A. Cliente y dependencias

```bash
# backend/package.json
"@aws-sdk/client-s3": "^3.x"
"@aws-sdk/s3-request-presigner": "^3.x"
```

Ambos paquetes son ESM/CJS dual y funcionan en Node 20.

### B. Configuración por env var

```env
S3_ENDPOINT=http://localhost:9000   # MinIO en dev; vacío en prod = AWS S3
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=aelium-storage
S3_REGION=eu-west-1                 # ignorado por MinIO; obligatorio en S3
S3_FORCE_PATH_STYLE=true            # MinIO requiere path-style; AWS subdomain-style
```

### C. `StorageService` canónico

Vive en `backend/src/core/storage/storage.service.ts`. Es `@Global` (igual que `OutboxService`) — cualquier módulo de negocio lo inyecta.

```typescript
@Injectable()
export class StorageService implements OnModuleInit {
  constructor(private readonly config: ConfigService) { /* ... */ }

  // Idempotente. Llamado en boot. Loguea warning si MinIO no está, no rompe el arranque.
  async onModuleInit(): Promise<void> { await this.ensureBucket(); }

  async upload(input: UploadInput): Promise<void>
  async download(key: string): Promise<Buffer>
  async delete(key: string): Promise<void>
  async headObject(key: string): Promise<ObjectMetadata | null>
  async presignedDownloadUrl(key: string, ttlSeconds?: number): Promise<string>
}
```

### D. Convención de keys (registro vivo)

| Dominio | Patrón | Ejemplo |
|---------|--------|---------|
| Facturas | `invoices/{invoice_number}.pdf` | `invoices/AEL-2026-000123.pdf` |
| Adjuntos chat (Sprint 7.7) | `chats/{conversation_id}/{message_id}/{filename}` | `chats/uuid-conv/uuid-msg/foto.png` |
| Adjuntos tickets (Sprint 7.6.3) | `tickets/{conversation_id}/{message_id}/{filename}` | idem |
| Logos brand (Sprint 12) | `branding/logo.{ext}` | `branding/logo.svg` |
| Avatares usuario (futuro) | `avatars/{user_id}.{ext}` | `avatars/uuid.png` |

**Norma:** todo dominio nuevo añade su patrón aquí en el mismo PR.

### E. Patrón de uso desde un módulo de negocio

```typescript
// 1. Generar buffer (PDF, asset, etc.)
const buf = await this.invoicePdfService.generatePdf(invoiceId);

// 2. Subir bajo key estable
const key = `invoices/${invoice.invoice_number}.pdf`;
await this.storage.upload({ key, body: buf, contentType: 'application/pdf' });

// 3. Persistir la KEY en la columna correspondiente
await this.prisma.invoice.update({ where: { id: invoiceId }, data: { pdf_url: key } });

// 4. En el endpoint de descarga, devolver redirect a signed URL
const url = await this.storage.presignedDownloadUrl(key);
res.redirect(302, url);
```

### F. Settings configurables

| Key | Tipo | Default | Uso |
|-----|------|---------|-----|
| `storage.signed_url_expiry_minutes` | number | 60 | TTL de cada signed URL generada |
| `storage.max_upload_size_mb` | number | 10 | Límite de tamaño en uploads externos (chat, tickets) — no aplica a buffers internos del backend |

### G. Integración con `BillingInvoiceService`

`markAsPaid()` y `sendToPending()` invocan `invoicePdfService.generateAndUpload(invoiceId)` **fuera** de la `prisma.$transaction` (la transición de estado y el evento outbox son críticos; el upload es best-effort y se reintenta en la primera descarga si falla). Si la subida falla, se loguea pero no rompe el flujo de cobro.

### H. Endpoints de descarga del PDF

Dos endpoints — mismo trabajo, distinto cliente. Ambos comparten la lógica
de generar/recuperar la signed URL vía
`InvoicePdfStorageService.getSignedDownloadUrl(invoiceId)`. CASL
`can(Read, Invoice)` + ownership check se hace **antes** de generar la URL.

#### H.1 `GET /billing/invoices/:id/pdf-url` (JSON) — frontend

```
{ url: string; filename: string }
```

El frontend del dashboard hace `fetch` con `Authorization: Bearer ...`,
recibe la signed URL y descarga directo del bucket con un `<a download>`.
**No hay XHR cross-origin contra el bucket → no se necesita configurar
CORS en MinIO/S3.** Es la vía recomendada para clientes web del propio
proyecto.

#### H.2 `GET /billing/invoices/:id/pdf` (302 redirect) — externo

```
302 Location: <signed-url>
```

Para enlaces externos que ven el redirect del navegador en navegación
normal (correos transaccionales, curl, integraciones backend-a-backend).
**No usar desde `fetch` con `Authorization`**: el header se strippea en el
redirect cross-origin (correctamente, por seguridad) y el preflight CORS
del bucket fallaría sin configuración adicional.

> **Anti-patrón en tests E2E:** llamar a `request.get('/pdf', { headers:
> { Authorization }, /* sin maxRedirects:0 */ })` falla en CI con
> `400 InvalidRequest: multiple authentication types` porque Playwright
> sigue el 302 propagando el header al bucket — la signed URL ya lleva
> `X-Amz-Signature` en query y MinIO/S3 ven dos firmas. **Patrón correcto
> en tests del endpoint legacy:**
>
> ```typescript
> const r = await request.get('/pdf', {
>   headers: { Authorization: `Bearer ${token}` },
>   maxRedirects: 0,
> });
> expect(r.status()).toBe(302);
> const final = await request.get(r.headers()['location']);
> expect(final.ok()).toBeTruthy();
> ```

#### Lógica común (`getSignedDownloadUrl`)

```
si invoice.pdf_url existe:
  return storage.presignedDownloadUrl(invoice.pdf_url, opts)
si no:
  buffer = await invoicePdfService.generatePdf(invoiceId)
  await storage.upload({ key, body: buffer, contentType })
  await prisma.update({ pdf_url: key })
  return storage.presignedDownloadUrl(key, opts)
```

`opts` incluye `responseContentDisposition: 'attachment; filename="<num>.pdf"'`
y `responseContentType: 'application/pdf'` para que el bucket devuelva
los headers correctos (descarga como attachment con filename estable).

---

## Consecuencias

- ✅ **Ganamos:**
  - **Cero lock-in** entre MinIO/S3/R2 — mismo SDK, sólo cambian env vars (Sprint 14 puede mover el bucket a Cloudflare R2 sin tocar código).
  - **Backend libre** del ancho de banda de descargas — el bucket sirve directo al cliente.
  - **Idempotencia natural** — mismo `invoice_number` siempre va a la misma key; rebuild del PDF sobrescribe limpiamente.
  - **Patrón único** para los 3 consumidores próximos (PDFs + adjuntos chat + adjuntos tickets) — refactor cero al añadirlos.
- ⚠️ **Aceptamos:**
  - **Subida síncrona en `markAsPaid` y `sendToPending`** (~50–200ms) — viola R2 estricto. **Deuda controlada**: migración a BullMQ planificada en P1.1 Sprint 9 (cola dedicada `pdf-generation` con DLQ).
  - **Signed URL expira** — si un cliente deja la URL en una pestaña vieja >1h, refrescar. TTL configurable vía settings.
  - **Nombre `pdf_url`** ligeramente engañoso (guarda key, no URL completa). Renombrar a `pdf_key` exigiría migración Prisma + reescritura de consumidores externos. No vale el churn — documentado.
- 🚪 **Cierra:**
  - **No múltiples clientes S3** en el codebase — sólo `@aws-sdk/client-s3`.
  - **No proxy del backend** para descargas (excepto en endpoints con DRM o lógica adicional, que no aplica hoy).
  - **No URLs públicas permanentes** — toda descarga es signed con TTL.
  - **No naming opaco con UUID** — keys siempre semánticas.

---

## Cuándo revisar

- Cuando un consumidor **necesite proxy del backend** (ej: DRM, marca de agua dinámica, log de descargas) → ese endpoint puede convivir con el patrón general; revisar si el proxy se vuelve mayoritario.
- Cuando se introduzca **CDN** (Cloudflare delante de R2) → reevaluar TTL + cache headers.
- Cuando el volumen de adjuntos exceda **100 GB** → revisar lifecycle policies (purge después de N días para chats guest, p.ej.).
- Si MinIO se cae con frecuencia en dev → considerar fallback a filesystem local (sólo en dev).
- Cuando se implemente **encriptación de objetos sensibles** (ADR-015 alude a credenciales de plugins) → puede aplicarse SSE-C o KMS.

---

## Referencias

- **Módulos afectados:** `core/storage` (nuevo), `billing` (consumidor inmediato), `support` (consumidor futuro Sprint 7.7 y 7.6.3), `infrastructure` (operativa MinIO).
- **Reglas relacionadas:** R2 (cola — deuda asumida hoy, cierre P1.1), R7 (errores), R14 (UX errores), R12 (encriptación — no aplica al storage genérico).
- **ADRs relacionados:** [ADR-043](./adr-043-infraestructura-self-hosted.md) (declara MinIO en stack), [ADR-025](./adr-025-numeracion-secuencial-facturas.md) (`invoice_number` inmutable → key estable), [ADR-033](./adr-033-outbox-pattern-pendiente.md) (Outbox no se aplica al upload — ver Consecuencias), [ADR-058](./adr-058-integracion-landing.md) (futuros assets de landing).
- **Glosario:** [Storage](../00-foundations/glossary.md), [Bucket](../00-foundations/glossary.md), [Signed URL](../00-foundations/glossary.md).
- **Settings:** `storage.signed_url_expiry_minutes`, `storage.max_upload_size_mb` ([settings-reference.md](../50-operations/settings-reference.md#-storage-sprint-115-minio)).
- **Sprint asociado:** [Sprint 11.5 — MinIO Storage local](../60-roadmap/current.md#sprint-115).
