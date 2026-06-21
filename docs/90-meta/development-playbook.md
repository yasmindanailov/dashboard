# Development Playbook — Aelium Dashboard

> **Tu manual de operaciones para desarrollar este proyecto de forma profesional.**
> Si solo lees un documento de la carpeta `90-meta/`, que sea este.

---

## 1. Estado actual del proyecto (snapshot)

### Lo que está SÓLIDO

✅ **6 capas de validación automática activas** — typecheck, build, tests, lint, hooks pre-commit/pre-push, CI verde.
✅ **Tests E2E cubriendo los 3 flujos críticos** (auth, billing, support).
✅ **Documentación arquitectónica completa**:
- Reglas R1–R16 + D1–D11 unificadas en `docs/00-foundations/rules.md`
- Glosario canónico en `docs/00-foundations/glossary.md`
- Contracts de los 8 módulos en `docs/20-modules/`
- Matriz de dependencias y catálogo de eventos
- 84 ADRs individuales en `docs/10-decisions/` (F2 cerrado — `DECISIONS.md` legacy con mapping § → ADR)
- Schema partido por dominio en `docs/30-data/` (F3 cerrado — `DATABASE_SCHEMA.md` legacy con mapping tabla → archivo)
- Referencias operativas en `docs/50-operations/` (F5 cerrado — settings, plantillas, jobs, errores)
- Roadmap profesional en `docs/60-roadmap/` (F6 cerrado — current, backlog priorizado P0-P3, archive de sprints cerrados, plantilla activa)
- Auditoría código vs doc en `docs/90-meta/audit-2026-04-26.md` (verdad verificada que alimenta el roadmap)
- Definition of Done escrito y plantilla de sprint lista

✅ **Conformidad arquitectónica**:
- Regla R1 (módulos por eventos): 100% conforme
- Subservices Regla R15: aplicados correctamente en 5 módulos

### Postura de deploy (formalizada 2026-04-29)

📜 **[ADR-069 — Estrategia de deploy diferido](../10-decisions/adr-069-estrategia-deploy-diferido.md)**: el proyecto es a largo plazo, sin clientes esperando ni demo pública. Sprint 14 Deploy real está reclasificado como **gate condicionado P-DEPLOY**, no como cola activa. Toda la deuda dependiente de prod queda agrupada bajo P-DEPLOY hasta trigger explícito (cliente real / demo / captación / decisión consciente). Mientras tanto, la cola activa la ordena el **valor funcional**, no la cercanía al deploy.

### Lo que tiene DEUDA conocida

⚠️ **Outbox Pattern (R8)**: **5 eventos lo usan** — `invoice.*` (created/paid/failed/overdue) + `domain.registered` (15D.D) vía `OutboxService` + `OutboxWorker` en `backend/src/core/outbox/`. Pendiente extender a `service.*` y `partner.*`. ADR-033 documenta el patrón canónico. **Bajo P-DEPLOY (no urgente — ADR-069)** — ver auditoría 2026-06-21 (MEDIUM-1: `service.*` ya accionable, precondición Sprint 11 cumplida).
✅ **Sprint 8 (Tasks + Support Inside)** — **cerrado 2026-05-01** (~6 sesiones, ~25 commits, 5 ADRs nuevos 072..076). Retrospectiva en [`completed/sprint-8-tasks-support-inside.md`](../60-roadmap/completed/sprint-8-tasks-support-inside.md). Documentación operativa en [`docs/features/tasks/`](../features/tasks/) y [`docs/features/support-inside/`](../features/support-inside/). Cobertura final: 157/157 unit + 117/117 E2E verde, 5 migraciones aplicadas. Eventos task aún huérfanos: `task.created`, `task.completed` (audit Sprint 9 Fase E pendiente — EC-T8-44).

