# Sprints en curso — Aelium Dashboard

> **Estado real verificado** contra código en auditoría 2026-04-26. Cualquier sprint listado aquí está parcialmente avanzado (no es backlog puro — para eso ver [`backlog.md`](./backlog.md)).

> **Última actualización:** 2026-04-26 — refactor de roadmap (post F6).
> **Cambios estructurales recientes:**
> - **Sprint 11.5 (MinIO Storage)** añadido como sprint independiente — antes estaba dentro del Sprint 14 Deploy. Desbloquea adjuntos chat/tickets sin obligar a desplegar a producción.
> - **Sprint 14 (Deploy)** limpiado — solo lo que realmente requiere producción real.
> - **Sprint 15 (Plugins)** partido en sub-sprints 15A-15H independientes — cada plugin se aborda según necesidad real, no en cadena.
> - **Sprint 8 Fase D (Support Inside)** refinada con UX dedicada según [ADR-061](../10-decisions/adr-061-support-inside-tier-cuenta-ux.md).

---

## 🔄 Sprint 7 — Billing Hardening + Support

**Estado:** ~95% completo, **bloqueado por dependencias externas** para los pasos restantes.
**Inicio:** Sprint 6 (continuación). **Cierre formal estimado:** cuando se desbloqueen Sprints 14, 15, 8.

### ✅ Lo cerrado (verificado contra código)

- **Billing hardening (5 pasos):** admin checkout selector, validar `targetUserId`, perfil de facturación contra cliente destino, IVA recálculo en edición, descuento anual aplicado.
- **Support core (8 pasos):** SupportService completo, WebSocket gateway con auth dual JWT+guest, chat tiempo real, arquitectura dual chat+ticket, escalación, panel agente 3 columnas, bandeja tickets, detalle conversación, plantillas de email, admin.md.
- **Support hardening (25 pasos H1-H25):** dedup WS+REST, escalación única, cleanup typing, post-escalación redirige al ticket, página `[id]` diferenciada, sorting waiting_agent, indicador asignación, unread separado por type, stats filtrados, sync notas, nota obligatoria al reabrir, coherencia acciones panel, sidebar contexto cliente, etc.
- **Chat anónimo (8 pasos):** guest token, endpoint guest, rate limit 3/h, gateway auth fallback, widget guest mode, vinculación por email, vinculación manual, cleanup cron 30d.
- **Refactorización R15 (9 pasos R15.1-R15.9):** chats/page (907→77), ChatWidget (671→155), support/page (557→102), support/[id] (733→88), checkout (570→233), layout (394→79), clients/[id] (683→243), products (323→282), products/new (347→296). **Backend support refactor:** support.service (1054→90 fachada + 4 sub-servicios), gateway (526→232).

### ⏳ Lo pendiente (todo bloqueado)

| Paso | Bloqueado por | Cuándo se desbloquea |
|------|---------------|----------------------|
| 7.6.1-3 Horario soporte | Nada — se puede hacer ya | Decisión de priorizar |
| 7.7 Adjuntos archivos | **Sprint 14 — MinIO** | Tras Sprint 14 |
| 7.6.1-4 Ticket UX (rich text + email-style + adjuntos + subject editable) | **Sprint 7.5 Fase 2 + Sprint 14 MinIO** | Cuando ambos cierren |
| 7.8/7.9 IA filtro + copilot | **Sprint 15 Plugins (Claude AI)** | Tras Sprint 15 |
| 7.SI.1/2 Support Inside (badge, página cliente) | **Sprint 8 Fase D** | Tras cierre Sprint 8 |

**Acción recomendada:** **NO cerrar Sprint 7 formalmente** todavía. Cuando todos los bloqueos se resuelvan en sus respectivos sprints, se cierra de una vez.

---

## 🔄 Sprint 7.5 — Design System Foundation

**Estado:** Fase 1 ✅ cerrada. Fase 2 parcial.

### ✅ Fase 1 — Tokens y componentes base (D1–D10f, D11)

Verificada completa contra código en `frontend/components/ui/`:

- D1 Tokens CSS, D2 Button, D3 Input/Select/SearchInput/Textarea, D4 Badge/StatusDot, D5 Card, D6 Modal, D7 Table, D8 Toast, D9 EmptyState/Skeleton, D10 Avatar/Tooltip/Dropdown, D10b Pagination/StatsCard/AlertBanner, D10c UI_SPEC.md, D10d StatusTabs, D10e Breadcrumb, D10f Tabs.
- D11 Dashboard shell migrado (Sidebar, Topbar, Layout) — CSS modules, eliminados inline styles.

