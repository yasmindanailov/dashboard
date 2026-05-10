# Sprint 15C — Plugin Enhance CP 🔄 (90% — hardening pendiente)

> **Estado:** 🔄 **Cerrado al 90%** — Fases A→J + Fase I parcial mergeadas o pendientes commit. Smoke real Yasmin 2026-05-10 reveló 18 issues + 4 decisiones doctrinales pendientes que requieren un **sub-sprint de hardening dedicado** antes de promote a producción.
> **Sub-sprint hardening:** [`sprint-15c-ii-hardening-enhance-dossier.md`](../sprint-15c-ii-hardening-enhance-dossier.md) — 6 fases A→F + cierre, ~4-5 sesiones estimadas.
> **Compromiso doctrinal Yasmin (2026-05-10 literal)**: "no se da un paso más, hasta que el plugin esté al 100% operativo con los features básicos y necesarios perfectos para producción." → Sprint 15D ResellerClub bloqueado hasta cierre 15C.II.
> **Cierre original Fase 15C.I:** 2026-05-10 (parcial — fixes en rama `sprint15c-fase-i-cierre-sprint` pendientes commit) — ~9-10 sesiones de trabajo activo a lo largo de 3 días intensivos, **11 PRs encadenados** mergeados (PRs #36..#51).
> **Identificadores:** P2.3 — primer plugin SaaS real post Sprint 15A. Hereda TODO el framework `plugin_installs` + `SecretVault` + `CircuitBreaker` + manifest declarativo.
> **ADRs nacidos durante el sprint:** [ADR-077 Amendment A1](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments) (capability `has_dns_management`) + [ADR-077 Amendment A3](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments) (`ServiceAction.adminOnly`) + [ADR-080 Amendment B](../../10-decisions/adr-080-plugin-framework.md#amendments) (`productConfigSchema` opcional) + [ADR-082](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) modelo Domain↔Hosting transversal + [ADR-083](../../10-decisions/adr-083-plugin-enhance-cp-specifics.md) Enhance CP specifics.
> **Doc operativa diaria:** [`docs/features/provisioning/admin-plugins-enhance.md`](../../features/provisioning/admin-plugins-enhance.md) — guía superadmin + smoke checklist contra Enhance live + troubleshooting.

---

## Resumen ejecutivo

Sprint 15C entregó el **primer plugin SaaS real** del framework Aelium (post Sprint 15A): `enhance_cp` conecta Aelium con un cluster [Enhance Control Panel](https://www.enhance.com/) v12.21.3 propiedad de Aelium para aprovisionar **hosting compartido web** completamente automático. El alcance pasó de las 9 fases originales del dossier pre-sprint a **11 fases** tras review riguroso de Fase E (PR #44) que destapó 5 gaps estructurales del flujo end-to-end (form admin productos sin `provisioner_config` UI bloqueante, plugin install no seeded, frontend `ActionsBar` sin filter `adminOnly`, página `/admin/services/[id]` no existe, E2E completo sin spec). Los 4 gaps estructurales se absorbieron en las 2 fases nuevas **15C.E.2** + **15C.J**; el gap E2E se materializó como Fase **15C.I** (cierre formal).

El plugin entrega:

- **6 métodos contrato** (ADR-077 v2): `provision`, `deprovision`, `getStatus`, `getServiceInfo`, `executeAction`, `getSsoUrl`. Lazy-create customer Enhance idempotente con search-by-email + insert mapping `enhance_customers`.
- **10 acciones inline curadas**: 7 cliente (`reset_password`, `view_disk_usage`, `view_bandwidth_usage`, `list/add/update/delete_dns_record`) + 3 admin-only (`change_package`, `force_resync`, helper interno `list_available_plans`).
- **Capability `has_dns_management=true`**: 9 tipos canónicos DNS (`A, AAAA, CNAME, TXT, SPF, SRV, NS, MX, CAA`) + DNS-as-capability declarativo en lugar de `if (provisioner === 'enhance_cp')`.
- **DNS records UI cliente** (`/dashboard/services/[id]/dns`) con DS components estándar (Select/Input/Modal) — descartado `@rjsf/core` por UX rica per kind.
- **SSO admin impersonation** con audit obligatorio (Fase F): emit dual `service.sso_opened` (técnica) + `service.admin_sso_impersonation` (GDPR-flagged) cuando `actorIsAdmin && service.user_id !== actorUserId`. Cliente lo ve en `/dashboard/transparency` vía constante canónica `TRANSPARENCY_VISIBLE_ACTIONS`.
- **Reconciliation L3 cron** `@Cron(EVERY_6_HOURS)` con 3 sub-tipos drift (subscription_missing / status_divergence / plan_divergence) + listener notif threshold (default 5/24h) + dedupe via setting interno.
- **Página admin `/admin/services/[id]`** completa (Fase J) con `ChangePackageModal` + `INTERNAL_HELPER_SLUGS` blacklist + plugin install seed condicional dev/QA.
- **Defense-in-depth `adminOnly`**: filter UI cliente + wrapper backend HTTP 403 + audit fila `service.action_admin_only_violation` (defensa profunda Fase E).
- **i18n cableado** (Fase I) con translator local minimal cubriendo namespace `plugin.enhance_cp.*` ES (decisión doctrinal: `next-intl` diferido como sub-sprint cuando llegue cliente angloparlante, A6/A7 Fase I).
- **E2E spec** [`tests/e2e/sprint-15c-enhance-flow.spec.ts`](../../../tests/e2e/sprint-15c-enhance-flow.spec.ts) cubriendo plugin install + filter adminOnly + 403 + audit + change_package admin con `MockEnhanceServer` standalone como tercer webServer Playwright.

---

## Métricas finales

| Métrica | Valor |
|---|---|
| Sesiones trabajo activo | ~9-10 (dentro del rango bajo proyectado 9-12.5) |
| Commits master (squash) | 11 PRs encadenados (`#36`..`#51`) sin desincronización |
| ADRs nacidos | 2 nuevos (082 + 083) + 3 amendments (077 A1 + 077 A3 + 080 B) |
| Tests unit añadidos | +233 (suite final **488/493 verde + 5 skipped** vs 255 base post-Sprint 15A) |
| Tests E2E añadidos | +1 spec nuevo (`sprint-15c-enhance-flow.spec.ts`) con 6 escenarios serial |
| Migraciones Prisma | 2 (`enhance_customers` Fase C + columnas service Fase D) |
| Plugins reales nuevos | 1 (`enhance_cp` — primer plugin SaaS real del framework) |
| Eventos canónicos nuevos | 2 (`service.admin_sso_impersonation` Fase F + `service.reconciled_external_change` Fase H) + 1 evento aspiracional (`provisioning.default_nameservers_changed` Fase D, listener cableado, emisor llega Sprint 12) |
| Listeners nuevos | 4 (`AuditAdminSsoImpersonationListener`, `AuditOnServiceReconciledExternalChangeListener`, `NotificationsOnReconciliationThresholdExceededListener`, `BootstrapEnhanceDefaultsOnPluginInstalledListener` + reuse `auto-config-dns-on-hosting-provisioned` Fase D) |
| Crons nuevos | 1 (`EnhanceReconciliationCron` `@Cron(EVERY_6_HOURS)` estático in-process) |
| Settings nuevos | 2 (`provisioning.default_nameservers` cluster-wide + `provisioning.enhance_cp.reconciliation_alert_threshold`) + 1 setting interno dedupe (`enhance_cp.reconciliation_last_alert_at`) |
| Páginas frontend nuevas | 3 (`/dashboard/services/[id]/dns` + `/admin/services/[id]` + plugin Enhance detail mejorado) |
| Componentes shared nuevos | ~6 (DnsRecordForm CC + DnsRecordsManager CC + DnsExternallyBanner SC + ChangePackageModal CC + AdminServiceOperationsCard CC + i18n translator local) |
| Deudas resueltas | 1 (gap operativo "primer cliente real es imposible de contratar end-to-end" cerrado por Fases E.2 + J) |
| Deudas diferidas conscientemente | 16+ DC.NEW-15C-* (DNSSEC, EMAIL/DB CRUD admin, importers, sub-resellers, etc.) |

---

## 8 lecciones aprendidas

### 1. Reformular alcance tras review riguroso es la decisión correcta

Fase E review (PR #44) destapó 5 gaps estructurales del flujo end-to-end que el dossier original NO previó. **No se añadieron como deudas nuevas — se absorbieron como fases del sprint** tras decisión doctrinal Yasmin. Resultado: 9 fases → 11 fases, sprint pasa de "backend correcto" a "primer cliente real contratable end-to-end". El coste de las 2 fases nuevas (~2 sesiones extra) es trivial vs. el coste de cerrar el sprint con un plugin operativamente roto. **Patrón replicable**: cualquier sprint donde el review destapa gaps estructurales de scope merece reformular antes que cerrar débil.

### 2. Doc-only Fase A (3 ADRs) ahorró tiempo de re-trabajo en cada fase de código

Fase 15C.A (PR #36) fue exclusivamente documental: ADR-082 transversal + ADR-077 Amendment A1 + ADR-083 specifics congelaron 35 decisiones doctrinales antes del primer commit funcional. Las 10 fases siguientes se construyeron literalmente desde el ADR sin ambigüedad inter-fase. **Mismo patrón canónico que Sprint 8 D.0 / Sprint 11 11.A / Sprint 15A A** — confirmado replicable a futuros plugins (15D RC, 15E Docker, 15G Plesk).

### 3. El patrón "una rama por fase desde master sincronizado" escala hasta 6 PRs/día

Las 11 fases produjeron **6 PRs encadenados sin fricción el 2026-05-09** (Fases E + E.2 + F + G mergeados consecutivos + housekeeping #48 + Fases H + J + housekeeping #51 + cierre Fase I). Pre-condición clave: cada rama parte de master post-merge del PR anterior, NO de la rama hermana — evita conflicts en `current.md` + dossier (los archivos doc-only que se actualizan post-merge). El housekeeping post-merge (PRs #48 + #51) es la sutura que mantiene `current.md` + dossier alineados con master sin reabrir fases cerradas.

### 4. Ambigüedades doctrinales pre-codear en cada fase es ROI muy alto

Cada fase E.2 + F + G + H + J + I incluyó "ambigüedades doctrinales resueltas pre-codear" (3-4 por fase). El tiempo invertido en plantear la ambigüedad + recomendar + obtener decisión Yasmin (típicamente 10 minutos) ahorra horas de re-trabajo. Ejemplos canónicos del sprint:

- **A1 Fase H** cron estático vs BullMQ scheduled — decisión: estático in-process consistente con `AuditRetentionCron`. Sin esto, hubiese gastado ~1 sesión migrando a BullMQ y luego re-migrando.
- **A4 Fase H** comparar `service.metadata.enhance_plan_id` vs `Product.provisioner_config` — decisión: por-servicio. Sin esto, false-positives `plan_divergence` eternos tras change_package admin.
- **A1 Fase J** modal location colocated en `/admin/services/[id]/_components/` vs shared. Decisión: colocated (modal admin-only NO debe vivir en `_shared/`). Sin esto, contaminación shared con admin-only logic.

**Patrón replicable explícito**: cada fase nueva DEBE listar 3-4 ambigüedades pre-codear en el plan antes de empezar a codear.

### 5. Defense-in-depth `adminOnly` requiere filter UI + wrapper backend + audit (3 capas)

Fase E introdujo el flag canónico `ServiceAction.adminOnly` (ADR-077 Amendment A3) implementado en 3 capas:
- **UI cliente** (Fase E.2 `ActionsBar.tsx`): filter declarativo `actions.filter((a) => !a.adminOnly || isAdmin)`. Cliente NO ve botones adminOnly.
- **Wrapper backend** (Fase E `executeActionWithCacheInvalidation`): rechaza con `ForbiddenException` HTTP 403 si actor no-admin invoca action adminOnly. Defense-in-depth contra bypass UI.
- **Audit** (Fase E): emite `service.action_admin_only_violation` + `audit.logAccess` con shape canónico `{service_id, user_id, actor_user_id, provisioner_slug, action_slug, ip}`.

Ninguna capa por sí sola es suficiente. Filter UI sin backend = bypass via curl. Backend sin filter UI = mala UX (cliente ve botón que recibe 403). Backend sin audit = defensa silenciosa, sin visibilidad operativa de intentos. **Patrón canónico para futuros plugins**: cualquier action admin-only requiere las 3 capas declaradas y testeadas.

### 6. El cron L3 NO debe modificar `Service.status` directamente

Fase H decisión doctrinal A1: cuando `subscription_missing` (404 Enhance), el cron emit-only — NO cambia `Service.status` a `unknown` (que ni siquiera existe en el enum Prisma) ni a `failed`. Razón: DH-INV-6 (Enhance gana en conflicto) + el cron es **detector**, NO actor. Admin investiga manualmente y decide si cancelar o re-provisionar. El emit `service.reconciled_external_change` + listener notif threshold da visibilidad sin auto-corrección destructiva. **Patrón canónico**: drift detection emit-only + escalación humana, NO auto-correction agresiva.

### 7. Bug fix incluido en la fase que lo descubre, NO en una nueva fase

Fase H descubrió que `actionChangePackage` (Fase E backend) NO actualizaba `service.metadata.enhance_plan_id` tras éxito del PATCH a Enhance. Sin este fix, el cron L3 emitiría `plan_divergence` false-positive eterno tras cualquier change_package admin. **Decisión doctrinal**: el fix se incluyó en el commit de Fase H (no se reabrió Fase E ni se creó una micro-fase nueva). Trazabilidad: cita inline en commit + spec del cron documenta la condición. **Patrón canónico**: bugs descubiertos durante una fase se arreglan **en esa fase** si el alcance lo permite, nunca dejados como deuda silenciosa.

### 8. La doctrina canónica `provisioner !== 'X'` se sostiene incluso cuando es tentador romperla

Fase J introduzo `INTERNAL_HELPER_SLUGS` blacklist hardcoded (`['change_package', 'list_available_plans']`) en `ActionsBar.tsx`. Tentación: añadir flag `hidden_in_actions_bar` al contrato canónico ProvisionerPlugin. Decisión doctrinal: `INTERNAL_HELPER_SLUGS` es **la única excepción canónica documentada** — slugs operados desde modal admin custom. Razón: añadir un nuevo flag al contrato solo para 2 slugs en 1 plugin no justifica el cambio + acoplamiento bajo (string array hardcoded + comentario explicando por qué). Si en el futuro llega un tercer plugin con un slug que también deba ocultarse → re-evaluar si vale la pena introducir el flag entonces. **Patrón canónico**: blacklists locales con comentario explicando por qué son aceptables vs. añadir flags al contrato sin razón estructural.

---

## Commit refs canónicos cronológicos

| Fase | PR | Commit master | Fecha | Contenido |
|---|---|---|---|---|
| 15C.A | [#36](https://github.com/yasmindanailov/dashboard/pull/36) | `0bb83b3` | 2026-05-08 | ADR-082 transversal + ADR-077 Amendment A1 + ADR-083 specifics (35 decisiones frozen) |
| 15C.B | [#37](https://github.com/yasmindanailov/dashboard/pull/37) | `156ea35` | 2026-05-08 | `EnhanceApiClient` + types TypeScript + `MockEnhanceServer` Express stub + fixtures |
| 15C.C | [#38](https://github.com/yasmindanailov/dashboard/pull/38) | `69fed47` | 2026-05-08 | Plugin core (6 métodos contrato + manifest + DI + tabla `enhance_customers`) |
| 15C.D | [#41](https://github.com/yasmindanailov/dashboard/pull/41) | `a319063` | 2026-05-08 | Listener `auto-config-dns-on-hosting-provisioned` + setting `provisioning.default_nameservers` + cluster propagation + `dns-authority-resolver.ts` + endpoints orquestador `/dns/*` |
| 15C.E | [#44](https://github.com/yasmindanailov/dashboard/pull/44) | `8de99fd` | 2026-05-09 | Acciones curadas backend + flag canónico `ServiceAction.adminOnly` + 10ª action `list_available_plans` + enforcement HTTP 403 + evento `service.action_admin_only_violation` |
| 15C.E.2 ⭐ | [#45](https://github.com/yasmindanailov/dashboard/pull/45) | `99f4a0c` | 2026-05-09 | Frontend acciones curadas (form admin productos `provisioner_config` UI + filter `adminOnly` `ActionsBar`) — gap descubierto Fase E review |
| 15C.F | [#46](https://github.com/yasmindanailov/dashboard/pull/46) | `801e748` | 2026-05-09 | SSO endpoints + admin impersonation + listener GDPR + transparency UI |
| 15C.G | [#47](https://github.com/yasmindanailov/dashboard/pull/47) | `5207ff1` | 2026-05-09 | DNS records management UI cliente con CRUD completo (9 tipos canónicos) |
| 15C — housekeeping | [#48](https://github.com/yasmindanailov/dashboard/pull/48) | `9806528` | 2026-05-09 | Housekeeping post-merge Fases E + E.2 + F + G — commit refs + plan Fase H |
| 15C.H | [#49](https://github.com/yasmindanailov/dashboard/pull/49) | `1efeb83` | 2026-05-09 | L3 reconciliation cron `EVERY_6_HOURS` + listeners audit/notifications + bug fix `actionChangePackage` actualiza metadata |
| 15C.J | [#50](https://github.com/yasmindanailov/dashboard/pull/50) | `c1c9f41` | 2026-05-09 | Admin services detail page + change_package modal + plugin install seed condicional dev/QA + hotfix `a34bb93` row click |
| 15C — housekeeping | [#51](https://github.com/yasmindanailov/dashboard/pull/51) | `0f2c15b` | 2026-05-09 | Housekeeping post-merge Fases H + J — commit refs + plan Fase I (cierre formal) |
| **15C.I** | TBD | TBD | 2026-05-10 | **Cierre formal** — i18n local namespace `plugin.enhance_cp` + E2E spec `sprint-15c-enhance-flow.spec.ts` 6/6 verde + doc operativa `admin-plugins-enhance.md` + smoke checklist + retrospectiva (este archivo). **Smoke real Yasmin descubrió 4 bugs adicionales** (todos arreglados in-fase): (B1) `$queryRaw`→`$executeRaw` en `enhance-customers.service.ts` (bug pre-existente Fase C, manifestaba `prisma:error: Failed to deserialize column of type 'void'` solo contra Postgres real, los unit tests mockean Prisma); (B2) `translateSchema()` walk-recursive + aplicado en 3 call-sites rjsf `<Form>` para traducir `description`/`title` del JSON Schema (los widgets `aeliumDsWidgets` solo cubrían `helperText` interior, NO el FieldTemplate); (B3) `info.display.secondary` y plugin manifest labels renderizados crudos en `ServiceHeader.tsx` + `admin/services/[id]/page.tsx` — fix con `t()`; (B4) `INTERNAL_HELPER_SLUGS` extendido con 4 DNS slugs (`list/add/update/delete_dns_record`) — eran botones standalone redundantes con la UI canónica DNS Fase G y al ejecutarse sin payload form fallaban con `INVALID_PAYLOAD`. (B5) traducciones ES de keys wrapper backend (`action.unknown/circuit_open/invalid_payload/provider_error`) añadidas al translator local. **Bug fix DTO ya documentado**: `AdminPluginUpdateDto` removió `@ValidateNested + @Type(() => Object)` que combinado con `forbidNonWhitelisted` global rechazaba props internas de `config`/`secrets` — descubierto por el spec E2E nuevo (Sprint 15A test admin-plugins solo enviaba `enabled` así que no se detectó). Suite final **488/493 unit verde + 5 skipped** sin regresiones. |

---

## Deuda diferida v1+

| Ref | Item | Cuándo abordar |
|---|---|---|
| **DC.NEW-15C-1** | UI cliente `change_package` bloqueada hasta cierre sub-sprint billing prorrateo cross-plan | Cuando cierre sub-sprint billing |
| **DC.NEW-15C-i18n** | EN locale + provider real (`next-intl` o equivalente) reemplazando translator local Fase I | Cuando llegue cliente angloparlante |
| **DC.NEW-15C-2** | DNS records `PTR` (reverse DNS) — power-user | v1.1 si demanda |
| **DC.NEW-15C-3** | Métricas time-series Enhance — Prometheus + recharts | v2 si demanda |
| **DC.NEW-15C-4** | Webhook receiver Aelium — solo si Enhance añade webhooks push en futura versión orchd | Cuando Enhance los exponga |
| **DC.NEW-15C-5** | WordPress install/staging/clone inline — feature comercial fuerte | v1.x si decisión comercial |
| **DC.NEW-15C-6** | SSO webmail directo (`/orgs/.../emails/{e}/sso`) | v1.x UX brillante |
| **DC.NEW-15C-7** | SSO phpMyAdmin directo (`/orgs/.../mysql-dbs/{db}/sso`) | v1.x UX brillante |
| **DC.NEW-15C-8** | SSO wp-admin directo (`/orgs/.../wordpress/users/{u}/sso`) | v1.x UX brillante |
| **DC.NEW-15C-9** | Backup CRUD + restore inline | v1.1 si demanda real |
| **DC.NEW-15C-10** | SSL CRUD inline (LE auto + custom cert upload) | v1.1 |
| **DC.NEW-15C-11** | App templates / WordPress instalación inline | v1.x — feature comercial |
| **DC.NEW-15C-12** | Importers cPanel/Plesk → Enhance | v2 si migración real de clientes legacy |
| **DC.NEW-15C-DNSSEC** | DNSSEC enable/disable + DS records | v1.1 |
| **DC.NEW-15C-EMAIL** | CRUD email accounts + forwards + autoresponders | NUNCA cliente. Admin v1.1 si demanda. |
| **DC.NEW-15C-DB** | CRUD MySQL databases + users | NUNCA cliente. Admin v1.1 si demanda. |
| **DC.NEW-15C-RESELLER** | Sub-resellers (customers que son resellers) | NUNCA primer cliente real. Solo si Aelium ofrece "reseller hosting". |
| **DC.NEW-15C-E2E** | E2E DNS UI cliente CRUD + SSO impersonation full flow Playwright | Sub-sprint dedicado a E2E coverage si demanda CI/regression |
| **DC.NEW-15C-EMAIL-RESET** | Listener `notifications-on-password-reset` que envía email al cliente con la nueva password tras `reset_account_password` | v1.1 — descubierto smoke 2026-05-10 (Yasmin esperaba email automático tras reset, plugin solo rota la password en Enhance) |
| **DC.NEW-15C-METRICS-MODAL** | Modal admin que renderiza `result.data` formateado tras `view_disk_usage` / `view_bandwidth_usage`. Alternativa: sustituir las acciones por un botón único "Refrescar métricas" que invalide solo el cache 60s (las métricas ya viven en `MetricsBar` cliente y admin) | v1.1 — descubierto smoke 2026-05-10 (UX feedback genérico "Acción completada" sin mostrar la data) |
| **DC.NEW-15C-CATALOG-SYNC** | Sync automático catálogo planes Enhance ↔ catálogo productos Aelium (admin actualmente debe crear N productos manualmente cuando Enhance añade N planes nuevos) | v2 si demanda — el `change_package` runtime ya consume `list_available_plans` dinámico, el catálogo es donde queda manual |
| **DC.NEW-15C-DNS-ADMIN-UI** | UI admin nativa de DNS records en `/admin/services/[id]/dns` (paralela a la cliente Fase G) reusando endpoints `/admin/services/:id/dns/records*` ya implementados | v1.1 — backend ya listo, solo falta frontend admin (banner actual: "la UI admin nativa de DNS llegará en un sprint futuro") |

---

## Hardening Sprint 15C.II — bloqueante pre-producción

> Smoke real Yasmin 2026-05-10 reveló que el plugin Enhance NO está listo para producción a pesar de las 11 fases cerradas. 18 issues clasificados + 4 decisiones doctrinales pendientes. **Sprint 15D ResellerClub queda bloqueado en cola hasta cierre 15C.II.**
>
> Detalle exhaustivo en dossier canónico [`sprint-15c-ii-hardening-enhance-dossier.md`](../sprint-15c-ii-hardening-enhance-dossier.md).

### Issues clasificados (18 totales)

| Categoría | # items | Estado |
|---|---|---|
| **A. Bugs reales** | 3 (BUG-15CII-1..3) | 2 ✅ fix in-branch (commits pendientes), 1 ⏳ pendiente |
| **B. UI_SPEC §4.3 violaciones** | 3 (BUG-15CII-4..6) | 2 ✅ fix in-branch, 1 ⏳ decisión doctrinal §3.1 |
| **C. Mensajes engañosos** | 3 (BUG-15CII-7..9) | 2 ✅ fix in-branch, 1 ⏳ pendiente §3.3 drift UX |
| **D. UX redundante** | 2 (BUG-15CII-10..11) | 2 ✅ fix in-branch (parcial), naming pendiente §3.2 |
| **E. i18n parcial** | 3 (BUG-15CII-12..14) | 1 ✅ fix in-branch (cache-clean verifier), 2 ⏳ pendientes |
| **F. Funcionalidades NO impl.** | 4 (DC.NEW-15CII-*) | 4 ⏳ pendientes Sprint 15C.II |

### Decisiones doctrinales pendientes (4)

1. **§3.1 Refresh metrics pattern** — eliminar 2 inline actions vs spinner refresh inline en MetricsBar.
2. **§3.2 Reconcile UX dual** — botón general (settings) + granular (service) con naming "Reconciliar contra Enhance".
3. **§3.3 Drift UX discriminada por rol** — cliente generic + admin AlertBanner con CTA SSO investigación.
4. **§3.4 Admin overview operativo** — ¿incluir dashboard estadístico plugin ahora o diferir Sprint 12?

### Branch actual `sprint15c-fase-i-cierre-sprint` — fixes valiosos sin commit

11+ fixes aplicados durante Fase 15C.I + smoke real (ver dossier hardening §5):
- $queryRaw bug fix backend.
- DTO refactor backend.
- ActionsBar + SsoButton useToast.
- Mensaje reset_password honesto.
- INTERNAL_HELPER_SLUGS extendido DNS.
- view_disk/bandwidth adminOnly.
- force_resync description tooltip.
- translateSchema() walk-recursive.
- ServiceHeader + admin/services/[id] + product forms i18n.
- E2E spec sprint-15c-enhance-flow 6/6 verde.
- Mock runner + i18n local minimal.

**Recomendación próximo agente** (dossier hardening §5 Opción A):
1. Commit + PR rama actual como **Fase 15C.I parcial** (fixes valiosos + E2E + docs).
2. Mergear a master.
3. Abrir nueva rama `sprint15c-ii-enhance-hardening` desde master post-merge.
4. Ejecutar Fase 15C.II.A (decisiones doctrinales frozen) → A→F → cierre.

---

## Frase de arranque post-cierre 15C → Sprint 15D

> *"Lee `docs/60-roadmap/sprint-15d-resellerclub-dossier.md` + `docs/10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md` + `docs/10-decisions/adr-083-plugin-enhance-cp-specifics.md` + `docs/60-roadmap/completed/sprint-15c-plugin-enhance-cp.md` (retrospectiva del sprint hermano que comparte ADRs 082+083). Vamos con Sprint 15D — Plugin ResellerClub. Crea rama `sprint15d-plugin-resellerclub` desde master."*

---

# Anexo — Dossier de pre-sprint (preservado para trazabilidad)

> A continuación se preserva el dossier de pre-sprint completo redactado el 2026-05-07 antes del primer commit funcional. Mantenerlo permite trazar **qué se decidió ANTES de codear** vs. qué se ajustó durante la implementación. Los enlaces relativos del dossier original se mantienen apuntando a `60-roadmap/` (donde vivía pre-mover); algunos pueden quedar rotos tras el move — se conservan tal cual como reflejo histórico del thinking original.

# Sprint 15C — Plugin Enhance CP · Dossier de pre-sprint

> **Tipo:** Pre-sprint research dossier (no es plan de sprint activo).
> **Estado:** ⏸ **En cola P2.3, primer plugin real post Sprint 15A.** Cabeza de cola activa P2 — desbloquea Sprint 15D ResellerClub (cuyo dossier ya cuelga aquí en [`sprint-15d-resellerclub-dossier.md`](./sprint-15d-resellerclub-dossier.md)).
> **Origen:** Sesión Yasmin ↔ Claude del 2026-05-07 (post merge Sprint 15A `bee90d8` + post commit dossier 15D `542d589`).
> **Cuándo se promueve a sprint activo:** decisión consciente de Yasmin. Pre-condición técnica: Sprint 15A mergeado en master (✅ cumplido).
> **Frase canónica de arranque (futuro):** *"Lee `docs/60-roadmap/sprint-15c-enhance-cp-dossier.md` + `docs/_research/sprint-15c/orchd-oas3-api.yaml` + `docs/10-decisions/adr-080-plugin-framework.md` + `docs/20-modules/provisioning/contract.md`. Vamos con Sprint 15C — Plugin Enhance CP. Crea rama `sprint15c-plugin-enhance-cp` desde master."*

---

## 1. Por qué este dossier existe

El sprint 15C arrancó como conversación de planning el 2026-05-07, en cadena directa con el dossier 15D ResellerClub que se mergeó horas antes (commit `542d589`). Antes del primer commit de código, la iteración con Yasmin produjo decisiones arquitectónicamente densas que se perderían si se pierde el contexto de chat:

1. **Modelo de tenancy real Enhance**: customer = sub-org en Enhance (no entidad aparte), descubrimiento que simplifica el mapping `Client` Aelium ↔ Enhance y elimina ambigüedad de varios diseños previos.
2. **Mecanismo SSO real**: OTP via `/orgs/{org}/members/{m}/sso` (no impersonate endpoint hipotético) → diseño de 2 calls + redirect 302 para el flujo "abrir mi panel" del cliente.
3. **DNS records management completo confirmado**: 11 record kinds soportados (`A, AAAA, CNAME, TXT, SPF, SRV, NS, MX, PTR, DS, CAA`); per-zone CRUD existe + DNSSEC + Cloudflare proxy flag.
4. **Default DNS records platform-level** (`/v2/settings/dns/default-records`) **reemplazan** el listener inline `auto-config-dns-on-hosting-provisioned` que el dossier 15D pre-fijó: se aplican automáticamente a TODA zona nueva — diseño más limpio, menos código.
5. **Sin webhooks v1**: orchd v12.21.3 no expone webhooks push hacia integraciones (solo `slackNotificationWebhookUrl` que es push DE Enhance HACIA Slack — irrelevante). Reconciliation pull-based confirmado como única vía → 3 capas (60s cache / on-demand / 6h cron).
6. **Doctrina canónica de bidirectionality**: Aelium → Enhance síncrono inmediato; Enhance → Aelium eventual consistency con drift detection. Operacionalmente Enhance gana en conflicto (DH-INV-6 nuevo).
7. **Spec capturado en repo**: el OpenAPI 3.0.3 literal vive en [`docs/_research/sprint-15c/orchd-oas3-api.yaml`](../_research/sprint-15c/orchd-oas3-api.yaml) (588 KB, 20.848 líneas, ~280 paths), con README de research describiendo provenance.

Este dossier sirve a **tres propósitos canónicos** (mismo patrón que el dossier 15D):

- **Memoria institucional**: cuando se abra Sprint 15C, no se reabre el debate. Cada decisión §6 cita línea exacta del spec.
- **Input formal de ADRs futuros**: ADR-077 Amendment A1 + ADR-082 + ADR-083 toman su contenido literal de aquí.
- **Inventario de deuda consciente**: lo que se difiere queda con razón.

---

## 2. Posición canónica en la cola P2 + relación con Sprint 15D

### Recap inversión P2.3 ↔ P2.4 (ya formalizada en dossier 15D §2)

El dossier 15D documentó la inversión: Sprint 15C Enhance CP **antes** que Sprint 15D ResellerClub. Razón técnica: Aelium opera Enhance en server propio con PowerDNS como autoridad DNS real; las hostnames `ns1.aelium.net` / `ns2.aelium.net` apuntan al servidor dedicado. Registrar dominios con NS=Aelium antes de tener Enhance plugin = dominios técnicamente caídos.

**No se reabre la decisión.** Este dossier asume la inversión vigente.

### Posición Sprint 15C en cola activa P2

| Prioridad | Sprint | Estado |
|---|---|---|
| ✅ P2.1 | Sprint 11 — Provisioning (chasis canónico) | Cerrado 2026-05-02 |
| ✅ P2.2 | Sprint 15A — Plugin Framework | Cerrado 2026-05-06, mergeado `bee90d8` |
| **▶ P2.3** | **Sprint 15C — Plugin Enhance CP** | **Cabeza de cola activa — primer plugin real, este dossier** |
| ⏸ P2.4 | Sprint 15D — Plugin ResellerClub | Diferido hasta cierre 15C — dossier completo |
| ⏸ P2.5 | Sprint 10 — Infrastructure | Independiente |
| ⏸ P2.6 | Sprint 15E — Plugin Docker Engine | Emparejado con 10 |
| ⏸ P2.7 | Sprint 12 — Settings + Knowledge Base | Tras plugins reales |

### Relación bidireccional con Sprint 15D

Sprint 15C **produce** la infraestructura transversal que Sprint 15D consume:

| Producción 15C | Consumo 15D |
|---|---|
| ADR-082 mergeado (modelo Domain↔Hosting) | RC plugin lee invariantes DH-INV-1..6 |
| ADR-077 Amendment A1 (`has_dns_management` flag) | RC declara `has_dns_management: false`; Enhance `true` |
| `EnhanceProvisionerPlugin` operativo | RC handshake `domain.zone_pre_create` consume zona Enhance |
| Default DNS records seedeados en Enhance | RC registra dominios sabiendo que zona se autocrea |
| Setting `provisioning.default_nameservers` | RC lee setting al ejecutar `domains/register?ns=...` |

Sin 15C cerrado, 15D registraría dominios sin destino DNS válido. Por eso 15C es **bloqueante operacional** para 15D.

---

## 3. Modelo canónico Domain ↔ Hosting (input para ADR-082) — extiende dossier 15D §3

> **Doctrina transversal**. Aplica a todos los registrar plugins futuros (RC, Hexonet, OpenSRS) y a todos los hosting plugins (Enhance, Docker, futuro cPanel/Plesk).
>
> Este dossier **extiende** lo pre-fijado en [`sprint-15d-resellerclub-dossier.md` §3](./sprint-15d-resellerclub-dossier.md#3-modelo-canónico-domain--hosting-input-para-adr-082) con la sexta invariante (§3.1), revisión doctrinal del listener (§3.5) y el resolver cross-plugin (§3.6).

### 3.1. Seis invariantes (DH-INV-1..6)

| # | Invariante | Justificación |
|---|---|---|
| **DH-INV-1** | **Hosting service SIEMPRE tiene un FQDN** (`service.domain` no nulo). | Requerimiento técnico de cada control panel. Sin dominio no hay routing posible. |
| **DH-INV-2** | **Hosting plugin rechaza `provision()` si `service.domain` null o malformed.** | Defensa en profundidad. `INVALID_PAYLOAD` con mensaje claro. |
| **DH-INV-3** | **Domain service puede vivir solo** (sin hosting asociado obligatorio). | Defensa de marca, futuro proyecto, redirect, dominio aparcado. |
| **DH-INV-4** | **Domain ↔ hosting linkage = string `services.domain`, NO foreign key.** | Permite "bring your own domain" externo. WHMCS lo modela igual desde 2007. Aelium ya está modelado así (`schema.prisma:456`). |
| **DH-INV-5** | **Renewal cycles independientes.** Cancelar uno NO cancela el otro. | Dominio anual, hosting variable. Invoices separadas. |
| **DH-INV-6** ⭐ | **En conflicto operacional, Enhance / panel del proveedor gana sobre Aelium.** Aelium NO es fuente de verdad operacional — es gateway curado de billing + identidad. | Si admin/cliente cambia algo en panel Enhance directamente, reconcile cron actualiza Aelium, no al revés. Excepción: provision/deprovision donde Aelium dispara la acción y persiste el resultado tras éxito en Enhance. |

DH-INV-6 es **nueva en 15C**, no estaba en el dossier 15D. Aclara la doctrina de bidirectionality + simplifica decisiones de race condition (siempre que hay conflicto entre estado Aelium y estado proveedor: gana proveedor).

### 3.2. Cuatro flujos canónicos de checkout (idéntico dossier 15D §3.2)

| Flujo | Caso | Provisioning |
|---|---|---|
| **F1** Register new domain + buy hosting (60-70% industria) | 2 line items en misma factura. | Registrar primero (síncrono RC), hosting después (Enhance). Default DNS records globales del cluster Enhance se aplican a la zona automáticamente. 2 services con renewal cycles independientes desde día 1. |
| **F2** Use existing Aelium-managed domain + buy hosting | 1 line item (solo hosting). | Hosting service se crea con `domain=<FQDN existente>`. La zona DNS del dominio ya existe en Enhance (se creó al registrar/transferir vía RC); el website se mapea a ella. |
| **F3** BYOD (Bring Your Own Domain externo) + buy hosting | 1 line item (solo hosting). | Hosting service con `domain=<FQDN externo>`. NO existe service Aelium para ese dominio. Aelium presenta instrucciones al cliente para configurar A records en su registrar externo (o cambiar NS a Aelium). NO renewal alerts del dominio. |
| **F4** Transfer-in domain + buy hosting | 2 line items. | Hosting se provisiona inmediatamente con dominio externo (estado F3 transitorio). Transfer-in arranca asíncrono (5-7 días). Cuando completa → evento `domain.transfer_completed` → email "Tu dominio ya está gestionado por Aelium, DNS configurado". |

### 3.3. DNS-as-capability (idéntico dossier 15D §3.3, refinado contra spec literal)

| Plugin | `has_dns_management` |
|---|---|
| `internal` / `manual` | `false` (Amendment A1 update obligatorio) |
| `resellerclub` | **`false`** (NS por defecto van a Aelium, no a RC) |
| `enhance_cp` | **`true`** (la autoridad DNS real — PowerDNS via API confirmada en spec) |
| `docker_engine` (Sprint 15E) | `false` |
| Futuro `cloudflare_dns` (hipotético) | `true` |

UI condicional al servir DNS records management (en `/dashboard/services/[id]` del dominio): si `domain.nameservers === setting.default_nameservers` → routea al plugin Enhance. Si NS apuntan a externos → banner "DNS externo en `<ns>`. Gestiona allí." + acción curada `modify_ns` (con `confirm_required: true` + texto explicando impacto).

### 3.4. Tres capas NS sync (revisado vs dossier 15D §3.4)

La configuración `ns1/ns2.aelium.net` debe coincidir en 3 lugares:

| Capa | Dónde vive | Cómo se aplica en 15C |
|---|---|---|
| **C1** Glue records de `aelium.net` | Cloudflare zone + WHOIS del registrar de `aelium.net` | Manual ops Yasmin. **No automático.** |
| **C2** Default NS de zonas Enhance | API Enhance: `POST /v2/settings/dns/default-records` con records `{ kind: 'NS', name: '@', value: 'ns1.aelium.net' }` y `'ns2.aelium.net'` | **Bootstrap automático del plugin** al instalarse + cuando admin cambia setting C3 |
| **C3** Setting Aelium | `Setting` tabla, categoría `provisioning`, key `default_nameservers`, value `["ns1.aelium.net","ns2.aelium.net"]` | Fuente de verdad. Listener `provisioning.default_nameservers_changed` propaga a C2 vía API. |

**Mejora respecto a dossier 15D**: la propagación C3 → C2 ahora es automática vía API (no manual). C1 sigue manual porque vive fuera del cluster Enhance (en Cloudflare/registrar).

### 3.5. Listener `auto-config-dns-on-hosting-provisioned` — REVISADO post-spec

El dossier 15D pre-fijó este listener para "tras provisioning de hosting, añadir A records iniciales (apex + www) a la zona DNS del dominio". **El descubrimiento del endpoint `/v2/settings/dns/default-records` lo hace innecesario** como mecanismo primario:

- Enhance aplica los default records a **TODA zona nueva** automáticamente. No hay race condition: el momento de creación de la zona es atómico con la aplicación de defaults.
- Aelium configura los defaults una sola vez en bootstrap del plugin: `{ kind: 'A', name: '@', value: '<server_ip>' }`, `{ kind: 'A', name: 'www', value: '<server_ip>' }`, `{ kind: 'NS', name: '@', value: 'ns1.aelium.net' }`, etc.
- Cualquier zona creada después hereda esos records. Cero código en runtime de provision.

**Decisión canónica**: el listener queda como **reconciliation defensivo**, NO como creación inline:
- Tras `service.activated` con plugin enhance, listener verifica que la zona tiene los records esperados (defensivo: por si admin cambió defaults después de zona ya creada).
- Si faltan, los añade.
- Si hay records inesperados extra, NO los borra (operador puede haber añadido cosas custom).

Esto es una **mejora arquitectónica** sobre el dossier 15D: menos código activo + lógica más declarativa + cero race condition. ADR-082 documenta el patrón "default records + reconcile defensivo" como canónico para hosting plugins con DNS authority.

### 3.6. Cross-plugin DNS authority resolver (NUEVO en 15C)

El cliente abre `/dashboard/services/[id]` de su **dominio** (provisioner=resellerclub). RC declara `has_dns_management: false`. Para mostrar DNS records, el orquestador `provisioning` debe resolver: "¿quién es la autoridad DNS de este dominio?".

**Diseño canónico**:

```
core/provisioning/dns-authority-resolver.ts

resolveDnsAuthority(service: Service): {
  authority: 'aelium' | 'external',
  plugin: ProvisionerPlugin | null
}
  - Si service.product_type !== 'domain' → authority='aelium', plugin=enhance_cp
    (el hosting tiene su propia zona en Enhance siempre)
  - Si service.product_type === 'domain':
    - Compara service.metadata.nameservers vs Setting.provisioning.default_nameservers
    - Match → authority='aelium', plugin=enhance_cp (la zona vive en cluster Aelium)
    - No match → authority='external', plugin=null (cliente debe gestionar fuera)
```

**Endpoint canónico nuevo**: `GET /api/v1/services/{id}/dns/records` que internamente:
1. Resuelve authority via helper.
2. Si `aelium` → routea al plugin Enhance: `enhancePlugin.executeAction(service, 'list_dns_records', {})`.
3. Si `external` → devuelve 404 + `{ message: 'DNS gestionado externamente', nameservers: [...] }` para que UI muestre banner.

R4 intacto: el plugin RC NO importa el plugin Enhance. El orquestador (no plugin) hace el routing.

ADR-082 documenta este resolver como pieza canónica del core/provisioning, NO del plugin individual.

---

## 4. Catálogo Enhance API — orchd v12.21.3

> **Fuente literal**: [`docs/_research/sprint-15c/orchd-oas3-api.yaml`](../_research/sprint-15c/orchd-oas3-api.yaml). 25 tags / ~280 paths. OpenAPI 3.0.3.
> **Auth canónico** (`securitySchemes`): `bearerAuth` (HTTP Bearer, token Super Admin) + `sessionCookie` (HTTP cookie, login interactivo — no usado). Aelium usa `bearerAuth` exclusivamente.

### 4.1. Bloques funcionales relevantes para Aelium

> Marcado audiencia: 🧑 cliente · 🛠️ admin Aelium · ⚙️ interno (no expuesto)

**A. Auth & test connection**

| # | Path | Método | Uso Aelium |
|---|---|---|---|
| A1 | `/version` | GET | ⚙️ test-connection (idempotente, no requiere auth, devuelve SemVer string) |
| A2 | `/status` | GET | ⚙️ readiness check |
| A3 | `/licence` | GET/PUT | 🛠️ admin: verificar licencia Enhance activa |
| A4 | `/orgs/{master_org_id}/access_tokens` | GET/POST | 🛠️ admin: rotar token Aelium si filtración |

**B. Multi-tenancy — orgs / customers / members / owner / login**

| # | Path | Método | Uso Aelium |
|---|---|---|---|
| B1 | `/orgs` | GET/POST | ⚙️ POST solo en bootstrap (Master org ya existe) |
| B2 | `/orgs/{org_id}` | GET/PATCH/DELETE | ⚙️ GET para resolver `ownerId/ownerLoginId` (fundamental para SSO) |
| B3 | `/orgs/{master}/customers` | GET/POST | ⚙️ POST = lazy create customer al primer hosting |
| B4 | `/orgs/{org_id}/owner` | PUT/DELETE | ⚙️ PUT promueve member a Owner tras crearlo |
| B5 | `/orgs/{org_id}/members` | GET/POST | ⚙️ POST añade login como member con rol |
| B6 | `/orgs/{org_id}/members/{m}` | GET/PATCH/DELETE | ⚙️ admin: gestión miembros |
| B7 | `/orgs/{org_id}/members/{m}/sso` ⭐ | GET | 🧑🛠️ **CRÍTICO** — devuelve OTP URL para SSO impersonation |
| B8 | `/logins` | POST | ⚙️ POST con `?orgId=` crea login del cliente en realm |
| B9 | `/v2/orgs/{org_id}/customers/logins` | GET | 🛠️ admin: listar logins de customers |
| B10 | `/v2/logins/{login_id}/password` | PUT | 🛠️ admin: reset password (cliente olvida password Enhance) |
| B11 | `/login/sessions/sso?otp=<uuid>` | GET | ⚙️ endpoint que el OTP URL llama internamente — Aelium NO llama directamente, solo redirige browser ahí |

**C. Provisioning lifecycle — subscriptions / websites**

| # | Path | Método | Uso Aelium |
|---|---|---|---|
| C1 | `/orgs/{master}/customers/{customer_org_id}/subscriptions` | GET/POST | ⚙️ POST = paso 5 del provision flow (`{ planId }`) |
| C2 | `/orgs/{org_id}/subscriptions/{sub_id}` | GET/PATCH/DELETE | ⚙️ PATCH `{ isSuspended, planId }` = suspend/upgrade. DELETE = deprovision. |
| C3 | `/orgs/{org_id}/subscriptions/{sub_id}/bandwidth` | GET | ⚙️ métrica para `getServiceInfo.metrics.bandwidth` (cache 12h interno Enhance, override `?refreshCache=true`) |
| C4 | `/orgs/{org_id}/subscriptions/{sub_id}/calculate-resource-usage` | PUT | 🛠️ force resync resources (E.ADM.3) |
| C5 | `/orgs/{org_id}/websites` | GET/POST | ⚙️ POST = paso 6 del provision flow (`{ domain, subscriptionId }`) |
| C6 | `/orgs/{org_id}/websites/{ws_id}` | GET/PATCH/DELETE | ⚙️ PATCH `{ isSuspended }` para suspend a nivel website. DELETE para remove individual. |
| C7 | `/orgs/{org_id}/websites/{ws_id}/php-version` | GET/PUT | métrica + (DC.NEW v1.x si demanda inline) |

**D. SSO sub-recursos** (todos diferidos v1, registrar para v1.x)

| # | Path | Uso |
|---|---|---|
| D1 | `/orgs/{org}/websites/{ws}/emails/{email}/sso` | DC.NEW-15C-6 webmail directo |
| D2 | `/orgs/{org}/websites/{ws}/mysql-dbs/{db}/sso` | DC.NEW-15C-7 phpMyAdmin directo |
| D3 | `/orgs/{org}/websites/{ws}/apps/{app}/wordpress/users/{u}/sso` | DC.NEW-15C-8 wp-admin directo |
| D4 | `/orgs/{org}/websites/{ws}/mysql-dbs/{db}/sso` | (idem D2) |

**E. DNS zone & records — autoridad DNS real**

| # | Path | Método | Uso Aelium |
|---|---|---|---|
| E1 | `/orgs/{org}/websites/{ws}/domains/{dom}/dns-zone` | GET/PATCH | 🧑🛠️ GET zone+SOA+records. PATCH SOA (admin only). |
| E2 | `.../dns-zone/records` | POST | 🧑🛠️ create record (manifest action `add_dns_record`) |
| E3 | `.../dns-zone/records/{rec_id}` | PATCH/DELETE | 🧑🛠️ update / delete record |
| E4 | `.../dns-zone/dnssec` | POST/DELETE | DC.NEW-15C-DNSSEC v1.1 |
| E5 | `.../dns-status` | GET | 🛠️ admin diagnose DNS health |
| E6 | `.../dns-query` | GET | 🛠️ admin live query |
| E7 | `/v2/settings/dns/default-records` | GET/POST/PATCH/DELETE | ⚙️ **CRÍTICO** — Aelium configura aquí los defaults A apex/www + NS + MX → toda zona nueva los hereda |
| E8 | `/orgs/{org}/domains/{dom}/auth-ns` | GET | 🛠️ verifica NS authority |

**Record kinds confirmados** (línea 18258 spec): `[A, AAAA, CNAME, TXT, SPF, SRV, NS, MX, PTR, DS, CAA]` — 11 kinds. Aelium v1 expone 7: `A, AAAA, CNAME, MX, TXT, SRV, CAA`.

**F. Métricas & resource usage**

| # | Path | Métrica expuesta en Aelium |
|---|---|---|
| F1 | `/orgs/{org}/subscriptions/{sub}/bandwidth` | `metrics.bandwidthUsedMb` |
| F2 | `/orgs/{org}/subscriptions/{sub}/calculate-resource-usage` | `metrics.diskUsedMb`, `emailAccountsUsed`, `databasesUsed` (response = UsedResourcesFullListing) |
| F3 | `/orgs/{org}/websites/{ws}/metrics` | website-level metrics (línea 9285) |

**G. Acciones admin** (suspend / cancel / upgrade / reset password)

| Acción Aelium curada | Llamada Enhance |
|---|---|
| Suspend subscription completa (impago) | `PATCH /orgs/{org}/subscriptions/{sub}` body `{ isSuspended: true }` |
| Unsuspend | mismo path body `{ isSuspended: false }` |
| Cancel/deprovision | `DELETE /orgs/{org}/subscriptions/{sub_id}` |
| Force cancel (wipe completo) | `DELETE /orgs/{org}/subscriptions/{sub_id}?force=true` (admin only, audit pesado) |
| Change plan (admin only v1) | `PATCH /orgs/{org}/subscriptions/{sub}` body `{ planId: <new> }` |
| Reset hosting password | `PUT /v2/logins/{login_id}/password` body `NewPassword` |

**H. Email accounts & forwards** — diferido v1.x (delegado a Customer Panel via SSO)

`/orgs/{org}/websites/{ws}/emails`, `.../emails/{email}` (CRUD), `.../emails/{email}/password`, `.../emails/{email}/forwards` (CRUD), `.../emails/{email}/autoresponder`, `.../emails/{email}/sso` (D1 arriba).

**I. MySQL databases & users** — diferido v1.x

`/orgs/{org}/websites/{ws}/mysql-dbs`, `.../mysql-dbs/{db}` (CRUD), `.../mysql-dbs/{db}/sql`, `.../mysql-dbs/{db}/sso` (phpMyAdmin), `/orgs/{org}/websites/{ws}/mysql-users` (CRUD).

**J. SSL certificates** — diferido v1.x

`/orgs/{org}/websites/{ws}/ssl/*`, `/v2/domains/{dom}/letsencrypt`, `/v2/domains/{dom}/ssl`. Enhance auto-provisiona Let's Encrypt; CRUD custom cert via Customer Panel.

**K. Backups** — diferido v1.x

`/orgs/{org}/websites/{ws}/backups` (CRUD + restore + directory tree).

**L. Apps & WordPress** — diferido v1.x

`/orgs/{org}/websites/{ws}/apps` (instalación), `.../wordpress/*` (gestión WP completa), `.../joomla/*` (Joomla gestión).

**M. Branding** — NO Aelium scope

`/orgs/{org}/branding/*`. Branding Aelium se configura una vez vía panel Enhance manualmente. Cluster-wide (Aelium = Master org → cascade).

**N. Cluster admin** — NO plugin scope

`/servers/*` (gestión cluster), `/settings/orchd/*` (settings plataforma). Vive en `/admin/infrastructure` (Sprint 10 + ADR-071), no en plugin.

**O. Importers** — para futura migración

`/v2/orgs/{org}/import/*`. Aelium NO migra clientes existentes v1 (sin clientes legacy hosting).

**P. Default DNS records platform** — pieza clave de §3.5

`/v2/settings/dns/default-records` GET/POST + `.../{record_id}` PATCH/DELETE. Plugin Enhance los configura en bootstrap + propaga al cluster.

### 4.2. Schemas críticos (refs literales)

| Schema | Línea spec | Uso Aelium |
|---|---|---|
| `Org` | 15504 | Resolver `ownerId/ownerLoginId` para SSO |
| `NewCustomer` | 15455 | `{ name }` — minimal |
| `LoginInfo` | 16072 | `{ email, password, name }` para crear login |
| `NewMember` | 16238 | `{ loginId, roles }` para promover login a member |
| `OrgOwnerUpdate` | 18444 | `{ memberId }` para promover member a Owner |
| `Role` enum | 16149 | `[Owner, SuperAdmin, Business, SiteAccess, Support, Sysadmin]` |
| `NewSubscription` | 15923 | `{ planId, dedicatedServers?, friendlyName? }` |
| `Subscription` | 15934 | Status, resources, allowances, suspendedBy |
| `UpdateSubscription` | 16013 | `{ status?, isSuspended?, planId?, ... }` (planId updatable = plan change) |
| `NewWebsite` | 16392 | `{ domain, subscriptionId, ...serverIds? }` |
| `Website` | 16448 | id, domain, status, suspendedBy, plan, php, server IPs |
| `DnsRecordKind` enum | 18258 | `[A, AAAA, CNAME, TXT, SPF, SRV, NS, MX, PTR, DS, CAA]` |
| `DnsRecord` | 18130 | `{ id, kind, name, value, ttl, proxy }` |
| `DnsZone` | 18088 | `{ origin, soa, records[], dnssecDsRecords?, dnssecDnskeyRecords? }` |
| `NewDnsRecord` | 18185 | `{ kind, name, value, ttl?, proxy? }` |

---

## 5. Scope v1 Plugin Enhance CP — frozen contra spec literal

**Total: 28 features in / 17+ features out.**

### 5.1. ✅ ENTRA en v1 (28 features)

**Auth & bootstrap (3)**

| # | Feature | Endpoint(s) Enhance |
|---|---|---|
| E.AUTH.1 | Bearer token + Org ID en `manifest.secretsSchema` (apiToken) + `configSchema` (baseUrl, masterOrgId) | — |
| E.AUTH.2 | Test-connection idempotente | `GET /version` (sin auth) o `GET /orgs/{master_org_id}` (auth check) |
| E.AUTH.3 | Lazy create Customer + tabla nueva `enhance_customers (client_id PK, enhance_org_id, enhance_owner_login_id, enhance_owner_member_id)` | `POST /orgs/{master}/customers` |

**Provisioning lifecycle (5)**

| # | Feature | Endpoint(s) Enhance |
|---|---|---|
| E.PROV.1 | `provision()` flujo 6 pasos idempotente (search-by-email + create customer + create login + create member + promote owner + create subscription + create website) | `POST /orgs/{master}/customers`, `POST /logins?orgId=`, `POST /orgs/{cust}/members`, `PUT /orgs/{cust}/owner`, `POST /orgs/{master}/customers/{cust}/subscriptions`, `POST /orgs/{cust}/websites` |
| E.PROV.2 | `deprovision()` cancel subscription | `DELETE /orgs/{org}/subscriptions/{sub_id}` |
| E.PROV.3 | `getStatus()` para reconcile cron | `GET /orgs/{org}/subscriptions/{sub_id}` + `GET /orgs/{org}/websites/{ws_id}` |
| E.PROV.4 | Listener `auto-config-dns-on-hosting-provisioned` como **reconciliation defensivo** (no creación inline — los defaults globales lo hacen automático) | (lectura zone + verificación) |
| E.PROV.5 | Suspend/unsuspend admin (`/admin/services/[id]`) | `PATCH /orgs/{org}/subscriptions/{sub_id}` body `{ isSuspended }` |

**Service info + métricas (1)**

| # | Feature | Endpoint(s) |
|---|---|---|
| E.INFO.1 | `getServiceInfo()` con `display.primary`, `metrics.{disk, bandwidth, emailAccounts, databases}`, `status` mapeado | `GET /orgs/{org}/subscriptions/{sub_id}` + `GET .../bandwidth` + `GET .../calculate-resource-usage` (cache 60s Redis) |

**Acciones inline cliente (3)** — heredan `inlineActions` ADR-077 §4

| # | Feature | Endpoint Enhance |
|---|---|---|
| E.ACT.1 | `reset_account_password` | `PUT /v2/logins/{customer_owner_login_id}/password` |
| E.ACT.2 | `view_disk_usage` (drill-down) | (read de `getServiceInfo.metrics`, sin endpoint nuevo) |
| E.ACT.3 | `view_bandwidth_usage` (drill-down) | (idem) |

**SSO (2 + 1 evento)**

| # | Feature | Endpoint Enhance |
|---|---|---|
| E.SSO.1 | Cliente "Abrir mi panel" → 2 calls + redirect 302 | `GET /orgs/{cust}` (resolve ownerId) + `GET /orgs/{cust}/members/{ownerId}/sso` (OTP URL) |
| E.SSO.2 | Admin Aelium "Abrir panel cliente" (impersonation) | mismo patrón + audit `service.admin_sso_impersonation` |
| E.SSO.3 | Evento canónico `service.admin_sso_impersonation` con flag `gdpr_visible_to_data_subject=true` (visible en `/dashboard/transparency`) | — |

**DNS records management (8)** — pieza pesada del sprint

| # | Feature | Endpoint Enhance |
|---|---|---|
| E.DNS.1 | Endpoint orquestador `GET /api/v1/services/{id}/dns/records` con resolver cross-plugin | `GET /orgs/{org}/websites/{ws}/domains/{dom}/dns-zone` (vía plugin si authority='aelium') |
| E.DNS.2 | Add record (7 tipos: A, AAAA, CNAME, MX, TXT, SRV, CAA) | `POST .../dns-zone/records` body `NewDnsRecord` |
| E.DNS.3 | Update record | `PATCH .../dns-zone/records/{rec_id}` body `UpdateDnsRecord` |
| E.DNS.4 | Delete record | `DELETE .../dns-zone/records/{rec_id}` |
| E.DNS.5 | List records (paginado client-side, zone API devuelve todos) | (parte de E.DNS.1) |
| E.DNS.6 | Listener `domain.zone_pre_create` (handshake con plugin RC futuro 15D) — verifica zona existe antes de RC register | (lectura zone defensiva) |
| E.DNS.7 | Bootstrap default DNS records globales del cluster (A apex, A www, NS) en plugin install + propagación setting `provisioning.default_nameservers` → Enhance | `POST /v2/settings/dns/default-records` |
| E.DNS.8 | Helper `core/provisioning/dns-authority-resolver.ts` (cross-plugin routing por NS comparison) | (no toca Enhance) |

**Acciones admin (2)**

| # | Feature | Endpoint Enhance |
|---|---|---|
| E.ADM.1 | `change_package` admin-only v1 (cliente bloqueado hasta billing prorrateo cross-plan) — DC.NEW-15C-1 | `PATCH /orgs/{org}/subscriptions/{sub_id}` body `{ planId }` |
| E.ADM.2 | `force_resync` admin (recalcular resources tras cambio externo) | `PUT /orgs/{org}/subscriptions/{sub_id}/calculate-resource-usage` |
| E.ADM.3 | Endpoint `POST /api/v1/admin/services/{id}/force-reconcile` para forzar reconcile de un service tras cambio manual conocido | (orquestador, no toca Enhance) |

**Transversales (4)**

| # | Feature | Detalle |
|---|---|---|
| E.X.1 | Cron `reconcile-enhance-services` cada 6h (BullMQ) | Detecta drift: subscription/website missing, status divergence, plan divergence |
| E.X.2 | Audit completo de cada llamada API (heredado wrappers ADR-080) | `audit_change_log` + `audit_access_log` |
| E.X.3 | Circuit breaker (heredado ADR-080) en `getServiceInfoWithCache` + `executeActionWithCacheInvalidation` | — |
| E.X.4 | `MockEnhanceServer` Express stub para CI E2E + fixtures capturados de live durante 15C.B | — |
| E.X.5 | Setting global `provisioning.default_nameservers` (no per-plugin) — fuente de verdad. Listener `provisioning.default_nameservers_changed` propaga a Enhance via E.DNS.7. | — |
| E.X.6 | Evento canónico nuevo `service.reconciled_external_change` con payload `{ service_id, plugin_slug, change_type, expected, actual, detected_at }` + listener `audit-on-service-reconciled-external-change` con flag GDPR | — |
| E.X.7 | Setting `provisioning.enhance_cp.reconciliation_alert_threshold` (default 5 divergencias/día) → si superado, alerta superadmin | — |

> **Nota**: la cuenta dice "transversales (4)" pero realmente son 7 con E.X.5/E.X.6/E.X.7 que se fijaron en el chat 2026-05-07. Total scope v1 final: **28 features in** (3 auth + 5 prov + 1 info + 3 act + 3 sso + 8 dns + 3 adm + 7 transversales — ajuste menor sobre estimación inicial 27).

### 5.2. ❌ FUERA de v1 — diferido con razón (17+ features)

| Feature | Razón fuera v1 | Cuándo vuelve |
|---|---|---|
| **CRUD email accounts** (5+ endpoints) | Customer Panel es el experto: forwarding rules, autoresponders, filters, password policy, quotas. ADR-070 doctrina explícita. | NUNCA dashboard cliente. v1.1 admin si demanda fuerte. |
| **CRUD database accounts + users** (8+ endpoints) | phpMyAdmin embebido en Customer Panel. | NUNCA dashboard cliente. |
| **Backup CRUD + restore** (5 endpoints) | Backup role Enhance gestiona; cliente lo ve via Customer Panel. | DC.NEW-15C-9 v1.1 si demanda |
| **File Manager** | Customer Panel + cliente usa SFTP/Git. | NUNCA dashboard. |
| **Cron jobs (website cron)** | Customer Panel. | NUNCA. |
| **SSL CRUD (LE + custom)** | Auto-LE Enhance. Custom cert via panel. | DC.NEW-15C-10 v1.1 |
| **WordPress staging/clone/install** | Enhance app templates + Customer Panel. | DC.NEW-15C-11 v1.1 (feature comercial fuerte) |
| **`change_package` UI cliente** | Bloqueado hasta billing prorrateo cross-plan implementado en Aelium | DC.NEW-15C-1 cuando cierre sub-sprint billing |
| **`SPF` records** | Deprecated RFC 7208 (use TXT con `v=spf1`). | NUNCA — confunde al cliente |
| **`NS` records de zona (CRUD)** | Setting global gestiona NS. Editar NS-as-record en zona = romper delegación. | NUNCA cliente. v1.1 admin diagnostic-only |
| **`PTR` records** | Reverse DNS, requiere PTR delegation que cliente típico no tiene | DC.NEW-15C-2 v1.1 |
| **`DS` records (DNSSEC)** | Va con flag `enableDnsSec` separado. | DC.NEW-15C-DNSSEC v1.1 |
| **DNSSEC enable/disable** | Power-user feature | DC.NEW-15C-DNSSEC v1.1 |
| **SSO sub-recursos** (webmail D1, phpMyAdmin D2, wp-admin D3) | UX brillante pero v1 prioriza el flujo principal (panel Enhance scopado) | DC.NEW-15C-6/7/8 v1.x |
| **Webhook receiver Aelium** (`POST /api/v1/webhooks/enhance`) | orchd v12.21.3 NO emite webhooks → código muerto v1 | DC.NEW-15C-WEBHOOKS si Enhance los añade |
| **Cluster admin (servers, packages CRUD, branding)** | Vive en `/admin/infrastructure` (Sprint 10 + ADR-071) — fuera plugin scope | Sprint 10 + 15E |
| **Importers (cPanel/Plesk migrate)** | Sin clientes legacy hosting que migrar | DC.NEW-15C-12 v2 si migración real |
| **Reseller sub-customers** (recursive customer hierarchy) | Aelium = Master directo, sin sub-resellers v1 | NUNCA primer cliente real |

### 5.3. Comparativa Aelium v1 vs WHMCS / Blesta / WiseCP / Upmind

| Feature | WHMCS oficial | Blesta | WiseCP | Upmind | **Aelium v1** |
|---|---|---|---|---|---|
| Provision/suspend/terminate | ✅ | ✅ | ✅ | ✅ | ✅ |
| Change package | ❌ | ❌ | ✅ | ❌ | ✅ admin only |
| Reset password | ❌ | ❌ | ✅ | ❌ | ✅ |
| One-click panel login | ❌ | ❌ | ✅ | ❌ | ✅ cliente + admin (separados) |
| DNS records CRUD | ❌ | ❌ | ❌ | ❌ | ✅ **7 tipos** |
| Métricas inline (disk/bandwidth/email/db) | ❌ | ❌ | ❌ | ❌ | ✅ snapshot 60s |
| Acciones curadas auditables | ❌ | ❌ | parcial | ❌ | ✅ ADR-070 doctrina |
| Default DNS records globales bootstrap | ❌ | ❌ | ❌ | ❌ | ✅ E.DNS.7 |
| Reconcile drift detection (cron 6h) | parcial | parcial | parcial | parcial | ✅ + alerta superadmin si threshold superado |
| Audit completo (R3 inmutable) | ❌ | ❌ | parcial | parcial | ✅ ADR-080 wrappers |
| Circuit breaker | ❌ | ❌ | ❌ | ❌ | ✅ ADR-080 |
| Cross-plugin DNS authority routing | ❌ | ❌ | ❌ | ❌ | ✅ E.DNS.8 |
| Customer Panel SSO scopado (no admin global) | ❌ | ❌ | parcial (no scoping confirmado) | ❌ | ✅ via OTP `/orgs/{cust}/members/{owner}/sso` |

Aelium v1 supera a WiseCP (el más capaz) en DNS + métricas + audit + cross-plugin + reconcile drift + circuit breaker. Razón: doctrina "dashboard puerta unificada profesional" (ADR-070) + framework Sprint 15A ya construido.

---

## 6. Decisiones técnicas frozen para Sprint 15C

> Estas decisiones se tomaron en el chat Yasmin ↔ Claude del 2026-05-07 + se validaron contra spec literal (`docs/_research/sprint-15c/orchd-oas3-api.yaml`). Entran a ADR-083 cuando se redacte. **No se reabren** salvo razón nueva documentada.

### 6.1. Auth & test connection

1. **Scheme**: `bearerAuth` exclusivamente (`sessionCookie` ignorado — Aelium no hace login interactivo).
2. **Token scope**: **Super Admin** (no Owner). Razón: Owner no se puede borrar — mayor blast radius si filtración. Super Admin tiene permisos completos cluster-wide pero es revocable.
3. **Storage**: `SecretVaultService` AES-256-GCM (heredado ADR-080).
4. **Manifest**:
   - `configSchema`: `{ baseUrl: string format=uri required, masterOrgId: string format=uuid required, reconciliationIntervalHours: integer default=6 }`
   - `secretsSchema`: `{ apiToken: string format=password required }`
5. **Test-connection**: `GET /version` (idempotente, sin auth) seguido de `GET /orgs/{masterOrgId}` (con auth) → si ambos 200, OK.
6. **Header en todas las llamadas**: `Authorization: Bearer <apiToken>` + `Accept: application/json`.

### 6.2. Multi-tenancy mapping (Client Aelium ↔ Customer Org Enhance)

7. **Tabla nueva** `enhance_customers (client_id PK uuid → clients.id, enhance_org_id uuid unique, enhance_owner_login_id uuid, enhance_owner_member_id uuid, created_at timestamptz, updated_at timestamptz)`. Migración Prisma `sprint15c_enhance_customers`.
8. **Lazy create**: el customer se crea en Enhance al primer hosting Aelium provisionado (no en el alta de Client). Idempotencia robusta:
   - Step 0: `prisma.$transaction` con advisory lock por `client_id`.
   - Step 1: `SELECT FROM enhance_customers WHERE client_id = ?` → si existe, return.
   - Step 2: `GET /orgs/{master}/customers?search=<client.email>` (defensivo cross-restart): si existe pero no en tabla, INSERT mapping y return.
   - Step 3: si no, ejecutar provision flow (§6.3).
9. **Mapping Service Aelium**:
   - `services.provider_reference = enhance_subscription_id` (integer serializado a string).
   - `services.metadata = { enhance_website_id, enhance_org_id, enhance_subscription_id, enhance_plan_id, primary_domain }` (todo string, R12 ADR-077 §2.2).

### 6.3. Provision flow 6-step idempotent

10. **Flujo canónico** (todos los IDs en respuesta):

```
1. POST /orgs/{master}/customers
   body: { name: client.organisation_name }
   → { id: customer_org_id }

2. POST /logins?orgId={customer_org_id}
   body: { email: client.email, password: <random uuid>, name: client.organisation_name }
   → { id: login_id }

3. POST /orgs/{customer_org_id}/members
   body: { loginId: login_id, roles: ["Owner"] }
   → { id: member_id }

4. PUT /orgs/{customer_org_id}/owner
   body: { memberId: member_id }
   → 200 OK

5. POST /orgs/{master}/customers/{customer_org_id}/subscriptions
   body: { planId: <product.config.enhance_plan_id> }
   → { id: subscription_id (integer) }

6. POST /orgs/{customer_org_id}/websites
   body: { domain: service.domain, subscriptionId: subscription_id }
   → { id: website_id }
```

11. **Atomicidad**: cada paso idempotente individualmente. Si paso 4 falla tras pasos 1-3 OK → reintento 5 minutos después (BullMQ retry policy `[30s, 90s, 270s]`). Tras 3 fallos → DLQ + alerta.
12. **Reverso compensatorio si falla mid-flight**: se delega al cron `reconcile-enhance-services` (servicios en estado 'pending' >24h se marcan 'failed' + alerta admin). NO hay rollback automático (riesgoso si admin ya tocó algo manualmente).

### 6.4. SSO 2-call OTP flow

13. **Flujo cliente "Abrir mi panel"**:

```
1. GET /orgs/{customer_org_id}
   → returns Org { ..., ownerId, ownerLoginId, ... }

2. GET /orgs/{customer_org_id}/members/{ownerId}/sso
   → returns string (OTP URL: "https://<panel>/login/sessions/sso?otp=<uuid>")

3. Aelium emite audit event service.sso_opened + redirect 302 → OTP URL

4. Browser sigue redirect → Enhance verifica OTP → crea sesión cookie scopada al customer org → cliente entra
```

14. **Flujo admin Aelium "Abrir panel cliente"**: idéntico paso 1+2, pero antes emite `service.admin_sso_impersonation` con flag `gdpr_visible_to_data_subject=true` → audit log + portal RGPD `/dashboard/transparency` lo expone al cliente ("Aelium agente <X> abrió tu panel el <fecha> desde IP <Y>").
15. **TTL del OTP**: corto (Enhance lo gestiona). Aelium NO cachea la URL — se regenera en cada apertura.

### 6.5. DNS authority + records doctrine

16. **Capability flag canónico nuevo** `has_dns_management: boolean` añadido a `PluginCapabilities` (ADR-077 Amendment A1):
    - `enhance_cp` declara `true`.
    - Plugins existentes (`internal`, `manual`) declaran `false` (Amendment A1 también los actualiza).
    - Plugins futuros (`resellerclub`, `docker_engine`, `plesk_obsidian`) declaran `false` por defecto; `cloudflare_dns` hipotético declararía `true`.
17. **Record kinds expuestos v1**: `[A, AAAA, CNAME, MX, TXT, SRV, CAA]` (7 de 11 disponibles). SPF/NS/PTR/DS fuera v1 (§5.2 razones).
18. **Helper canónico** `core/provisioning/dns-authority-resolver.ts`:
    ```typescript
    export function resolveDnsAuthority(
      service: Service,
      registry: PluginRegistryService,
      settings: SettingsService
    ): { authority: 'aelium' | 'external'; plugin: ProvisionerPlugin | null }
    ```
19. **Endpoint nuevo orquestador**: `GET /api/v1/services/{id}/dns/records` + `POST/PATCH/DELETE` análogos. Resolver routea al plugin con `has_dns_management=true`.
20. **Default records cluster Enhance**: bootstrap del plugin instala defaults vía `POST /v2/settings/dns/default-records`:
    - `{ kind: 'A', name: '@', value: '<server_ip>' }`
    - `{ kind: 'A', name: 'www', value: '<server_ip>' }`
    - `{ kind: 'NS', name: '@', value: 'ns1.aelium.net' }`
    - `{ kind: 'NS', name: '@', value: 'ns2.aelium.net' }`
    - `{ kind: 'MX', name: '@', value: 'mail.<server_ip_reverse>' }` (opcional, si email role activo)
21. **Listener `auto-config-dns-on-hosting-provisioned` redefinido**: NO crea records inline. Reconcile defensivo (verifica que la zona tiene los defaults, los re-aplica si faltan). Cero race condition.

### 6.6. Reconciliation 3 capas (60s / on-demand / 6h)

22. **L1 — Cache `service_info` Redis TTL 60s** + invalidación tras cualquier acción Aelium (heredado ADR-080 wrappers). Cubre status + métricas + display.
23. **L2 — Reads on-demand sin cache** para DNS records / list emails / list databases. Cada vez que la UI renderiza esa pestaña, golpe directo a Enhance. Siempre fresh.
24. **L3 — Reconcile cron** `reconcile-enhance-services` BullMQ cada 6h:
    - Para cada service con `provisioner_slug='enhance_cp'` y `status IN ('active','suspended')`:
      - `GET /orgs/{org}/subscriptions/{sub_id}` → si 404 → emit `service.reconciled_external_change` con `change_type='subscription_missing'`.
      - Comparar `Subscription.status` Aelium vs Enhance → si divergente → emit `service.reconciled_external_change` con `change_type='status_divergence'`.
      - Comparar `Subscription.planId` vs `Product.config.enhance_plan_id` → si divergente → emit `change_type='plan_divergence'` (NO auto-corregir — billing implication).
    - Setting `provisioning.enhance_cp.reconciliation_alert_threshold` (default 5 / día) → si supera, alerta superadmin.

### 6.7. Mock testing strategy

25. **`MockEnhanceServer`**: Express stub local que responde con fixtures JSON capturados durante 15C.B contra Enhance live.
26. **Fixtures captura plan**: durante 15C.B Yasmin ejecuta ~10 curls contra su Enhance live (sub-customer `qa-aelium` creado ad-hoc) → JSON responses dump en `tests/fixtures/enhance/`.
27. **CI E2E**: usa MockServer al 100%. NO golpea Enhance live.
28. **Smoke E2E manual** (15C.I): Yasmin ejecuta suite ad-hoc contra Enhance live para validar shapes reales (1-2 horas).

### 6.8. Plan upgrade admin-only v1

29. **Cliente UI**: botón "Cambiar plan" en `/dashboard/services/[id]` → "Contacta soporte" inline + CTA crear ticket. Bloqueado hasta cierre billing prorrateo cross-plan (DC.NEW-15C-1).
30. **Admin UI**: acción curada `change_package` en `/admin/services/[id]` → modal confirm con texto explícito sobre billing manual + dropdown de planes Enhance disponibles. Admin asume responsabilidad de generar invoice ajuste o nota de crédito.

### 6.9. Capability flags refinement (`enhance_cp`)

31. **Capabilities estáticas frozen**:

```typescript
{
  has_sso_panel: true,
  panel_label: 'plugin.enhance_cp.panel_label',  // i18n key → "Panel Enhance"
  has_metrics: true,
  has_metrics_history: false,
  requires_server: false,
  provision_mode: 'sync',
  completes_via_task: false,
  supports_reconciliation: true,
  has_dns_management: true,  // ⭐ NUEVO via ADR-077 Amendment A1
}
```

32. **`inlineActions` literal**:

```typescript
[
  { slug: 'reset_account_password', label: 'plugin.enhance_cp.actions.reset_password', confirmRequired: true, destructive: false },
  { slug: 'view_disk_usage', label: 'plugin.enhance_cp.actions.view_disk', confirmRequired: false, destructive: false },
  { slug: 'view_bandwidth_usage', label: 'plugin.enhance_cp.actions.view_bandwidth', confirmRequired: false, destructive: false },
  { slug: 'add_dns_record', label: 'plugin.enhance_cp.actions.add_dns_record', confirmRequired: false, destructive: false, payloadSchema: <NewDnsRecord JSON-Schema> },
  { slug: 'update_dns_record', label: 'plugin.enhance_cp.actions.update_dns_record', confirmRequired: false, destructive: false, payloadSchema: <UpdateDnsRecord> },
  { slug: 'delete_dns_record', label: 'plugin.enhance_cp.actions.delete_dns_record', confirmRequired: true, destructive: true },
  { slug: 'change_package', label: 'plugin.enhance_cp.actions.change_package', confirmRequired: true, destructive: false, payloadSchema: { planId: integer } },  // admin only
  { slug: 'force_resync', label: 'plugin.enhance_cp.actions.force_resync', confirmRequired: false, destructive: false },  // admin only
]
```

### 6.10. Operational doctrine — Enhance gana en conflicto (DH-INV-6)

33. **Aelium NO es fuente de verdad operacional**. Es:
    - Fuente de verdad **billing** (qué se cobró cuándo, qué products tiene el cliente).
    - Fuente de verdad **identidad cross-portal** (Client + roles + audit trail).
    - **Gateway curado** sobre Enhance para acciones de alta frecuencia + UX unificada.
34. **Si conflicto operacional**: gana Enhance. Reconcile cron actualiza Aelium, no al revés. Excepción: provision/deprovision donde Aelium dispara la acción + persiste resultado tras éxito.
35. **Aplicación práctica**:
    - Admin borra website manualmente desde panel Enhance → reconcile detecta missing → marca `Service.status='unknown'` (no 'cancelled' automático — podría ser error humano recuperable) + alerta superadmin + audit.
    - Admin suspende subscription manualmente → reconcile detecta + actualiza `Service.status='suspended'`.
    - Admin cambia planId manualmente → reconcile detecta divergence + alerta (NO auto-corrige Aelium — billing implication, decisión consciente requerida).

---

## 7. Estimación esfuerzo Sprint 15C — 11 fases

> **Reformulación 2026-05-09**: el alcance original de 9 fases asumía implícitamente que el frontend admin operativo "se resolvería en otro sprint", pero ningún sprint posterior (Sprint 12 Settings + KB no cubre productos UI ni service detail admin) absorbía el gap. Tras review riguroso de Fase 15C.E (PR #44) Yasmin decidió añadir 2 fases nuevas que cierran el sprint con un plugin Enhance **operable end-to-end** (no solo backend correcto). Total pasa de 7-10.5 sesiones a **9-12.5 sesiones**.
>
> **Orden canónico de ejecución** (decisión Yasmin 2026-05-09): `A → B → C → D → E → E.2 → F → G → H → J → I`. La tabla abajo está **ordenada por nombre de fase** para legibilidad; la columna *Estado* indica el estado real. **Siguiente fase tras merge PRs #49 + #50 es 15C.I** — última fase del sprint (cierre formal: E2E completo + retrospectiva + smoke contra Enhance live + i18n + housekeeping documental). 10/11 fases cerradas (estado actualizado 2026-05-09 post-merge fases H + J).

| Fase | Contenido | Estimación | Estado |
|---|---|---|---|
| 15C.A | ADR-082 transversal + ADR-077 Amendment A1 + ADR-083 specifics | 0.5–1 sesión | ✅ cerrada (PR #36, master `0bb83b3`) |
| 15C.B | Cliente HTTP Enhance (`EnhanceApiClient`) + types TypeScript del spec + `MockEnhanceServer` Express + capturar fixtures contra live | 0.5–1 sesión | ✅ cerrada (PR #37, master `156ea35`) |
| 15C.C | Plugin core (6 métodos contrato + manifest + DI registration + tabla `enhance_customers` + lazy-create idempotente con search-by-email) | 1–1.5 sesión | ✅ cerrada (PR #38, master `69fed47`) |
| 15C.D | Listener `auto-config-dns-on-hosting-provisioned` reconcile defensivo + setting `provisioning.default_nameservers` + propagación cluster + helper `dns-authority-resolver.ts` + endpoints orquestador `/dns/*` | 1–1.5 sesión | ✅ cerrada (PR #41, master `a319063`) |
| 15C.E | **Acciones curadas backend**: reset_password + view_disk + view_bandwidth + change_package admin + force_resync admin + audit completo + flag canónico `ServiceAction.adminOnly` (ADR-077 A3) + 10ª action `list_available_plans` (ADR-083 A3) + enforcement HTTP 403 backend + evento `service.action_admin_only_violation`. Solo backend canónico — el frontend operativo se aborda en Fase 15C.E.2. | 0.5–1 sesión | ✅ cerrada (PR [#44](https://github.com/yasmindanailov/dashboard/pull/44), master `8de99fd`) — 9 commits + suite 454/459 + 5 skipped |
| **15C.E.2** ⭐ NUEVO | **Frontend acciones curadas (gap descubierto Fase 15C.E review)**: (1) Form admin productos (`new/page.tsx` + `ProductEditForm.tsx`) extendido con sub-form dinámico `provisioner_config` por provisioner, vía `@rjsf/core` JSON-Schema 7 (patrón heredado Sprint 15A plugin install UI). Para `enhance_cp`: campo `enhance_plan_id: integer` required. (2) Filter `adminOnly` en `frontend/app/_shared/services/ActionsBar.tsx` con prop `isAdmin` derivada server-side via `isStaffRole(session?.user.role.slug)`. Materializa [ADR-080 Amendment B](../10-decisions/adr-080-plugin-framework.md#amendments) (productConfigSchema opcional) + [ADR-077 Amendment A3.5](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments) frontend filter. Defense-in-depth backend del wrapper sigue activo. | 1 sesión | ✅ cerrada (PR [#45](https://github.com/yasmindanailov/dashboard/pull/45), master `99f4a0c`) — suite 458/463 + 5 skipped |
| 15C.F | **SSO endpoints + admin impersonation + listener GDPR + transparency**. Wrapper `getSsoUrlWithAudit` detecta admin impersonation con predicado canónico `actorIsAdmin && service.user_id !== actorUserId`. Emite ambos eventos: `service.sso_opened` (técnica) + `service.admin_sso_impersonation` (GDPR-flagged) con shape ADR-083 §6. Listener `AuditAdminSsoImpersonationListener` persiste en `audit_access_log` con `metadata.target_user_id = service.user_id` (filtro canónico transparency). Constante cerrada `TRANSPARENCY_VISIBLE_ACTIONS = ['read', 'admin_sso_impersonation']` reemplaza filter por action única. Frontend transparency añade `RESOURCE_LABEL.Service` + `ACTION_LABEL.admin_sso_impersonation`. UI admin SSO trigger se difiere a Fase J. | 0.5–1 sesión | ✅ cerrada (PR [#46](https://github.com/yasmindanailov/dashboard/pull/46), master `801e748`) — suite 466/471 + 5 skipped |
| 15C.G | **DNS records management UI cliente**. Decisión doctrinal: DS components estándar (Select/Input/Modal) en lugar de @rjsf/core (schema plano + UX rica por kind). 9 tipos canónicos en `lib/api.ts` + sync drift `ServiceInfoCapabilities.has_dns_management`. 4 Server Actions con discriminación 404 externally-managed. Página SC `/dashboard/services/[id]/dns/page.tsx` con manejo defensivo `result.success=false`. 3 componentes (`DnsExternallyBanner` SC + `DnsRecordForm` CC + `DnsRecordsManager` CC). Link "Gestionar DNS" en service detail condicional. Doc `features/services/client.md §7.5`. | 1.5–2 sesiones | ✅ cerrada (PR [#47](https://github.com/yasmindanailov/dashboard/pull/47), master `5207ff1`) — sin cambios backend, frontend typecheck + lint + build verde |
| 15C.H | **Reconciliation L3 cron + listener audit + notificación threshold**. Materializa [ADR-083 §6 decisión 24](#6-reconciliation-3-capas-decisiones-22-24). Cron `EnhanceReconciliationCron` (`@Cron(CronExpression.EVERY_6_HOURS)` estático in-process — patrón canónico consistente con `AuditRetentionCron`/`NotificationsRetentionCron`, **NO BullMQ scheduled** como sugería el dossier original — A1 doctrina) ejecuta cada 6h sobre services `provisioner_slug='enhance_cp' AND status IN ('active','suspended')`. Por cada service hace **`api.getSubscription` directo via `plugin.getApiClient()`** (acoplamiento plugin-internal aceptable — el cron vive **dentro** del módulo Enhance, NO usa `plugin.getStatus()` que solo devuelve status sin planId). 3 escenarios drift mutuamente excluyentes por pasada:<br/>· `subscription_missing` (404 Enhance) → emite `service.reconciled_external_change` con `change_type='subscription_missing'` + log warn. **NO modifica `Service.status`** (DH-INV-6 + dossier §6.10 + el enum Prisma no tiene `'unknown'`). Admin investiga.<br/>· `status_divergence` (Enhance status ≠ Aelium status) → emite + adopta **automáticamente** (`active`↔`suspended`) o emit-only fuera del set safe-adopt (cancelled/expired/failed) preservando flujo billing — A2 doctrina.<br/>· `plan_divergence` (`Subscription.planId ≠ service.metadata.enhance_plan_id`) → emite + NO auto-corrige (billing implication). **Compara contra `service.metadata.enhance_plan_id`** (snapshot por-servicio) NO contra `Product.provisioner_config` (catálogo) — A4 doctrina, evita false-positives tras change_package admin o cambio default catálogo.<br/><br/>**Bug fix incluido**: `actionChangePackage` ahora actualiza `service.metadata.enhance_plan_id` tras éxito del PATCH a Enhance (sin esto, el cron L3 emitiría plan_divergence false-positive eterno tras cualquier change_package admin).<br/><br/>**Listeners cableados:**<br/>· `AuditOnServiceReconciledExternalChangeListener` (`modules/audit/`) — persiste en `audit_change_log` con `user_id=null` (sistema) + `_meta.gdpr_visible_to_data_subject` discriminado per change_type (subscription_missing/status_divergence visibles al cliente; plan_divergence solo admin por billing implication).<br/>· `NotificationsOnReconciliationThresholdExceededListener` (`modules/notifications/listeners/`) — SQL count `+1` race-tolerant sobre `audit_change_log` últimas 24h vs setting `provisioning.enhance_cp.reconciliation_alert_threshold` (default 5). Si supera → `dispatchToSuperadmins('enhance.reconciliation_threshold_exceeded')` + dedupe via setting interno NUEVO `enhance_cp.reconciliation_last_alert_at` (ventana 24h, upsert directo Prisma) — A3 doctrina (NO Redis nuevo, NO precedente en el módulo).<br/><br/>**4 ambigüedades doctrinales resueltas pre-codear** (A1 cron estático; A2 adopta auto + audit; A3 SQL count + setting dedupe; A4 metadata.enhance_plan_id + bug fix change_package). Suite **488/493 unit verde + 5 skipped** (+22 tests: 10 cron + 4 audit listener + 7 notif listener + 1 plugin spec modificado por bug fix). | 0.5 sesión | ✅ cerrada (PR [#49](https://github.com/yasmindanailov/dashboard/pull/49), master `1efeb83`) |
| **15C.I** ⚡ SIGUIENTE — ÚLTIMA FASE | **Cierre formal del sprint** — E2E completo flujo Enhance + smoke manual contra Enhance live + cierre documental + i18n strings finales. **Última fase del sprint** — se ejecuta DESPUÉS de J (cierre operativo) según orden de ejecución canónico (cf. nota encima de la tabla).<br/><br/>**Scope literal del E2E** (debe ejecutarse Playwright o equivalente):<br/>· Producto admin con `provisioner_config.enhance_plan_id` → cliente checkout → `invoice.paid` → orchestrator `provision()` 6-step contra `MockEnhanceServer` → `service.activated`.<br/>· Frontend cliente `/dashboard/services/[id]` render N botones (filtrados por `adminOnly`) → click `view_disk_usage` → 200 + métricas reales del mock.<br/>· Click cliente `change_package` (NO debería verse — defensa filter `adminOnly` + blacklist `INTERNAL_HELPER_SLUGS`) → si bypassed manual con curl → 403 + audit `service.action_admin_only_violation`.<br/>· Click admin desde `/admin/services/[id]` botón "Cambiar plan…" → modal abre → invoca `list_available_plans` → dropdown poblado → submit `change_package` con `planId` elegido → 200 + `service.metadata.enhance_plan_id` actualizado (Fase H bug fix verifiable).<br/>· Cliente abre `/dashboard/services/[id]/dns` → crea record A apex → 200 + record visible.<br/>· Admin abre SSO impersonation desde `/admin/services/[id]` → cliente lo ve en `/dashboard/transparency` (filter `TRANSPARENCY_VISIBLE_ACTIONS` Fase F).<br/><br/>**Plan paso a paso para próximo agente** (orden canónico):<br/>1. **Pre-research**: leer dossier completo (especialmente §6 + §7 todas las filas A→J cerradas para entender qué heredas) + `current.md` §Sprint 15C + estado código (ya 488/493 unit verde post-Fase J). Verificar el playbook E2E del proyecto (¿existe `frontend/e2e/`? ¿Playwright config? ¿precedente `admin-plugins.spec.ts` Sprint 15A?).<br/>2. **E2E Playwright**: crear `frontend/e2e/sprint-15c-enhance-flow.spec.ts` o equivalente con los 6 escenarios literales arriba. Reusar `MockEnhanceServer` Express stub (Fase B `backend/test/mocks/enhance-server/`). Setup canónico: pre-seed services + plugin_install enhance_cp con apiToken cifrado apuntando al mock local.<br/>3. **Smoke manual contra Enhance live** (1-2h Yasmin): documentar checklist paso a paso (login → seteo env vars `ENHANCE_DEV_*` → `pnpm seed` → crear producto → cliente checkout → verificar provisioning → cambiar plan → SSO → DNS → reconcile cron triggered manualmente o esperar 6h).<br/>4. **Doc canónica nueva**: `docs/features/provisioning/admin-plugins-enhance.md` operativa diaria del plugin Enhance (paralela a `admin-plugins.md` framework Sprint 15A) con secciones: visión general, instalación + configuración, flujo provisioning end-to-end, operaciones admin (change_package + force_resync + SSO impersonation + DNS), reconciliation L3 + alertas threshold, troubleshooting común, references canon.<br/>5. **Retrospectiva** `docs/60-roadmap/completed/sprint-15c-plugin-enhance-cp.md`: mover dossier completo (1500+ líneas, 11 fases) a `completed/` siguiendo el patrón `completed/sprint-15a-plugin-framework.md`. Añadir secciones: resumen ejecutivo, métricas finales (sesiones reales vs estimadas, tests añadidos, LOC, ADRs nacidos, deudas resueltas/diferidas), 8-10 lecciones aprendidas (qué salió bien, qué salió mal, qué cambiaría), commit refs canónicos cronológicos. Actualizar `current.md` con puntero al nuevo `completed/`.<br/>6. **Actualizar `_events.md` y `_matrix.md`**: confirmar que los 2 eventos nuevos (`service.admin_sso_impersonation` Fase F + `service.reconciled_external_change` Fase H) están con estado ✅ consumido y shape literal documentado. `_matrix.md`: añadir filas con dependencias plugin Enhance → orquestador → DNS → audit + cross-plugin DNS authority.<br/>7. **i18n strings finales**: deuda heredada de Sprints 11/15A — los plugins emiten strings i18n keys por contrato (ADR-077 §2 + ADR-080 §1) esperando que el frontend traduzca, pero el frontend NO tiene i18n provider cableado todavía. El smoke manual de Yasmin Fase J detectó "plugin.enhance_cp.label" mostrándose crudo en lugar de "Hosting Enhance". Esta fase **cierra esa deuda**: cablear i18n provider canónico (next-intl o equivalente) + traducir todas las keys del plugin Enhance al menos en español (es) — opcionalmente inglés (en) si Yasmin decide. Actualizar `frontend/app/_shared/i18n/` o equivalente con namespace `plugin.enhance_cp`.<br/>8. **DoD final**: typecheck + lint + suite + build (back+front) verdes; E2E spec verde; smoke manual Yasmin OK; retrospectiva movida a `completed/`; `current.md` actualizado removiendo Sprint 15C de "en curso" + añadiendo puntero `completed/sprint-15c-plugin-enhance-cp.md`; rama mergeada a master con squash o cadena (decisión Yasmin); siguiente sprint desbloqueado: **Sprint 15D ResellerClub** (cabeza de cola P2.4 — frase de arranque al re-abrir 15D ya documentada en §10 de este dossier).<br/><br/>**Ambigüedades doctrinales para preguntar a Yasmin antes de codear** (3 detectadas pre-research; el siguiente agente puede detectar más al arrancar):<br/>· **(A1)** ¿E2E Playwright completo (full browser automation) o smoke E2E con supertest backend + jest-axe frontend (más rápido pero menos cobertura visual)? Recomendación: **Playwright** — primer plugin SaaS real, vale la pena la inversión que sirve de patrón para futuros plugins (15D RC, 15E Docker, 15G Plesk).<br/>· **(A2)** ¿Cobertura i18n: solo español (es) o también inglés (en)? Aelium opera principalmente ES pero la base i18n debe estar lista para EN futuro. Recomendación: **solo es** en Fase I (cierre puntual + ahorra ~30% del tiempo de cierre); cablear EN como sub-sprint cuando llegue cliente angloparlante.<br/>· **(A3)** Retrospectiva: ¿mover el dossier ENTERO (1500+ líneas) a `completed/` o crear retrospectiva sintética nueva más corta + dejar el dossier en `60-roadmap/` como referencia técnica? Patrón previo Sprint 15A: movió todo a `completed/` y mantuvo el doc original como referencia histórica del thinking pre-codear. Recomendación: **patrón Sprint 15A** — preserva trazabilidad del proceso de pensamiento, no del outcome solo.<br/><br/>**Frase de arranque verbatim para nueva conversación** (a copiar tal cual al abrir nueva conversación con el siguiente agente):<br/><br/>> *"Lee `docs/60-roadmap/sprint-15c-enhance-cp-dossier.md` §7 fila I + §10 + estado código (488/493 unit verde, 10 fases A→J cerradas, master `c1c9f41` post-merge PR #50). Vamos con Sprint 15C Fase 15C.I — cierre formal del sprint (última fase). Crea rama `sprint15c-fase-i-cierre-sprint` desde master sincronizado tras merge de housekeeping post-fases H+J. Antes de codear, plantéame las 3 ambigüedades doctrinales (A1 E2E Playwright vs smoke supertest; A2 cobertura i18n es vs es+en; A3 retrospectiva mover dossier vs sintética nueva) + cualquier ambigüedad nueva que detectes leyendo el plan paso a paso. Procede de manera rigurosa y profesional. La doc es de lo más importante del proyecto."* | 1–1.5 sesión | ⏳ pendiente — ÚLTIMA FASE |
| 15C.J | **Cierre real operativo (gap descubierto Fase 15C.E review)**: (1) Página admin `/admin/services/[id]` SC nativo paralelo al detalle cliente — reusa `ServiceHeader/MetricsBar/SsoButton/ActionsBar` de `_shared/services/` + Card "Datos del servicio (admin)" (Service ID, owner link a `/admin/clients/[user_id]`, provisioner_slug, producto, fechas) + Card "Operaciones admin" + Banner DNS condicional. CC `AdminServiceOperationsCard` wrapper carga planes via `executeAction('list_available_plans')` en el **event handler del botón** "Cambiar plan…" (canónico React 19 — `react-hooks/set-state-in-effect` prohíbe data fetching dentro de `useEffect`). Pasa `plans/loadingPlans/loadError` por props al CC `ChangePackageModal` (modal puro de UI, gestiona internamente solo `selectedPlanId` + flujo submit que invoca `executeAction('change_package', {planId})`). Blacklist `INTERNAL_HELPER_SLUGS = ['change_package', 'list_available_plans']` añadida a `_shared/services/ActionsBar.tsx` — slugs operados desde modal admin custom, ocultos del listado de botones standalone (tanto cliente como admin). Único caso canónico de blacklist por slug, ortogonal al filter declarativo `adminOnly` (Fase E.2). (2) Plugin install seed condicional `seedSampleEnhancePluginInstall` (`backend/prisma/seeds/`) — 4 ANDs: `NODE_ENV !== 'production'` + 3 env vars completas `ENHANCE_DEV_BASE_URL`/`ENHANCE_DEV_MASTER_ORG_ID`/`ENHANCE_DEV_API_TOKEN` (tras trim defensivo). Si activo: instancia `SecretVaultService` con shim `ConfigService` que delega a `process.env.ENCRYPTION_KEY` (mismo algoritmo AES-256-GCM runtime — blob descifrable por el plugin tras boot), encripta `apiToken` y upsert `plugin_installs.enhance_cp` con `enabled=true`. Idempotente: fila existente preserved (admin config gana). 3 vars OPTIONAL nuevas en `.env.example`. **Hotfix incluido en commit `a34bb93`** (smoke manual Yasmin post-merge): cableado `onRowClick` en lista admin `/admin/services` para navegar a la nueva ruta detail. **4 ambigüedades doctrinales resueltas pre-codear** (A1 modal location → admin colocated en `frontend/app/admin/services/[id]/_components/`; A2 admin UX → sección dedicada con modal NO ActionsBar reuse; A3 seed condition → solo si 3 env vars completas; A4 list_available_plans visibility → oculto vía blacklist hardcoded). Suite **488/493** sin cambios (el seed es script bootstrap sin precedente de unit tests; Jest `rootDir='src'`). Frontend typecheck + lint + build verde. | 1 sesión | ✅ cerrada (PR [#50](https://github.com/yasmindanailov/dashboard/pull/50), master `c1c9f41`) — incluye hotfix `a34bb93` |

**Total: 9–12.5 sesiones.** Mayor que Sprint 15D RC (3-4.5) por: DNS UI completa + listener cross-plugin + lazy customer model con flujo 6 pasos + reconcile drift detection + Frontend admin productos provisioner_config UI dinámica + página admin services detalle. Hereda TODO el framework Sprint 15A. **Las 2 fases nuevas (E.2 + J) cierran el gap operativo descubierto en review** — sin ellas el sprint entrega backend correcto pero un primer cliente real es imposible de contratar end-to-end.

> **Estado real al 2026-05-09 (post-merge fases H + J)**: 10/11 fases cerradas. Suite **488/493 unit verde + 5 skipped**. Solo queda Fase I (cierre formal). 4 PRs encadenados sin desincronización el 2026-05-09 (E + E.2 + F + G), seguidos de 2 PRs más en cadena el mismo día (H + J), confirman que el patrón canónico "una rama por fase desde master sincronizado" escala hasta 6 PRs/día sin fricción. **Total real estimado:** 9-10 sesiones efectivas (dentro del rango bajo proyectado), gracias a que las decisiones doctrinales doc-only de Fase A (3 ADRs) ahorraron tiempo de re-trabajo en cada fase de código.

---

## 8. Deuda explícita generada por este dossier

> Items conscientemente diferidos. Se añaden a `backlog.md` cuando Sprint 15C se promueva a sprint activo (incrementan los DC.NEW-1..11 del dossier 15D).

| Ref | Item | Cuándo abordar |
|---|---|---|
| **DC.NEW-15C-1** | UI cliente `change_package` bloqueada hasta cierre sub-sprint billing prorrateo cross-plan | Cuando cierre sub-sprint billing |
| **DC.NEW-15C-2** | DNS records `PTR` (reverse DNS) — power-user | v1.1 si demanda |
| **DC.NEW-15C-3** | Métricas time-series Enhance — Prometheus + recharts | v2 si demanda |
| **DC.NEW-15C-4** | Webhook receiver Aelium — solo si Enhance añade webhooks push en futura versión orchd | Cuando Enhance los exponga |
| **DC.NEW-15C-5** | WordPress install/staging/clone inline — feature comercial fuerte | v1.x si decisión comercial |
| **DC.NEW-15C-6** | SSO webmail directo (`/orgs/.../emails/{e}/sso`) | v1.x UX brillante |
| **DC.NEW-15C-7** | SSO phpMyAdmin directo (`/orgs/.../mysql-dbs/{db}/sso`) | v1.x UX brillante |
| **DC.NEW-15C-8** | SSO wp-admin directo (`/orgs/.../wordpress/users/{u}/sso`) | v1.x UX brillante |
| **DC.NEW-15C-9** | Backup CRUD + restore inline | v1.1 si demanda real |
| **DC.NEW-15C-10** | SSL CRUD inline (LE auto + custom cert upload) | v1.1 |
| **DC.NEW-15C-11** | App templates / WordPress instalación inline | v1.x — feature comercial |
| **DC.NEW-15C-12** | Importers cPanel/Plesk → Enhance | v2 si migración real de clientes legacy |
| **DC.NEW-15C-DNSSEC** | DNSSEC enable/disable + DS records | v1.1 |
| **DC.NEW-15C-EMAIL** | CRUD email accounts + forwards + autoresponders | NUNCA cliente. Admin v1.1 si demanda. |
| **DC.NEW-15C-DB** | CRUD MySQL databases + users | NUNCA cliente. Admin v1.1 si demanda. |
| **DC.NEW-15C-RESELLER** | Sub-resellers (customers que son resellers) | NUNCA primer cliente real. Solo si Aelium ofrece "reseller hosting". |

> **Nota review 2026-05-09 (Fase 15C.E PR #44)**: review riguroso destapó 5 gaps estructurales del flujo end-to-end (form admin productos sin `provisioner_config` UI ⚠ bloqueante, plugin install no seeded, frontend `ActionsBar` sin filter `adminOnly`, página `/admin/services/[id]` no existe, E2E completo sin spec). **No se añaden como deudas nuevas — se absorben como fases** del Sprint 15C tras decisión doctrinal Yasmin de reformular §7 (era 9 fases, pasa a 11): los 4 gaps estructurales se cubren en las 2 fases nuevas **15C.E.2** (form productos `provisioner_config` UI + filter `ActionsBar`) y **15C.J** (página admin/services/[id] + plugin-seed dev) declaradas en §7 arriba. El gap E2E se absorbe al alcance ampliado de **15C.I** (que ahora declara explícitamente el flujo end-to-end con asserts concretos). Trazabilidad histórica del descubrimiento: commits `22fd093` (5 DCs registradas) → `9271069` (absorción en fases tras decisión doctrinal Yasmin). El listado de DCs originales arriba (1..16 + DNSSEC/EMAIL/DB/RESELLER) son **features diferidas conscientemente** en el dossier original — no gaps estructurales como los 5 descubiertos en review.

---

## 9. ADRs futuros que materializan este dossier

| ADR | Sprint | Contenido literal de este dossier |
|---|---|---|
| **ADR-077 Amendment A1** | 15C.A | Añadir `has_dns_management: boolean` (required) a `PluginCapabilities`. Update plugins existentes (`internal`, `manual`) con `false`. Test contract genérico actualizado para validar el flag. **§3.3 + §6.5** del dossier son input. |
| **ADR-082** Modelo Domain↔Hosting + DNS doctrine (transversal) | 15C.A | Las 6 invariantes DH-INV-1..6 (§3.1) + 4 flujos canónicos checkout F1-F4 (§3.2) + DNS-as-capability (§3.3) + 3 capas NS sync (§3.4) + listener reconcile defensivo (§3.5) + cross-plugin DNS authority resolver (§3.6) + doctrina DH-INV-6 (Enhance gana en conflicto). Implementación en 15C; otros consumidores futuros (RC + email plugins + futuros hosting). |
| **ADR-083** Plugin Enhance CP specifics | 15C.A | Decisiones §6 frozen (35 items): auth flow, multi-tenancy mapping, provision 6-step idempotente, SSO 2-call OTP, DNS authority + records doctrine, reconcile 3 capas, mock testing, plan upgrade admin-only, capability flags refinement, operational doctrine DH-INV-6. Tabla nueva `enhance_customers`. Setting `provisioning.default_nameservers`. Eventos nuevos `service.admin_sso_impersonation` + `service.reconciled_external_change`. |

---

## 10. Cómo arrancar Sprint 15C cuando llegue su turno

> **Estado al 2026-05-09**: Sprint 15C está **en curso al 91%** (10/11 fases cerradas). Esta sección preserva el plan histórico de arranque + añade el **plan canónico para cerrar la Fase I** (última fase) y el **siguiente sprint a arrancar tras cierre 15C** (15D RC).

### 10.1. Plan original de arranque (histórico — ya ejecutado fases A→J)

Pre-condición: Sprint 15A mergeado en master (✅ cumplido — `bee90d8`).

Pasos seguidos:

1. ✅ Re-leído este dossier completo + spec literal en `docs/_research/sprint-15c/orchd-oas3-api.yaml`.
2. ✅ Rama `sprint15c-plugin-enhance-cp` creada desde master sincronizado (Fase A) + ramas posteriores por fase.
3. ✅ Fase 15C.A: 3 ADRs redactados (082 transversal + 077 Amendment A1 + 083 specifics) con contenido literal de §3 + §6.
4. ✅ Shapes validados contra spec (líneas exactas del YAML).
5. ✅ Fases 15C.B → 15C.J ejecutadas según §7 (10 fases — A B C D E E.2 F G H J — siguiendo orden canónico `A → B → C → D → E → E.2 → F → G → H → J → I`).
6. ✅ PR doc-only de ADRs primero (15C.A) → review Yasmin → merge.
7. ✅ PRs siguientes por fase encadenados (B #37, C #38, D #41, E #44, E.2 #45, F #46, G #47, H #49, J #50). Housekeeping documental post-merge en PR #48 (post-E+E.2+F+G) y PR #TBD (post-H+J).
8. ⏳ **Cierre Sprint 15C — Fase 15C.I (siguiente)**: ver §10.2 abajo.
9. ⏳ Tras cierre 15C, arrancar Sprint 15D RC: ver §10.3.

### 10.2. Cómo arrancar Fase 15C.I (siguiente — última fase del sprint)

Pre-condición: Fases A→J mergeadas en master (✅ cumplido — `c1c9f41`) + housekeeping post-fases H+J mergeado.

**Frase de arranque verbatim** (a copiar tal cual al abrir nueva conversación con el siguiente agente):

> *"Lee `docs/60-roadmap/sprint-15c-enhance-cp-dossier.md` §7 fila I + §10.2 + estado código (488/493 unit verde, 10 fases A→J cerradas, master `c1c9f41` post-merge PR #50). Vamos con Sprint 15C Fase 15C.I — cierre formal del sprint (última fase). Crea rama `sprint15c-fase-i-cierre-sprint` desde master sincronizado tras merge de housekeeping post-fases H+J. Antes de codear, plantéame las 3 ambigüedades doctrinales (A1 E2E Playwright vs smoke supertest; A2 cobertura i18n es vs es+en; A3 retrospectiva mover dossier vs sintética nueva) + cualquier ambigüedad nueva que detectes leyendo el plan paso a paso. Procede de manera rigurosa y profesional. La doc es de lo más importante del proyecto."*

El plan paso a paso completo + las 3 ambigüedades doctrinales identificadas pre-research están en [§7 fila I](#7-estimación-esfuerzo-sprint-15c--11-fases) (ver también el contenido de la celda con scope literal del E2E + 8 pasos canónicos del cierre).

### 10.3. Tras cierre 15C → desbloquea Sprint 15D RC

**Frase de arranque al re-abrir 15D** (a usar tras merge final de Fase 15C.I):

> *"Lee `docs/60-roadmap/sprint-15d-resellerclub-dossier.md` + `docs/10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md` + `docs/10-decisions/adr-083-plugin-enhance-cp-specifics.md` + `docs/60-roadmap/completed/sprint-15c-plugin-enhance-cp.md` (retrospectiva del sprint hermano que comparte ADRs 082+083). Vamos con Sprint 15D — Plugin ResellerClub. Crea rama `sprint15d-plugin-resellerclub` desde master."*

---

## 11. Referencias canónicas

- **Spec API literal**: [`docs/_research/sprint-15c/orchd-oas3-api.yaml`](../_research/sprint-15c/orchd-oas3-api.yaml) (orchd 12.21.3, OpenAPI 3.0.3, 588 KB / 20.848 líneas / ~280 paths).
- **README research**: [`docs/_research/sprint-15c/README.md`](../_research/sprint-15c/README.md).
- **Doctrina industria** (cruzada): WHMCS oficial Enhance integration ([quickhost.uk KB](https://help.quickhost.uk/index.php/knowledge-base/whmcs-integration/)), Blesta module ([docs.blesta.com](https://docs.blesta.com/integrations/modules/enhance/)), WiseCP ([docs.wisecp.com](https://docs.wisecp.com/en/kb/enhance)), Upmind ([docs.upmind.com](https://docs.upmind.com/docs/how-to-add-enhance-web-server)).
- **ADRs vigentes consumidos**: [ADR-009](../10-decisions/adr-009-estrategia-plugins.md), [ADR-021](../10-decisions/adr-021-provisioners.md), [ADR-070](../10-decisions/adr-070-service-info-sso-acciones-curadas.md), [ADR-077](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md), [ADR-080](../10-decisions/adr-080-plugin-framework.md).
- **Dossier hermano**: [`sprint-15d-resellerclub-dossier.md`](./sprint-15d-resellerclub-dossier.md) — 11 secciones, 3 ADRs futuros (077 Amendment A1 que ahora produce 15C, 082 transversal que ahora produce 15C, 081 RC specifics).
- **Conversación origen**: sesión Yasmin ↔ Claude del 2026-05-07 (post merge dossier 15D `542d589`).
- **Schema Aelium relevante**: `Service.domain` (`String? @db.VarChar(300)`, schema.prisma:456), `ProductType` enum incluye `domain` y `hosting_web` (schema.prisma:293+).
- **Rules consumidas**: R0 (ADR para arquitectura), R3 (audit inmutable), R4 (plugins no se importan desde core), R7 (errores semánticos), R10 (rate limiting), R11 (circuit breaker), R12 (secretos no en metadata cliente), R13 (fallos no desaparecen), R14 (manejo errores frontend).
