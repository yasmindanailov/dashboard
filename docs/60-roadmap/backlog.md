# Backlog priorizado — Aelium Dashboard

> Lista priorizada de **trabajo futuro**, alimentada por la [auditoría 2026-04-26](../90-meta/audit-2026-04-26.md), refactorizada tras críticas arquitectónicas de Yasmin sobre [ADR-061](../10-decisions/adr-061-support-inside-tier-cuenta-ux.md), Sprint 11.5 (MinIO standalone), partición de Sprint 15 en sub-sprints independientes, y **[ADR-069 política de deploy diferido](../10-decisions/adr-069-estrategia-deploy-diferido.md)**.

> **Última actualización:** 2026-04-29 — re-priorización tras ADR-069 (Sprint 14 reclasificado a gate condicionado P-DEPLOY).

---

## Cómo se priorizan los items

| Prioridad | Significado |
|-----------|-------------|
| **P0** | Crítico pre-producción. Bloquea despliegue real o tiene riesgo legal/financiero. |
| **P1** | Importante para producción profesional. No bloquea desarrollo, sí bloquea calidad/UX al cliente final. |
| **P2** | Funcional core necesario para operar el negocio (módulos pendientes). **Cola activa principal.** |
| **P3** | Crecimiento (Fase 2). Features que multiplican el valor pero no son requisito mínimo. |
| **P-DEPLOY** | **Gate condicionado** ([ADR-069](../10-decisions/adr-069-estrategia-deploy-diferido.md)). Trabajo dependiente de producción real. NO está en cola activa — se ejecuta sólo al activarse un trigger explícito (cliente real, demo, captación, validación externa). |

**Regla:** no se aborda P_N+1 con P_N abierto, **salvo** que tengan dependencias entre sí, que P_N esté bloqueado por terceros, **o que P_N sea P-DEPLOY (gate condicionado, ADR-069)**.

---

## P0 — Crítico pre-producción

> Bloquean **despliegue a producción real** o representan **riesgo legal/financiero**. Cerrar antes de Sprint 14 (Deploy).

| # | Item | Esfuerzo | Origen | Bloquea |
|---|------|----------|--------|---------|
| ~~**P0.1**~~ | ~~**Cerrar Sprint 8 mínimo:** listener `@OnEvent('task.assigned')` + validación FK `assigned_to` + tests E2E tasks~~ ✅ **Cerrado 2026-04-26** | ~~1-2 sesiones~~ | Auditoría §3.2 + Sprint 8 contract | Sprint 9 (notifications listeners), Sprint 7.SI — **desbloqueado** |
| ~~**P0.2**~~ | ~~**Outbox Pattern para `invoice.*`** (4 eventos: created, paid, failed, overdue)~~ ✅ **Cerrado 2026-04-26** — `OutboxService` + `OutboxWorker` (`@Interval(5s)` + `FOR UPDATE SKIP LOCKED`) en `backend/src/core/outbox/`; 4 emits `invoice.*` migrados a `enqueue(tx, ...)` dentro de `prisma.$transaction`; E2E `tests/e2e/outbox-invoice.spec.ts`; ADR-033 actualizado | ~~1-2 sesiones~~ | [ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md), R8 | Despliegue real — **desbloqueado para `invoice.*`**; pendiente extender a `service.*` cuando provisioning se implemente |
| ~~**P0.3**~~ | ~~**F0.6 saneamiento lint** — resolver ~344 errores `no-unsafe-*`, hacer lint bloqueante en CI~~ ✅ **Cerrado 2026-04-26** — Backend: 294 → 0 errores (`AuthenticatedRequest`, `getErrorMessage`, Prisma `WhereInput`, JWT layer, guards, JSON DTOs, WebSocket payloads). Frontend: 117 → 0 errores (`lib/types.ts` con tipos de dominio, `lib/error.ts`, refactor de 22 archivos). CI: `lint:check` bloqueante en backend, `lint` bloqueante en frontend. Deuda residual DC.6 (27 warnings `set-state-in-effect` → migración Server Components futura). | ~~3-4 sesiones~~ → 4 commits | Playbook §1, Auditoría §3.5 | Salvaguarda 5 — **completa para errores**, parcial para warnings |
| ~~**P0.4**~~ | ~~**Tests E2E exhaustivos** — 2FA con código real, checkout completo, PDF download, escalación con WS~~ ✅ **Cerrado 2026-04-26** — 3 specs nuevos (4 tests): `auth-2fa-exhaustive.spec.ts` (código incorrecto + lockout 5 fallos), `checkout-flow.spec.ts` (crear→finalizar→pagar→PDF con magic bytes `%PDF-` + verificación outbox), `support-ws-escalation.spec.ts` (chat→escalación→ticket recibido vía socket.io en `agent:inbox` en tiempo real). Todos pasan en CI mode (workers=1). | ~~2 sesiones~~ | Playbook §5 | Confianza pre-deploy — **P0 cerrado completo** |

**Total estimado P0 restante:** **0 sesiones** ✅ — P0.1, P0.2, P0.3, P0.4 cerrados (2026-04-26). P1.1 / P1.1.5 / P1.1.6 / P1.2 cerrados (2026-04-26→28). **[ADR-069 (2026-04-29)](../10-decisions/adr-069-estrategia-deploy-diferido.md)** reclasifica Sprint 14 a gate condicionado **P-DEPLOY** (no requiere trigger técnico, sino de negocio). Cola activa actual: **P2** (ver más abajo) con voto profesional para **Sprint 8 residual** (regla "no abrir lo nuevo con WIP abierto") como primer movimiento.

---

## P1 — Importante para producción

> Cierran la Fase 1 antes de Sprint 14 Deploy.