✅ **Sprint 11 (Provisioning) — cerrado 2026-05-02** (~3 sesiones, 7 PRs, 2 ADRs nuevos 077 + 078). Retrospectiva en [`completed/sprint-11-provisioning.md`](../60-roadmap/completed/sprint-11-provisioning.md). Documentación operativa en [`docs/features/services/`](../features/services/) y [`docs/features/provisioning/admin.md`](../features/provisioning/admin.md). Cobertura final: **241/241 unit + 129/129 E2E verde**, 1 migración. Plugins triviales `internal` + `manual` operativos sobre el chasis canónico (3 wrappers cross-cutting + cache Redis DB 2 + plugin registry + cola BullMQ `provisioning-dispatch` con DLQ). Frontend: 3 páginas + 5 componentes shared. Decisión local registrada: el orquestador emite evento NUEVO `service.activated` (coexiste con `service.provisioned` legacy de `BillingCheckoutService` para preservar Sprint 8 D.12.9). 4 DCs nuevas en backlog (DC.27 Playwright image, DC.29 bloque Servicios admin/clients, DC.30 UI inline slot SI, DC.31 AuditLogFeed inline diferido).
✅ **DC.6 — Frontend `set-state-in-effect`**: **CERRADA** (Sprint 13 §13.AUTH). La regla está en `error` global en `frontend/eslint.config.mjs`; el antipatrón se erradicó migrando a Server Components y los call-sites legítimos React 19 llevan supresión per-línea justificada. `pnpm --dir frontend lint:check --max-warnings=0` pasa con **0 warnings** (verificado auditoría 2026-06-21).
⚠️ **~11 eventos huérfanos** (clasificados en `_events.md`; varios son hooks aspiracionales para módulos futuros, pero algunos `auth.*` YA los consume `audit` desde Sprint 13.5 → reconciliar `_events.md`, ver auditoría 2026-06-21).
⚠️ **Sentry preparado, sin DSN configurado** — decisión consciente. Activar al desplegar a producción.
⚠️ **Crons en `@nestjs/schedule` (in-process)** — ~10 crons que duplicarán trabajo al escalar a múltiples instancias (`billing-lifecycle`/`service-lifecycle` son los críticos). Migrar a BullMQ con leader election cuando aplique. (El dispatch de **Outbox YA** corre en BullMQ repeatable con leader election — ADR-064, no `@Interval`.) Ver auditoría 2026-06-21 (TDI-OUTBOX-CRONS-2).

### Lo que NO existe todavía

❌ **8 módulos stub** sin implementación (audit, notifications, promotions, error-log, infrastructure, knowledge-base, provisioning, partner). Plan de cada uno en sus respectivos `contract.md`.
❌ **Plugin de pago real** (Stripe). Sprint dedicado post-Sprint 14.
❌ **Producción desplegada**. Hoy todo es localhost vía Docker.

---

## 2. Tu flujo de trabajo profesional

### Cuando arrancas un sprint nuevo

1. Copia [`docs/60-roadmap/_sprint-template.md`](../60-roadmap/_sprint-template.md) y rellénalo en una rama nueva, o añade tu sprint como sección a [`current.md`](../60-roadmap/current.md) si es continuación de uno en curso.
2. Rellena las 10 secciones de la plantilla **antes** de empezar a codificar:
   - Objetivo en 1 frase
   - Depende de
   - Produce (contratos nuevos: endpoints, eventos, modelos)
   - Modifica (contratos existentes)
   - Pasos atómicos
   - Edge cases anticipados
   - Definition of Done
   - Riesgos
   - Decisiones a registrar
3. Si el sprint introduce un módulo nuevo → crear `contract.md` siguiendo plantilla en `docs/20-modules/_template-contract.md` **antes** de codificar.
4. Si introduce decisión de arquitectura → crea un ADR en [`docs/10-decisions/`](../10-decisions/) (F2 cerrado: 84 ADRs vivos). Sigue el formato de los existentes (`adr-NNN-titulo-kebab.md`) y enlázalo desde el contract afectado.

### Cuando cierras un sprint

Ejecuta el [Definition of Done](./definition-of-done.md):
- [ ] Código: build, typecheck, tests, lint pasan
- [ ] CI verde tras último push
- [ ] Documentación: `contract.md`, `admin.md`, eventos en `_events.md` actualizados
- [ ] Smoke test manual (tú, en el navegador) de los flujos críticos
- [ ] Commits con Conventional Commits

### Cuando un PR / push sale rojo en CI

1. Abrir el run en `github.com/yasmindanailov/dashboard/actions`
2. Identificar el job rojo (Backend / Frontend / E2E)
3. Si **E2E rojo:** descargar artifact `playwright-report`. El HTML tiene screenshots y traces.
4. Pegarme el log relevante (no todo) y el contexto de qué tocaste.
5. **No mergees hasta que esté verde.**

### Cuando el dev server del frontend crashea (Turbopack worker)

Síntoma típico: `Jest worker encountered N child process exceptions, exceeding retry limit` al navegar a una página específica. Es un **crash del compilador Turbopack**, no un bug de tu código (Next.js 16 + Turbopack tiene este modo de fallo cuando la caché `.next/` se corrompe o el worker se queda sin memoria tras horas de desarrollo).