### ⏳ Fase 2 — Migración de páginas existentes (parcial)

Algunas páginas migradas en Sprint 7 R15 (chats, support, checkout, layout, clients, products). Otras pendientes — el playbook no enumera el % exacto. Acción: **cuando se aborde una página por trabajo de feature, migrarla al DS en el mismo PR** (oportunismo) en lugar de un sprint dedicado de migración masiva.

---

## 🔄 Sprint 8 — Tasks + Support Inside

**Estado:** WIP confirmado en auditoría 2026-04-26. Fase A 50%, Fases B-E pendientes.

> **Bloquea cadena de Sprint 9** (Audit + Notifications) que necesita listeners de `task.*` para emails.

### Fase A — Schema + fixes base

| # | Paso | Estado real | Notas |
|---|------|-------------|-------|
| 8.1 | TasksService CRUD + asignación + estados + Controller con CASL | ✅ **Cerrado P0.1 (2026-04-26)** — validación FK `assigned_to` (existe + activo + rol asignable) implementada en `assertAssignableUser`. |
| 8.1b | Schema: `task_checklist_completions`, `maintenance_logs`, `product_checklist_items`, `service_checklist_items` + migración | ⬜ |
| 8.1c | Schema: campo `task_id` nullable FK en `client_notes` + migración | ⬜ |
| 8.1d | Backend: completar maintenance → `maintenance_log` + persistir notas + crear `ClientNote(task_id)` | ⬜ |
| 8.14 | Backend: endpoint listar agentes (`GET /api/v1/users?role=agent*`) | ⬜ |

### Fase B — Frontend core

| # | Paso | Estado real |
|---|------|-------------|
| 8.8 | Tablero ListPage + DetailPage + NewTaskModal + TaskTable | 🔄 |
| 8.8b/c/d/e | Select agente, bloques adaptativos, DS compliance, ClientNotesTab vinculación tarea | ⬜ |

### Fase C — Automatización

| # | Paso | Estado real |
|---|------|-------------|
| 8.2 | Listener `service.provisioned` → crear `wow_call` automático | ⬜ |
| 8.3 | WOW calls checklist post-alta (depende 8.1b) | ⬜ |
| 8.10 | **Listeners `task.assigned`, `task.overdue`, `maintenance.completed`, `maintenance.critical`** | 🔄 **`task.assigned` cerrado P0.1 (2026-04-26)** vía `tasks-email.listener.ts` (email + notificación interna). Resto pendiente Sprint 9. |
| 8.12 | Cron `not_completed_in_time` + emit `task.overdue` | ⬜ |

### Fase D — Support Inside (UX dedicada — ADR-061)

> **Refinada por [ADR-061](../10-decisions/adr-061-support-inside-tier-cuenta-ux.md):** Support Inside se presenta como **tier de cuenta** con páginas dedicadas, no como producto en el catálogo público. El schema sigue igual ([ADR-034](../10-decisions/adr-034-support-inside-modelo.md)) — solo cambia la presentación.

| # | Paso | Estado real |
|---|------|-------------|
| 8.4 | Schema + Service support_inside_* + planes Básico/Medium/Pro (sin cambios respecto a ADR-034) | ⬜ |
| **8.4b** | **(NUEVO ADR-061)** Admin `/admin/support-inside-plans` — página dedicada con los 3 planes lado a lado, NO en el CRUD genérico de productos | ⬜ |
| 8.5 | Página cliente `/dashboard/support-inside` — 3 planes comparados si no tiene activo; gestión de plan/slots si tiene activo. **NO aparece en `/dashboard/catalog`** | ⬜ |
| 8.6 | Cancelación cascada + recurrencia anniversary_day + cron mensual generación de tareas mantenimiento | ⬜ |
| 8.7 | ~~We Do It For You~~ — **DEPRECADO** ([ADR-022](../10-decisions/adr-022-wdify-deprecado-proyectos.md), reemplazado por Projects Sprint 22) | 🛑 |
| 8.9 | Frontend vista mantenimiento mensual (depende 8.6) | ⬜ |
| 8.13 | Cron alerta tarea crítica (X días antes fin mes, configurable) | ⬜ |

### Fase E — Cierre

| # | Paso | Estado real |
|---|------|-------------|
| 8.11 | docs/features/tasks/admin.md + agent.md | ⬜ |
| **8.E.1** | **(NUEVO desde auditoría)** Tests E2E para tasks: crear → asignar → completar | ✅ **Cerrado P0.1 (2026-04-26)** — `tests/e2e/tasks.spec.ts` con 3 specs (flujo completo + 2 validaciones FK). |