| # | Item | Esfuerzo | Depende de |
|---|------|----------|------------|
| ~~**P1.1**~~ | ~~**Sprint 9 — Audit + Notifications Full**~~ ✅ **Cerrado 2026-04-27** — 6 fases (A/B/C/D MVP/E/F) + 8 commits (`b6fd53a` → `bff4fec`). 3 ADRs nuevos (063/064/065), 3 colas BullMQ activas (`pdf-generation`, `outbox-dispatch`, `notifications-dispatch`), DLQ persistente con `failed_jobs`, alerta superadmin extremo a extremo (`outbox.event_failed` + `dlq.job_failed`), portal transparencia RGPD `/dashboard/transparency`, árbol staff `/admin/*` + `AdminOnlyGuard`, cron retención audit (730 días). Tests: 21/21 unit + 30/30 E2E full. **Items diferidos a Sprint 9.5** (no bloquean Sprint 14): UX admin notifications (campana Topbar + panel plantillas + cron limpieza + 4 settings + listener `system.error`). **DC.7** (split admin/cliente retroactivo) registrado. | 2-3 sesiones (real: 3 sesiones) | — |
| ~~**P1.1.5**~~ | ~~**Sprint 9.5 — UX admin de notifications + cabos sueltos Sprint 9**~~ ✅ **Cerrado 2026-04-27** — 7 items + DC.10. Endpoints cliente `/notifications` (4) + admin `/admin/notifications/templates` (4 con `AdminOnlyGuard`) + `NotificationBell` Topbar (polling 30s, click marca leída + navega) + página admin `/admin/notifications/templates` (DS-style con preview en línea) + `NotificationsRetentionCron` (`EVERY_DAY_AT_2AM`, sólo `internal`) + 4 settings `notifications.*` seedeados + `NotificationsSystemErrorListener` con guard anti-loop hard + plantillas `system.error` (email + internal) + 6 specs E2E nuevos (`notifications.spec.ts`) + 1 spec adicional Client/User en `audit-portal.spec.ts` (DC.10). Cierra `9.D.11/12/13/14/15/16/17 + 9.F.10`. | ~~1 sesión densa~~ | — |
| ~~**P1.1.6**~~ | ~~**Sprint 9.6 (DC.7) — Split admin/cliente retroactivo + 3 portales raíz + permisos granulares por rol staff**~~ ✅ **Cerrado 2026-04-28** — 12 commits encadenados (`16b22ed` → `53b90d0`) en 1 sesión densa. 3 ADRs nuevos (066 portales raíz + PortalBadge / 067 granularidad CASL Subjects nuevos / 068 multi-path Deprecation headers). Migración páginas admin-puro `/dashboard/{clients,products,tasks,support/chats}` → `/admin/*` con `git mv`. Split UX billing + support: `_shared/billing/`, `_shared/support/`, `_shared/shell/Topbar` (con NotificationBell) compartidos por single-source-of-truth; pages divergen sólo en presentación. Granularidad CASL fina: `agent_billing` (Clientes+Facturación+Tareas), `agent_support` (Clientes read+Soporte+Tareas), `agent_full` (todo menos Settings/Plantillas/Jobs DLQ), `superadmin` (todo). Subjects nuevos `NotificationTemplate` + `Job` solo superadmin. **Bonus no planificado**: seed modular profesional (Fase F.0) con 7 cuentas por rol + datos demo + 4 salvaguardas + `seed-reference.md` + Topbar shell unificado (Fase F.0.bis cierra bug logout admin). Tests: 21→**37/37 unit verde**, 51→**60/60 E2E verde** en ~1min (+9 nuevos: aliases-rest-deprecation, admin-tree-migration, admin-granular-roles). Ver retrospectiva en [`completed/sprint-9-6-split-admin-cliente.md`](./completed/sprint-9-6-split-admin-cliente.md). **Items diferidos a Sprint 13 Hardening**: paralelización E2E real (DC.13), AdminSidebar collapse + mobile drawer (DC.14), colapso `SIDEBAR_PERMISSIONS` duplicado frontend/backend (DC.15). | ~~1.5–2 sesiones~~ → 1 sesión densa (12 commits) | P1.1 cerrado, auditoría iterativa con Yasmin |
| ~~**P1.2**~~ | ~~**Sprint 11.5 — MinIO Storage (local)**~~ ✅ **Cerrado 2026-04-26** — `core/storage/StorageService` (`@aws-sdk/client-s3`) + `InvoicePdfStorageService` puente; `Invoice.pdf_url` ahora guarda la S3 key (no URL); endpoint `/pdf` 302 redirect a signed URL con `Content-Disposition: attachment` forzado; MinIO en `docker-compose.dev.yml` y CI; fire-and-forget upload tras `markAsPaid`/`sendToPending` (deuda R2 documentada → P1.1); test E2E `storage-pdf.spec.ts` con flujo principal + fallback legacy; settings `storage.signed_url_expiry_minutes` y `storage.max_upload_size_mb` seedeados; ADR-062 publicado. **Desbloquea Sprint 7.7 (adjuntos chat) + Sprint 7.6.3 (adjuntos tickets) + Sprint 12 (logos brand).** | ~~1 sesión~~ → 1 sesión real | — |
| **P1.3** | **Sprint 7.5 Fase 2 finalizar** — migración progresiva de páginas restantes al Design System (oportunista — al tocar página, migrarla en mismo PR) | continuo | — |
| ~~**P1.4**~~ | ~~**Sprint 14 — Deploy real**~~ → **Reclasificado a [P-DEPLOY.1](#gate-condicionado-p-deploy-sprint-14--adr-069)** (gate condicionado, [ADR-069](../10-decisions/adr-069-estrategia-deploy-diferido.md) 2026-04-29). | — | trigger de negocio |
| ~~**P1.5**~~ | ~~**Backup + recovery plan**~~ → **Reclasificado a [P-DEPLOY.2](#gate-condicionado-p-deploy-sprint-14--adr-069)** (parte del Sprint 14). | — | trigger de negocio |

> **Nota:** tras los closures masivos de P1.1/1.5/1.6 + P1.2 (2026-04-26→28), la sección P1 queda con **sólo P1.3 (continuo/oportunista)** como item activo. La cola activa principal es **P2** (módulos funcionales pendientes). Sprint 14 vive en P-DEPLOY (gate condicionado).

---

## Gate condicionado: P-DEPLOY (Sprint 14 — ADR-069)

> 📜 **[ADR-069](../10-decisions/adr-069-estrategia-deploy-diferido.md)**: el deploy productivo NO está en cola activa. Se ejecuta sólo cuando se cumple un **trigger de negocio explícito**:
>
> - Cliente real con fecha de onboarding acordada.
> - Demo pública (inversor/partner/cliente potencial que necesite URL real).
> - Captación activa (campaña marketing, landing pública con formulario de alta).
> - Validación externa de UX (usability test con usuarios externos).
> - Decisión consciente de Yasmin con razón documentada.
>
> Mientras tanto, P-DEPLOY agrupa toda la deuda dependiente de producción real. Cuando el gate se active, Sprint 14 ejecuta TODA la lista de una sola pasada (commit atómico o cadena corta).

| # | Item | Esfuerzo | Notas |
|---|------|----------|-------|
| **P-DEPLOY.1** | **Sprint 14 — Deploy real** (Docker Compose **prod** + Traefik + SSL + Grafana/Prometheus/Loki + pipeline + backups Cloudflare R2 + Sentry real + reglas WAF `/admin/*` + rate limiting diferenciado por portal) | 2-3 sesiones | Dry-run en staging desechable previo + checklist + runbook |
| **P-DEPLOY.2** | **Backup + recovery plan documentado** (RTO < 4h, RPO < 6h) | parte de P-DEPLOY.1 | — |
| **P-DEPLOY.3** | **Cierre ventana aliases REST** ([ADR-068 §3](../10-decisions/adr-068-multi-path-deprecation-headers.md)) — eliminar paths legacy del array `@Controller([...])` antes del primer push productivo | parte de P-DEPLOY.1 | — |
| **P-DEPLOY.4** | **Outbox extendido a `service.*` y `partner.*`** ([ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md), R8) | sólo si esos módulos están implementados | Hoy `invoice.*` cerrado; `service.*` requiere Sprint 11 Provisioning; `partner.*` requiere P3.17 Partner Module |
| **P-DEPLOY.5** | **Reemplazo fire-and-forget R2** de PDFs (`InvoicePdfStorageService.generateAndUploadInBackground`) por **job persistente BullMQ** | 0.5 sesión | Documentado en [`jobs-reference.md` §Crons aspiracionales](../50-operations/jobs-reference.md) |
| **P-DEPLOY.6** | **Sentry DSN real** + verificación que correlation IDs llegan al dashboard Sentry | parte de P-DEPLOY.1 | Hoy preparado, sin DSN configurado |
| **P-DEPLOY.7** | **Branch protection en GitHub** (requiere upgrade Free → Pro/Team) | 0.1 sesión | Coste GitHub Pro: $4/mes |

---

## P2 — Funcional core (módulos pendientes)

> Necesarios para operar el negocio en producción profesional. **Cola activa principal** post Sprint 9.6 + ADR-069.

> 📜 **Nota canónica sobre Sprint 10 (2026-04-29, [ADR-070](../10-decisions/adr-070-service-info-sso-acciones-curadas.md))**: Sprint 10 (Infrastructure) **sólo aplica al modelo Docker auto-hosteado** (consumidor: `docker_engine` plugin de Sprint 15E). Los plugins SaaS (`enhance_cp`, `cpanel_whm`, `resellerclub`, ...) no usan `servers`/`server_pools`/`server_metrics`. Por tanto **Sprint 10 se ejecuta emparejado con Sprint 15E** (no antes), evitando construir infra sin consumidor (YAGNI). Para hostings/dominios, la operativa post-venta usa `ProvisionerPlugin.getServiceInfo()` + SSO al panel externo + acciones curadas inline (ADR-070), no `server_metrics`.

| # | Item | Esfuerzo | Depende de |
|---|------|----------|------------|
| **P2.1** | **Sprint 11 — Provisioning** (orquestador lifecycle servicios + interfaz `ProvisionerPlugin` extendida [ADR-070](../10-decisions/adr-070-service-info-sso-acciones-curadas.md): `getServiceInfo` + `getSsoUrl` + `executeAction` + cache Redis + audit hooks · plugins iniciales `internal` y `manual` triviales · página cliente única `/dashboard/services/[id]`) | 3 sesiones | Sprint 5, Sprint 6 |
| **P2.2** | **Sprint 15A — Plugin Framework** (manifest + loader + UI dinámica desde Settings + encriptación API keys + helpers `core/provisioning/plugin-utils.ts` para cache wrapper + audit logger + circuit breaker boilerplate) | 1-2 sesiones | P2.1 |
| **P2.3** | **Sprint 15D — Plugin ResellerClub (dominios)** — primer plugin externo. SaaS, no usa Sprint 10. Acciones curadas: DNS records CRUD + transfer out + auto-renew toggle. | 2 sesiones | P2.2 |
| **P2.4** | **Sprint 15C — Plugin Enhance CP (hostings)** — segundo plugin SaaS. Tampoco usa Sprint 10. Acciones curadas: reset password account + view disk/bandwidth (lectura). SSO al panel Enhance. | 2-3 sesiones | P2.2 |
| **P2.5** | **Sprint 10 — Infrastructure** (TAB 1 servidores propios: CRUD + pools + capacidad detectada automáticamente vía Docker API/SSH + cron `poll-server-metrics` + algoritmo `pickServerForProduct` con margen seguridad + editor `docker_templates`. **TAB 2 vista federada [ADR-071](../10-decisions/adr-071-vista-admin-federada-infraestructura.md)**: agregador read-only `listRemoteServers()` + `getProviderHealthSummary()` cross-plugin con cache Redis 600s + degradación elegante + acciones admin curadas con doble confirmación. **TAB 3 pools matriz** producto × servidor con servidores propios y remotos en lectura. UI única `/admin/infrastructure`.) | 2-3 sesiones | P2.2, P2.3 (ResellerClub no aplica TAB 2) o P2.4 (Enhance ya implementa TAB 2) |
| **P2.6** | **Sprint 15E — Plugin Docker Engine** (provisioner contenedores Docker + Collabora compartido + métricas custom Docker stats por contenedor + acciones curadas: restart + view_logs_tail_100 + reset_admin_password + change_subdomain) | 3 sesiones | **P2.5 (Sprint 10) emparejado** |
| **P2.7** | **Sprint 12 — Settings + Knowledge Base** (página settings con categorías, gestión plugins via UI dinámica, editor marca, prefijo numeración configurable, due_date desde settings, KB articles) | 2-3 sesiones | P2.2 (plugins UI) |
| **P2.8** | **Sprint 12.5 — Portal Transparencia RGPD** (zona transparencia cliente, integrations registry, consentimientos, editor textos legales, exportación datos, eliminación cuenta, cron retención) | 2-3 sesiones | P1.1 (audit) ✅, Sprint 4 |
| **P2.9** | **Sprint 13 — Hardening + Escalabilidad** (**§13.AUTH** = httpOnly cookies + refresh rotation con replay detection + CSRF middleware + frontend SC nativo bulk migrate ([ADR-078](../10-decisions/adr-078-auth-server-side-cookies-httponly.md), cierra **DC.6 + DC.28**), session cleanup cron, audit trail global, validaciones billing edge cases, Redis adapter Socket.io, N+1 audit, cursor pagination, caching, archival messages, R15 restantes, **DC.13 paralelización E2E**, **DC.14 AdminSidebar collapse**, **DC.15 colapso `SIDEBAR_PERMISSIONS`** duplicado) | 4-5 sesiones | Sprints anteriores · ADR-078 mergeado |

---

## P3 — Crecimiento (Fase 2 + Plugins)

> Features que multiplican valor pero no son requisito mínimo. **Sprint 15 partido en sub-sprints independientes** ([ADR-009](../10-decisions/adr-009-estrategia-plugins.md), [ADR-021](../10-decisions/adr-021-provisioners.md)) — cada plugin se aborda **cuando se necesita**, no en cadena. Orden recomendado por valor de negocio:

### Prioridad A — Plugins críticos para go-to-market

> ⚠️ **Movidos a P2 (cola activa) por [ADR-070](../10-decisions/adr-070-service-info-sso-acciones-curadas.md) 2026-04-29**:
> - ~~P3.1 Sprint 15A Plugin Framework~~ → **P2.2** (prerequisito de cualquier otro plugin)
> - ~~P3.5 Sprint 15C Plugin Enhance CP~~ → **P2.4**
> - ~~P3.6 Sprint 15D Plugin ResellerClub~~ → **P2.3**
> - ~~P3.7 Sprint 15E Plugin Docker Engine~~ → **P2.6** (emparejado con P2.5 Sprint 10)
>
> **Razón**: Yasmin confirmó modelo de negocio que requiere los 3 plugins (hostings, dominios, Docker) para operar — no son "Fase 2 crecimiento", son cola funcional core junto con Sprint 11 Provisioning. Sólo Sprint 15B Stripe / 15F Claude AI / 15G Manual quedan en P3 porque son aspiracionales o sustituibles.

| # | Item | Esfuerzo | Justificación |
|---|------|----------|---------------|
| **P3.1** | **Sprint 15B — Plugin Stripe** (PaymentProvider con Checkout/PaymentIntents + webhook signature verification + frontend Stripe Elements + tests sandbox) | 2-3 sesiones | Sin Stripe el cobro es manual. Probable primer plugin tras P2 cerrado si quieres aceptar pagos online. Si por ahora cobras transferencia, puede esperar. |
| **P3.2** | **Sprint 15F — Plugin Claude AI** (filtro chat + copilot agente + token budget + audit + transparencia) | 2-3 sesiones | Desbloquea Sprint 7.8 (filtro IA chat) + Sprint 7.9 (copilot agente). Útil si tienes muchos clientes sin Support Inside (filtro reduce carga del agente). |
| **P3.3** | **Sprint 18 — Landing Integration** (catálogo público + buscador dominios + checkout sin cuenta + webchat + formulario contacto) | 2-3 sesiones | Sin cara pública no hay captación online. Requiere **P2.3 (Sprint 15D ResellerClub)** si lanzas con buscador de dominios. |
| **P3.4** | **Sprint 15G — Plugin Manual** (formaliza el provisioning manual actual) | 1 sesión | Baja prioridad — `manual` provisioner ya estará implementado en Sprint 11 (P2.1) como plugin trivial. Sprint 15G sólo se justifica si se formaliza con UI propia (gestión de variantes manual). |

### Prioridad B — Operaciones de negocio

| # | Item | Esfuerzo | Justificación |
|---|------|----------|---------------|
| **P3.5** | **Sprint 22 — Projects** (sistema de propuestas + budget + estados + items snapshot + agentes + history) | 3-4 sesiones | Tu modelo de negocio es: ir a negocios → proponer tecnología → crear proyecto → vender. |
| **P3.6** | **Sprint 21 — CRM Completeness** (gestión completa de clientes) | 2 sesiones | Complementa proyectos. |
| **P3.7** | **Sprint 23 — Tickets Redesign** (UI thread-based + sidebar enriquecida + vinculación servicio/proyecto + tags + SLA + adjuntos) | 2-3 sesiones | Tickets necesitan vinculación a proyectos/servicios. Depende de P3.5. |
| **P3.8** | **Sprint 24 — Citation System** (citas estructuradas en mensajes — `references` jsonb) | 1-2 sesiones | Comunicación contextual. Depende de P3.5 + P3.7. |
| **P3.9** | **Sprint 25 — AI Workers** (asistente IA para tareas — OpenClaw como AI Worker) | 2-3 sesiones | Eficiencia del equipo. Depende de Sprint 8 + P3.2 (Plugin Claude) + P3.5. |

### Prioridad C — Crecimiento (B2C)

| # | Item | Esfuerzo | Justificación |
|---|------|----------|---------------|
| **P3.10** | **Sprint 17 — Promotions & Discounts** (upsell, crossell, descuentos, contadores atómicos, BullMQ promotions) | 2-3 sesiones | Aumenta ARPU. |
| **P3.11** | **Sprint 20 — Referral System** (códigos referido por cliente, créditos mensuales, descuento primera compra) | 2 sesiones | Adquisición orgánica. |

### Prioridad C bis — Canal Partner (B2B)

| # | Item | Esfuerzo | Justificación |
|---|------|----------|---------------|
| **P3.12** | **Sprint 15H — Plugin Stripe Connect** (payouts automáticos a partners via split payments) | 1-2 sesiones | Pre-requisito para Sprint 19. Depende de P3.1 (Stripe activo). |
| **P3.13** | **Sprint 19 — Partner Module** (canal B2B, comisiones, payouts, tickets bidireccionales, vinculación cuenta cliente) | 4-5 sesiones | Canal de crecimiento sin renunciar al control operativo. Depende de P3.12. |

### Prioridad D — Internacionalización

| # | Item | Esfuerzo | Justificación |
|---|------|----------|---------------|
| **P3.14** | **Sprint 16 — i18n + Multi-Currency** | 2-3 sesiones | Solo importa si vendes fuera de España. **Inversión prematura** hasta que haya tracción en mercado local. |

---

## Deuda continua (no urgente, importante)

Items que deben **integrarse en sprints existentes** (oportunismo) en lugar de tener su propio sprint:

| # | Item | Cuándo abordar |
|---|------|----------------|
| **DC.1** | **Drift de nomenclatura** schema vs doc legacy (`assigned_to` ↔ `assigned_agent_id`, `parent_conversation_id` ↔ `escalated_from_id`, `ai_handled` ↔ `is_ai_filtered`) | Decidir nombre canónico al refactorizar, no antes |
| **DC.2** | **Generación automática de `docs/30-data/*.md` desde Prisma** (script + tests de sincronización) | F7-9 si valor > esfuerzo |
| **DC.3** | **Comentarios `///` en Prisma** para descripciones de campos | Al editar schema, oportunismo |
| **DC.4** | **TODO en `dashboard.service.ts:next_settlement = null`** — feature no documentado | Cuando se decida settlement real (Sprint 6 o futuro billing) |
| **DC.5** | **Refactor R15 restantes** (billing-email.listener split, billing.controller helpers, page landing secciones, GradientMesh hook) | Al tocar el archivo |
| **DC.6** | **Migración fetch → Server Components + Suspense (frontend)** — `react-hooks/set-state-in-effect` marca 27 call-sites del patrón clásico `useEffect(() => { setLoading(true); fetch().then(setData) }, …)`. La regla está bajada a `warn` en `frontend/eslint.config.mjs` con justificación. La doctrina React 19 oficial es migrar fetching a Server Components + `use()`/Suspense ([react.dev/learn/you-might-not-need-an-effect](https://react.dev/learn/you-might-not-need-an-effect)). **Plan canónico congelado en [ADR-078](../10-decisions/adr-078-auth-server-side-cookies-httponly.md) (2026-05-02)**: cierre acoplado a DC.13 en Sprint 13 §13.AUTH (la migración a SC requiere auth server-side vía cookies httpOnly). Sprint 11 Fase 11.D es la **última excepción permitida** del patrón viejo — Sprint 12+ requiere SC nativo. Trazabilidad mecánica: `grep TODO(ADR-078) frontend/app` da la lista exacta de archivos a migrar. | Sprint 13 §13.AUTH (acoplado DC.13) |
| **DC.8** | **Migración de listeners `auth.*` directos a `audit_access_log` → `AuditService.logAccess(...)`** — `auth-login.service.ts:219`, `auth-register.service.ts:68`, `auth-token.service.ts:94` escriben a la tabla con `prisma.auditAccessLog.create(...)` directamente desde Sprint 5. Funcionalmente correcto pero rompe el patrón canónico de Sprint 9 Fase E. NO se migró en Sprint 9 para no romper tests E2E auth ya verdes. **Cuándo abordar**: oportunista cuando se toque `auth-login.service.ts` por otro motivo. Sin urgencia. | Oportunista al tocar `auth/*` |
| ~~**DC.9**~~ | ~~**Contracts canónicos `audit/`, `notifications/`, `error-log/` con stubs mínimos**~~ ✅ **Cerrado 2026-04-28 (cierre documental Sprint 9.5)**. Decisión registrada: **contracts breves que apuntan a ADRs canónicos son suficientes** — no se replican las 12 secciones del template cuando los ADRs ya capturan el detalle profundo. Los 3 contracts (audit, notifications, error-log) reescritos como "mapa del módulo" con secciones: propósito, estado, arquitectura → referencias canónicas, modelos, API REST, anti-loop / edge cases relevantes, pendientes registrados. Patrón canónico para futuros módulos cuyo diseño esté bien capturado en ADRs. | ~~Sprint 9.5~~ |
| ~~**DC.10**~~ | ~~**Cobertura E2E `audit-portal.spec.ts` para path Client/User**~~ ✅ **Cerrado 2026-04-27 (Sprint 9.5)** — spec adicional añadido a `tests/e2e/audit-portal.spec.ts`: admin `GET /clients/:id` (`@AuditAccess('Client')`) → fila persistida con `target_user_id = client.id` + verificación de que aparece en el portal del cliente. | ~~Sprint 9.5~~ |
| **DC.11** | **Suite E2E local depende de env exacto (`SUPERADMIN_PASSWORD` del `.env` debe coincidir con el seed que se ejecutó previamente)** — los specs hardcodean `'AeliumDev2026!'` como fallback (`process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!'`); si `.env` exporta otro password, el seed lo usa para bcrypt-ar y el flujo de login del spec encaja, pero si el seed se ejecutó con un env y los tests con otro, falla con `Credenciales incorrectas`. En CI los secrets garantizan coherencia; en local hace falta `set -a && source .env && set +a` antes de `pnpm prisma db seed` Y antes de `pnpm test:e2e`. **Plan**: documentar en `tests/e2e/README.md` (no existe) o añadir un `playwright.globalSetup.ts` que cargue `.env` y avise. **Cuándo abordar**: oportunista al tocar tests E2E o al preparar Sprint 14 Deploy (CI mode local más cercano al CI real). | Oportunista |
| ~~**DC.7**~~ | ~~**Split de árboles por audiencia**: `/dashboard/*` (cliente) · `/admin/*` (staff) · `/partner/*` (futuro Sprint 19)~~ ✅ **Cerrado 2026-04-28 (Sprint 9.6, P1.1.6)** — Tres portales raíz canónicos formalizados en ADR-066. Migración retroactiva de páginas admin-puro completada vía `git mv`. Split UX billing/support con `_shared/` doctrine. Granularidad CASL fina por rol staff (ADR-067) con Subjects `NotificationTemplate` + `Job` exclusivos de superadmin. Multi-path con Deprecation headers (ADR-068) para aliases REST hasta cierre Sprint 14. Suite E2E full **60/60 verde** sin regresión + 9 specs nuevos. Componente PortalBadge en Design System. Topbar shell unificado en `_shared/shell/`. Sprint 19 (Partner Module — P3.17) replica el patrón con `/partner/*`. Detalle completo en [`completed/sprint-9-6-split-admin-cliente.md`](./completed/sprint-9-6-split-admin-cliente.md). | ~~Sprint 9.6 (post Sprint 9 cierre)~~ |
| **DC.13** | **Paralelización E2E real con fixtures aisladas por spec** — Sprint 9.6 Fase F.4 descubrió que la suite E2E NO soporta paralelismo (DB Postgres, MailPit, Redis, cuentas seed compartidos). `playwright.config.ts` ahora fuerza `workers=1` + `fullyParallel=false` en local y CI. Para paralelizar de verdad: cada spec necesita DB de test propia (schema dinámico o snapshot por worker), MailPit dedicado o filtrado por to-address, usuarios `e2e-${uid}-${role}` aislados (no las cuentas seed canónicas). Beneficio: tiempo total cae de ~1min a ~15s con 4 workers. **Cuándo abordar**: Sprint 13 Hardening (es refactor de infra de tests, no bloquea features). | Sprint 13 Hardening |
| **DC.14** | **AdminSidebar collapse + mobile drawer** — el `AdminSidebar.tsx` es width 260px fijo. El `Sidebar.tsx` cliente sí tiene `collapsed` toggle + drawer mobile. Sprint 9.6 Fase D priorizó estabilizar la lógica del split sobre paridad UX completa (regla DC.X "lógica antes que pulido"). Pasada UX dedicada en Sprint 13 Hardening / Sprint 13.5 UX Pulido alineará ambos sidebars al mismo contrato (`collapsed`, `onToggle`, `mobileOpen`, `onMobileClose`). | Sprint 13 Hardening / 13.5 UX Pulido |
| **DC.15** | **Colapsar duplicación `SIDEBAR_PERMISSIONS` frontend/backend** — la matriz de permisos por rol vive duplicada en `backend/src/core/casl/permissions.ts` (canónica) y `frontend/app/lib/permissions.ts` (réplica manual sincronizada por convención). Sprint 9.6 ADR-067 añadió Subjects nuevos a ambos archivos manualmente. Plan: endpoint `/api/v1/me/permissions` que retorne la matriz al login y el frontend la cachee en `AuthContext`. Elimina drift posible entre los dos archivos. **Cuándo abordar**: Sprint 13 Hardening (no bloquea — la doc de cada Subject es explícita y el linter ESLint verifica que existan ambos lados al añadir). | Sprint 13 Hardening |
| **DC.16** | **`services.credit_balance_eur` ausente en schema (BUFFER TÉCNICO de prorrateo, NO sistema de créditos)** — [ADR-029 §"Sin devolución de dinero"](../10-decisions/adr-029-prorrateo-cambio-plan.md) declara este campo como **buffer técnico interno** del flujo de prorrateo cuando el crédito sobrante (días no consumidos del plan anterior) excede el coste del nuevo plan. **No existe en `services` hoy**. Bloquea cualquier flujo upgrade/downgrade real (Support Inside Básico→Pro, hosting Web Pro→Business, etc.). **IMPORTANTE — clarificación 2026-05-01 tras pregunta Yasmin**: este campo NO es un sistema de créditos transversal del dashboard (no hay wallet, monedero, recargas, transferencia entre clientes, expiración, RGPD especial). Es un saldo invisible al cliente que se aplica automáticamente a la siguiente factura del mismo servicio. Si en el futuro surge demanda de wallet/loyalty/refunds visibles, se documenta como ADR-NNN nuevo con tabla dedicada (`credit_transactions` con audit inmutable, expiración, source enum, etc.) y este campo queda como caso de uso histórico. Plan: migración Prisma `add_services_credit_balance` (`Decimal(10,2) NOT NULL DEFAULT 0`), actualizar `BillingCalculatorService.calculateProration()` para devolver crédito al servicio destino + `BillingService.processPayment()` para consumirlo antes del cargo. Tests unit. **Detectado**: Auditoría 2026-05-01 (Sprint 8 Fase D.12 ampliación). **Cuándo abordar**: P1 transversal — sub-sprint dedicado tras 8.D.12 cierre (~1 sesión). | P1 transversal |
| **DC.17** | **`tasks.slot_id` FK pendiente** — [`docs/30-data/support.md:193`](../30-data/support.md#L193) lo declara, schema Prisma real NO lo tiene. Cuando se cierre la asignación slot↔servicio (Sprint 11 Provisioning + 8.D.12.8), las tareas de mantenimiento generadas por slot necesitan referenciarlo para auditoría/historial. Plan: migración `ALTER TABLE tasks ADD COLUMN slot_id uuid NULL REFERENCES support_inside_slots(id) ON DELETE SET NULL` + actualizar `MaintenanceMonthlyService.generate()` para setearlo + `tasks/contract.md` documenta el campo. **Detectado**: Auditoría 2026-05-01. **Cuándo abordar**: dependiente Sprint 11 Provisioning (donde se construye `/dashboard/services/[id]` con CTA "Activar Support Inside"). | P1 dependiente Sprint 11 |
| **DC.18** | **Upgrade entre planes distintos del mismo dominio (ADR-077 propuesto)** — [ADR-029](../10-decisions/adr-029-prorrateo-cambio-plan.md) cubre solo mensual↔anual del MISMO `product_id`. Cambio Básico→Pro de Support Inside, o `hosting-web-pro`→`hosting-web-business`, no tiene flujo canónico. Workaround actual: cancelar y recontratar (pierde días pagados, slots, etc.). ADR-077 a redactar: lógica de migración + prorrateo de la diferencia + qué pasa con slots vinculados al plan viejo. Bloquea cierre comercial Support Inside (no se puede ascender de Básico a Pro elegantemente) y upselling hosting. **Detectado**: Auditoría 2026-05-01. **Cuándo abordar**: P1 transversal post-DC.16 (depende de `credit_balance_eur`). Sub-sprint dedicado ~1.5 sesiones. | P1 transversal |
| **DC.19** | **Slots adicionales facturables como `support_addon` (ADR-077.b o ADR independiente)** — hoy `SupportInsideService.addSlot(is_extra=true)` crea row sin facturar. [ADR-034 §sistema de slots](../10-decisions/adr-034-support-inside-modelo.md) declara que los slots adicionales son productos `support_addon` independientes. Implementación canónica: cada slot extra crea su propia fila en `services` con `pricing_id` apuntando a un producto `type='support_addon'` (nuevo). Cero refactor del motor de billing — `BillingCheckoutService.checkout()` se reutiliza. Beneficio: cancelable individualmente, factura recurrente automática, listado en `/dashboard/billing`. **Detectado**: Auditoría 2026-05-01. **Cuándo abordar**: P1 dependiente DC.16+DC.18 (post-cierre 8.D.12). | P1 dependiente |
| **DC.20** | **Channels alternativos (WhatsApp, SMS) en `NotificationsService`** — [ADR-061 §canales](../10-decisions/adr-061-support-inside-tier-cuenta-ux.md) define `support_inside_config.channels_active` (webchat, email, phone, whatsapp). Hoy se guarda y se muestra al cliente, pero `NotificationsService` solo despacha por `EmailChannel`+`InAppChannel`. Falta canal `WhatsAppChannel` (Twilio o equivalente) + plantillas WhatsApp + integrar `NotificationsService.dispatchToUser()` para leer `channels_active` del cliente con SI activo y filtrar canales habilitados. **Detectado**: Auditoría 2026-05-01. **Cuándo abordar**: P2 — Sprint 12 Settings+KB o sprint dedicado de canales (incluye Twilio + tarifas + UI configuración admin). | P2 |
| **DC.21** | **Historial de valor cliente Support Inside** — [ADR-061 §UX cliente](../10-decisions/adr-061-support-inside-tier-cuenta-ux.md) declara: "consultas resueltas · tiempo medio de respuesta · soluciones aplicadas · mantenimientos realizados con detalle". No implementado. Requiere queries cross-módulo (support `conversations.resolved_at` + tasks `maintenance_logs` + `client_notes` con `category=solution`) + sección dedicada en `/dashboard/support-inside` (tab "Historial" o card extendida). **Detectado**: Auditoría 2026-05-01. **Cuándo abordar**: P2 sprint dedicado a métricas tras visibilidad transversal cerrada (~2 sesiones). | P2 |
| **DC.22** | **Settings globales `/admin/settings/support-inside`** — [ADR-061 §Settings globales](../10-decisions/adr-061-support-inside-tier-cuenta-ux.md): 1/3 cubierto (`support.maintenance_critical_threshold_days` ya existe Sprint 8.C). Faltan: configuración de horario de soporte (Sprint 7.6 ops aspiracional) + plantillas respuesta automática fuera de horario. **Detectado**: Auditoría 2026-05-01. **Cuándo abordar**: P2 — Sprint 12 Settings+KB (la página `/admin/settings/*` se construye en ese sprint). | P2 |
| **DC.23** | **Bundles producto+SI** ([ADR-061 §"Cuándo revisar"](../10-decisions/adr-061-support-inside-tier-cuenta-ux.md)) — "Hosting Web Pro + Support Inside Pro como bundle único" no diseñado. Trigger condicional: cuando un cliente real lo pida o cuando comercial decida empaquetar como oferta. Requiere ADR propio (modelo de bundles cross-producto + facturación combinada). **Cuándo abordar**: trigger condicional, no sprint asignado. | Trigger condicional |
| **DC.24** | **Listado admin `/admin/clients` con columna/badge Support Inside** — `/admin/clients` no muestra qué clientes tienen SI activo (auditoría #2). Plan: extender `clientsService.findAll` con `include support_inside_subscription { product { name } }` + columna en frontend `ClientsListPage` con `<Badge variant="brand">SI {tier}</Badge>` o icono escudo. **Detectado**: Auditoría 2026-05-01. **Cuándo abordar**: P2 mejora UX admin — oportunista al tocar `/admin/clients` o sub-sprint dedicado a UX admin con visibilidad cross-módulo. | P2 oportunista |
| **DC.25** | **Card servicio cliente "Cubierto por Support Inside"** — cuando exista `/dashboard/services` (Sprint 11 Provisioning), añadir badge en cada card si `service.support_inside_slots.some(s => !s.released_at)` + tipo de slot (`maintenance` / `maintenance_management`). Auditoría #8. **Cuándo abordar**: Sprint 11 Provisioning, en el mismo PR que construya las cards de servicio. | Sprint 11 |
| **DC.26** | **Topbar/avatar indicador SI cliente** — icono escudo dorado pequeño junto a la campana cliente si SI activo (auditoría #9). Requiere field en sesión auth o query rápida en `_shared/shell/Topbar.tsx`. **Cuándo abordar**: P3 pulido visual — no bloquea, oportunista al tocar `Topbar.tsx` por otro motivo. | P3 oportunista |
| **DC.28** | **Auth server-side con cookies httpOnly + CSRF + refresh rotation** — JWT vive hoy en `localStorage` (vulnerable a XSS) y se atacan endpoints con `Authorization: Bearer` desde Client Components. Doctrina industrial (OWASP, Auth0, Vercel App Router) exige cookies httpOnly + Secure + sameSite + double-submit CSRF + refresh rotation con detección de replay. **Plan canónico congelado en [ADR-078](../10-decisions/adr-078-auth-server-side-cookies-httponly.md)** (2026-05-02): backend emite cookies en login/verify-2fa además del body (compat tests), JwtStrategy lee header **o** cookie, frontend `getServerSession()` + `serverFetch()` helpers, CSRF middleware en mutaciones cookie-authenticated. Acoplada con DC.6 (Server Components requieren auth server-side) en Sprint 13 §13.AUTH. Sprint 11 Fase 11.D es la **última excepción permitida** del patrón viejo — Sprint 12+ requiere SC nativo. Trazabilidad mecánica: `grep TODO(ADR-078) frontend/app` da la lista exacta a migrar. **Detectado**: cierre Sprint 11 Fase 11.C (2026-05-02). | Sprint 13 §13.AUTH (acoplado DC.6) |
| **DC.27** | **Migrar job E2E del CI a imagen oficial Playwright** (`mcr.microsoft.com/playwright:v<X>-noble`) — el job CI E2E hoy parte de imagen Ubuntu base + `apt-get install` para Playwright deps. Detectado 2026-05-02 (cierre Sprint 11): un runner se quedó 2h colgado en espejos Azure de `apt-get update`. Solución estructural canónica documentada por Playwright: usar la imagen oficial que ya trae todo preinstalado. Mejora colateral: ~2 min menos por run. Plan: editar `.github/workflows/ci.yml` job E2E para usar `container: image: mcr.microsoft.com/playwright:v1.NN.0-noble` (sincronizar versión con `playwright/test` del repo). Eliminar el bloque `apt-get install`. Verificar que la versión major:minor coincide con `package.json` para evitar drift de browsers. **Cuándo abordar**: oportunista cuando el flake reincida, o en Sprint 13 Hardening junto con DC.13 (paralelización E2E). | Oportunista / Sprint 13 |
| **DC.29** | **Bloque "Servicios contratados" en `/admin/clients/[id]`** — `/admin/services` (Sprint 11 Fase 11.D) sirve para vista cross-cliente con filtros (ops/incidentes), NO para atención cotidiana al cliente. Cuando el agente abre la ficha de un cliente concreto necesita ver de un vistazo qué servicios tiene (con su estado, plugin, vencimiento, link al detalle) sin tener que ir a `/admin/services` y filtrar. Plan: extender `clientsService.findOne` con `include services { include product, billingProfile }` + nuevo bloque `<ClientServicesBlock>` en `/admin/clients/[id]` (tabla compacta o cards) + link a `/dashboard/services/[id]` (vista impersonando cliente) o `/admin/services/:id` (cuando exista — Sprint 13). **Detectado**: cierre Sprint 11 Fase 11.D (2026-05-02). **Cuándo abordar**: oportunista al tocar `/admin/clients/[id]` por otro motivo, o sub-sprint UX admin con DC.24 + DC.25 + esta. | Oportunista / sub-sprint UX admin |
| **DC.30** | **UI inline del slot Support Inside desde `/dashboard/services/[id]`** (DC.17 cierre parcial) — el endpoint backend (`POST /api/v1/support-inside/slots/assign-service`) y la vista detalle servicio (Sprint 11 Fase 11.D) están listos. Falta: formulario inline en la card del servicio que permita al cliente solicitar/asignar un slot SI directamente desde ahí (en lugar de ir a `/dashboard/support-inside` → modal "Asignar slot"). Beneficio UX: el cliente que está mirando un servicio que se beneficiaría de mantenimiento ve un CTA claro "Cubrir con Support Inside" sin cambiar de página. Plan: nuevo componente `<RequestSlotInline>` en `frontend/app/_shared/services/` que llama al endpoint existente, valida elegibilidad client-side (plan SI activo + `applicable_product_types` cubre el `product.type` del servicio), tests E2E. **Detectado**: cierre Sprint 11 Fase 11.D. **Cuándo abordar**: oportunista o Sprint 12 cuando se aborden mejoras de Support Inside. | Oportunista / Sprint 12 |
| **DC.31** | **`<AuditLogFeed>` inline en `/dashboard/services/[id]`** — diferido por decisión Sprint 11 Fase 11.E. La transparencia RGPD ya vive globalmente en `/dashboard/transparency` desde Sprint 9 (todas las acciones del staff sobre el cliente + accesos del cliente). Replicar feed inline en cada detalle de servicio añadiría redundancia sin valor claro. Si en futuras revisiones UX un cliente solicita "ver qué pasó con ESTE servicio en concreto", entonces se diseña: extender `AuditService.list` con filtro `service_id` + componente DS feed cronológico. **Cuándo abordar**: trigger condicional (solicitud cliente) o sprint UX dedicado. | Trigger condicional |

---

## Items NO en backlog (decididos no hacer)

| # | Item | Motivo |
|---|------|--------|
| **NO.1** | ~~We Do It For You como addon~~ ([ADR-022](../10-decisions/adr-022-wdify-deprecado-proyectos.md)) | Reemplazado por Sprint 22 Projects |
| **NO.2** | ~~Microservicios + Kubernetes~~ ([ADR-056](../10-decisions/adr-056-estrategia-escalabilidad.md)) | Overkill para esta escala. Monolito modular es correcto. |
| **NO.3** | ~~GraphQL~~ ([ADR-056](../10-decisions/adr-056-estrategia-escalabilidad.md)) | REST es la decisión. |
| **NO.4** | ~~Hosting agency como tipo de producto~~ ([ADR-024](../10-decisions/adr-024-eliminacion-hosting-agency.md)) | Eliminado. Partners venden hosting_web. |
| **NO.5** | ~~Cambiar de Prisma a otro ORM~~ ([ADR-056](../10-decisions/adr-056-estrategia-escalabilidad.md)) | Limitaciones conocidas pero cambio = más riesgo que beneficio. Para hot paths: `$queryRaw`. |

---

## Cómo añadir items a este backlog

1. Si el item nace de una **auditoría/incidente**, referenciar el documento origen.
2. Si es un **sprint completo**, redactar usando [`_sprint-template.md`](./_sprint-template.md) en una hoja aparte y aquí solo poner el resumen.
3. Si es **deuda continua**, ponerlo en sección DC y describir cuándo se debe abordar (oportunismo) en lugar de sprint dedicado.
4. Si se decide **NO hacer algo**, moverlo a "Items NO en backlog" con ADR como respaldo.

**Regla:** este backlog se actualiza al cierre de cada sprint mayor. La auditoría 2026-04-26 estableció el baseline.