Procedimiento estándar (en este orden):

1. **Detén el dev server** del frontend con `Ctrl+C` en su terminal.
2. **Limpia caché:** `cd frontend && pnpm dev:clean` (alias de `rm -rf .next/`).
3. **Reinicia:** `pnpm dev`.
4. **Si reaparece tras limpiar caché**, fallback a webpack (más lento pero estable):
   ```bash
   cd frontend && pnpm dev:webpack
   ```
   Documentado en `node_modules/next/dist/docs/01-app/03-api-reference/08-turbopack.md` como vía oficial de fallback.
5. **Si persiste con webpack**, abre issue: probablemente es un bug específico de la página (CSS module mal formado, importación circular, etc.). Léeme el log real del terminal (no el overlay del navegador) — el "Jest worker exception" oculta el error de fondo.

### Cuando vayas a desplegar a producción

> ⚠️ **Política canónica ([ADR-069](../10-decisions/adr-069-estrategia-deploy-diferido.md))**: el deploy productivo (Sprint 14) **NO se ejecuta por defecto**. Requiere trigger explícito: cliente real con fecha de onboarding, demo pública, campaña de captación, validación externa de UX, o decisión consciente documentada. Si no se cumple ningún trigger, **no es momento de desplegar** — la cola activa son features.

Cuando el trigger se cumpla y Sprint 14 se active, ejecuta toda la lista P-DEPLOY de [`backlog.md`](../60-roadmap/backlog.md) en una sola pasada (commit atómico o cadena corta), incluyendo:

1. Define `SENTRY_DSN` en el hosting → activa observabilidad.
2. Define `NEXT_PUBLIC_API_URL` real (no localhost).
3. Define los secrets sensibles (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`) — generar nuevos, no usar los de dev.
4. Configura SMTP real (Mailgun, SES, etc.) en lugar de MailPit.
5. Migra Postgres + Redis a managed services o instancias dedicadas.
6. **Cierra ventana de aliases REST** ([ADR-068 §3](../10-decisions/adr-068-multi-path-deprecation-headers.md)) — eliminar paths legacy del array `@Controller([...])`.
7. **Reemplaza fire-and-forget R2** de PDFs (`InvoicePdfStorageService.generateAndUploadInBackground`) por job persistente BullMQ.
8. **Extiende Outbox a `service.*` / `partner.*`** si esos módulos están implementados (R8).
9. Habilita branch protection en GitHub Pro/Team (cuando upgrade del plan Free).
10. Dry-run de Sprint 14 contra staging desechable antes del primer push productivo + checklist + runbook.

---

## 3. Cuándo invocar a Claude y para qué

### Invocaciones de bajo coste (1 sesión, ≤30 min)

| Caso | Qué pedir |
|------|-----------|
| CI rojo | "CI rojo en commit X, log: ..." |
| Bug en local | "Esto no funciona, paso reproducción: ..." |
| Cambio puntual de UI | "Cambia el copy de X a Y en página Z" |
| Verificar que algo cumple las reglas | "¿Esta función cumple R5?" |

### Invocaciones medias (1 sesión, 30 min – 2 h)

| Caso | Qué pedir |
|------|-----------|
| Cerrar Sprint 8 (Tasks) | "Cierra Sprint 8: añade listener task.assigned, valida assigned_to, arregla los 2 errores lint" |
| Implementar feature pequeña | "Añade endpoint X con su contract.md actualizado" |
| Revisar PR | "Revisa estos cambios contra rules.md y _matrix.md" |
| Refactor R15 de un archivo | "Este archivo supera 300 líneas, divide en sub-services" |

### Invocaciones largas (1+ sesiones, ≥2 h)

| Caso | Qué pedir |
|------|-----------|
| Implementar módulo nuevo | "Implementa partner siguiendo `partner/contract.md`" |
| Sanear deuda técnica | "Resuelve los 229 errores no-unsafe-* del backend (F0.6c)" |
| Outbox Pattern para `invoice.*` | "Implementa Outbox para los 4 eventos invoice según R8" |
| Continuar refactor de doc | "Procede con F2 (ADRs) o F3 (schema por dominio)" |

### Patrón obligatorio al pedirme algo

Acompáñalo siempre con:
- **Contexto:** ¿qué módulo? ¿qué estás intentando? ¿qué has probado?
- **Referencias:** "según `billing/contract.md`", "para cumplir R8", etc.
- **Aceptación:** ¿cómo sabremos que está terminado? (DoD aplicable)

---

## 4. Refactor de documentación (F1–F9) — ✅ 100% completo

- ✅ F0 (7 salvaguardas)
- ✅ F1 (foundations: rules + glossary)
- ✅ F2 (84 ADRs individuales en `docs/10-decisions/`, `DECISIONS.md` marcado legacy con mapping § → ADR)
- ✅ F3 (`docs/30-data/` con 14 archivos por dominio, `DATABASE_SCHEMA.md` marcado legacy con mapping tabla → archivo)
- ✅ F4 (contracts + matrix + events) ⭐ la pieza más impactante
- ✅ F5 (`docs/50-operations/` con settings-reference, email-templates, jobs-reference, api-errors)
- ✅ F6 (`docs/60-roadmap/` con README, current, backlog priorizado P0-P3, archive de sprints 0-6 en `completed/`, plantilla activa). `ROADMAP.md` legacy con header puntero. **Auditoría 2026-04-26 alimenta el roadmap nuevo con verdad verificada.**
- ✅ **F7** (voz de marca: `DESIGN_SYSTEM.md §D11` y `UI_SPEC.md §P5` convertidos en punteros al canónico `aelium-documento-de-marca.md §VOZ DE MARCA` — sólo conservan ejemplos UI específicos)
- ✅ **F8** (`docs/20-modules/partner/admin.md` — guía operativa para administrar partners cuando el módulo se implemente)
- ✅ **F9** (`docs/90-meta/reading-order.md` — qué leer según tipo de tarea, optimizado por contexto)

**Estado de la documentación:** ✅ **completa al 100%.** El próximo paso natural es **abordar P0 del backlog** ([`docs/60-roadmap/backlog.md`](../60-roadmap/backlog.md)): cerrar Sprint 8 + Outbox `invoice.*` + F0.6 saneamiento lint.

---

## 5. Pendiente de desarrollo (features)

> 🎯 **P0 cerrado al 100%** (2026-04-26) · **P1.1 / P1.1.5 / P1.1.6** cerrados (2026-04-27/28) · **P1.2 Sprint 11.5 (MinIO)** cerrado (2026-04-26).
> 📜 **[ADR-069](../10-decisions/adr-069-estrategia-deploy-diferido.md) reclasifica P1.4 Sprint 14 Deploy como gate condicionado P-DEPLOY** — no está en cola activa.

### Cola activa (orden recomendado por valor funcional, post [ADR-070](../10-decisions/adr-070-service-info-sso-acciones-curadas.md) 2026-04-29)

1. ~~**Sprint 8 residual — Tasks + Support Inside**~~ ✅ **Cerrado 2026-05-01** — ver [`completed/sprint-8-tasks-support-inside.md`](../60-roadmap/completed/sprint-8-tasks-support-inside.md).
2. ~~**P2.1 Sprint 11 — Provisioning**~~ ✅ **Cerrado 2026-05-02** — ver [`completed/sprint-11-provisioning.md`](../60-roadmap/completed/sprint-11-provisioning.md). Contrato `ProvisionerPlugin` v2 congelado (ADR-077) + chasis canónico + plugins triviales `internal`/`manual` + frontend (3 páginas + 8 endpoints REST). 2 ADRs nuevos (077 + 078).
3. **P2.2 Sprint 15A — Plugin Framework** (manifest + loader + UI dinámica desde Settings + encriptación API keys + helpers `core/provisioning/plugin-utils.ts`) — ~1-2 sesiones. **Cabeza de cola activa post Sprint 11.**
4. **P2.3 Sprint 15D — Plugin ResellerClub (dominios)** — primer plugin externo. SaaS, no usa Sprint 10. Acciones curadas: DNS records CRUD + transfer out + auto-renew. ~2 sesiones.
5. **P2.4 Sprint 15C — Plugin Enhance CP (hostings)** — segundo plugin SaaS. Tampoco usa Sprint 10. Acciones curadas: reset password + view disk/bandwidth. SSO al panel Enhance. ~2-3 sesiones.
6. **P2.5 Sprint 10 — Infrastructure** (CRUD servidores + pools + capacidad detectada + cron `poll-server-metrics` + algoritmo `pickServerForProduct` + UI `/admin/infrastructure` + editor `docker_templates`) — ~2 sesiones. **Emparejado con P2.6.**
7. **P2.6 Sprint 15E — Plugin Docker Engine** — provisioner contenedores Docker + Collabora compartido + métricas Docker stats por contenedor + acciones curadas (restart, view_logs, reset_admin_password, change_subdomain). ~3 sesiones. **Único consumidor real de Sprint 10 — por eso se ejecutan en cadena corta.**
8. **P2.7 Sprint 12 — Settings + Knowledge Base** (página settings categorizada + gestión plugins via UI dinámica + editor marca + prefijo numeración configurable + due_date desde settings + KB articles) — ~2-3 sesiones.
9. **P2.8 Sprint 12.5 — Portal Transparencia RGPD** (zona transparencia cliente, integrations registry, consentimientos, editor textos legales, exportación datos, eliminación cuenta) — ~2-3 sesiones.
10. **P2.9 Sprint 13 — Hardening + Escalabilidad** (httpOnly cookies, refresh rotation, audit trail global, validaciones billing edge cases, Redis adapter Socket.io, N+1 audit, cursor pagination, caching, R15 restantes, **DC.13 paralelización E2E**, **DC.14 AdminSidebar collapse**, **DC.15 colapso `SIDEBAR_PERMISSIONS`** duplicado).

> 📜 **Doctrina de orden** ([ADR-070](../10-decisions/adr-070-service-info-sso-acciones-curadas.md)):
> - Sprint 11 + Plugin Framework primero, **antes** de cualquier plugin concreto, para fijar la interfaz extendida.
> - **Plugins SaaS antes que Sprint 10**: `resellerclub` y `enhance_cp` no consumen `infrastructure`. Construir Sprint 10 antes que ellos sería YAGNI (módulo sin consumidor).
> - Sprint 10 + Sprint 15E **emparejados** porque el plugin Docker es el único consumidor real de `servers`/`server_pools`/`server_metrics`.
> - Sprint 12 (Settings + KB) tras los plugins porque la UI dinámica de settings depende del manifest declarado por cada plugin.

### Continuo / oportunista (sin sprint dedicado)

- **P1.3 Sprint 7.5 Fase 2** — migración progresiva al Design System. Al tocar página, migrar en el mismo PR.
- **DC.5 R15 restantes** — al tocar el archivo.
- ~~**DC.6 Migración fetch → Server Components + Suspense**~~ ✅ **cerrada** (Sprint 13 §13.AUTH; lint frontend a 0 warnings — auditoría 2026-06-21).
- **DC.8 Listeners `auth.*`** → `AuditService.logAccess(...)` — al tocar `auth/*`.
- **DC.11 Suite E2E env coherente** — documentar al preparar Sprint 14 o tocar tests.

### Gate condicionado: P-DEPLOY (Sprint 14 — ADR-069)

> No está en cola activa. Se ejecuta cuando se cumple un **trigger de negocio**: cliente real con fecha de onboarding, demo pública, captación activa, validación externa de UX, o decisión consciente de Yasmin.

- **P-DEPLOY.1** Sprint 14 — Deploy real (Docker Compose prod + Traefik + SSL + Grafana/Prometheus/Loki + pipeline + backups Cloudflare R2 + Sentry real + reglas WAF `/admin/*` + rate limiting diferenciado).
- **P-DEPLOY.2** Backup + recovery plan documentado (RTO < 4h, RPO < 6h).
- **P-DEPLOY.3** Cierre ventana aliases REST ([ADR-068 §3](../10-decisions/adr-068-multi-path-deprecation-headers.md)).
- **P-DEPLOY.4** Outbox extendido a `service.*` / `partner.*` (cuando sus módulos estén implementados).
- **P-DEPLOY.5** Reemplazo fire-and-forget R2 PDFs por job persistente BullMQ.

### P3 — Features grandes (Fase 2, plugins, canal partner, i18n)

Plugin framework, Stripe, ResellerClub, Docker Engine, Claude AI; Projects, CRM, Tickets redesign, Citations, AI Workers, Promotions, Referral, Partner module, i18n. Cada uno gobernado por su propio sub-sprint independiente — ver [`backlog.md` P3](../60-roadmap/backlog.md).

---

## 6. Reglas de oro para no romper nada

### Antes de tocar código

1. Lee el `contract.md` del módulo afectado.
2. Si vas a modificar la API pública → planifica el cambio en el contract antes de codificar.
3. Si introduces evento → añádelo a `_events.md` antes de emitirlo.
4. Si vas a usar un nombre nuevo → busca primero en `glossary.md` por si ya existe canónico.

### Mientras codeas

5. Respeta R15: si un archivo crece más de los límites, divídelo en sub-services antes de añadir lógica nueva.
6. Si tu cambio toca un módulo del que dependen otros (ver matrix inversa) → ejecuta tests E2E completos.
7. Conventional Commits siempre. `commitlint` te ayuda.

### Antes de pushar

8. Pre-commit + pre-push corren solos. Si rechazan, no fuerces (`--no-verify`) salvo emergencia documentada.
9. CI verde antes de merge. Si tarda en pasar a verde, no acumules más cambios — arregla primero.

### Cosas que NO se hacen

❌ **Borrar una factura** (BILL-INV-2)
❌ **Eliminar el último ProductPricing activo de un producto** (PROD-INV-5)
❌ **Modificar tablas de audit** — solo INSERT (R3)
❌ **Importar plugin directamente desde core** (R4)
❌ **Tragar errores en frontend con `catch {}` vacío** (R14)
❌ **Calcular precio de factura en frontend** (R5)
❌ **Eliminar reglas de `rules.md` sin ADR** (sólo se modifican vía ADR)

---

## 7. Cuando algo se rompe en producción (futuro)

Hoy estás en localhost; cuando despliegues:

1. **Sentry** te llega por email. Investiga el correlation ID en los logs.
2. Buscar en logs por correlation ID → ver toda la cadena (request → eventos → jobs).
3. Hipótesis → reproducir local → fix → test que cubra → push → deploy.
4. **Documentar el incident** en `docs/60-roadmap/incidents.md` — el archivo no existe aún (lo creará el primer incident real post-deploy). Estructura sugerida: una entrada por incident con ID, fecha, severidad, sintomáticos, causa raíz, fix, follow-ups.
5. Si la causa es deuda conocida → priorizarla en próximo sprint.

---

## 8. Costes (referencia rápida)

| Servicio | Plan | Coste actual | Cuándo upgrade |
|----------|------|--------------|----------------|
| GitHub | Free privado | 0 € | Cuando necesites branch protection o equipo: GitHub Pro $4/mes |
| Sentry | Free (5k errores/mes) | 0 € | Si el volumen real supera 5k/mes |
| Hosting | (no decidido) | — | Cuando despliegues |
| Stripe | (no integrado) | — | Cuando se priorice plugin de pago |

---

## 9. Documentos clave (orden de lectura sugerido)

Cuando vuelvas tras tiempo, lee en este orden:

1. **`docs/90-meta/phase-0-completed.md`** — qué hay y por qué
2. **Este archivo** (`development-playbook.md`) — cómo procedo
3. **`docs/00-foundations/rules.md`** — qué nunca rompo
4. **`docs/00-foundations/glossary.md`** — términos
5. **`docs/20-modules/_matrix.md`** — cómo se conectan los módulos
6. **`docs/20-modules/<modulo>/contract.md`** del módulo que vayas a tocar
7. **`docs/10-decisions/README.md`** — índice de los 84 ADRs (consultar cuando una decisión no esté clara)
8. **`docs/30-data/README.md`** — índice de tablas por dominio (consultar antes de tocar el schema)
9. **`docs/50-operations/README.md`** — índice de settings, plantillas, jobs, errores (consultar antes de añadir cualquiera de los cuatro)
10. **`docs/60-roadmap/README.md`** — qué está en curso, qué viene priorizado P0-P3, qué se ha cerrado
11. **`docs/90-meta/audit-2026-04-26.md`** — última auditoría: estado real del proyecto (consultar si hay duda sobre coherencia código↔doc)

---

## 10. Mi recomendación honesta para tu próxima sesión

> **Estado actualizado 2026-05-02.**
> ✅ **P0 cerrado al 100%** (2026-04-26).
> ✅ **P1.1 Sprint 9** (Audit + Notifications + BullMQ + DLQ) cerrado 2026-04-27 — [`completed/sprint-9-audit-notifications-bullmq.md`](../60-roadmap/completed/sprint-9-audit-notifications-bullmq.md).
> ✅ **P1.1.5 Sprint 9.5** (UX admin notifications) cerrado 2026-04-27 — [`completed/sprint-9-5-ux-admin-notifications.md`](../60-roadmap/completed/sprint-9-5-ux-admin-notifications.md).
> ✅ **P1.1.6 Sprint 9.6** (DC.7 split admin/cliente + 3 ADRs nuevos 066/067/068) cerrado 2026-04-28 — [`completed/sprint-9-6-split-admin-cliente.md`](../60-roadmap/completed/sprint-9-6-split-admin-cliente.md).
> ✅ **P1.2 Sprint 11.5** (MinIO Storage) cerrado 2026-04-26 — [`completed/sprint-11-5-minio-storage.md`](../60-roadmap/completed/sprint-11-5-minio-storage.md).
> ✅ **Sprint 8** (Tasks + Support Inside, 5 ADRs nuevos 072..076) cerrado **2026-05-01** — [`completed/sprint-8-tasks-support-inside.md`](../60-roadmap/completed/sprint-8-tasks-support-inside.md).
> ✅ **P2.1 Sprint 11** (Provisioning, 2 ADRs nuevos 077 + 078) cerrado **2026-05-02** — [`completed/sprint-11-provisioning.md`](../60-roadmap/completed/sprint-11-provisioning.md). 7 PRs (#13→#19), 8 endpoints REST, 5 eventos `service.*` nuevos, cobertura 241/241 unit + 129/129 E2E verde. Plugins triviales `internal` + `manual` operativos sobre chasis canónico congelado por ADR-077. Plugins reales en Sprint 15A-G.
> 🧹 **Saneamiento documental 2026-05-02**: 5 sprints cerrados que vivían en `current.md` por inercia (9 / 9.5 / 11.5 / 9.6 / 11) movidos a `completed/`. `current.md` ahora muestra solo Sprint 7 + 7.5 (paraguas continuos) + punteros cronológicos a los cerrados.
> 📜 **Política deploy diferido formalizada en [ADR-069](../10-decisions/adr-069-estrategia-deploy-diferido.md)** (2026-04-29): Sprint 14 reclasificado como **gate condicionado P-DEPLOY**, no como cola activa.

### Política canónica para "qué viene ahora" (post ADR-069)

El proyecto es **a largo plazo**, sin clientes esperando ni demo pública pendiente. Por tanto, la cola activa **NO** la ordena la cercanía al deploy productivo, sino el **valor funcional de cada sprint**. Sprint 14 espera trigger explícito (cliente real, demo, captación, decisión consciente). Mientras tanto, la cola activa es feature work de los módulos pendientes.

### Vías legítimas para el siguiente sprint (ordenadas por valor profesional)

#### Vía 1 (recomendada por defecto) — Sprint 15A Plugin Framework (P2.2, sigue cabeza de cola P2 tras Sprint 11)

- **"Implementa Sprint 15A — manifest plugin + loader dinámico desde Settings + encriptación API keys + helpers `core/provisioning/plugin-utils.ts` extendidos. Construye sobre el contrato congelado por ADR-077."**
- ~1-2 sesiones.
- **Por qué primero**: con Sprint 11 cerrado y el contrato `ProvisionerPlugin` v2 congelado, Sprint 15A construye el framework necesario para que Sprints 15C/D/E/G (plugins reales) tengan UI dinámica de configuración + carga de credenciales encriptadas + helpers compartidos. Cero refactor del contrato porque ADR-077 lo selló.
- **Lo que cierra**: el "sistema operativo" de los plugins. Sin él, cada plugin Sprint 15C+ tendría que reimplementar carga de credenciales + UI Settings.

#### Vía 2 — Sprint 13 Hardening §13.AUTH (P2.9, desbloquea Sprint 12)

- **"Implementa Sprint 13 §13.AUTH — cookies httpOnly + refresh rotation con replay detection + CSRF middleware + frontend SC nativo bulk migrate. Cierra DC.6 + DC.28 acoplados según ADR-078."**
- ~3-5 sesiones.
- **Por qué tiene sentido**: ADR-078 §5 establece que Sprint 12 (Settings + KB) **NO arranca hasta que Sprint 13 §13.AUTH cierre**. Si la prioridad es Sprint 12, primero hay que cerrar Sprint 13 §13.AUTH. Trazabilidad mecánica de archivos a migrar via `grep -r "TODO(ADR-078" frontend/app`.
- **Lo que cierra**: deuda transversal de seguridad (XSS via localStorage) + 27+24 warnings DC.6 + bloqueo doctrinal Sprint 12+.

#### Vía 3 — Sprint 10 Infrastructure (P2.5, independiente)

- **"Implementa Sprint 10 — CRUD servidores + pools + capacidad detectada automáticamente + docker_templates UI."**
- ~2 sesiones, **sin dependencias**.
- **Por qué tiene sentido**: emparejado con Sprint 15E (Plugin Docker Engine) en cadena corta — son los únicos consumidores reales de la infra `servers/server_pools`. Si la prioridad es Docker Engine, abrir Sprint 10 antes que Sprint 15A/C/D/E es legítimo.
- **Por qué no por defecto**: el plan canónico (ADR-070) recomienda Plugin Framework primero, antes de plugins concretos. Sin Sprint 15A, Sprint 10 está sin consumidor real definido (YAGNI).

### Mi voto profesional: Vía 1 (Sprint 15A Plugin Framework)

**Estado 2026-05-02:** Sprint 11 cerrado al 100%. La cabeza de cola activa P2 pasa a Sprint 15A según [ADR-070](../10-decisions/adr-070-service-info-sso-acciones-curadas.md) §"Doctrina de orden": Plugin Framework antes de plugins concretos.

Razones:
1. **Sprint 11 cerrado al 100%** (2026-05-02) — sin WIP arrastrado. Contrato `ProvisionerPlugin` v2 congelado y validado con plugins triviales.
2. **Sprint 15A construye sobre el contrato sin tocarlo** — manifest, loader, UI Settings dinámica, encriptación API keys, helpers compartidos. Cero riesgo de refactor cross-sprint.
3. **Habilita Sprints 15C/D/E/G en serie** — primer plugin real (Enhance CP, Sprint 15C) consume el framework como librería. Sin 15A, cada plugin reimplementaría boilerplate.
4. **Alternativa válida**: si el siguiente objetivo es desbloquear Sprint 12 (Settings + KB), priorizar Sprint 13 §13.AUTH primero (Vía 2) según ADR-078 §5.

### Cuándo Sprint 14 vuelve a estar en cola

Cuando se cumpla **trigger ADR-069** (cliente real con fecha, demo pública, captación activa, validación externa de UX, o decisión consciente documentada). Hasta entonces, toda la deuda pre-deploy (R8 Outbox para `service.*`/`partner.*`, fire-and-forget R2 de PDFs, cierre de aliases REST por ADR-068 §3, secrets reales, Sentry DSN, plan recovery) queda agrupada bajo **P-DEPLOY** en `backlog.md` y se ejecuta toda junta cuando el gate se active.

---

## 11. Seed y datos de prueba

> Documento canónico: [`docs/50-operations/seed-reference.md`](../50-operations/seed-reference.md).

El seed (`pnpm seed` desde `backend/`) es modular e idempotente desde
Sprint 9.6 Fase F.0. Cada `pnpm seed` deja la base de datos en un
estado conocido con:

- **7 cuentas canónicas** (1 por cada rol en `RoleSlug`):
  - `admin@aelium.net` / `AeliumDev2026!` (superadmin, requiere 2FA)
  - `agent.full@aelium.test` / `AgentFull2026!`
  - `agent.billing@aelium.test` / `AgentBilling2026!`
  - `agent.support@aelium.test` / `AgentSupport2026!`
  - `cliente@aelium.test` / `Cliente2026!`
  - `partner@aelium.test` / `Partner2026!`
  - `partner.pending@aelium.test` / `Partner2026!`
- **Datos de muestra mínimos**: 2 clientes adicionales, 2 productos
  con pricing real, 2 facturas (una `paid` + una `pending`), 1 ticket
  + 1 chat del cliente principal. Con marker `metadata.seeded = true`
  para limpieza selectiva futura.

**Salvaguardas**: cuentas demo `*.test` y datos demo NO se siembran si
`NODE_ENV === 'production'`. La cuenta superadmin sí (boot inicial).
Passwords overridables vía `SEED_*_PASSWORD` env vars.

**Cuándo re-seedear**:
- Tras `pnpm prisma migrate deploy` (cambio de schema borra/recrea
  tablas afectadas).
- Tras `pnpm prisma migrate reset` (resetea toda la DB).
- En CI antes de cada run de tests E2E.

Si añades un módulo de datos demo nuevo, sigue el patrón de
`backend/prisma/seeds/sample-<dominio>.ts` documentado en
`seed-reference.md` §"Estructura del seed".

---

## 12. Si te bloqueas

- **Si no entiendes una regla** → léela en `rules.md` con ejemplos. Si sigue confuso, pídeme que te explique con un caso concreto.
- **Si Claude propone algo que parece chocar con una regla** → cita la regla y pídele que justifique.
- **Si Claude pierde contexto entre sesiones** → primer mensaje de la sesión nueva: "Lee `docs/90-meta/development-playbook.md` y `docs/20-modules/<modulo>/contract.md`. Vamos a continuar X."
- **Si pierdes de vista qué pendiente tienes** → este archivo §4 y §5.

---

**Recuerda:** "robusto y profesional" no es un estado, es una práctica. Cada commit que respeta las reglas y la doc añade un grano de robustez. Cada atajo "solo por esta vez" la quita. Has invertido bien en la base — úsala.