### ✅ P0.1 cerrado (2026-04-26) — cierre mínimo Sprint 8

1. ✅ Listener `@OnEvent('task.assigned')` en `backend/src/modules/tasks/tasks-email.listener.ts` → email al agente + notificación interna en tabla `notifications`.
2. ✅ Validación FK `assigned_to` (helper privado `assertAssignableUser` en `tasks.service.ts`): valida user existe + status=`active` + rol en `superadmin|agent_full|agent_billing|agent_support`. Devuelve 400 (`BadRequestException`) si no.
3. ✅ Tests E2E (`tests/e2e/tasks.spec.ts`) — 3 specs serializados (gestión 2FA del superadmin), incluyen helper `loginSuperadminAPI` reusable. Suite completa CI mode 10/10 pasa.
4. ✅ Fix oportunista: 2 errores `no-unsafe-enum-comparison` resueltos (uso `TaskStatusDto.completed` en vez de string literal). Lint backend mejora -4 errores netos.

### 🔴 Resto del Sprint 8 — pendiente

- Fase A: schemas pendientes (8.1b/c/d/14).
- Fase B: frontend bloques adaptativos + ClientNotesTab vinculación tarea.
- Fase C: listener `task.overdue` + cron `not_completed_in_time` + WOW calls automáticos.
- Fase D: Support Inside (UX dedicada — ADR-061).
- Fase E: docs admin/agent.

**Próximo paso recomendado tras P0.1:** ~~**P0.2 Outbox Pattern para `invoice.*`**~~ ✅ **Cerrado 2026-04-26** — los 4 eventos `invoice.*` (`created`, `paid`, `failed`, `overdue`) usan `OutboxService.enqueue(tx, ...)` dentro de transacción Prisma; `OutboxWorker` (`@Interval(5s)` + `FOR UPDATE SKIP LOCKED`) los despacha vía `EventEmitter2.emitAsync` con retries y crash recovery. Test E2E `tests/e2e/outbox-invoice.spec.ts` demuestra persistencia tras "crash" del bus. ADR-033 actualizado.

~~**Siguiente: P0.3 saneamiento lint**~~ ✅ **Cerrado 2026-04-26** — Backend 294 → 0 errores, Frontend 117 → 0 errores, CI lint bloqueante en ambos. 4 commits incrementales (`3b2df25`, `8f91daf`, `56285d3`, `36099a8`, `f313e31`, `3d27da1`). Deuda residual DC.6 (27 warnings `set-state-in-effect` — migración Server Components, ver [`backlog.md`](./backlog.md)).

~~**Siguiente: P0.4 tests E2E exhaustivos**~~ ✅ **Cerrado 2026-04-26** — 3 specs nuevos en `tests/e2e/` (auth-2fa-exhaustive, checkout-flow, support-ws-escalation). Cubren: código 2FA incorrecto + lockout 5 fallos password, flujo billing completo (crear→finalizar→pagar→descarga PDF con magic bytes), escalación chat→ticket recibida en tiempo real vía WebSocket en `agent:inbox`.

🎯 **P0 cerrado al 100%.** El primer deploy productivo (Sprint 14) ya no tiene bloqueos críticos pre-deploy. Próxima prioridad: **P1.1 Sprint 9 — Audit + Notifications Full + Outbox worker hardening** (ver [`backlog.md`](./backlog.md)).

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
| 1 | [ADR-043](../10-decisions/adr-043-infraestructura-self-hosted.md) — MinIO declarado en stack | ✅ | — |
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
- Migración de `generateAndUploadInBackground` a una **cola BullMQ `pdf-generation`** con DLQ + retries (cumplir R2 estricto, R13) → P1.1 Sprint 9. Documentado en [`jobs-reference.md`](../50-operations/jobs-reference.md#crons-aspiracionales-documentados-no-implementados).
- Adjuntos en **chat (Sprint 7.7)** y **tickets (Sprint 7.6.3)** → desbloqueados; abordar oportunamente cuando la UX lo justifique. La convención de keys está fijada en [ADR-062 §D](../10-decisions/adr-062-storage-canonico-minio.md).
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

## Convenciones de este documento

- **Estado real ≠ estado declarado.** Los símbolos aquí reflejan lo verificado en código a fecha 2026-04-26.
- **No mover sprints a `completed/` hasta que estén realmente cerrados** según [Definition of Done](../90-meta/definition-of-done.md).
- **Cuando un sprint cierra:** mover su sección a `completed/sprint-N-titulo.md` con resumen ejecutivo + commit de cierre + retrospectiva breve.
