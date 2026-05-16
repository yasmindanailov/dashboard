# Sprint 15C.II — Plugin Enhance Hardening · Dossier de pre-sprint

> **Tipo:** Pre-sprint research dossier (preservado como referencia histórica) + **Apéndice A** al final con decisiones doctrinales congeladas + gaps audit técnico + **§A.10 handoff completo Fase E → F** (próximo agente: leer §A.10 antes de codear — y §A.9.6.1 para el scope detallado de suspend/unsuspend; §A.7/§A.8/§A.9 preserved como referencia histórica de los handoffs anteriores).
> **Estado:** ▶ **ACTIVO 2026-05-11** — Fases A + B + C + D + **E mergeadas a master** (Fase E = PR [#60](https://github.com/yasmindanailov/dashboard/pull/60) squash-merge `1250a2e` 2026-05-11 vía bypass policy §6 — CI GitHub bloqueada por incidente billing externo §A.9.10, validación local `ci:check:full` verde + boot real; rama temporal eliminada). Próxima sesión arranca **Fase F** (admin overview operativo + suspend/unsuspend + audit timeline GAP-M + error_log módulo GAP-N + G4/G5/G8) — frase canónica verbatim §A.10.1, **leer §A.9.6.1 entero** (suspend transversal). Pre-condición técnica Fase F: ✅ resuelta — #60 en master, arranca desde master. PRs mergeados: #52 `ef7f488` + #53 `714c94c` (Fase A) + #54 `01ad9a8` (Fase B) + #55 Fase C 7 rounds + #56 housekeeping + #57 `c3b519e` (Fase D, bypass CI §A.9.10) + #58/#59 housekeeping + #60 `1250a2e` (Fase E, bypass CI §6).
> **Origen:** Smoke real Yasmin contra mock 2026-05-10 durante cierre Fase 15C.I. Reveló gaps sistémicos, decisiones doctrinales aún no tomadas, y violaciones del UI_SPEC §4.3 que el cierre formal Fase I solo abordó parcialmente.
> **Pre-condición técnica:** ✅ resuelta — Opción A doctrina §5 ejecutada (commit Fase 15C.I parcial → PR #52 → merge → nueva rama hardening desde master limpio).
> **Doctrina canónica del usuario (literal 2026-05-10):** "Sobre las deudas pendientes en relación al plugin Enhance, hay que documentarlas, no se da un paso más, hasta que el plugin esté al 100% operativo con los features básicos y necesarios perfectos para producción."
>
> **🆕 Las decisiones doctrinales A1-A4 (§3.1-3.4) quedaron CONGELADAS 2026-05-10** vía AskUserQuestion — todas con la recomendación canónica industria (Stripe / Vercel / WCAG 2.1) seleccionada por Yasmin literal. **Audit técnico paralelo (4 agentes) descubrió 8 gaps adicionales NO documentados aquí** — recogidos en **Apéndice A §A.2**. **Plan de fases ampliado a 7 fases (A→G)** — ver §A.3.
>
> **Frase canónica de arranque (Fase C, próxima sesión post-merge PR #54):** *"Lee `docs/60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md` Apéndice A §A.7 (handoff completo Fase B → C). Vamos con Sprint 15C.II Fase C — Drift UX por rol + i18n completo + a11y Modal + PluginConfigForm useToast + ChangePackageModal toast. Crea rama `sprint15c-ii-fase-c-drift-ux-i18n` desde master post merge PR #54. Lee también UI_SPEC §4.13 (patrón canónico drift UX) + ADR-083 Amendment A4.3 (decisión congelada). Procede con rigor."*
>
> **Frase histórica (arranque Fase B, ya consumida):** *"Continúa Sprint 15C.II — Fase B (refresh metrics + reconcile dual). Lee Apéndice A del dossier (decisiones congeladas + plan refinado), [ADR-083 Amendment A4](../10-decisions/adr-083-plugin-enhance-cp-specifics.md#amendment-a4-2026-05-10--hardening-ux-post-smoke-real-yasmin-sprint-15cii) y [UI_SPEC §4.13](../UI_SPEC.md#413-estados-de-detección-externa-drift--patrón-discriminado-por-rol). Implementa A4.1 (eliminar 2 actions + ↻ MetricsBar) + A4.2 (endpoint reconcile-all + rename + UI settings)."*

---

## 1. Por qué este dossier existe

Sprint 15C cerró 11 fases (A→J + I) entregando el primer plugin SaaS real al 90%. La cobertura E2E + unit + integration es sólida (488/493 unit + 6/6 E2E). Pero el **smoke real de Yasmin contra el mock** (sesión 2026-05-10) reveló **18 issues** agrupables en 3 categorías:

1. **Bugs reales de provisioning** (3) — algunos fixed in-fase Fase I, otros pendientes.
2. **Violaciones UI_SPEC §4.3 + UX subóptima** (8) — feedback inline en lugar de toast, acciones redundantes, mensajes engañosos.
3. **Decisiones doctrinales NO tomadas en Sprint 15C** (4) — el agente original no las planteó como ambigüedades pre-codear porque no eran obvias hasta ver el plugin operativo.

Yasmin decidió que **estos issues NO son deuda v1.x diferida** — son bloqueantes pre-producción. El plugin Enhance es el primer plugin SaaS real y debe estar al 100% antes de pasar a Sprint 15D ResellerClub (que reusará TODO el patrón).

Este dossier sirve a **tres propósitos canónicos** (mismo patrón que dossier 15D + dossier 15C original):

- **Memoria institucional**: cuando se abra Sprint 15C.II, el siguiente agente NO empieza desde cero — encuentra el inventario completo de issues + las decisiones doctrinales recomendadas, frozen.
- **Input formal de ADRs futuros**: los issues #2.1 (refresh metrics pattern), #2.2 (reconcile general vs servicio) y #2.3 (drift UX) podrían materializar Amendments a ADR-070 / ADR-077 / ADR-080.
- **Inventario exhaustivo de feedback smoke real**: cada issue cita exactamente lo que Yasmin vio en pantalla.

---

## 2. Inventario completo de issues (smoke 2026-05-10)

### 2.A. Bugs reales (provisioning + tipo)

> Estos son bugs que rompen funcionalidad. Algunos ya fixed in-fase Fase I (commit pendiente), otros pendientes.

| # | ID | Síntoma observado | Causa raíz | Estado | Sprint que cerrará |
|---|---|---|---|---|---|
| 1 | **BUG-15CII-1** | Provision crashea con `prisma:error: Failed to deserialize column of type 'void'` y service queda stuck en `provisioning` | `tx.$queryRaw` sobre `pg_advisory_xact_lock(...)` (que retorna VOID) — Prisma rompe deserializando | ✅ **Fix aplicado en branch** (`enhance-customers.service.ts:108` $queryRaw → $executeRaw + spec actualizado) | Sprint 15C.I parcial (pendiente commit) |
| 2 | **BUG-15CII-2** | `PATCH /admin/plugins/enhance_cp` con `config + secrets` devuelve 400 Bad Request | `AdminPluginUpdateDto` con `@ValidateNested + @Type(() => Object)` + `forbidNonWhitelisted: true` global rechaza props internas | ✅ **Fix aplicado en branch** ([admin-plugin-update.dto.ts](backend/src/modules/admin-plugins/dto/admin-plugin-update.dto.ts)) | Sprint 15C.I parcial (pendiente commit) |
| 3 | **BUG-15CII-3** | Cliente checkout enhance_cp con plugin disabled deja service en `pending` indefinido | El orquestador NO procesa el job — el plugin no es `active`. Comportamiento esperado, **NO bug** sino edge case UX (admin debería ver alerta "tienes services pending por plugin deshabilitado") | ⏳ **Pendiente** — diseñar UX alerta admin | Sprint 15C.II |

### 2.B. UI_SPEC §4.3 — Toast vs inline (canon canónico violado)

> [`UI_SPEC §4.3`](../UI_SPEC.md): "Toast = feedback efímero esquina superior derecha. AlertBanner = persistente inline. NO intercambiables."

| # | ID | Componente | Patrón actual | Patrón canónico | Estado |
|---|---|---|---|---|---|
| 4 | **BUG-15CII-4** | `ActionsBar.tsx` | Renderiza `<p>` inline en la card con `feedback.result.message` o `error` | `useToast()` + `toast('success'|'error', msg)` | ✅ **Fix aplicado en branch** |
| 5 | **BUG-15CII-5** | `SsoButton.tsx` | Renderiza `<p>` inline con error si SSO falla | Mismo `useToast()` | ✅ **Fix aplicado en branch** |
| 6 | **BUG-15CII-6** | `MetricsBar.tsx` | Sin botón refresh — métricas se refrescan solo via TTL cache 60s o `getServiceInfo` page reload | **Decisión doctrinal pendiente** — ver §3.1 abajo | ⏳ **Pendiente** |

### 2.C. Mensajes engañosos / contenido falso

| # | ID | Texto observado | Por qué es engañoso | Estado |
|---|---|---|---|---|
| 7 | **BUG-15CII-7** | Tras `reset_account_password`: toast "Contraseña restablecida. **El cliente recibirá la nueva contraseña por email**." | El email NO se envía — el plugin solo rota la password en Enhance. Promesa falsa al admin. | ✅ **Fix aplicado en branch** (mensaje honesto) |
| 8 | **BUG-15CII-8** | Section "Acciones rápidas" admin con 4 botones DNS que al click fallan con `INVALID_PAYLOAD` | Las 4 actions DNS inline (`list/add/update/delete_dns_record`) son CONTRACT-required (ADR-077 A1.3) pero redundantes con UI canónica DNS Fase G — sin payload form fallan siempre | ✅ **Fix aplicado en branch** (`INTERNAL_HELPER_SLUGS` extendido) |
| 9 | **BUG-15CII-9** | Cliente y admin ven `subscription not found in Enhance (drift detected)` como subtitle pero `Estado canónico: active` | DH-INV-6 dice "no auto-modificar status" pero la UX muestra contradicción — service activo pero subscription perdida | ⏳ **Pendiente** — ver §3.3 abajo |

### 2.D. UX redundante / sin valor

| # | ID | Síntoma | Pregunta literal Yasmin | Recomendación | Estado |
|---|---|---|---|---|---|
| 10 | **BUG-15CII-10** | Botones "Ver uso de disco" / "Ver uso de ancho de banda" en cliente | "¿para qué los quiero si ya sale arriba?" | Eliminar del cliente — solo admin para refresh cache | ✅ **Fix aplicado en branch** (`adminOnly: true`) |
| 11 | **BUG-15CII-11** | Botón "Forzar resincronización" sin tooltip explicativo | "¿para qué sirve?" | Tooltip canónico explicando reconcile contra Enhance | ✅ **Fix aplicado parcial en branch** (`description` i18n + tooltip HTML `title`) — pero la UBICACIÓN sigue siendo cuestionable, ver §3.2 |

### 2.E. i18n parcial — render de descriptions

| # | ID | Lugar | Estado | Fix |
|---|---|---|---|---|
| 12 | **BUG-15CII-12** | rjsf `<Form schema={...}>` renderiza `description` cruda del JSON Schema | Mi fix Fase I aplicó `translateSchema()` walk-recursive en 3 call-sites + widget helperText. Yasmin reporta que SIGUE crudo en sus screenshots — **probable cache navegador** (no rebuild + Ctrl+Shift+R), pero el fix ESTÁ en código | ✅ **Fix aplicado en branch**, requiere verificación cache-clean |
| 13 | **BUG-15CII-13** | Plugin manifest: 5 actions sin `description` i18n | force_resync ✅ post Fase I, view_disk ✅ post Fase I, view_bandwidth ✅ post Fase I, **reset_account_password ❌**, **change_package ❌** | ⏳ **Pendiente** Sprint 15C.II — añadir i18n descriptions completas |
| 14 | **BUG-15CII-14** | Service status `unknown` cuando `subscription_missing` muestra `statusReason` como string crudo (no traducido) | "service has no enhance_org_id/subscription_id in metadata" / "subscription not found in Enhance" — son mensajes técnicos cliente NO debería ver | ⏳ **Pendiente** — i18n keys + UX cliente discriminada |

### 2.F. Funcionalidades NO implementadas (deuda v1.x)

| # | ID | Funcionalidad | Razón se difirió | Sprint propuesto |
|---|---|---|---|---|
| 15 | **DC.NEW-15CII-EMAIL-RESET** | Listener `notifications-on-password-reset` que envía email al cliente con la nueva password tras `reset_account_password` | El plugin retorna la nueva password en `data.new_password`, pero ningún listener la consume para email | Sprint 15C.II hardening |
| 16 | **DC.NEW-15CII-DNS-ADMIN-UI** | UI admin nativa DNS records `/admin/services/[id]/dns` paralela a la cliente Fase G | Backend ya listo (Fase D endpoints `/admin/services/:id/dns/records*`) — solo falta frontend admin (banner actual: "llegará en sprint futuro") | Sprint 15C.II hardening |
| 17 | **DC.NEW-15CII-METRICS-MODAL** | Modal admin que renderiza `result.data` formateado tras invocar `view_disk_usage` / `view_bandwidth_usage` | Hoy las acciones retornan `data` pero la UX muestra solo toast genérico — Yasmin recomienda eliminar las actions y reemplazar por refresh button en MetricsBar (decisión doctrinal §3.1) | Decisión doctrinal §3.1 |
| 18 | **DC.NEW-15CII-CATALOG-SYNC** | Sync automático catálogo planes Enhance ↔ catálogo productos Aelium | Admin debe crear N productos manualmente cuando Enhance añade N planes nuevos | v2 si demanda — `change_package` runtime ya consume `list_available_plans` dinámico, el catálogo es el manual gap |

---

## 3. Decisiones doctrinales pendientes (no resueltas en Sprint 15C original)

> Estas son las preguntas de Yasmin que el agente original NO planteó como ambigüedades pre-codear porque no eran obvias hasta ver el plugin operativo. Cada una merece resolución doctrinal antes de codear el hardening, o terminan en re-trabajo.

### 3.1. Refresh de métricas — ¿spinner inline o action separada?

> **Pregunta literal Yasmin (2026-05-10)**: "Para refrescar los stats, simplemente poner un spinner pequeño en un lateral de los stats, para refrescarlos todos. O hacerlo más robusto y profesional. ¿Cómo se hace con el estándar profesional?"

**Estado actual**: las 2 acciones inline `view_disk_usage` y `view_bandwidth_usage` declaradas en el manifest `plugin.inlineActions` invocan al wrapper `executeActionWithCacheInvalidation` que invalida cache 60s + re-fetch. UX: toast genérico "completada" sin renderizar el `data` retornado.

**Estándar profesional industria** (Stripe Dashboard, Hostinger hPanel, Vercel Dashboard):

| SaaS | Patrón refresh métricas |
|---|---|
| **Stripe Dashboard** | Botón "↻" pequeño superior-derecha de cada card de métricas + autorrefresh cada 30s con dot indicator |
| **Hostinger hPanel** | Sin botón explícito — métricas se refrescan al navegar a la página + cache TTL backend |
| **Vercel Dashboard** | Button "↻ Refresh" siempre visible junto al título de Metrics + countdown del próximo autorrefresh |

**Recomendación canónica** (Yasmin debe aprobar):

> **Patrón canónico Aelium para métricas en service detail (cliente + admin)**:
> 1. **Eliminar** las 2 inline actions `view_disk_usage` y `view_bandwidth_usage` del manifest. Estas violan el principio P4 ("Acción, no contemplación") del UI_SPEC §1.2 — son botones que NO llevan a una acción del usuario, solo invalidan cache que se invalidaría sola en 60s.
> 2. **Añadir botón "↻ Refrescar"** pequeño a `MetricsBar.tsx` (esquina superior-derecha de la Card). Click → invoke server action `refreshServiceInfoAction(serviceId)` que invalida cache + re-fetch + actualiza el render.
> 3. **NO autorrefresh polling** — el cliente puede irse de la página y volver para refrescar; el admin tiene el botón explícito. Polling consume ancho de banda + complica WS architecture.
> 4. Coherente con UI_SPEC §1.2 P4 + DnsRecordsManager (ya tiene patrón "↻ Refresh" implícito al re-fetch tras crear/editar).

**Implicación contractual**: ADR-077 §2 ServiceAction NO requiere las 2 actions view_metrics — son opcionales. Eliminarlas NO rompe contrato. Patrón replicable a 15D RC + 15E Docker (ningún plugin SaaS futuro necesita action "view metrics" si el plugin ya expone `metrics` en `getServiceInfo`).

**Ambigüedad pre-codear Sprint 15C.II**: confirmar con Yasmin si elimina actions O las mantiene admin-only como están hoy.

### 3.2. Reconcile — ¿per-servicio, general del plugin, o ambos?

> **Pregunta literal Yasmin (2026-05-10)**: "El 'reconcile' qué es? Si cambio algo en Enhance, que se visualice en el dashboard? Si es eso, realmente no debería ser 'forzar reconcile' en el servicio del cliente, sino algo general del plugin."

**Definición técnica canónica** (ADR-082 §reconciliation + ADR-083 §6):

> **Reconcile = comparar Aelium (cache local) vs Enhance (truth)**. Detectar drift (subscription_missing / status_divergence / plan_divergence) y emit events + audit + (opcionalmente) auto-corregir si es safe. NO es "refrescar para que se vea el cambio" — eso es "invalidate cache".

**Estado actual** (Fase H): cron L3 `EnhanceReconciliationCron` corre cada 6h sobre TODOS los services `provisioner_slug='enhance_cp'`. Action `force_resync` admin invoca el mismo pipeline pero **single-shot sobre UN service**.

**Lo que falta UX-wise**:

- **NO hay botón "Reconciliar TODO ahora"** desde `/admin/settings/plugins/enhance-cp`. Si admin hizo cambios masivos en Enhance UI, debe esperar 6h (el cron L3 next run) o ejecutar `force_resync` service-by-service desde cada detail page.
- **Naming UX engañoso**: "Forzar resincronización" suena a "refresca la pantalla". Debería ser "Reconciliar contra Enhance".

**Recomendación canónica** (Yasmin debe aprobar):

> **Doble entry point reconcile, naming honesto**:
> 1. **General (settings plugin)**: `/admin/settings/plugins/enhance-cp` añade botón "↻ Reconciliar todos los servicios contra Enhance ahora" (reusable como patrón para 15D RC + 15E Docker). Llama un endpoint admin nuevo `POST /admin/plugins/enhance_cp/reconcile-all` que invoca `cron.runManually()`.
> 2. **Granular (service detail admin)**: el botón actual "Forzar resincronización" se mantiene pero **renombrado** a "Reconciliar contra Enhance" + tooltip ya añadido en branch.
> 3. Cliente NUNCA ve botón reconcile — es operación admin (ya OK con `adminOnly: true`).

**Implicación arquitectónica**: hay que extraer el método `reconcileEnhanceServices()` del cron a un servicio reusable + exponer endpoint admin REST. Coste estimado ~2-3 horas.

**Ambigüedad pre-codear Sprint 15C.II**: confirmar naming + ubicación de los 2 botones.

### 3.3. Drift UX — ¿qué ve cliente vs admin cuando subscription_missing?

> **Estado actual observado por Yasmin**: cliente y admin ven `subscription not found in Enhance (drift detected)` como `info.statusReason` mostrado en `ServiceHeader.tsx`, MIENTRAS `Estado canónico: active` (DH-INV-6 dice no auto-modificar). Mensaje técnico crudo (no traducido) confunde al cliente.

**Análisis**:
- Cliente NO debería ver "drift detected" — es término técnico interno.
- Admin SÍ debería ver alerta "⚠ Drift detectado — investiga en Enhance UI" con CTA al panel SSO.
- Service status canónico se mantiene `active` por DH-INV-6 (correcto). Pero la UX debe diferenciarse por rol.

**Recomendación canónica**:

> **UX drift discriminada por rol** (UI_SPEC §1.2 P6 contenido adaptativo):
> 1. **Cliente**: `info.statusReason` técnicos NO se renderizan en `ServiceHeader.tsx`. Si status `unknown` o `failed` → mostrar mensaje genérico tipo "Tu servicio está temporalmente no disponible. Hemos avisado al equipo técnico." + ocultar acciones que requieran metadata (DNS, SSO).
> 2. **Admin**: banner amarillo `<AlertBanner variant="warning">` arriba del MetricsBar mostrando el `statusReason` técnico + CTA "Investigar en Enhance UI" (link al SSO admin).
> 3. Pattern replicable: cualquier futuro plugin que retorne status `unknown` con `statusReason` aplicará la misma UX.

**Ambigüedad pre-codear Sprint 15C.II**: confirmar mensajes literales cliente / formato banner admin.

### 3.4. Admin landing del plugin — ¿overview operativo?

> **Estado actual**: `/admin/settings/plugins/enhance-cp` solo permite habilitar/configurar. No muestra estadísticas operativas del plugin (services activos por status, drifts detectados últimas 24h, jobs failed BullMQ, circuit state, etc.).

**Recomendación canónica**:

> **Overview operativo del plugin** (UI_SPEC §2.3 Overview type):
> 1. Stats grid 4 cards: Services activos | Services suspendidos | Drifts últimas 24h | Estado circuit breaker.
> 2. Tabla recent drifts (últimos 10 emit `service.reconciled_external_change`) con CTA "Investigar".
> 3. Botón "Reconciliar todos ahora" (§3.2).
> 4. Botón "Test conexión" (existe).
> 5. Form config + secrets (existe).

**Ambigüedad pre-codear Sprint 15C.II**: confirmar si añadir overview en este sub-sprint o diferir a Sprint 12 (Settings + Knowledge Base).

---

## 4. Plan de fases propuesto Sprint 15C.II — 4 fases

> Total estimado **4-5 sesiones**. Se ejecuta en una rama nueva `sprint15c-ii-enhance-hardening` desde master post-merge de Fase I parcial (que llevará los 4 fixes ya aplicados en branch actual).

### Fase 15C.II.A — Decisiones doctrinales frozen (doc-only)

**Patrón canónico Aelium** (Sprint 8 D.0 / Sprint 11 11.A / Sprint 15A A / Sprint 15C A): congelar decisiones antes del primer commit funcional. Resuelve §3.1 + §3.2 + §3.3 + §3.4 con Yasmin via 4 ambigüedades doctrinales:

- **A1**: ¿eliminar `view_disk_usage`/`view_bandwidth_usage` del manifest o mantener adminOnly como están?
- **A2**: ¿reconcile UX dual (general settings + granular service) con naming "Reconciliar contra Enhance"?
- **A3**: drift UX discriminada por rol (cliente generic + admin AlertBanner) — confirmar copy.
- **A4**: ¿admin overview operativo en este sub-sprint o diferir a Sprint 12?

**Estimación**: 0.3 sesión.

### Fase 15C.II.B — Refresh metrics + reconcile general (cliente + admin)

Materializa decisiones A1 + A2:
- Si A1=eliminar: borrar 2 actions del manifest + `MetricsBar.tsx` añade botón "↻ Refrescar" que invoca `refreshServiceInfoAction()`.
- Si A2=dual: endpoint `POST /admin/plugins/:slug/reconcile-all` + UI button settings + rename action local "Reconciliar contra Enhance".

**Estimación**: 1-1.5 sesión.

### Fase 15C.II.C — Drift UX + i18n completo

Materializa decisión A3:
- `ServiceHeader.tsx` discrimina cliente/admin para `statusReason`.
- Cliente: si status `unknown`/`failed`, ocultar SSO/DNS + mensaje genérico.
- Admin: AlertBanner warning con CTA SSO.
- Plugin manifest: descriptions i18n para `reset_account_password` + `change_package` (faltan).
- i18n keys nuevas: `service.status.drift.client.unknown`, `service.status.drift.admin.investigate`, etc.

**Estimación**: 1 sesión.

### Fase 15C.II.D — Email reset_password listener

Cierra DC.NEW-15CII-EMAIL-RESET:
- `NotificationsOnPasswordResetListener` consume evento `service.action_executed` filter `action_slug='reset_account_password'`.
- Plantilla notification seedeada `enhance.password_reset` con la nueva password.
- Email canónico al cliente afectado (`service.user_id`) con la password.
- Mensaje admin actualizado: "Contraseña restablecida. El cliente ha recibido la nueva password por email."

**Riesgo**: la nueva password viaja en clear-text en el evento — debe ir en `data` no persistido en `audit_change_log` (R12 secrets nunca audit). Patrón: añadir flag `excludeFromAudit: ['data.new_password']` o no emitir el plain en el evento.

**Estimación**: 0.7 sesión.

### Fase 15C.II.E — UI admin DNS records nativa

Cierra DC.NEW-15CII-DNS-ADMIN-UI:
- `/admin/services/[id]/dns/page.tsx` SC paralelo al cliente (Fase G).
- Reusa endpoints `/admin/services/:id/dns/records*` + componentes `DnsRecordForm`/`DnsRecordsManager`.
- Banner actual "llegará en sprint futuro" se elimina.

**Estimación**: 0.7-1 sesión.

### Fase 15C.II.F — Cierre + retrospectiva

- E2E spec adicional o extensión del existente cubriendo refresh metrics + reconcile general + drift UX.
- Update `admin-plugins-enhance.md` §8 marcando todos los gaps cerrados.
- Update `completed/sprint-15c-plugin-enhance-cp.md` añadiendo sección "Hardening Sprint 15C.II completado" + métricas.
- Smoke final Yasmin contra mock + Enhance live.

**Estimación**: 0.5 sesión.

---

## 5. Branch actual (`sprint15c-fase-i-cierre-sprint`) — qué hacer con él

La rama tiene **fixes valiosos no commiteados**:
- $queryRaw → $executeRaw (BUG-15CII-1)
- AdminPluginUpdateDto refactor (BUG-15CII-2)
- ActionsBar + SsoButton useToast (BUG-15CII-4 + BUG-15CII-5)
- Mensaje reset_password honesto (BUG-15CII-7)
- INTERNAL_HELPER_SLUGS extendido DNS (BUG-15CII-8)
- view_disk/bandwidth adminOnly (BUG-15CII-10)
- force_resync description tooltip (BUG-15CII-11 parcial)
- translateSchema() walk-recursive + 3 call-sites (BUG-15CII-12)
- ServiceHeader t() (BUG-15CII-12 parcial)
- E2E spec sprint-15c-enhance-flow 6/6
- Mock runner + tsconfig + dotenv loader playwright
- i18n local minimal + 30+ traducciones ES
- Docs: dossier 15C movido a completed/ con retrospectiva, admin-plugins-enhance.md operativa diaria

**Recomendaciones para el siguiente agente**:

> **Opción A (Recomendada)**: commit + PR estos cambios como "Fase 15C.I parcial" + abrir nueva rama `sprint15c-ii-enhance-hardening` desde master post-merge para abordar este dossier.
>
> **Opción B**: reset de la rama + abordar TODO en una sola Fase 15C.I robust. Pierdes el work-in-progress (no recomendado dado que los E2E + i18n + 4 fixes ya pasan DoD).
>
> **Opción C** (cleanest): commit los fixes + cerrar PR como Fase 15C.I "parcial — hardening sigue en Sprint 15C.II". Update `current.md` reflejando el estado real.

---

## 6. Compromiso doctrinal — NO Sprint 15D RC hasta cerrar 15C.II

> **Decisión Yasmin literal (2026-05-10)**: "no se da un paso más, hasta que el plugin esté al 100% operativo con los features básicos y necesarios perfectos para producción."

Sprint 15D ResellerClub queda **bloqueado en cola** hasta cierre Sprint 15C.II. Razón doctrinal: 15D RC reusará el patrón canónico del plugin Enhance (manifest + provision + actions + reconcile + UI). Si Enhance tiene gaps UX/UI_SPEC, RC los heredará silenciosamente.

Cola P2 actualizada:
1. ✅ P2.1 Sprint 11 Provisioning
2. ✅ P2.2 Sprint 15A Plugin Framework
3. 🔄 **P2.3 Sprint 15C Plugin Enhance — 90% (Fase I parcial pendiente commit + Sprint 15C.II hardening)**
4. ⏸ P2.4 Sprint 15D Plugin ResellerClub (bloqueado por 15C.II)
5. ⏸ P2.5+ resto

---

## 7. Frase canónica de arranque (próxima conversación)

> *"Lee `docs/60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md` (este archivo) + `docs/60-roadmap/completed/sprint-15c-plugin-enhance-cp.md` § Deuda diferida + `docs/features/provisioning/admin-plugins-enhance.md` §8 + `docs/UI_SPEC.md` §4.3. Vamos con Sprint 15C.II — Plugin Enhance Hardening. Antes de codear, plantéame las 4 ambigüedades doctrinales A1-A4 (refresh metrics pattern, reconcile dual, drift UX discriminada, admin overview now/diferido). Decide con Yasmin si commit la rama actual `sprint15c-fase-i-cierre-sprint` como Fase 15C.I parcial primero (Opción A doctrina §5) o approach alternativo. Procede con rigor profesional — el plugin Enhance debe estar al 100% operativo antes de pasar a Sprint 15D RC."*

---

## 8. Referencias canónicas

- [`docs/60-roadmap/completed/sprint-15c-plugin-enhance-cp.md`](./completed/sprint-15c-plugin-enhance-cp.md) — Sprint 15C original cerrado al 90%, dossier preservado como anexo + retrospectiva con métricas + 8 lecciones + commit refs cronológicos.
- [`docs/features/provisioning/admin-plugins-enhance.md`](../features/provisioning/admin-plugins-enhance.md) — Doc operativa diaria del plugin Enhance §8 inventario funcionalidades + deudas.
- [`docs/UI_SPEC.md`](../UI_SPEC.md) — §1.2 principios UX (P1 densidad, P4 acción no contemplación, P5 voz Aelium, P6 contenido adaptativo por rol) + §4.3 Toast vs AlertBanner + §4.5 manejo errores.
- [`docs/10-decisions/adr-070-service-info-sso-acciones-curadas.md`](../10-decisions/adr-070-service-info-sso-acciones-curadas.md) — patrón canónico service detail (header inline + métricas + acciones curadas + SSO + DNS).
- [`docs/10-decisions/adr-077-contrato-provisioner-plugin-v2.md`](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) — contrato canónico ProvisionerPlugin v2 + 8 capability flags + Amendments A1/A2/A3/A3.5.
- [`docs/10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md`](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) — modelo Domain↔Hosting + DNS doctrine + DH-INV-6 (Enhance gana en conflicto).
- [`docs/10-decisions/adr-083-plugin-enhance-cp-specifics.md`](../10-decisions/adr-083-plugin-enhance-cp-specifics.md) — 35 decisiones Enhance specifics frozen + Amendments A1/A2/A3 + **A4 (2026-05-10) hardening UX post smoke real**.
- **Sesión origen smoke real**: Yasmin ↔ agent 2026-05-10 — 18 issues identificados + 4 decisiones doctrinales pendientes documentadas en este dossier.

---

# Apéndice A — Decisiones congeladas + audit técnico + plan refinado (2026-05-10)

> **Tipo:** Adendum post merge PR #52 (`ef7f488`). Preserva el dossier original (§1-§8) como referencia histórica + congela las decisiones doctrinales A1-A4 + recoge 8 gaps técnicos descubiertos en audit paralelo (4 agentes Explore) + refina el plan de fases a 7 (A→G).
>
> **Patrón canónico Aelium:** mismo enfoque que el dossier 15C original preservado en `completed/sprint-15c-plugin-enhance-cp.md` con su retrospectiva como anexo. El dossier original arriba refleja el thinking pre-merge; este apéndice refleja las decisiones tras el AskUserQuestion + audit técnico.

## A.1. Decisiones doctrinales A1-A4 — FROZEN 2026-05-10

Yasmin seleccionó la opción **Recommended** de cada AskUserQuestion (referencia canónica industria). Las 4 decisiones quedan congeladas y materializadas en [ADR-083 Amendment A4](../10-decisions/adr-083-plugin-enhance-cp-specifics.md#amendment-a4-2026-05-10--hardening-ux-post-smoke-real-yasmin-sprint-15cii) (§A4.1-A4.4) + [UI_SPEC §4.13](../UI_SPEC.md#413-estados-de-detección-externa-drift--patrón-discriminado-por-rol) + [ADR-077 Amendment A4](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendment-a4-2026-05-10--capability-flag-supports_suspend) (capability flag nueva).

| ID | Decisión congelada | Materialización canónica |
|---|---|---|
| **A1** | Eliminar inline actions `view_disk_usage` + `view_bandwidth_usage` del manifest. Añadir botón "↻ Refrescar" en `MetricsBar.tsx` (cliente + admin) → `refreshServiceInfoAction(serviceId)` invalida cache + re-fetch. NO autorrefresh polling. Patrón Stripe/Vercel. | ADR-083 A4.1 + Sprint 15C.II Fase B |
| **A2** | Dual entry point reconcile + rename "Reconciliar contra Enhance". Endpoint nuevo `POST /api/v1/admin/plugins/:slug/reconcile-all` cumple **doble rol**: A2 (botón general settings plugin) + G1 (trigger manual cron — desbloquea `admin-plugins-enhance.md §6.2 paso 13` que era vaporware). Cliente NUNCA ve botón reconcile. | ADR-083 A4.2 + Sprint 15C.II Fase B |
| **A3** | Drift UX discriminada por rol — cliente generic ("Tu servicio está temporalmente no disponible. Hemos avisado al equipo técnico.") + admin AlertBanner warning con `statusReason` técnico + CTA "Investigar en Enhance UI" (link SSO impersonation). Service status canónico se mantiene `active` (DH-INV-6). Heredable a 15D RC, 15E Docker, 15G Plesk. | ADR-083 A4.3 + UI_SPEC §4.13 + Sprint 15C.II Fase C |
| **A4** | Admin overview operativo dentro de Sprint 15C.II como **Fase F nueva** (NO diferir a Sprint 12). Stats grid 4 cards (services activos / suspendidos / drifts 24h / circuit breaker state) + tabla recent drifts + botón reconcile general (A2) + Test conexión (existe) + Form config + secrets (existe). Componente reusable `<PluginOperationalOverview>` heredable. | ADR-083 A4.4 + Sprint 15C.II Fase F |

## A.2. Gaps técnicos descubiertos en audit paralelo — NO documentados originalmente

Audit técnico 2026-05-10 ejecutado por 4 agentes Explore en paralelo (backend + frontend + test coverage + doc-vs-código + tunnel). Resultado: **8 gaps adicionales** que el dossier original NO había capturado.

### Backend (5 gaps)

| ID | Severidad | Archivo:línea | Realidad descubierta | Fase de cierre |
|---|---|---|---|---|
| **G1** | 🔴 CRÍTICO | `docs/features/provisioning/admin-plugins-enhance.md §6.2 paso 13` | **Vaporware**. La doc afirma `POST /api/v1/admin/cron/enhance-reconciliation` para trigger manual del cron L3. **No existe** en el código. Sin esto NO es posible smoke testear reconciliación sin esperar 6h. | **Fase B** — endpoint A4.2 cumple doble rol (reconcile-all + trigger manual) |
| **G2** | 🔴 ALTA | `enhance.plugin.ts:687-693` | `actionResetAccountPassword` retorna `data.password` plaintext. El wrapper auditor canónico `core/provisioning/plugin-utils.ts` persiste `result.data` íntegro en `audit_change_log` SIN sanitización. Riesgo compliance R12 (secrets nunca audit). Prerequisito para listener email Fase D. | **Fase D** — `audit-sanitizer.ts` helper redacta campos sensibles antes de audit emit (ADR-083 A4.5) |
| **G3** | 🟡 MEDIA | `enhance.plugin.ts` manifest capabilities | Falta declaración capability flag `supports_suspend`. El plugin tiene `patchSubscription({ isSuspended })` operativo desde Sprint 15C.B pero el frontend admin no puede ramificar por capability (doctrina ADR-070). | **Fase F** — ADR-077 Amendment A4 + 2 inline actions nuevas `suspend_service`/`unsuspend_service` |
| **G4** | 🟡 MEDIA | `core/provisioning/plugin-utils.ts` | TTL cache 60s **hardcoded** mientras `reconciliationIntervalHours` del manifest es configurable. Posible DoS de la propia API Enhance por sobre-polling si Enhance reporta cache interno mayor. | **Fase F** — sanity-check + permitir override declarativo desde manifest opcional |
| **G5** | 🟡 MEDIA | `EnhanceApiClient` | Sin CircuitBreaker propio en HTTP client — solo el wrapper externo lo tiene sobre `getServiceInfoWithCache` + `executeActionWithCacheInvalidation`. Si Enhance cae, BullMQ reintentará lento (~6 min hasta DLQ) en vez de fail-fast 503. | **Fase F** — evaluar integración (puede diferirse a v1.1 si no hay incidente real) |

### Frontend (3 gaps)

| ID | Severidad | Archivo:línea | Realidad descubierta | Fase de cierre |
|---|---|---|---|---|
| **G6** | 🔴 ALTA | `frontend/app/admin/settings/plugins/[slug]/_components/PluginConfigForm.tsx:104-111` | **Mismo bug UI_SPEC §4.3 que ActionsBar/SsoButton** — usa `setFeedback({kind, message})` inline con `<p>`. NO se detectó en smoke porque solo se testeó service detail, no settings plugin. | **Fase C** — migrar a `useToast()` |
| **G6b** | 🟡 MEDIA | `frontend/app/admin/services/[id]/_components/ChangePackageModal.tsx:85-93` | `setSubmitError()` inline en modal sin toast. Mismo patrón. | **Fase C** — migrar a `useToast()` |
| **G7** | 🟡 MEDIA | `frontend/app/components/ui/Modal/Modal.tsx:17-30, 44` | Sin `aria-labelledby` (vinculación título) + sin focus trap. WCAG 2.1 básico no cumplido (sí tiene `role="dialog"` + `aria-modal="true"` + Escape listener — falta el resto). | **Fase C** — añadir focus trap + aria-labelledby (refactor compartido) |

### Coverage gaps — paths productivos sin test (8 áreas)

Tests críticos sin coverage que podrían ocultar bugs en producción (la suite reporta 488/493 verde **en superficie** pero **profundidad débil** en escenarios reales):

1. **Concurrent provision del mismo dominio** + advisory lock — exactamente el escenario del bug `$queryRaw` que pasó tests + falló con DB Postgres real. Necesita integration test con transacciones paralelas reales.
2. **Encryption key rotation** graceful failure (`ENCRYPTION_KEY` cambia → secrets viejos no descifran).
3. **DNS edge cases** — TTL bounds (0, 99999999), kinds inválidos, shapes inesperados de Enhance, conflicto authority external.
4. **CircuitBreaker behavior con Enhance** — 5 fallos en 60s → open → fast-fail. Recovery half-open.
5. **change_package metadata sync rollback** — qué pasa si PATCH a Enhance OK pero `service.update()` falla → plan_divergence false-positive eterno.
6. **SSO impersonation full flow E2E** — solo unit + smoke manual hoy.
7. **AdminOnly enforcement E2E** con bypass real curl → 403 + audit emit.
8. **Threshold race condition** — 2 reconcile concurrent <1s → dedupe correcto vs double alert.

→ **Cierre completo en Fase G** (tests críticos faltantes pre-deploy).

## A.3. Plan de fases refinado — 7 fases A→G

Plan original era 6 fases (A→F). Tras audit + decisión A4 ("Overview now"), pasa a 7:

| Fase | Estimación | Scope (con scope ampliado por audit) |
|---|---|---|
| **A** doc-only | 0.3 sesión | ✅ **CERRADA 2026-05-10** [PR #53](https://github.com/yasmindanailov/dashboard/pull/53) merged `714c94c`. ADR-077 A4 + ADR-083 A4 + UI_SPEC §4.13 + este Apéndice + corrección vaporware admin-plugins-enhance.md §6.2 + sync current.md |
| **B** refresh + reconcile | 1-1.5 sesión | ✅ **CERRADA 2026-05-10** [PR #54](https://github.com/yasmindanailov/dashboard/pull/54) — 7 commits: 1 feat (`6506615`) + 6 rounds fix-up (`7b2138d`, `4492325`, `a86f162`, `6b0ad8e`, `794b9b2`, `ce0b93d`). A1 (eliminar 2 actions + ↻ MetricsBar + `refreshServiceInfoAction`) + A2 (endpoint `POST /admin/plugins/:slug/reconcile-all` cumpliendo doble rol con G1 + UI settings + rename action local "Reconciliar contra Enhance"). Detalle exhaustivo round-by-round + lecciones técnicas en §A.7 handoff. |
| **C** drift UX + i18n + a11y + service detail hardening | 1-1.5 sesión planeada → **3 sesiones reales (7 rounds)** | ✅ **CERRADA 2026-05-10** [PR #55](https://github.com/yasmindanailov/dashboard/pull/55) — 7 commits round-by-round (`5906165` round 1 inicial → `f9b4b2f` round 7 refresh UX por rol). Scope original A3 + i18n + G6/G6b/G7 entregado round 1; rounds 2-7 cerraron 8 bugs doctrinales descubiertos en smoke real (cache wrapper nunca invalidaba, reprovision idempotency, terminal service UX, error codes discriminados, ServiceHeader dedupe terminal, refresh por rol, card admin Cliente/Servicio/Fechas con `<CopyableId>`). Detalle exhaustivo round-by-round + 10 lecciones técnicas heredables en §A.8 handoff. |
| **D** email listener + sanitizer | 0.7-1 sesión | DC.NEW-15CII-EMAIL-RESET (listener `notifications-on-password-reset` + plantilla email seedeada) + **G2 sanitización `data.password` en wrapper auditor** (CRÍTICO antes del listener — `audit-sanitizer.ts` redacta campos sensibles via regex canónico password\|secret\|token\|apiKey\|privateKey) |
| **E** UI admin DNS | 0.7-1 sesión | DC.NEW-15CII-DNS-ADMIN-UI (página `/admin/services/[id]/dns` reusando endpoints existentes) + validación DnsRecordForm (TTL min/max + duplicados — gap audit) |
| **F** admin overview + capabilities + breaker | 1-1.5 sesión | A4 admin overview (stats grid 4 cards + tabla recent drifts + botón reconcile general A2 + Test conexión + form config) + **G3 capability flag `supports_suspend` (ADR-077 A4)** + 2 inline actions `suspend_service`/`unsuspend_service` con audit + **G4 sanity-check cache TTL configurable** + **G5 evaluar breaker EnhanceApiClient** (puede diferirse a v1.1 si no se valida criticidad) |
| **G** tests críticos + cierre | 1-1.5 sesión | **8 tests críticos faltantes** (concurrent advisory lock real Postgres + CircuitBreaker E2E con Enhance + SSO impersonation E2E + AdminOnly enforcement E2E con bypass curl real + encryption key rotation + DNS edge cases TTL bounds + change_package metadata rollback + threshold race condition concurrent reconciliation) + E2E spec extension cubriendo refresh metrics + reconcile-all + drift UX por rol + admin overview render + smoke real Yasmin contra mock + Enhance live + retrospectiva en `completed/sprint-15c-plugin-enhance-cp.md` |

**Estimación total Sprint 15C.II:** **6-8 sesiones** (vs 4-5 originales — el ampliado es honesto, no negociable para "100% operativo perfecto"). Sprint 15D RC sigue bloqueado en cola hasta cierre 15C.II.

## A.4. Respuesta a la pregunta crítica — ¿necesitamos Cloudflare tunnel / dashboard en internet?

> **Conclusión:** **NO** para smoke testing del plugin Enhance CP en pre-producción. Setup local es 100% suficiente.

Evidencia técnica recogida en audit (agente 4):

1. **Enhance ↔ Aelium = PURE PULL outbound.** El plugin hace HTTP a Enhance vía `EnhanceApiClient` (GET/POST/PATCH/DELETE). Enhance NUNCA llama a dashboard. Cero rutas tipo `/webhooks/enhance` en backend (verificado).
2. **Enhance v12.21.3 NO expone webhooks push** hacia integraciones (solo Slack push, irrelevante). Confirmado en spec OAS3 + ADR-083.
3. **DNS provisioning NO valida resolución pública** del FQDN — Enhance crea zona interna fire-and-forget; el cliente configurará NS en su registrador externo después.
4. **SSO redirect** apunta directo al cluster Enhance (`https://enhance.lab.aelium.net/sso?token=...`); dashboard NO es proxy.
5. **Stripe webhook live**: NO existe endpoint Stripe receiver hoy en backend (grep limpio). El billing dispara `invoice.paid` desde código interno (admin marca pagado desde `/admin/billing/[id]/mark-paid`). Cuando se integre Stripe real (Sprint 8 territory), entonces sí necesitará tunnel — pero NO bloquea Enhance hoy.

**Setup canónico smoke local 100% operativo** (documentado en `admin-plugins-enhance.md §6.1`):

```bash
# .env.local backend
ENHANCE_DEV_BASE_URL=https://enhance.lab.aelium.net
ENHANCE_DEV_MASTER_ORG_ID=<UUID real Master Org Aelium>
ENHANCE_DEV_API_TOKEN=<Super Admin token revocable>
ENCRYPTION_KEY=<openssl rand -hex 32>

docker compose up -d postgres redis mailpit
pnpm --dir backend prisma migrate deploy && pnpm --dir backend run seed
pnpm --dir backend start:dev   # :3001
pnpm --dir frontend start:dev  # :3002
```

**Casos que SÍ requerirían tunnel a futuro (fuera de scope Enhance CP):**
- Demo en vivo a cliente externo (acceso desde cualquier IP)
- Integración Stripe live (webhook receiver público)
- Callbacks email externos (links de confirmación)

## A.5. Estado del branch + commits — trazabilidad

- **Rama de trabajo Sprint 15C.II:** `sprint15c-ii-enhance-hardening` (creada desde master post merge PR #52)
- **PR Fase 15C.I parcial:** [#52](https://github.com/yasmindanailov/dashboard/pull/52) merged como `ef7f488` (32 archivos, +2004/-131, 11 fixes smoke + E2E spec + i18n + dossier hardening)
- **Hotfix prettier line 111:** commit `2b56319` en branch del PR (auto-fix prettier multiline literal)
- **PR Fase 15C.II.A doc-only:** [#53](https://github.com/yasmindanailov/dashboard/pull/53) merged como `714c94c` (6 archivos, +339/-7, ADR-077 A4 + ADR-083 A4 + UI_SPEC §4.13 + este Apéndice + corrección vaporware + current.md sync)
- **PR Fase 15C.II.B:** [#54](https://github.com/yasmindanailov/dashboard/pull/54) (rama `sprint15c-ii-fase-b-refresh-reconcile`). 7 commits + ~30 archivos cambiados ~+1450/-200 LOC. Detalle round-by-round en §A.7.
- **Suite pre Fase B:** 488/493 unit verde + 5 skipped + E2E 6/6 verde
- **Suite post Fase B:** 501/506 unit verde + 5 skipped (+13 tests nuevos: ReconcileRegistry + AdminPluginsService.reconcileAll + cron onModuleInit) + 0 regresiones

## A.6. Sesiones origen

- 2026-05-10 (smoke real Yasmin) → 18 issues iniciales documentados en §2
- 2026-05-10 (post merge PR #52, AskUserQuestion) → A1-A4 frozen (§A.1)
- 2026-05-10 (audit técnico paralelo 4 agentes Explore) → G1-G7 + 8 coverage gaps (§A.2)
- 2026-05-10 (Fase A doc-only) → este Apéndice + ADRs Amendments + UI_SPEC §4.13
- 2026-05-10 (Fase B refresh + reconcile + 6 rounds fix-up smoke real) → §A.7 handoff completo

---

# Apéndice A.7 — Handoff Fase B → Fase C (próximo agente IA)

> **Audiencia**: el siguiente agente que arranque Sprint 15C.II Fase C.
> **Pre-condición técnica**: PR #54 mergeado a master.
> **Tipo**: handoff doc canónico — leer ANTES de tocar nada de código.

## A.7.1. Frase canónica de arranque (verbatim)

> *"Lee `docs/60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md` Apéndice A §A.7 (handoff completo Fase B → C). Vamos con Sprint 15C.II Fase C — Drift UX por rol + i18n completo + a11y Modal + PluginConfigForm useToast + ChangePackageModal toast. Crea rama `sprint15c-ii-fase-c-drift-ux-i18n` desde master post merge PR #54. Lee también UI_SPEC §4.13 (patrón canónico drift UX) + ADR-083 Amendment A4.3 (decisión congelada). Procede con rigor."*

## A.7.2. Estado real al cierre Fase B

**7 commits Fase B** (todos en PR #54 — branch `sprint15c-ii-fase-b-refresh-reconcile`):

| Commit | Tipo | Round | Resumen |
|---|---|---|---|
| `6506615` | feat | 1 (inicial) | Refresh metrics ↻ + reconcile dual entry point + endpoint manual cron + 13 tests nuevos |
| `7b2138d` | fix | 2 | 4 bugs smoke: DI runtime ReconcileRegistry + apiToken vapor + plural ES + provider_error crudo |
| `4492325` | fix | 3 | Labels duplicadas templates rjsf + statusReason → i18n keys (3) + ServiceHeader t() |
| `a86f162` | fix | 4 | Drift UX cliente con metadata canónica + MetricsBar siempre visible con ↻ Refrescar |
| `6b0ad8e` | fix | 5 | Widget DS prioriza schema.title sobre props.label rjsf (defensivo) |
| `794b9b2` | fix | 6 | **Refactor radical**: FieldTemplate única fuente de label (widgets sin chrome) |
| `ce0b93d` | fix | 7 | Descriptions sin repetir el label (UX content writing) |

**Suites tests post Fase B:** 501/506 unit verde + 5 skipped + 0 regresiones. typecheck both verde + lint:check both verde.

## A.7.3. Lecciones técnicas críticas (heredables — léelas antes de codear)

### L1 — DI Nest: módulo leaf para servicios cross-module sin ciclos

**Problema descubierto en runtime**: `ProvisioningModule` importa `EnhanceCpModule` (composición). Si necesitas un servicio singleton (`ReconcileRegistryService`) que ambos módulos consuman, **NO** lo provees en `ProvisioningModule` — el `EnhanceCpModule` no podría inyectarlo de vuelta sin ciclo.

**Patrón canónico**: módulo dedicado leaf en `core/provisioning/` que solo provee + exporta el servicio. Tanto `ProvisioningModule` como `EnhanceCpModule` lo importan independientemente. Re-exportar el **módulo** (no el provider directo) si alguien necesita acceso transitivo.

**Ejemplo canónico**: [`ReconcileRegistryModule`](../../backend/src/core/provisioning/reconcile-registry.module.ts).

### L2 — rjsf v5 manipula `props.label` inconsistentemente por field/format

**Problema descubierto en smoke real**: con `format=uri` (primer field del schema), rjsf v5 puede pasar `props.label` vacío al widget. Otros formats (uuid, integer, password) reciben label correctamente. Imposible de detectar en typecheck.

**Solución defensiva insuficiente**: leer `schema.title` como fallback dentro del widget — pero rjsf también puede mutar el schema en el camino.

**Solución radical canónica** (round 5):
- **El `FieldTemplate` es la ÚNICA fuente del label visible**. Lee `props.schema.title` (siempre traducido por `translateSchema()` upstream). Renderiza `<label htmlFor={id}>{title}{required && '*'}</label>` arriba del children.
- **Los widgets DS NO renderizan label propio** — solo el Input core sin chrome. a11y preservada via `htmlFor → id` consistente.
- Eliminada toda dependencia en cómo rjsf maneja `props.label`.

**Aplicación canónica**: [`AeliumDsFieldTemplate`](../../frontend/app/_shared/plugins/rjsf-theme/templates.tsx) + widgets DS sin label en [widgets.tsx](../../frontend/app/_shared/plugins/rjsf-theme/widgets.tsx). Heredable a 15D RC + 15E + 15G sin modificación.

### L3 — Convención label vs description (UX content writing)

**Problema reportado**: descriptions repitiendo textualmente el nombre del label (ej. label="UUID del Master Org Aelium" + description="UUID del Master Org Aelium en Enhance — owner canónico..."). Visualmente duplicado.

**Convención canónica** (documentada inline en `translations-es.ts`):
- **Label** = nombre conciso del campo (ej. "URL base de la API Enhance")
- **Description** = info complementaria SIN repetir el nombre (ej. "Ejemplo: https://...", "Owner canónico de los customers...")

Aplica a todos los plugins. Si añades campo nuevo en 15D/15E/15G, sigue esta convención.

### L4 — `statusReason` SIEMPRE i18n key (no string literal)

**Patrón canónico congelado**: cualquier plugin que retorne `info.statusReason` (o `getStatus().statusReason`) DEBE retornar una **i18n key** (no string literal en inglés). El frontend `ServiceHeader.tsx` aplica `t()` con fallback retro-compat (string literal pasa intacto si no hay traducción).

**Keys canónicas existentes** (translations-es.ts):
- `service.status_reason.plugin_not_registered` — fallback genérico provisioning service
- `plugin.enhance_cp.status_reason.not_yet_provisioned`
- `plugin.enhance_cp.status_reason.subscription_missing`

**Heredable**: 15D RC añadirá `plugin.resellerclub.status_reason.{*}`, 15E Docker `plugin.docker_engine.status_reason.{*}`, etc.

### L5 — MetricsBar SIEMPRE visible si `serviceId` presente

**Patrón canónico congelado**: `MetricsBar` no retorna `null` si recibe `serviceId` aunque no haya métricas. Renderiza header (h2 "Métricas" + botón ↻ Refrescar) + mensaje "Métricas no disponibles ahora — Pulsa ↻ Refrescar para reintentar".

**Razón doctrinal**: el botón refresh es el único path para reintentar tras drift. Si lo ocultas cuando hay drift, el usuario queda atrapado sin solución visual.

Cliente y admin pages pasan `metrics={info.metrics ?? { fetchedAt: info.fetchedAt }}` para garantizar render siempre.

### L6 — Card "Detalles del servicio" cliente con metadata canónica

**Patrón canónico congelado**: cliente service detail page renderiza una card "Detalles del servicio" SIEMPRE visible (independiente de `info.status`). Contiene metadata canónica de `service` (no `info`):
- Plan (`service.product_name`)
- Estado de tu servicio (`service.status` capitalizado)
- Contratado el (`service.created_at` formateado es-ES)

**Razón doctrinal**: cliente nunca queda sin información útil ante drift / unknown status. Garantía profesional.

Admin tiene equivalente "Datos del servicio (admin)" con metadata más técnica (provider_slug, IDs internos). Patrón homogéneo cliente vs admin discriminado por nivel de detalle.

### L7 — Smoke real local: setup canónico

**Pre-requisitos** (validados durante Fase B smoke real):

```bash
# 1. Docker compose dev up (postgres + redis + mailpit + minio)
docker compose -f docker/docker-compose.dev.yml up -d

# 2. .env backend con ENHANCE_DEV_* apuntando al mock local
ENHANCE_DEV_BASE_URL=http://127.0.0.1:3099
ENHANCE_DEV_MASTER_ORG_ID=00000000-0000-0000-0000-00000000aaaa
ENHANCE_DEV_API_TOKEN=e2e-mock-token-fixture

# 3. Mock Enhance running (tsconfig específico)
cd backend && pnpm exec ts-node -P ../tests/e2e/fixtures/tsconfig.mock-runner.json \
  --transpile-only ../tests/e2e/fixtures/mock-enhance-runner.ts &

# 4. Backend + frontend dev
cd backend && pnpm start:dev &  # :3001
cd frontend && pnpm dev &        # :3002

# Auth flow automatizado vía Mailpit API:
# POST /auth/login → temp_token + 2FA email enviado
# GET http://127.0.0.1:8025/api/v1/messages?limit=1 → extraer 6-digit code del Subject
# POST /auth/verify-2fa con temp_token + code → access_token (Bearer)
```

**Token API expira en ~5 min** — re-auth flow automatizable. Cookies httpOnly del Modelo A viven en dominio Next.js (no son las del API directo).

### L8 — Hot-reload cache caveat Next.js dev

Tras cambios en `lib/api.ts` types o componentes leaf, el HMR de Next.js dev a veces no propaga bien. **Si el frontend no muestra cambios tras edits**, ejecutar:

```bash
# Kill frontend + clear .next cache + relaunch
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3002).OwningProcess -Force
Remove-Item -Recurse -Force frontend/.next
cd frontend && pnpm dev
```

Y pedir al usuario `Ctrl+Shift+R` (hard refresh) en el browser.

## A.7.4. Scope completo Fase 15C.II.C (lo que hay que hacer)

### C.1 — Drift UX por rol (decisión A3 + ADR-083 A4.3 + UI_SPEC §4.13)

**Materializar la discriminación cliente vs admin** del `info.statusReason` cuando `info.status` ∈ {`unknown`, `failed`}:

**Cliente** (`/dashboard/services/[id]`):
- NO renderizar `info.statusReason` técnico crudo (actualmente lo hace `ServiceHeader.tsx:65`).
- Reemplazar con mensaje genérico empático tipo: _"Tu servicio está temporalmente no disponible. Hemos avisado al equipo técnico."_
- **Ocultar SSO card + DNS card** cuando metadata corrupta (ej. status=unknown sin `enhance_org_id` en metadata) — porque dar click ahora produce errores `action.provider_error`.

**Admin** (`/admin/services/[id]`):
- Renderizar `<AlertBanner variant="warning">` ARRIBA de MetricsBar con:
  - Título: "Drift detectado · {change_type}"
  - Body: `info.statusReason` técnico crudo (admin necesita información literal)
  - CTA: botón "Investigar en panel del proveedor" → invoca SSO (admin impersonation)
- Mantener TODA la info admin visible (incluido SSO, DNS — el admin debe poder operar para diagnosticar).
- Botón "Re-aprovisionar" prominente cuando status=unknown sin metadata (caso `not_yet_provisioned`).

### C.2 — i18n completo (gap BUG-15CII-13)

Plugin Enhance manifest declara `description` i18n key faltantes para 2 actions:
- `reset_account_password` → `plugin.enhance_cp.actions.reset_password.description`
- `change_package` → `plugin.enhance_cp.actions.change_package.description`

Añadir las descriptions al manifest + las keys al `translations-es.ts`.

### C.3 — PluginConfigForm useToast (gap G6)

`frontend/app/admin/settings/plugins/[slug]/_components/PluginConfigForm.tsx`:
- Eliminar el state local `feedback: FeedbackState | null` + componente `<FeedbackInline>`.
- Usar `useToast()` igual que `ActionsBar.tsx` y `SsoButton.tsx` ya hacen tras Fase I.
- Patrón coherente con UI_SPEC §4.3 (Toast = feedback efímero, AlertBanner = persistente).

### C.4 — ChangePackageModal toast (gap G6b)

`frontend/app/admin/services/[id]/_components/ChangePackageModal.tsx`:
- Mismo patrón que C.3: eliminar `setSubmitError()` + `setSuccessMessage()` inline → `useToast()`.

### C.5 — Modal a11y (gap G7)

`frontend/app/components/ui/Modal/Modal.tsx`:
- Añadir `aria-labelledby={titleId}` + `id={titleId}` en el `<h2>` título del modal.
- Implementar **focus trap** (al abrir modal, foco se mueve al primer focusable; Tab cicla dentro del modal; Shift+Tab también).
- Opciones: usar `<FocusScope>` de Radix UI primitives, o implementación manual (~50 LOC).

### C.6 — Card "Detalles del servicio" cliente — pulir

Round 4 ya añadió la card básica. Considerar pulir si hace falta:
- Añadir tooltip explicando "Estado de tu servicio" si admin discrimination requiere.
- Considerar mostrar próxima fecha de renovación si está disponible en el response.

## A.7.5. Archivos clave que tocar (line numbers donde aplique)

| Archivo | Acción |
|---|---|
| `frontend/app/_shared/services/ServiceHeader.tsx:52-72` | Añadir prop `isAdmin` + condicional render statusReason según rol |
| `frontend/app/dashboard/services/[id]/page.tsx:99-194` | Condicional ocultar SSO/DNS cards si status=unknown sin metadata |
| `frontend/app/admin/services/[id]/page.tsx` | Añadir AlertBanner warning + botón "Re-aprovisionar" |
| `frontend/app/components/ui/AlertBanner/` | Verificar si existe; si no, crear |
| `frontend/app/components/ui/Modal/Modal.tsx:17-44` | aria-labelledby + focus trap |
| `frontend/app/admin/settings/plugins/[slug]/_components/PluginConfigForm.tsx:104-111, 322-379` | useToast migration + eliminar FeedbackInline |
| `frontend/app/admin/services/[id]/_components/ChangePackageModal.tsx` | useToast migration |
| `frontend/app/_shared/i18n/translations-es.ts` | Añadir keys nuevas: drift cliente generic + admin investigate + reset_password.description + change_package.description |
| `backend/src/plugins/provisioners/enhance_cp/enhance.plugin.ts` (manifest sección actions) | Añadir `description` i18n key a 2 actions faltantes |

## A.7.6. Lo que NO está en Fase C (sigue para Fase D-G)

| Fase | Scope |
|---|---|
| **D** | Email listener `notifications-on-password-reset` + audit-sanitizer.ts (gap G2 — redact `data.password` antes de audit). **CRÍTICO compliance R12**: sin sanitizer NO se puede activar el email listener. |
| **E** | UI admin nativa DNS records (`/admin/services/[id]/dns`) + validación TTL min/max + duplicados |
| **F** | Admin overview operativo plugin (stats grid 4 cards + tabla recent drifts + botón reconcile general) + capability flag `supports_suspend` (G3 ADR-077 A4) + cache TTL configurable (G4) + breaker EnhanceApiClient (G5) + **G8 nuevo: bug `test-connection`** descubierto en smoke automatizado Fase B (synthetic service sin metadata → `getStatus()` falla siempre — ver §A.7.7) |
| **G** | Tests críticos faltantes (8 áreas) + E2E spec extension + retrospectiva en `completed/sprint-15c-plugin-enhance-cp.md` + smoke final Yasmin contra mock + Enhance live |

## A.7.7. Gaps audit estado actual (post Fase B)

| ID | Estado |
|---|---|
| **G1** vaporware endpoint manual cron | ✅ Cerrado Fase B (endpoint `POST /admin/plugins/:slug/reconcile-all` ahora existe) |
| **G2** sanitización data.password en wrapper auditor | ⏳ Fase D (CRÍTICO antes del email listener) |
| **G3** capability flag `supports_suspend` | ⏳ Fase F |
| **G4** TTL cache 60s hardcoded | ⏳ Fase F |
| **G5** CircuitBreaker en EnhanceApiClient | ⏳ Fase F (evaluar criticidad) |
| **G6** PluginConfigForm useToast inline | ⏳ Fase C |
| **G6b** ChangePackageModal error inline sin toast | ⏳ Fase C |
| **G7** Modal sin aria-labelledby + focus trap | ⏳ Fase C |
| **G8** **NUEVO** test-connection synthetic service sin metadata | ⏳ Fase F. Bug pre-existente descubierto durante smoke Fase B: `AdminPluginsService.buildSyntheticService(slug)` ([admin-plugins.service.ts:551](../../backend/src/modules/admin-plugins/admin-plugins.service.ts#L551)) construye un service sintético sin metadata, y `enhance.plugin.getStatus()` requiere refs (`enhance_org_id` + `subscription_id`) en metadata. Resultado: el botón "Probar conexión" del UI siempre reporta error aunque el cluster esté OK. Fix Fase F: usar un endpoint del proveedor que NO requiera service refs (ej. `GET /version`). |

## A.7.8. Validación end-to-end del estado actual (smoke automatizado yo, 2026-05-10)

**9 tests passed via curl + node parser**:

1. ✅ Login admin + verify 2FA (auto-extrae código de Mailpit API)
2. ✅ `GET /admin/plugins` → 3 plugins (internal, manual, enhance_cp), enhance_cp enabled
3. ✅ `GET /admin/plugins/enhance_cp` → manifest completo con title + description traducibles
4. ⚠ `POST /admin/plugins/enhance_cp/test-connection` → **bug pre-existente G8** (ver §A.7.7)
5. ✅ **`POST /admin/plugins/enhance_cp/reconcile-all` (NUEVO Fase B)** → HTTP 201 + shape canónico `{services_processed, drifts_detected, duration_ms, details}`
6. ✅ `GET /admin/services?provisioner_slug=enhance_cp` → 1 service del seed
7. ✅ **`POST /admin/services/:id/refresh` (NUEVO Fase B)** → HTTP 200 + service info fresca
8. ✅ `GET /admin/services/:id` → `availableActions` no incluye `view_disk_usage` ni `view_bandwidth_usage`
9. ✅ Smoke browser final (Yasmin): config plugin labels OK + descriptions sin duplicar + botón ↻ refresh activo + reconcile-all funcional + plural ES correcto

## A.7.9. Sesiones origen Fase B

- 2026-05-10 (Fase B inicial) → 7 commits round-by-round
- 2026-05-10 (smoke real Yasmin x6 iteraciones) → 6 rounds fix-up sucesivos
- 2026-05-10 (smoke automatizado curl) → 9 tests passed + descubierto G8 bug pre-existente
- 2026-05-10 (handoff doc Fase B → C) → este §A.7

---

# Apéndice A.8 — Handoff Fase C → Fase D (próximo agente IA)

> **Audiencia**: el siguiente agente que arranque Sprint 15C.II Fase D.
> **Pre-condición técnica**: PR #55 mergeado a master.
> **Tipo**: handoff doc canónico — leer ANTES de tocar nada de código.

## A.8.1. Frase canónica de arranque (verbatim)

> *"Lee `docs/60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md` Apéndice A §A.8 (handoff completo Fase C → D). Vamos con Sprint 15C.II Fase D — Email listener `notifications-on-password-reset` + `audit-sanitizer.ts` (gap G2). El sanitizer es PRE-CONDICIÓN del listener: sin él, activar el listener sería bomba de seguridad (passwords plaintext en `audit_change_log` viola compliance R12). Crea rama `sprint15c-ii-fase-d-email-listener-audit-sanitizer` desde master post merge PR #55. Lee también [ADR-083 Amendment A4.5](../10-decisions/adr-083-plugin-enhance-cp-specifics.md#a45-sanitización-datapassword-en-wrapper-auditor-gap-g2--riesgo-compliance) (audit sanitizer doctrina + regex canónico password|secret|token|apiKey|privateKey + opt-out `ServiceAction.allowsSensitiveDataInAudit`). Procede con rigor — el orden es 1) sanitizer + tests, 2) listener email + plantilla seedeada, 3) e2e flow integral. Procede."*

## A.8.2. Estado real al cierre Fase C

**7 commits Fase C** (todos en PR [#55](https://github.com/yasmindanailov/dashboard/pull/55) — branch `sprint15c-ii-fase-c-drift-ux-i18n`):

| Commit | Tipo | Round | Resumen |
|---|---|---|---|
| `5906165` | feat | 1 (inicial) | Drift UX por rol + i18n descriptions + a11y Modal (focus trap + aria-labelledby) + PluginConfigForm/ChangePackageModal a useToast. Cierra scope original A3 + i18n + G6/G6b/G7 |
| `32ac8c4` | fix | 2 | BUG-15CII-A reprovisión no-op silencioso (idempotency guard) + BUG-15CII-B effective provisioner slug UX (anotación "desde producto") |
| `5776b9d` | fix | 3 | BUG-15CII-C cache wrapper Redis nunca se invalidaba post provision (UI veía stale 60s) — orquestador + reprovisionAsAdmin invalidan canónicamente. Auto-refresh frontend 5s tras reprovisión |
| `a8d1ec1` | fix | 4 | BUG-15CII-D + BUG-15CII-E service terminal UX: shortcircuit backend + banner explícito admin/cliente + ocultar acciones futiles + cancellation_reason + cancelled_at expuestos al frontend |
| `56aa9c8` | fix | 5 | BUG-15CII-F error codes discriminados (INVALID_STATE drift detectable) + Modal DS canonical (reemplaza window.confirm en ActionsBar + AdminDriftBanner) + has_metrics gating |
| `79c3c94` | fix | 6 | BUG-15CII-G mensajes error split cliente vs admin (UI_SPEC §1.2 P5+P6) + BUG-15CII-H dedupe statusReason terminal en ServiceHeader |
| `f9b4b2f` | feat | 7 | Refresh metrics UX por rol (cliente pasivo, admin cooldown 10s) + card admin "Detalles operativos" rediseñada (Cliente/Servicio/Fechas) + componente DS `<CopyableId>` reusable + helper `buildClientDisplayName` |

**Suites tests post Fase C:** 505/510 unit verde + 5 skipped + 0 regresiones (+8 tests nuevos vs base Fase B 501/506: shortcircuit terminal `cancelled` + admin_action key + reprovisionAsAdmin reset status + reprovisionAsAdmin cache.invalidate + provision OK cache.invalidate + provision permanent failure cache.invalidate + getInfoForUser product_provisioner exposed + getInfoForUser product_provisioner null fallback). typecheck both verde + lint:check both verde + 5/5 CI checks SUCCESS (Backend, Frontend, E2E shards 1/3 + 2/3 + 3/3).

## A.8.3. Lecciones técnicas críticas (heredables — léelas antes de codear)

### L1 — Cache wrapper SIEMPRE invalidar tras mutación de service

**Problema descubierto en smoke real**: el wrapper canónico `getServiceInfoWithCache` (`backend/src/core/provisioning/plugin-utils.ts:70`) cachea el resultado del plugin en Redis por TTL=60s. El orquestador `provisionService` persistía nueva metadata (`enhance_org_id`, `provider_reference`) tras `plugin.provision()` OK, pero **NUNCA invalidaba la cache**. Resultado: durante 60s tras provision OK, cualquier lectura del wrapper devolvía la versión cacheada `not_yet_provisioned` de antes (cuando metadata estaba vacía). Bug crítico que invalidaba TODO el flujo de provisioning + reprovisión.

**Patrón canónico** (defense-in-depth — invalidar en TODOS los hitos de mutación):

1. **Orquestador `provisionService`** ([provisioning-orchestrator.service.ts:221](../../backend/src/modules/provisioning/provisioning-orchestrator.service.ts#L221)) — `await this.cache.invalidate(serviceId)` tras `prisma.service.update({ provider_reference, metadata })`.
2. **Orquestador failure path** (línea 258) — invalidar también tras permanent failure (status pasa a cancelled, UI debe ver el cambio inmediato).
3. **`reprovisionAsAdmin`** (`provisioning.service.ts:548`) — invalidar tras reset `status → 'provisioning'` (defense-in-depth durante ventana del job async).
4. **Wrapper `executeActionWithCacheInvalidation`** (`plugin-utils.ts:289`) — patrón ya existente desde Sprint 11, sirve de referencia canónica.

**Aplicación heredable**: cualquier plugin futuro (15D RC, 15E Docker, 15G Plesk) cuyo `provision()` modifique `service.metadata` o `service.provider_reference` debe asumir que el orquestador YA invalida cache automáticamente. NO reimplementar invalidate per-plugin — vive en wrapper canónico.

### L2 — Service terminal NO invocar plugin (shortcircuit canónico)

**Problema descubierto en smoke real**: service `aec6a6b5` (demo-carla.aelium.test) con `status='cancelled'` por `cancellation_reason='provisioning_failed:INVALID_PAYLOAD'` mostraba simultáneamente: Badge "Estado desconocido" + AlertBanner drift "Servicio aún no aprovisionado" + botón Re-aprovisionar. Causa: el wrapper `getServiceInfoWithCache` invocaba al plugin, que retornaba `not_yet_provisioned` por metadata vacía, ignorando que el service estaba TERMINAL.

**Doctrina canónica congelada**: cuando `service.status` ∈ `{cancelled, terminated}`, NO se invoca al plugin (cualquier respuesta sería falsa info sobre service que ya no opera). Patrón = banner explícito + ocultar acciones futiles. La cola provisioning ya skipea terminal idempotently ([orquestador:144](../../backend/src/modules/provisioning/provisioning-orchestrator.service.ts#L144)) — la UI debe reflejar la misma doctrina.

**Implementación canónica**: `getInfoForUser` ([provisioning.service.ts:251](../../backend/src/modules/provisioning/provisioning.service.ts#L251)) hace shortcircuit con `buildTerminalServiceFallback(service)` — retorna `info.status='cancelled'` + `statusReason` mapeado desde `cancellation_reason` + `capabilities` sin sso/dns/metrics/inlineActions. El frontend (`AdminServiceDataCard` + páginas admin/cliente) lee `service.status` ∈ `{cancelled, terminated}` y renderiza banner danger/info en lugar de drift.

**Heredable**: cualquier plugin SaaS que reciba un service terminal debe NO ser invocado. La pattern matching vive en `getInfoForUser` (no en cada plugin) — cero acoplamiento per-plugin.

### L3 — Backend retorna keys "base", frontend discrimina por rol

**Problema descubierto en smoke real round 5+6**: cliente al restablecer contraseña veía toast técnico admin: _"drift detectado", "Reconciliar contra Enhance", "metadata desincronizada"_. Viola UI_SPEC §1.2 P5 (voz Aelium) + P6 (contenido adaptativo por rol).

**Doctrina canónica congelada (R-frontend-canonical)**: el backend wrapper retorna **keys "base"** sin sufijo (ej. `action.invalid_state`). El frontend les añade `.client` o `.admin` según `isAdmin` del viewer. Esto evita acoplar el backend con la discriminación frontend — el backend solo conoce **códigos canónicos**, el frontend formatea según rol.

**Implementación canónica**:
- Backend: `executeActionWithCacheInvalidation` mapea `INVALID_STATE → 'action.invalid_state'` (sin sufijo). `getSsoUrlWithAudit` retorna shape canónico `GetSsoUrlResult = { sso, errorCode }` con códigos crudos.
- Frontend `_shared/services/ActionsBar.tsx`: helper `selectMessageKey(rawKey, isAdmin)` con `ROLE_DISCRIMINATED_KEYS = new Set(['action.invalid_state'])`. Solo aplica el sufijo a códigos donde el cliente NO debe ver jerga técnica.
- Frontend `_shared/services/SsoButton.tsx`: helper `selectSsoErrorKey(errorCode, isAdmin)`. Pages cliente/admin pasan `isAdmin` explícitamente.
- Frontend `admin/services/[id]/_components/AdminDriftBanner.tsx`: usa keys `.admin` directamente (componente admin-only por ubicación).

**Heredable**: cualquier plugin futuro que retorne códigos canónicos automáticamente hereda la discriminación cliente vs admin. NO añadir variantes `.client`/`.admin` per-plugin — solo per-código compartido.

### L4 — `window.confirm()` NUNCA en componentes que requieren UX consistente

**Problema descubierto en smoke real round 5**: reset password abría `window.confirm()` nativo del browser en lugar de Modal DS. Viola UI_SPEC §4.2 — confirmaciones reforzadas usan componente DS canónico (z-index, focus trap, theming, a11y).

**Patrón canónico congelado**: state local `pendingConfirm` + Modal DS componente con confirmación reforzada (botón "Cancelar" + "Confirmar" tipado por `destructive`). Reemplaza el nativo browser. Heredable a futuros plugins.

**Aplicación canónica**: `ActionsBar.tsx` + `AdminDriftBanner.tsx` ya migrados. Cualquier nuevo componente con confirmación destructiva (suspend, delete, reprovision, etc.) usa el mismo patrón. NO usar `window.confirm` ni `window.alert` ni `window.prompt`.

### L5 — Capability flags canónicos gatean rendering — UI ramifica por flags, NO por slug

**Problema descubierto en smoke real round 5**: MetricsBar visible siempre, incluso cuando `info.capabilities.has_metrics=false` (plugins triviales `internal`/`manual` y futuros productos tipo `support_inside`). Card vacía con "Métricas no disponibles" sin sentido.

**Patrón canónico R-070**: la UI ramifica por `info.capabilities.<flag>`, NUNCA por `service.provisioner_slug`. ADR-077 §3 lo declara explícito: "cero `if (provisioner === 'X')`".

**Aplicación canónica**: páginas admin + cliente del service detail leen `info.capabilities.has_metrics` antes de renderizar `<MetricsBar>`. Análogo: `info.capabilities.hasSsoPanel` para `<SsoButton>`, `info.capabilities.has_dns_management` para link DNS.

**Heredable**: cualquier plugin que NO declare métricas (`has_metrics: false` en su `capabilities`) ve la card oculta automáticamente sin tocar el SC. Decisión declarativa.

### L6 — Refresh UX discriminado por rol — cliente pasivo, admin con cooldown

**Patrón canónico congelado (estándar industria Stripe / Vercel / Datadog)**:

- **Cliente** (Stripe customer / Vercel viewer): SIN botón ↻ explícito. UX pasiva con timestamp relativo "Actualizado hace X" + tooltip fecha exacta + hint "Recarga la página para ver los datos más recientes". Razones doctrinales: (1) cliente no debe controlar manualmente la carga al proveedor — riesgo DoS + UX confusa "¿qué refresca el botón?"; (2) cache backend TTL=60s garantiza que recargar la página (F5 universal) obtiene fresh state cuando pasaron >60s; (3) F5 es UX universal cross-app.

- **Admin** (Stripe admin / Datadog): botón ↻ con cooldown VISIBLE 10s tras cada refresh exitoso. Estados del botón: `↻ Refrescar` (idle) → `⏳ Refrescando…` (pending) → `↻ 10s` → `↻ 9s` → ... → `↻ Refrescar` (vuelve idle). Razones doctrinales: (1) evita rate-limit accidental contra el proveedor; (2) DoS por click repetitivo durante debugging; (3) UX clara "ya pulsé, esperando resultado". Si el server action FALLA, el cooldown NO se aplica (admin debe poder reintentar inmediato para diagnosticar transient errors).

**Aplicación canónica**: `MetricsBar.tsx` gating `showRefreshButton = serviceId && isAdmin`. `MetricsRefreshButton.tsx` con `useState(cooldownRemaining)` + `useEffect` con `setTimeout` decrementando cada segundo. Helper `formatRelativeTime(iso)` server-side stable (GitHub/Stripe style — "hace 5 minutos").

**Heredable**: cualquier card de datos refrescable (futuro: stats admin, audit log preview, etc.) sigue el mismo patrón discriminado por rol.

### L7 — IDs UUID secundarios con `<CopyableId>`, info legible primaria

**Patrón canónico congelado (estándar Stripe / Vercel admin)**: información primaria visible (nombre, email, domain, plan, badge estado), IDs técnicos secundarios con click-to-copy + truncate visual. Las páginas admin de detalle agrupan en sub-secciones lógicas (Cliente / Servicio / Fechas) en lugar de listas planas de UUIDs crudos como valor primario.

**Componente DS heredable**: `<CopyableId>` ([components/ui/CopyableId/](../../frontend/app/components/ui/CopyableId/)) — `navigator.clipboard.writeText` + toast confirmación + truncate visual UUIDs (default 8 chars antes/después: `91c0e015-…f278b8`). Iconos copy/check inline SVG (sin dep externa). Reusable en futuros admin pages (clients, products, invoices).

**Patrón composición heredable**: `<AdminServiceDataCard>` ([admin/services/[id]/_components/](../../frontend/app/admin/services/[id]/_components/AdminServiceDataCard.tsx)) — Server Component con secciones jerárquicas. Helper `statusToBadge(rawStatus)` mapea `service.status` (incluye `terminated`, `provisioning` no canónicos en `ServiceInfo['status']`) → Badge tone + label legibles. Helper `formatDateWithRelative(iso)` para fechas amigables ("10 may 2026, 15:38 · hace 25 minutos").

### L8 — Error codes backend canónicos con frontend mapeo per-rol

**Códigos canónicos congelados** (heredables a 15D/15E/15G):

| Código backend (ProvisionerPluginError) | Wrapper backend mapea a | Frontend muestra (cliente / admin) |
|---|---|---|
| `INVALID_PAYLOAD` | `action.invalid_payload` (sin sufijo) | Mismo mensaje ambos roles (form/data del usuario) |
| `INVALID_STATE` | `action.invalid_state` (sin sufijo, role-discriminated) | `.client` empático / `.admin` operacional con CTA reconcile |
| `PROVIDER_INTERNAL_ERROR` (default unknown) | `action.provider_error` (sin sufijo) | Mismo mensaje (genérico transitorio) |
| `CIRCUIT_OPEN` (CircuitOpenError) | `action.circuit_open` (sin sufijo) | Mismo mensaje (informativo cooldown) |

**SSO errorCodes** (shape `GetSsoUrlResult.errorCode`):

| Código backend | Frontend SsoButton + AdminDriftBanner |
|---|---|
| `INVALID_STATE` | `sso.error.invalid_state.{client,admin}` |
| `CIRCUIT_OPEN` | `sso.error.circuit_open.{client,admin}` |
| Default (`PROVIDER_INTERNAL_ERROR`) | `sso.error.provider_internal.{client,admin}` |
| `null` (caso legítimo: `has_sso_panel=false` o refs missing) | NO mostrar toast (oculto upstream por gating) |

### L9 — Reset status→provisioning antes de enqueue (caso reprovision admin)

**Problema descubierto en smoke real**: el botón "Re-aprovisionar ahora" sobre service con `status='active'` enqueue el job correctamente, el worker levanta, y silently skipea por la guard idempotente del orquestador (`provisioning-orchestrator.service.ts:151` — `if (service.status === 'active') return`). Cero efecto operativo + cero feedback al admin.

**Patrón canónico congelado (Plesk admin "Reset & re-provision" / cPanel WHM "Force re-provisioning" / ResellerClub force-reprovision)**: `reprovisionAsAdmin` ([provisioning.service.ts:530](../../backend/src/modules/provisioning/provisioning.service.ts#L530)) resetea `status → 'provisioning'` ANTES del enqueue. El reset canónico pre-active hace que la guard idempotente pase y el worker invoque `plugin.provision()` real. Coherente con DH-INV-6 (ADR-082): NO se modifica status automáticamente desde cron/listener, solo desde acción explícita admin que firma audit `service.reprovision_requested`.

**Frontend complementa**: `<AdminDriftBanner>` tras toast "enqueued" hace `router.refresh()` inmediato + `setTimeout(refresh, 5000)` para ver resultado del job sin recargar manualmente.

### L10 — Bug crítico smoke: producto sin `enhance_plan_id` → INVALID_PAYLOAD permanente → cancelled

**Caso reproducido en smoke real** (service A `aec6a6b5...`): producto "Hosting Pro" (slug `hosting-pro`) NO tiene `enhance_plan_id` configurado en su `provisioner_config`. Cualquier intento de aprovisionar via plugin enhance_cp lanza `extractEnhancePlanId` → `ProvisionerPluginError(INVALID_PAYLOAD, retriable=false)` → orquestador marca `cancelled` con `cancellation_reason='provisioning_failed:INVALID_PAYLOAD'`.

**Esto NO es bug de código** — es **data issue del seed**. El producto debe tener `provisioner_config.enhance_plan_id = 1` (o el plan_id válido del Master Org). Fix: editar producto desde `/admin/products/[id]/edit` añadiendo `enhance_plan_id` válido. Service quedará cancelled (terminal, irreversible) — el cliente debe contratar uno nuevo (checkout) o el admin debe corregir la causa + crear service nuevo.

**Aplicación heredable**: cualquier plugin futuro que requiera campos en `productConfig` debe declararlos en `manifest.productConfigSchema` (ADR-080 Amendment B) + el admin debe configurarlos al crear el producto. Sin esto, **TODO** service del producto quedará cancelled tras provisioning fail.

## A.8.4. Scope completo Fase 15C.II.D (lo que hay que hacer)

### D.1 — Audit sanitizer (gap G2 — CRÍTICO PRE-CONDICIÓN)

> **Doctrina ADR-083 Amendment A4.5 frozen 2026-05-10** + R12 compliance (secrets nunca en audit log).

Crear `backend/src/core/provisioning/audit-sanitizer.ts`:

- **Función canónica `redactSensitiveFields(data, allowList?)`**: walk recursivo del objeto `data`. Para cada key cuyo nombre matchea el regex canónico **case-insensitive** `/(password|secret|token|apiKey|privateKey)/i`, sustituir el valor por `'[REDACTED]'`. La `allowList?: string[]` opcional permite skip de keys específicas (uncommon — requiere ADR específico justificando, NO aplica a `reset_account_password`).

- **Integración wrapper canónico `executeActionWithCacheInvalidation`** ([plugin-utils.ts:188](../../backend/src/core/provisioning/plugin-utils.ts#L188)): aplicar `redactSensitiveFields(result.data)` ANTES de cualquier `audit.logChange` o `events.emit('service.action_executed', { ..., result.data })`. El admin sigue viendo el campo en la UI (toast/modal) durante la sesión inmediata; solo el log persistido lo enmascara.

- **Test contract genérico nuevo (ADR-077 §7)**: `core/provisioning/audit-sanitizer.spec.ts` cubre:
  - Redact de `password|secret|token|apiKey|privateKey` (case-insensitive — `Password`, `apiKEY`, `privateKey` deben matchear).
  - Walk recursivo (objetos anidados, arrays con objetos, mixed).
  - allowList opcional (campo declarado allowed pasa intacto).
  - Default `[]` allowList: TODOS los matches se redactan.
  - Idempotencia (segundo call con data ya redactada no rompe).

- **Test integración `enhance.plugin.spec.ts`** verifica que tras `reset_account_password`, el wrapper sanitiza ANTES de audit emit. El test mockea `audit.logChange` y verifica que `changes_after.data.password` NO contiene la password plaintext (es `'[REDACTED]'` o no existe).

### D.2 — Email listener `notifications-on-password-reset` (DC.NEW-15CII-EMAIL-RESET)

> **PRE-CONDICIÓN**: D.1 sanitizer DEBE estar deployed antes. Sin sanitizer activar listener = bomba seguridad.

Crear `backend/src/modules/notifications/listeners/notifications-on-password-reset.listener.ts`:

- **Listener `@OnEvent('service.action_executed')`** filtra solo `action_slug === 'reset_account_password' && success === true`. Otros action_slugs son no-op silencioso.
- **Carga el `User` del `service.user_id`** (vía `prisma.user.findUnique({ where: { id }, select: { email, language, first_name } })`). Email del cliente afectado.
- **Carga el `data.new_password`** del payload del evento (NO del audit_change_log — ese ya está sanitizado). El listener consume el evento ANTES de la persistencia audit, por eso recibe la password plaintext temporal en memoria.
- **Llama `EmailService.send`** con plantilla seedeada `password_reset_enhance` (subject + body en ES por defecto, EN diferido):
  - Subject: "Tu contraseña ha sido restablecida — {service.domain}"
  - Body: nueva password + recomendación de cambiar al primer login + link al panel del proveedor (SSO).
- **Plantilla seedeada**: añadir migration o seed nuevo con `email_template` row para `password_reset_enhance` (si la tabla `email_templates` ya existe — verificar; si no, hardcoded en `EmailService` por ahora).
- **Tests**:
  - `notifications-on-password-reset.listener.spec.ts` — listener invocado con payload válido → llama `email.send` con shape correcto. Filter: action_slug ≠ reset_password → no-op. Filter: success=false → no-op.
  - Test integración E2E (extender `tests/e2e/sprint-15c-enhance-flow.spec.ts`): admin pulsa reset_password → mailpit API recibe email con subject correcto + nueva password en el body.

### D.3 — i18n keys nuevas

Añadir a `frontend/app/_shared/i18n/translations-es.ts`:
- `email.password_reset.subject = "Tu contraseña ha sido restablecida — {domain}"`
- `email.password_reset.body.intro` / `.password_label` / `.recommendation` / `.cta_panel`

(Plantilla puede ser HTML o text. Mantener simple — la riqueza visual del email se enfoca en Sprint 12 KB futuro.)

### D.4 — Update mensaje action.reset_password.success

Hoy ([translations-es.ts:91](../../frontend/app/_shared/i18n/translations-es.ts#L91)):
> "Contraseña restablecida en Enhance. Comparte la nueva manualmente con el cliente — el envío automático por email llegará en una próxima versión."

Actualizar tras Fase D:
> "Contraseña restablecida en Enhance. El cliente recibirá un email automático con la nueva contraseña."

## A.8.5. Archivos clave que tocar (line numbers donde aplique)

| Archivo | Acción |
|---|---|
| `backend/src/core/provisioning/audit-sanitizer.ts` | **NUEVO** — función `redactSensitiveFields(data, allowList?)` walk recursivo + regex canónico |
| `backend/src/core/provisioning/audit-sanitizer.spec.ts` | **NUEVO** — tests contract genéricos (regex, walk, allowList, idempotencia) |
| `backend/src/core/provisioning/plugin-utils.ts:188+` | Integrar `redactSensitiveFields(result.data)` ANTES de `audit.logChange` + `events.emit` en `executeActionWithCacheInvalidation` |
| `backend/src/modules/notifications/listeners/notifications-on-password-reset.listener.ts` | **NUEVO** — listener `@OnEvent('service.action_executed')` filtra `reset_account_password` + carga User + envía email |
| `backend/src/modules/notifications/listeners/notifications-on-password-reset.listener.spec.ts` | **NUEVO** — tests unit listener (filters + shape email.send) |
| `backend/src/modules/notifications/notifications.module.ts` | Registrar `NotificationsOnPasswordResetListener` como provider |
| `backend/prisma/seed/...` (verificar si existe seed canónico) | Seed plantilla `password_reset_enhance` si la tabla `email_templates` existe |
| `backend/src/plugins/provisioners/enhance_cp/enhance.plugin.spec.ts` | Test integración: tras `reset_account_password`, audit_change_log NO contiene password plaintext |
| `frontend/app/_shared/i18n/translations-es.ts` | Update key `plugin.enhance_cp.actions.reset_password.success` + nuevas keys `email.password_reset.*` |
| `tests/e2e/sprint-15c-enhance-flow.spec.ts` | Extender E2E: admin reset_password → mailpit recibe email con shape correcto |

## A.8.6. Lo que NO está en Fase D (sigue para Fase E-G)

| Fase | Scope |
|---|---|
| **E** | UI admin nativa DNS records (`/admin/services/[id]/dns`) reusando endpoints existentes Sprint 15C Fase G + validación TTL min/max + duplicados |
| **F** | Admin overview operativo plugin (`/admin/settings/plugins/enhance-cp`): stats grid 4 cards (services activos / suspendidos / drifts 24h / circuit breaker state) + tabla recent drifts + botón reconcile general (ya existe Fase B) + capability flag `supports_suspend` (G3 ADR-077 A4) + 2 inline actions `suspend_service`/`unsuspend_service` + cache TTL configurable (G4) + breaker EnhanceApiClient (G5 evaluar) + **G8 bug `test-connection`** synthetic service sin metadata |
| **G** | Tests críticos faltantes (8 áreas) + E2E spec extension cubriendo refresh metrics + reconcile-all + drift UX por rol + admin overview render + retrospectiva en `completed/sprint-15c-plugin-enhance-cp.md` + smoke final Yasmin contra mock + Enhance live |

## A.8.7. Gaps audit estado actual (post Fase C)

| ID | Estado |
|---|---|
| **G1** vaporware endpoint manual cron | ✅ Cerrado Fase B |
| **G2** sanitización data.password en wrapper auditor | ⏳ **Fase D (CRÍTICO antes del email listener)** |
| **G3** capability flag `supports_suspend` | ⏳ Fase F |
| **G4** TTL cache 60s hardcoded | ⏳ Fase F |
| **G5** CircuitBreaker en EnhanceApiClient | ⏳ Fase F (evaluar criticidad) |
| **G6** PluginConfigForm useToast inline | ✅ Cerrado Fase C round 1 |
| **G6b** ChangePackageModal error inline sin toast | ✅ Cerrado Fase C round 1 |
| **G7** Modal sin aria-labelledby + focus trap | ✅ Cerrado Fase C round 1 |
| **G8** test-connection synthetic service sin metadata | ⏳ Fase F |
| **G9** **NUEVO Fase C round 7** — futuras admin pages (clients, products, invoices) deberían adoptar `<CopyableId>` + patrón composición `<AdminServiceDataCard>` (Cliente/Servicio/Fechas). Diferido a sprint Clients refactor |

### Bugs doctrinales NUEVOS descubiertos en smoke real Fase C (todos cerrados rounds 2-7)

| ID | Bug | Round fix | Commit |
|---|---|---|---|
| **BUG-15CII-A** | reprovisión no-op silencioso cuando `status='active'` (guard idempotente) | round 2 | `32ac8c4` |
| **BUG-15CII-B** | UI muestra `provisioner_slug='—'` engañoso cuando service.provisioner_slug=null pero plugin sí actúa | round 2 | `32ac8c4` |
| **BUG-15CII-C** | Cache wrapper Redis nunca se invalidaba tras provision OK (UI stale 60s) | round 3 | `5776b9d` |
| **BUG-15CII-D** | UI muestra AlertBanner drift sobre service ya `cancelled` (semánticamente FALSO) | round 4 | `a8d1ec1` |
| **BUG-15CII-E** | Botón Re-aprovisionar sobre cancelled produce loop infinito | round 4 | `a8d1ec1` |
| **BUG-15CII-F** | INVALID_STATE colapsa a mensaje genérico "El proveedor no devolvió sesión" | round 5 | `56aa9c8` |
| **BUG-15CII-G** | Cliente ve mensajes técnicos admin ("ejecuta Reconciliar contra Enhance") | round 6 | `79c3c94` |
| **BUG-15CII-H** | statusReason duplicado en service cancelled (header + banner) | round 6 | `79c3c94` |

## A.8.8. Validación end-to-end del estado actual (post Fase C)

**Smoke real Yasmin 7 rounds 2026-05-10**:

1. ✅ Round 1 inicial: drift UX cliente generic + admin AlertBanner CTA + Modal a11y + useToast PluginConfigForm/ChangePackageModal
2. ✅ Round 2: reprovisión force funciona (status reset → provision real) + effective slug "desde producto"
3. ✅ Round 3: cache invalidation post-provision + auto-refresh 5s tras reprovisión (UI ve resultado real)
4. ✅ Round 4: service cancelled muestra banner danger explícito (no drift), acciones futiles ocultas
5. ✅ Round 5: error codes discriminados (INVALID_STATE drift detectable) + Modal DS reemplaza window.confirm + has_metrics gating
6. ✅ Round 6: mensajes cliente vs admin discriminados + dedupe statusReason terminal
7. ✅ Round 7: cliente sin botón ↻ (UX pasiva) + admin cooldown 10s visible + card admin "Detalles operativos" rediseñada (Cliente/Servicio/Fechas + CopyableId)

**Suites tests post Fase C:** 505/510 unit verde + 5 skipped + 0 regresiones (+8 tests nuevos vs Fase B baseline). typecheck both verde + lint:check both verde + 5/5 CI checks SUCCESS en PR #55.

**Estado mock Enhance vs Aelium en BD local**:
- Si reinicias backend y mock Enhance pierde state in-memory, los `member_id`/`login_id` cacheados en `enhance_customers` quedan stale → SSO + reset_password retornan 404 (`INVALID_STATE`).
- En PRODUCCIÓN esto NO ocurre (Enhance es persistente).
- Recovery dev: `DELETE FROM enhance_customers;` + reaprovisionar services activos (force_resync action).

## A.8.9. Sesiones origen Fase C

- 2026-05-10 (Fase C round 1 inicial) → 1 commit (scope original)
- 2026-05-10 (smoke real Yasmin x6 iteraciones, 6 rounds fix-up) → 6 commits cerrando 8 bugs doctrinales
- 2026-05-10 (push + PR #55 + CI verde 5/5) → ready-to-merge
- 2026-05-10 (handoff doc Fase C → D) → este §A.8

---

# Apéndice A.9 — Cierre Fase D + handoff a Fase E (2026-05-10)

> **Audiencia**: el siguiente agente que arranque Sprint 15C.II Fase E.
> **Pre-condición técnica**: PR Fase D mergeado a master.
> **Tipo**: cierre Fase D + hallazgos smoke real Fase D + handoff a E.

## A.9.1. Frase canónica de arranque Fase E (verbatim)

> *"Lee `docs/60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md` Apéndice A §A.9 (cierre Fase D + handoff a Fase E). Vamos con Sprint 15C.II Fase E — UI admin DNS records nativa + consolidación operaciones admin (BUG-15CII-I + GAP-15CII-J/K/L/M/N descubiertos en smoke real Fase D). Crea rama `sprint15c-ii-fase-e-admin-dns-operations` desde master post merge PR Fase D. Lee también ADR-082 §6 (DNS-as-capability + admin endpoints existentes Fase G) + ADR-077 Amendment A1.3 (4 slugs canónicos DNS si has_dns_management=true) + UI_SPEC §1.2 P4 + §4.13 (drift UX por rol). El orden es 1) BUG heurística showReprovision (1 línea), 2) UI admin DNS records reusing endpoints existentes, 3) AdminServiceOperationsCard ampliar con cancel + force_resync. Procede con rigor."*

## A.9.2. Estado real al cierre Fase D

**1 commit Fase D** (PR pendiente — branch `sprint15c-ii-fase-d-email-listener-audit-sanitizer`):

| Commit | Tipo | Resumen |
|---|---|---|
| (pendiente) | feat | D.1 audit-sanitizer.ts + tests (53 tests genéricos) + integración wrapper (audit redactado, evento plaintext) + ServiceAction.allowsSensitiveDataInAudit opcional + enhance.plugin.spec.ts integration test (gap G2 R12). D.2 notifications-on-password-reset.listener.ts + 13 tests unit + registrado en NotificationsModule. D.3 seed templates `service.password_reset` (email HTML EC-T8-17 + internal campana sin password expuesta). D.4 i18n keys `plugin.enhance_cp.actions.reset_password.success` + description actualizadas. E2E test 7 con verificación mailpit + audit redactado SQL. |

**Suites tests post Fase D:** 581 unit (576 pass + 5 skipped) backend, 0 regresiones (+21 tests nuevos vs Fase C). typecheck both verde + lint:check both verde. E2E test 7 nuevo pendiente verificación CI.

**Gaps cerrados:**

| Gap | Estado |
|---|---|
| **G2** sanitización data.password en wrapper auditor | ✅ Cerrado Fase D |
| **DC.NEW-15CII-EMAIL-RESET** listener email reset password | ✅ Cerrado Fase D |

## A.9.3. Lecciones técnicas críticas Fase D (heredables — léelas antes de codear Fase E)

### L11 — El wrapper canónico separa "qué se persiste" vs "qué se emite por evento"

**Doctrina canónica frozen 2026-05-10 (Sprint 15C.II Fase D):** el wrapper
`executeActionWithCacheInvalidation` aplica DOS rutas distintas para `result.data`:

1. **`audit.logChange`** → `data` se sanitiza vía `redactSensitiveFields()` (regex
   canónico `password|secret|token|apiKey|privateKey` case-insensitive). El log
   persistido NUNCA contiene plaintext. R12 compliance.
2. **`events.emit('service.action_executed', { ..., data: result.data })`** →
   plaintext conservado. Los listeners async (notifications, futuras integraciones)
   reciben el dato sensible in-memory; nunca lo persisten.

**Aplicable a 15D RC + 15E Docker + 15G Plesk**: cualquier plugin que retorne
secretos one-time (password reset, API key generation, recovery codes, OTP)
hereda este patrón automáticamente sin tocar nada.

**Excepción declarativa**: `ServiceAction.allowsSensitiveDataInAudit?: readonly string[]`
permite skip per-key cuando un campo matchea el regex pero es legítimamente
auditable (uncommon — requiere ADR específico). NO aplica a `reset_account_password`
ni equivalentes.

### L12 — Listeners de negocio NUNCA invocan EmailService directo

**Doctrina canónica ADR-065 reforzada Fase D**: `NotificationsOnPasswordResetListener`
NO llama a `EmailService.send()`. Usa `NotificationsService.dispatchToUser('service.password_reset',
payload, user_id)` que:

1. Encola job BullMQ `notifications-dispatch`
2. Processor resuelve recipient completo (email + first_name + language)
3. Lookup plantilla `(event_type, channel, locale)` con fallback a `es`
4. Render Handlebars (escape XSS automático EC-T8-17)
5. Entrega vía `EmailChannel` + `InAppChannel` simultáneamente

Beneficios: locale auto-resuelto, dispatch async (no bloquea el flujo
provisioning), DLQ + retries automáticos, plantillas editables admin runtime
(Sprint 9.5).

## A.9.4. Hallazgos smoke real Fase D (2026-05-10) — NUEVOS gaps descubiertos

Durante el smoke real Fase D contra mock-enhance-server fresh (state in-memory
vacío post-reinicio), Yasmin observó múltiples gaps en la UI admin del service
detail. Audit completo:

### BUG-15CII-I — Heurística `showReprovision` no detecta `subscription_missing`

**Síntoma**: en `/admin/services/[id]` con `info.statusReason =
'plugin.enhance_cp.status_reason.subscription_missing'`, el banner drift muestra
el mensaje técnico pero NO ofrece el botón "Re-aprovisionar ahora".

**Causa**: `admin/services/[id]/page.tsx` activa `showReprovision` solo cuando
`statusReason.endsWith('.status_reason.not_yet_provisioned')`. La heurística
fue diseñada para el caso "primer provision no se completó", pero `subscription_missing`
(recurso borrado externamente del proveedor) requiere IDÉNTICA acción admin
(re-crear en proveedor) y debería activar el mismo CTA.

**Fix Fase E (1 línea)**: ampliar la heurística a un set de status_reason keys:

```ts
const REPROVISION_TRIGGER_KEYS = new Set([
  'plugin.enhance_cp.status_reason.not_yet_provisioned',
  'plugin.enhance_cp.status_reason.subscription_missing',
  // Heredable: futuras keys de otros plugins (15D/15E/15G) que indiquen
  // "recurso ausente en proveedor" se añaden aquí.
]);
const showReprovision = isDrift &&
  typeof info.statusReason === 'string' &&
  REPROVISION_TRIGGER_KEYS.has(info.statusReason);
```

### GAP-15CII-J — UI admin NO expone `POST /admin/services/:id/deprovision` (cancelar servicio)

**Síntoma**: el AdminServiceOperationsCard solo tiene el botón "Cambiar plan…".
No hay forma desde la UI de cancelar / deprovisionar el servicio. Para
hacerlo, hoy hay que invocar el endpoint manualmente (curl/Postman) o vía SQL
directo (anti-doctrina).

**Backend existe**: `POST /admin/services/:id/deprovision` con DTO
`{reason: 'cancelled'|'expired'|'admin_override'}` ya implementado
(`admin-provisioning.controller.ts:118`) + audit + invocación a
`plugin.deprovision()` que ejecuta DELETE en el proveedor.

**Fix Fase E/F**: añadir botón "Cancelar servicio…" en `AdminServiceOperationsCard`
con Modal DS canónico (UI_SPEC §4.2 patrón Fase C round 5) que:

1. Pide razón canónica via dropdown (`cancelled` / `expired` / `admin_override`)
2. Pide confirmación reforzada con typing del domain (estándar Stripe/Plesk:
   "escribe `mi-cliente.es` para confirmar")
3. POST al endpoint con DTO
4. Tras 200, router.refresh() + toast success

**Distinción doctrinal cancelar vs suspender (frozen 2026-05-10)**:

| | **Suspender** | **Cancelar** |
|---|---|---|
| Reversibilidad | Reversible (botón "Reanudar") | Final + irreversible |
| Recurso proveedor | Sigue existiendo, solo deshabilitado | Eliminado |
| Datos cliente | Preservados intactos | Pueden quedar irrecuperables |
| Status BD | `suspended` + `suspended_at` timestamp | `cancelled` o `terminated` |
| Casos típicos | Impago temporal, DMCA en investigación, abuso bajo evaluación | Fraude confirmado, fin contrato, baja voluntaria cliente |
| Stripe equivalente | `subscription.pause()` | `subscription.cancel()` |
| cPanel WHM | `suspendacct` / `unsuspendacct` | `removeacct` |

Estándar SaaS: **ambas obligatorias**. Suspender es la "primera línea" antes
de cancelar — da al cliente oportunidad de regularizar antes de pérdida total.

### GAP-15CII-K — inline action `force_resync` declarada admin-only pero sin UI

**Síntoma**: la action `force_resync` existe en `ENHANCE_INLINE_ACTIONS` con
`adminOnly: true` (ADR-083 §9 decisión 32). El backend wrapper la enforce
correctamente. Pero NO hay ningún componente UI que la dispare — el admin no
puede usarla desde el panel.

**Re-evaluación 2026-05-10 (smoke real Yasmin Fase D)**: hay TRES capas
distintas hoy de "refresco" que se confunden — antes de añadir UI evaluar si
force_resync es REDUNDANTE con las dos que ya existen:

| Acción | Qué hace | Recalcula EN proveedor | UX |
|---|---|---|---|
| **F5 navegador** | SC re-render → respeta cache Redis 60s | NO | Default uso normal cliente/admin |
| **Botón ↻ Refresh metrics** (Fase C round 7, admin-only) | Bypass cache → re-fetch del plugin via `getServiceInfo` forceRevalidate=true | NO (solo re-lee lo que ya hay en proveedor) | Cooldown visible 10s post éxito |
| **Force resync** (action backend existente) | Bypass cache + dispara `calculate-resource-usage` PUT al proveedor para que recalcule disco/bandwidth en su lado | **SÍ** — pide al proveedor recálculo activo | Sin UI hoy |

**Conclusión doctrinal**: para 95% de los casos, F5 + botón ↻ ya cubren la
necesidad. Force resync solo aporta valor cuando el proveedor mismo (Enhance)
no ha recalculado disco/bandwidth en su lado en mucho tiempo y el admin
necesita forzar el recálculo upstream antes de leer.

**Distinción doctrinal force_resync vs reprovision (frozen 2026-05-10)**:

| | **Force resync** | **Reprovision** |
|---|---|---|
| Qué hace | Pide recálculo activo en proveedor (`calculate-resource-usage`) + re-fetch + bypass cache | Vuelve a CREAR el recurso desde cero (steps 1-6 plugin.provision()) |
| Modifica proveedor | NO destructivo (solo recálculo) | SÍ destructivo (crea customer/subscription/website) |
| Modifica BD | Solo invalida cache + escribe fresh info | Cambia `provider_reference` + `metadata.enhance_*` + status |
| Cuándo usar | Métricas del proveedor mismo están desactualizadas (raro) | Drift `subscription_missing`/`not_yet_provisioned`, primer provision falló |
| Coste proveedor | Medio (1 PUT recálculo + GETs) | Alto (5-6 mutaciones + posible facturación) |

Analogía: refresh = "recarga la página"; force resync = "pide al servidor que
recalcule antes de mandarte"; reprovision = "vuelve a comprar la cuenta".

**Decisión Fase E (pendiente confirmar al arrancar Fase E)**: 3 opciones:

1. **NO añadir botón UI** — mantener action solo invocable vía API admin
   (caso raro). Reduce ruido en `AdminServiceOperationsCard`. Mi recomendación
   por defecto.
2. **Incorporar como modo opcional del botón ↻** — checkbox "Forzar recálculo
   en proveedor" antes de pulsar el botón. UX más densa pero unifica conceptos.
3. **Renombrar** a `recalculate_provider_metrics` para que el siguiente
   developer entienda inequívocamente que NO es "refresh local". Mantiene API
   limpia.

**Tarea Fase E**: re-evaluar este gap con Yasmin antes de implementar.

### GAP-15CII-L — UI admin NO expone CRUD DNS records

**Síntoma**: el detalle service admin tiene banner "Para revisar la zona DNS de
este servicio, abre el panel del proveedor (Enhance) — la UI admin nativa de
DNS llegará en un sprint futuro". Backend completo (`GET/POST/PATCH/DELETE
/admin/services/:id/dns/records` desde `admin-provisioning.controller.ts:138+`),
faltan SOLO los componentes frontend admin.

**Fix Fase E**: implementar `/admin/services/[id]/dns` reusando los endpoints
existentes:

- Tabla DNS records con CRUD (kind / name / value / ttl / proxy)
- Validación TTL min/max (60 / 86400) + dedup canónica de records
- Modal DS para add / edit / delete con confirm reforzado destructive
- Heredable: el cliente tiene su UI DNS (Fase C — `/dashboard/services/[id]/dns`);
  el admin necesita la misma sin filtro ownership

(Este gap ya estaba apuntado en el dossier original §A.3 fila E.)

### GAP-15CII-M — No hay `/admin/services/[id]/audit` ni `/dashboard/services/[id]/audit`

**Síntoma**: no existe pestaña / página dedicada audit per-service. Las tablas
`audit_change_log` + `audit_access_log` persisten todo (provision events,
action_executed, sso_opened, admin_sso_impersonation GDPR-flagged Fase F,
service.password_reset, etc.) pero NO hay UI que lea filtrado por
`entity_id=service.id`.

**Estándar industria**: Stripe Dashboard "Events tab", AWS CloudTrail "Resource
history", Plesk "Domain action log", cPanel WHM "Account Logs". Pestaña /
página dedicada que muestra timeline COMPLETO de un recurso:

- Cuándo se creó (provision success/failure)
- Cambios de plan / suspensiones / reanudaciones
- Cuándo cliente abrió SSO
- Cuándo admin impersonó (audit GDPR-flagged)
- Cuándo se reseteó contraseña (R12 — sin password en plain)
- Modificaciones DNS records
- Drifts detectados y resoluciones admin

**Por qué importa profesionalmente**:

1. **Soporte técnico** — "¿por qué no funciona X?" → timeline en 2 clicks,
   sin correlacionar logs raw de N módulos.
2. **Cumplimiento RGPD artículo 15** — cliente solicita "qué información
   tienes sobre mí" → portal transparencia Sprint 12.5 alimenta de aquí.
3. **Diagnóstico incidentes** — on-call a las 3am ve "qué pasó con este
   recurso" en una pantalla.
4. **Litigios B2B** — demostrar legalmente "este servicio se suspendió el
   día X por motivo Y porque admin Z lo decidió".

**Fix Fase F**: `/admin/services/[id]/audit` (admin sin filtro) +
`/dashboard/services/[id]/audit` (cliente con filtro GDPR — solo eventos
visibles al data subject). Backend query SQL union de
`audit_change_log` + `audit_access_log` filtrada por `entity_id=service.id`
o `metadata->>'resource_id'=service.id`. Paginado + ordenado DESC. Renderer
timeline component reusable.

### GAP-15CII-N — error_log persiste módulo "http" en lugar del módulo origen

**Síntoma**: cuando el wrapper `getServiceInfoWithCache` o
`executeActionWithCacheInvalidation` rethrow una excepción, el exception
filter genérico NestJS lo atrapa en la capa HTTP y `ErrorLogService.log()`
recibe `module='http'`. La tabla `error_log` que alimenta `/admin/error-log`
muestra "http" como módulo, perdiendo el contexto útil (`provisioning.plugin-utils`,
`EnhanceProvisionerPlugin`, etc.). El backend stderr SÍ logea el módulo real
(lo vimos en boot), pero la persistencia para UI lo pierde.

**Fix Fase F**: el wrapper canónico debe invocar `ErrorLogService.log()`
explícitamente con `module='provisioning.plugin-utils'` (o equivalente) ANTES
de rethrow al exception filter. Patrón heredable a futuros plugins. Beneficio:
admin filtra error log por módulo del plugin (`module=enhance_cp`) en lugar
de buscar entre todos los HTTP 500.

## A.9.5. Plan refinado Fase E (orden de ejecución)

| Paso | Scope | LOC estimado | Tests nuevos |
|---|---|---|---|
| **E.1** | BUG-15CII-I fix heurística showReprovision (1 línea + Set de keys) | ~10 | Update test page.tsx existente |
| **E.2** | UI admin DNS records (`/admin/services/[id]/dns`) — reusa endpoints existentes | ~300 | Component spec + E2E test 8 |
| **E.3** | AdminServiceOperationsCard ampliar: botón "Cancelar servicio…" + Modal DS reason + typing-confirm | ~150 | Spec component + E2E test 9 |
| **E.4** | AdminServiceOperationsCard ampliar: botón "Forzar resincronización" (sin confirm) | ~30 | Update spec existente |
| **E.5** | i18n keys nuevas (12-15 keys) | ~30 | n/a |

**Estimación**: 1 sesión sólida o 2 cortas. Heredable: el patrón de
"AdminServiceOperationsCard como contenedor de operaciones destructivas/admin"
queda canónico para 15D RC + 15E Docker + 15G Plesk.

## A.9.6. Lo que NO está en Fase E (sigue para Fase F-G)

| Fase | Scope |
|---|---|
| **F** | Admin overview operativo plugin (`/admin/settings/plugins/enhance-cp`) — stats grid + tabla drifts + capability flag `supports_suspend` (G3 ADR-077 A4) + 2 inline actions `suspend_service`/`unsuspend_service` + cache TTL (G4) + breaker EnhanceApiClient (G5 evaluar) + G8 bug test-connection + **GAP-15CII-M `/admin/services/[id]/audit`** + **GAP-15CII-N error_log módulo origen** |
| **G** | Tests críticos faltantes (8 áreas) + E2E spec extension cubriendo Fase E + retrospectiva en `completed/` + smoke final Yasmin contra mock + Enhance live |

### A.9.6.1. Suspend / Unsuspend — scope detallado Fase F (transversal billing/abuse/GDPR)

> ⚠ **Materializado en Fase F.1 (2026-05-12) — RECONCILIACIÓN en §A.11.2.** Lo
> de abajo es el apuntado original (2026-05-10). Al implementar se siguió
> **ADR-077 Amendment A4.4 (frozen)** en vez de la propuesta de "métodos
> dedicados del contrato `suspendService`/`unsuspendService` + wrappers
> `suspendServiceWithAudit`": se materializó como **inline actions**
> `suspend_service`/`unsuspend_service` (NO métodos del contrato — sería breaking)
> + orquestador `ProvisioningService.suspendAsAdmin`/`unsuspendAsAdmin` (NO un
> wrapper en `plugin-utils.ts`) + `reason` como **enum canónico `SuspensionReason`**
> (NO string libre — mejora documentada en ADR-077 Amendment A4.5). El resto del
> apuntado (endpoints, listeners email, frontend modal+banner, casos transversales
> billing/abuse/GDPR/maintenance, schema BD ya existente) sigue vigente.

> Apuntado expandido 2026-05-10 (smoke real Fase D): `supports_suspend` NO es
> solo una feature del plugin Enhance — vincula con módulos de **billing**
> (impago temporal → suspensión automática), **support inside / abuse** (DMCA
> en investigación), **GDPR** (right-to-restrict art. 18), **maintenance**
> (cluster en mantenimiento programado). Materialización Fase F debe ser
> heredable a TODOS los plugins futuros (15D RC, 15E Docker, 15G Plesk) +
> consumible desde estos módulos transversales.

**Backend contract (Amendment A5 a ADR-077 — NO bump v3):**

- `PluginCapabilities.supports_suspend: boolean` (Amendment A4 ya frozen Fase A).
- Si `supports_suspend=true`, el plugin DEBE implementar:
  - `suspendService(service: ServiceWithRelations, reason: string): Promise<void>` — invoca al proveedor para deshabilitar el recurso preservando datos. Idempotente (si ya está suspendido en proveedor, no rompe).
  - `unsuspendService(service: ServiceWithRelations): Promise<void>` — reanuda el recurso. Idempotente.
- Si `supports_suspend=false`, los métodos NO son llamables — el wrapper lanza `NotImplementedError` antes de invocar al plugin.
- 2 inline actions canónicas registradas automáticamente en plugins con `supports_suspend=true`:
  - `suspend_service` — `adminOnly: true`, `destructive: true`, `confirmRequired: true`, payloadSchema `{reason: string (min 10 chars), internal_note?: string, notify_client?: boolean (default true)}`.
  - `unsuspend_service` — `adminOnly: true`, `destructive: false`, `confirmRequired: true` (es reversible pero impactante).

**Backend wrapper canónico (nuevo `suspendServiceWithAudit` similar a `executeActionWithCacheInvalidation`):**

1. Valida `service.status === 'active'` (NO se puede suspender lo que ya está suspendido/cancelado).
2. Invoca `plugin.suspendService(service, reason)`.
3. `prisma.service.update`: `status='suspended'`, `suspended_at=now()`, `suspension_reason=reason`.
4. `cache.invalidate(service.id)`.
5. `audit.logChange({action: 'service.suspended', changes_after: {status, suspended_at, suspension_reason, reason}})`.
6. `events.emit('service.suspended', {service_id, user_id, actor_user_id, reason, suspended_at, notify_client})`.

Análogo `unsuspendServiceWithAudit`:
1. Valida `service.status === 'suspended'`.
2. Invoca `plugin.unsuspendService(service)`.
3. `prisma.service.update`: `status='active'`, `suspended_at=null`, `suspension_reason=null`.
4. Resto de pasos análogos.

**Endpoints admin:**

- `POST /admin/services/:id/suspend` con DTO `{reason: string, internal_note?: string, notify_client?: boolean}`.
- `POST /admin/services/:id/unsuspend` sin DTO (solo audit).

**Listeners email (nuevos, herederos del patrón Fase D L11+L12):**

- `notifications-on-service-suspended` consume `service.suspended` → dispatch `service.suspended` template (email cliente + internal campana). Variables: `domain`, `suspension_reason`, `regularize_url`, `panel_url`. Plantilla email: explicación honesta + CTA "Regulariza tu pago" o "Contacta soporte" según contexto.
- `notifications-on-service-unsuspended` consume `service.unsuspended` → email "Tu servicio está activo de nuevo".

**Frontend admin (en `AdminServiceOperationsCard`):**

- Si `service.status === 'active'`: botón "Suspender servicio…" (variant warning).
- Si `service.status === 'suspended'`: botón "Reanudar servicio" (variant primary) + banner amarillo en service detail con `suspension_reason` + `suspended_at` + razón visible.
- Modal Suspend DS:
  - Campo razón obligatorio (min 10 chars) seleccionable de presets canónicos: "Impago vencido", "Investigación abuse", "Mantenimiento programado", "GDPR right-to-restrict", "Otro (especificar)".
  - Campo `internal_note?` opcional (no visible al cliente).
  - Checkbox `notify_client=true` por defecto. UX: "El cliente recibirá email con la razón seleccionada arriba."
  - Botón "Suspender" (variant warning, no rojo — es reversible).

**Casos de uso transversales (por qué importa heredable):**

| Módulo | Trigger automático/manual | Acción |
|---|---|---|
| **Billing** | Cron `billing-suspend-on-overdue` cuando factura supera grace period (ADR-billing-overdue, Sprint 8 Fase 8.1) | Llama endpoint admin con razón canónica "Impago vencido" + notify_client=true. Reactivación automática cuando paga (listener `billing-on-invoice-paid` → unsuspend si `suspension_reason='Impago vencido'`). |
| **Support inside** | Manual desde ticket cuando hay abuse confirmado | Admin acción manual desde service detail. |
| **GDPR** | Cliente solicita right-to-restrict art. 18 (Sprint 12.5) | Acción manual admin con razón "GDPR right-to-restrict". |
| **Maintenance** | Mantenimiento programado del cluster | Batch suspend desde admin cluster (Sprint 10 / 15E). |

**Schema BD (ya existen):**

- `services.suspended_at` (TIMESTAMPTZ NULL) — ya existe ([schema.prisma:488](../../backend/prisma/schema.prisma#L488) aprox).
- `services.suspension_reason` (TEXT NULL) — ya existe.
- `ServiceStatus` enum incluye `suspended` — verificar/añadir si falta.

**Heredable a 15D RC + 15E Docker + 15G Plesk:**

- ResellerClub: `domain.suspend()` API existe. `supports_suspend=true`.
- cPanel WHM: `suspendacct` / `unsuspendacct`. `supports_suspend=true`.
- Plesk: `--update-domain -status suspended/active`. `supports_suspend=true`.
- Docker Engine: stop container preservando volúmenes. `supports_suspend=true`.
- `internal` / `manual`: `supports_suspend=false` (no aplica).

**Tests Fase F:**

- Contract test genérico `provisioner-plugin-suspend.contract.spec.ts`: todo plugin con `supports_suspend=true` debe implementar suspendService + unsuspendService idempotentes.
- Unit test wrapper `suspendServiceWithAudit` + `unsuspendServiceWithAudit`: audit + event + cache invalidation + idempotency guards.
- Unit test plugin enhance specifically.
- E2E test 8 nuevo: admin suspende → mailpit recibe email cliente con razón → admin reanuda → mailpit recibe email "activo de nuevo".

## A.9.7. Gaps audit estado actual (post Fase D)

| ID | Estado |
|---|---|
| **G1** vaporware endpoint manual cron | ✅ Cerrado Fase B |
| **G2** sanitización data.password en wrapper auditor | ✅ Cerrado Fase D |
| **G3** capability flag `supports_suspend` + suspend/unsuspend actions | ⏳ Fase F |
| **G4** TTL cache 60s hardcoded | ⏳ Fase F |
| **G5** CircuitBreaker en EnhanceApiClient | ⏳ Fase F (evaluar criticidad) |
| **G6** PluginConfigForm useToast inline | ✅ Cerrado Fase C round 1 |
| **G6b** ChangePackageModal error inline sin toast | ✅ Cerrado Fase C round 1 |
| **G7** Modal sin aria-labelledby + focus trap | ✅ Cerrado Fase C round 1 |
| **G8** test-connection synthetic service sin metadata | ⏳ Fase F |
| **G9** `<CopyableId>` + `<AdminServiceDataCard>` heredables admin pages | Diferido a sprint Clients refactor |
| **BUG-15CII-I** heurística showReprovision no detecta `subscription_missing` | ⏳ **Fase E (1 línea, smoke real Fase D)** |
| **GAP-15CII-J** UI admin cancelar servicio (backend existe, falta UI) | ⏳ Fase E |
| **GAP-15CII-K** UI admin force_resync (action declarada, falta botón) | ⏳ Fase E |
| **GAP-15CII-L** UI admin DNS records CRUD (backend existe, falta UI) | ⏳ Fase E |
| **GAP-15CII-M** página `/admin/services/[id]/audit` timeline per-service | ⏳ Fase F |
| **GAP-15CII-N** error_log persiste módulo origen (no `http`) | ⏳ Fase F |

## A.9.8. Validación end-to-end del estado actual (post Fase D)

**Smoke real Yasmin Fase D 2026-05-10**:

1. ✅ Backend boot limpio con `NotificationsModule` cargando nuevo listener sin
   error de DI.
2. ✅ Stack completa levantada: backend (3001) + frontend (3002) + mock-enhance
   (3099) + Postgres + Redis + Mailpit + MinIO.
3. ✅ Circuit breaker `enhance_cp:getServiceInfo` ciclo open → half-open →
   closed verificado en stderr (R11 funcionando).
4. ✅ Cron L3 manual "Reconciliar contra Enhance" desde settings: detecta 2
   drifts correctamente (DH-INV-6 respetado — no modifica status).
5. ⚠️ Service detail admin muestra banner drift `subscription_missing` SIN
   botón reprovision → BUG-15CII-I descubierto + apuntado Fase E.
6. ⚠️ UI admin no expone cancelar / force_resync / DNS records → GAP-15CII-J/K/L
   apuntados Fase E.
7. ⚠️ No existe `/admin/services/[id]/audit` → GAP-15CII-M apuntado Fase F.
8. ⚠️ error_log muestra módulo "http" sin contexto plugin → GAP-15CII-N apuntado
   Fase F.

**Suites tests post Fase D:** 576/581 unit verde + 5 skipped + 0 regresiones
(+21 tests nuevos vs Fase C). typecheck both verde + lint:check both verde.
E2E test 7 nuevo (cliente reset_account_password + mailpit + audit redactado SQL)
pendiente CI green.

## A.9.9. Sesiones origen Fase D

- 2026-05-10 (Fase D inicial — sanitizer + listener + seed + i18n + E2E test 7) → 1 commit `45b9a89`
- 2026-05-10 (smoke real Yasmin Fase D — 6 gaps doctrinales descubiertos y apuntados Fase E/F) → este §A.9
- 2026-05-10 (refinamientos doctrinales preguntas Yasmin — suspend expandido §A.9.6.1 + force_resync re-evaluado §A.9.4) → commit `c6169a3`
- 2026-05-10 (squash-merge PR #57 → commit `c3b519e` en master) — ver §A.9.10 bypass CI documentado

## A.9.10. Bypass CI documentado — incidente billing externo GitHub Actions (2026-05-10)

> **Doctrina canónica heredable**: bypass CI verde es aceptable cuando concurren las
> 3 condiciones: (1) el motivo es externo al equipo (proveedor caído, billing
> accidentado, GitHub down), (2) la validación local es exhaustiva y registrada,
> (3) se documenta formalmente en el PR + dossier. NO es práctica habitual.

**Incidente**: GitHub Actions de la cuenta organizativa quedó bloqueado por
`payment failure` afectando TODOS los workflows. 4 intentos consecutivos de
arrancar CI fallaron con el mismo mensaje:

| Intento | Run | Resultado |
|---|---|---|
| Apertura PR #57 | `25638828448` | ❌ Billing (3s) |
| Rerun manual | `25638828448` | ❌ Billing |
| Push commit `c6169a3` | `25638909280` | ❌ Billing (3s) |
| Rerun tras hacer repo público temporal | `25638909280` | ❌ Billing |

**Decisión**: merge directo a master sin CI verde para no bloquear el sprint
indefinidamente (sprint posterior 15D RC sigue bloqueado hasta cierre 15C.II).

**Validación local ejecutada antes del merge** (timestamp 2026-05-10):

| Check | Resultado | Comando |
|---|---|---|
| Backend unit tests | ✅ **576/581 verde** + 5 skipped (+21 nuevos: 53 sanitizer + 13 listener + 4 wrapper + 1 enhance integration) | `cd backend && npm test` |
| Backend lint:check | ✅ | `cd backend && npm run lint:check` |
| Backend typecheck | ✅ | `cd backend && npm run typecheck` |
| Frontend lint:check | ✅ `--max-warnings=0` | `cd frontend && npm run lint:check` |
| Frontend typecheck | ✅ | `cd frontend && npm run typecheck` |
| Stack boot real | ✅ Backend (3001) + Frontend (3002) + Mock Enhance (3099) + Docker stack arrancados. `NotificationsModule` carga el nuevo listener sin error DI | `npm run dev` |
| 0 regresiones vs Fase C | ✅ 505/510 → 576/581 (+21) | comparativa pre/post Fase D |

**Únicos checks NO ejecutados locally**: E2E test 7 nuevo (cliente
reset_account_password → mailpit → audit SQL). Riesgo bajo dado que cobertura
unitaria del listener (13 tests) + wrapper (4 tests) + integration enhance (1
test gap G2 R12) cubre todos los paths del flow excepto el último mile de
delivery via BullMQ + EmailChannel + Mailpit (que son piezas existentes ya
testeadas en Sprint 9.5).

**Validación retroactiva en Fase E**: el siguiente PR (Fase E) correrá CI
normalmente cuando se resuelva el billing GitHub Actions, validando tanto el
código nuevo Fase E como cualquier regresión retroactiva Fase D. Si algo se
rompiera (probabilidad baja), saldrá en el PR de Fase E + fix inmediato.

**Comentario formal en PR #57** documentando bypass:
[https://github.com/yasmindanailov/dashboard/pull/57#issuecomment-4416282677](https://github.com/yasmindanailov/dashboard/pull/57#issuecomment-4416282677)

**Action items operativos** (fuera del scope técnico del sprint, responsabilidad
operativa cuenta GitHub):

1. Resolver method of payment en https://github.com/settings/billing/payment_information
2. Revisar spending limit en https://github.com/settings/billing/spending_limit
3. Considerar optimización workflows: mover E2E (3 shards × ~10-20 min) a corrida solo en master (post-merge), no en cada PR — ahorra ~70% minutos CI dentro de los 2000 free/mes plan Free.

---

# Apéndice A.10 — Cierre Fase E + handoff a Fase F (2026-05-11)

> **Audiencia**: el siguiente agente que arranque Sprint 15C.II Fase F.
> **Pre-condición técnica**: PR Fase E ([#60](https://github.com/yasmindanailov/dashboard/pull/60)) mergeado a master.
> ✅ **Estado al cierre de Fase E (2026-05-11):** PR [#60](https://github.com/yasmindanailov/dashboard/pull/60) **mergeado a master** (squash-merge `1250a2e` 2026-05-11) vía **bypass policy §6** — CI GitHub Actions bloqueada por el incidente billing externo (§A.9.10), las 3 condiciones cumplidas (`pnpm ci:check:full` verde + boot real backend + documentación formal en 2 comentarios del PR), label `ready-for-e2e` añadida (E2E correrá cuando se resuelva el billing). Rama temporal `sprint15c-ii-fase-e-admin-dns-operations` eliminada tras merge. **Fase F arranca desde master** — sin pre-condición pendiente.
> **Tipo**: cierre Fase E (gold standard — decisión Yasmin "cada punto al más alto estándar") + handoff a F.

## A.10.1. Frase canónica de arranque Fase F (verbatim)

> ⚠ **SUPERSEDIDA por §A.11.3** (Fase F partida en F.1/F.2/F.3 — decisión Yasmin 2026-05-12). F.1 (suspend/unsuspend) **ya está mergeada a master** (PR #63 `b6675ed`) y materializó la suspensión como **inline actions** (NO los `wrappers suspendServiceWithAudit/unsuspendServiceWithAudit` que menciona la frase de abajo — ver §A.11.2 reconciliación). La frase canónica vigente para arrancar es la de **§A.11.3** (Fase F.2 — admin overview operativo). La de abajo se conserva como referencia histórica del thinking pre-split.

> *"Lee `docs/60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md` Apéndice A §A.10 (cierre Fase E + handoff a Fase F). Vamos con Sprint 15C.II Fase F — admin overview operativo del plugin Enhance (`/admin/settings/plugins/enhance-cp`): stats grid + tabla drifts + capability flag `supports_suspend` (ADR-077 Amendment A4 ya frozen) + 2 inline actions `suspend_service`/`unsuspend_service` + wrappers `suspendServiceWithAudit`/`unsuspendServiceWithAudit` + endpoints `/admin/services/:id/suspend|unsuspend` + listeners email `notifications-on-service-suspended`/`-unsuspended` + UI `AdminServiceOperationsCard` botón suspender/reanudar + banner amarillo suspended + cache TTL configurable (G4) + breaker EnhanceApiClient (G5 evaluar) + G8 bug test-connection + GAP-15CII-M `/admin/services/[id]/audit` + `/dashboard/services/[id]/audit` timeline per-service + GAP-15CII-N error_log persiste módulo origen. Lee §A.9.6.1 (suspend/unsuspend scope detallado transversal billing/abuse/GDPR). Crea rama `sprint15c-ii-fase-f-admin-overview-suspend` desde master post merge PR Fase E. Procede con rigor."*

## A.10.2. Estado real al cierre Fase E

**Alcance gold standard** (Yasmin pidió "cada punto al más alto estándar, profesional, riguroso y robusto" → se subió el listón sobre el plan acotado del dossier original: `recoveryHint` estructurado en vez de lista hardcoded; typing-confirm en cancelar; rename honesto `force_resync` → `recalculate_provider_metrics` con progressive disclosure; DNS UI nivel "console" con TTL presets + validación por kind + dedup + DNSSEC read-only; email de cancelación incluido en Fase E aunque el dossier lo había puesto en F).

**ADRs (2 amendments, backward-compatible, NO bump `contractVersion`):**

| Amendment | Resumen |
|---|---|
| **ADR-077 Amendment A5** | Campo opcional `recoveryHint?: 'reprovision' \| 'reconcile' \| 'contact_support'` en `ServiceInfo`. El plugin clasifica su drift; la UI ramifica por el contrato, NUNCA por `statusReason.endsWith(...)`. Cierra BUG-15CII-I por construcción. Invariante test contract. |
| **ADR-083 Amendment A5** | A5.1: rename slug `force_resync` → `recalculate_provider_metrics` + label "Recalcular métricas en el proveedor" + reubicación a `AdminServiceOperationsCard` (progressive disclosure) — **corrige A4.2** (que decía inexactamente "Reconciliar contra Enhance / comparar cache vs ground truth"; la acción hace `PUT calculate-resource-usage`, no reconcilia). A5.2: `getServiceInfo()` puebla `recoveryHint` (mapping table — incluye detección de `plan_divergence` → `'reconcile'`). A5.3: `list_dns_records` expone estado DNSSEC read-only en `result.data.zone.dnssec`. |

**Backend:**

| Área | Cambio |
|---|---|
| `core/provisioning/types.ts` | + tipo `ServiceRecoveryHint` + `ServiceInfo.recoveryHint?` |
| `core/provisioning/plugin-utils.ts` | fallback `buildUnknownStateFallback` declara `recoveryHint: 'contact_support'` (proveedor caído / circuit open → no re-aprovisionable) |
| `modules/provisioning/provisioning.service.ts` | `buildPluginNotRegisteredFallback` → `recoveryHint: 'contact_support'`. `deprovisionAsAdmin` → evento `service.cancelled` lleva `notify_client` (default true) + audit `changes_after.notify_client` |
| `modules/provisioning/dto/provisioning.dto.ts` | `DeprovisionDto` + `notify_client?: boolean` |
| `plugins/provisioners/enhance_cp/enhance.plugin.ts` | `getServiceInfo` puebla `recoveryHint` (reprovision para not_yet_provisioned/subscription_missing; reconcile para plan_divergence). rename `force_resync` → `recalculate_provider_metrics` (manifest + switch + método `actionRecalculateProviderMetrics`). `actionListDnsRecords` mapea `dnssec` cuando la zona lo trae. helper `readPositiveIntConfig` |
| `plugins/provisioners/enhance_cp/api/client.ts` | docstring `calculateResourceUsage` corregido |
| `modules/notifications/listeners/notifications-on-service-cancelled.listener.ts` (NUEVO) | consume `service.cancelled`; si `notify_client !== false` → `dispatchToUser('service.cancelled', {service_id, domain, support_url}, user_id)`. Patrón L11+L12 Fase D. Degradación elegante R7 |
| `modules/notifications/notifications.module.ts` | + registro del listener nuevo |
| `prisma/seeds/notification-templates.ts` | + templates `service.cancelled` (email HTML + campana interna) — genéricos, sin motivo interno ni nota del admin |

**Frontend:**

| Área | Cambio |
|---|---|
| `app/lib/api.ts` | + `ServiceRecoveryHint` + `ServiceInfo.recoveryHint?` + `DnsZoneDnssec` + `DnsZone.dnssec?` |
| `app/admin/services/[id]/page.tsx` (E.1) | `showReprovision = isDrift && info.recoveryHint === 'reprovision'` (era `statusReason.endsWith(...)`). DNS placeholder banner → `Card` con `Link` real a `/admin/services/[id]/dns`. `AdminServiceOperationsCard` recibe `serviceDisplayName`. Comentarios actualizados |
| `app/_shared/services/dns/_components/` (E.2 — **movidos** desde `dashboard/services/[id]/dns/_components/` vía `git mv`) | `DnsRecordsManager`, `DnsRecordForm`, `DnsExternallyBanner` ahora compartidos cliente/admin con prop `isAdmin` (back-links + paths de acción). `DnsRecordForm`: TTL presets dropdown + "Personalizado…" + validación client-side por kind (A=IPv4, AAAA=IPv6, CNAME/MX=FQDN, MX/SRV/CAA formato) + dedup (kind+name+value) + conflicto CNAME (RFC 1034 §3.6.2). `DnsRecordsManager`: Badge DNSSEC + nota propagación post-mutación + empty state pulido |
| `app/_shared/services/dns/_actions.ts` (E.2) | 4 acciones DNS + param `isAdmin` (helpers `dnsBasePath` / `dnsPagePath`) |
| `app/admin/services/[id]/dns/page.tsx` (NUEVO, E.2) | SC paralelo: `serverFetch('/admin/services/:id')` + `listDnsRecordsAction(id, true)` + delega a `<DnsRecordsManager isAdmin>` |
| `app/dashboard/services/[id]/dns/page.tsx` (E.2) | imports actualizados al nuevo path `_shared` |
| `app/_shared/services/_actions.ts` (E.3) | + `deprovisionServiceAction(serviceId, {reason, notes?, notify_client?})` |
| `app/admin/services/[id]/_components/CancelServiceModal.tsx` (NUEVO, E.3) | Modal DS: AlertBanner advertencia (irreversible, recurso eliminado, distinto de suspender) + `<Select>` motivo (3 valores canónicos) + `<Textarea>` nota interna + checkbox "Notificar al cliente" (default ON) + typing-confirm del `serviceDisplayName` + botón danger deshabilitado hasta match. Tras OK: toast + `router.refresh()` (NO redirect — el SC re-renderiza con banner terminal) |
| `app/admin/services/[id]/_components/AdminServiceOperationsCard.tsx` (E.3 — **reescrito**) | Se renderiza siempre (parent solo lo monta si `!isTerminal`). Botones: "Cambiar plan…" (si action disponible), "Recalcular métricas en el proveedor" (si action `recalculate_provider_metrics` disponible — con tooltip que la distingue de ↻ Refrescar y del cron L3), "Cancelar servicio…" (danger, siempre → `CancelServiceModal`). Recibe `serviceDisplayName` |
| `app/_shared/services/ActionsBar.tsx` (E.4) | `INTERNAL_HELPER_SLUGS` += `recalculate_provider_metrics` (ya no aparece como botón standalone en "Acciones rápidas" — se opera desde `AdminServiceOperationsCard`) |
| `app/_shared/i18n/translations-es.ts` (E.5) | `plugin.enhance_cp.actions.recalculate_provider_metrics` + `.description` + `.success` (reemplazan `force_resync*`). + `plugin.enhance_cp.status_reason.plan_divergence`. Recovery messages `action.invalid_state.admin` / `sso.error.invalid_state.admin` apuntan ahora a "Reconciliar todos los servicios ahora" en la página settings del plugin (= cron L3, lo correcto — `recalculate_provider_metrics` NO re-sincroniza el mapping enhance_customers) |

**Suites tests post Fase E:** backend **591/596 unit verde** + 5 skipped (+10 vs Fase D: 4 recoveryHint en enhance.plugin.spec + 1 DNSSEC en enhance.plugin.spec + 1 recalculate rename test + 1 plugin-utils fallback recoveryHint + 1 plugin-contract recoveryHint invariant + 8 notifications-on-service-cancelled.listener.spec (1 suite nueva) + 1 provisioning.service.spec notify_client — descontando ajustes). typecheck both verde + lint:check both verde. Frontend NO tiene framework de unit tests (solo Playwright e2e en `tests/e2e/`) — la cobertura de la lógica nueva del frontend la dan: (a) los tipos TS estrictos, (b) la extensión del E2E `sprint-15c-enhance-flow.spec.ts` (admin DNS CRUD + cancelar + recalcular), opt-in label `ready-for-e2e`.

**Gaps cerrados Fase E:**

| Gap | Estado |
|---|---|
| **BUG-15CII-I** heurística showReprovision no detecta `subscription_missing` | ✅ Cerrado Fase E (por contrato — `recoveryHint`, no heurística de string) |
| **GAP-15CII-J** UI admin cancelar servicio | ✅ Cerrado Fase E (`CancelServiceModal` + `deprovisionServiceAction` + email cliente) |
| **GAP-15CII-K** UI admin force_resync sin botón | ✅ Cerrado Fase E (renombrada `recalculate_provider_metrics` + reubicada a `AdminServiceOperationsCard` con etiquetado preciso — corrige Amendment A4.2) |
| **GAP-15CII-L** UI admin DNS records CRUD | ✅ Cerrado Fase E (`/admin/services/[id]/dns` reusando componentes shared + endpoints existentes; + gold-standard TTL presets + validación por kind + dedup + DNSSEC read-only) |

## A.10.3. Lecciones técnicas críticas Fase E (heredables — léelas antes de codear Fase F)

### L13 — La UI ramifica por contrato del plugin, NUNCA por display strings (`recoveryHint` doctrine)

**Doctrina canónica frozen 2026-05-11 (ADR-077 Amendment A5):** cuando la UI necesita decidir "qué acción de recuperación ofrecer para este drift", **el plugin clasifica** (campo declarativo `ServiceInfo.recoveryHint`) y **la UI ramifica por ese campo**. Está PROHIBIDO matchear `statusReason` por string (`endsWith('.status_reason.X')`) — `statusReason` es i18n display, no contrato de comportamiento. El anti-patrón "fix de 1 línea: un Set de claves i18n hardcodeado en el frontend" traslada el problema (cada plugin nuevo tiene que recordar añadir su clave a una lista en otro paquete). El patrón correcto vive en el contrato. Heredable: 15D RC (`redemptionPeriod` → `reprovision`?), 15E Docker (container OOM → `reconcile`?), 15G Plesk — cada plugin clasifica su drift al implementar `getServiceInfo()`.

### L14 — Naming honesto sobre conveniencia: renombrar slugs de inline action es seguro

**Doctrina canónica frozen 2026-05-11 (ADR-083 Amendment A5.1):** los slugs de `inlineActions` son **plugin-internos**, NO contrato externo estable (solo `ProvisionerPlugin.slug` es inmutable — ADR-077 §4+§6). Si un slug miente sobre lo que hace (`force_resync` → en realidad `calculate-resource-usage`), renombrarlo es la decisión correcta — se actualiza en el mismo PR el manifest + el switch + el método + `INTERNAL_HELPER_SLUGS` (frontend) + las claves i18n + los specs. Un Amendment A4.2 "renombramos el label pero mantenemos el slug por compat" fue una mala decisión — el label mentía igual de mal y el slug seguía sin reflejar la operación. Cuando descubras que algo está mal nombrado, corrígelo de raíz.

### L15 — "Demote, don't delete": progressive disclosure para operaciones de power-user

**Doctrina canónica frozen 2026-05-11:** cuando una operación FUNCIONA pero es de power-user / raro (`recalculate_provider_metrics`: pedir al proveedor que recalcule sus métricas internas — útil en el ~5% de casos), el estándar profesional NO es borrarla del UI ni dejarla solo-API. Es **progressive disclosure**: vive en la sección de operaciones avanzadas (`AdminServiceOperationsCard`), con etiquetado preciso + tooltip que la distingue inequívocamente de operaciones similares (↻ Refrescar = re-lee lo último; reconciliación cron L3 = detecta drift). El usuario que la necesita la encuentra; el que no, no tropieza con ella. Heredable a cualquier acción admin "rara pero legítima" de futuros plugins.

### L16 — Componentes compartidos cliente/admin: `_shared/` + prop `isAdmin`, NO duplicación

**Patrón canónico (Sprint 15C.II Fase E):** cuando una funcionalidad existe para cliente y admin con la misma UX pero distinta ruta de backend (`/services/:id/...` vs `/admin/services/:id/...`) y distintos back-links, la solución es: (1) componentes en `app/_shared/<dominio>/_components/`, (2) prop `isAdmin: boolean` que el SC parent deriva server-side y pasa hacia abajo, (3) server actions con param `isAdmin` que discrimina path + `revalidatePath` (igual que `refreshServiceInfoAction`). CERO duplicación de componentes. El backend es defense-in-depth: el endpoint `/admin/...` saltea ownership con `isAdmin=true`; el `/services/...` deriva `isAdmin` del rol y aplica el filtro. Heredable: 15D RC dominios, 15E Docker, cualquier feature cliente↔admin compartida.

### L17 — Flujo destructivo de grado profesional: el checklist completo

**Doctrina canónica frozen 2026-05-11 (`CancelServiceModal` como referencia):** una acción **irreversible y destructiva** en el panel admin lleva, en orden: (1) `AlertBanner` de advertencia honesta (qué se pierde, que es irreversible, alternativa menos drástica — "suspende en vez de cancelar"); (2) motivo canónico obligatorio (dropdown — taxonomía que va al audit log, NO se muestra al cliente); (3) nota interna opcional (audit log, NO cliente); (4) toggle "notificar al cliente" (default ON — desactivar solo casos especiales: fraude, test); (5) **typing-confirm** del identificador del recurso (estándar GitHub/AWS/Vercel/Stripe — botón danger deshabilitado hasta match exacto); (6) tras OK: toast + re-render (NO redirect — el detalle del recurso cancelado sigue siendo útil para el audit trail). Heredable a `suspend_service` (Fase F — aunque suspender NO necesita typing-confirm por ser reversible: variant warning, no danger), deprovision de futuros plugins, cualquier acción admin destructiva.

## A.10.4. Lo que NO está en Fase E (sigue para Fase F-G)

| Fase | Scope |
|---|---|
| **F** | Admin overview operativo plugin (`/admin/settings/plugins/enhance-cp`) — stats grid 4 cards + tabla recent drifts + componente reusable `<PluginOperationalOverview slug>` (ADR-083 A4.4). Capability flag `supports_suspend` (ADR-077 Amendment A4 ya frozen) + 2 inline actions `suspend_service`/`unsuspend_service` + wrappers `suspendServiceWithAudit`/`unsuspendServiceWithAudit` + endpoints `/admin/services/:id/suspend\|unsuspend` + listeners email `notifications-on-service-suspended`/`-unsuspended` + templates `service.suspended`/`service.unsuspended` + UI `AdminServiceOperationsCard` botón "Suspender servicio…" (variant warning) / "Reanudar servicio" + banner amarillo suspended con `suspension_reason` + `suspended_at`. **Todo el detalle transversal billing/abuse/GDPR/maintenance está en §A.9.6.1 — léelo entero.** + cache TTL configurable (G4) + breaker EnhanceApiClient (G5 evaluar criticidad) + G8 bug test-connection synthetic service sin metadata + **GAP-15CII-M** `/admin/services/[id]/audit` (admin sin filtro) + `/dashboard/services/[id]/audit` (cliente con filtro GDPR) timeline per-service union de `audit_change_log` + `audit_access_log` filtrado por `entity_id=service.id` + **GAP-15CII-N** wrapper canónico invoca `ErrorLogService.log()` con `module='provisioning.plugin-utils'` (o equiv.) antes de rethrow al exception filter |
| **G** | Tests críticos faltantes (8 áreas — ver §A.2 coverage gaps) + E2E spec extension cubriendo Fase E + Fase F + retrospectiva en `completed/sprint-15c-ii-hardening-enhance.md` (patrón canónico: header retrospectiva + dossier original como anexo) + smoke final Yasmin contra mock + Enhance live |

**Nota Fase F sobre `recoveryHint`:** `getServiceInfo()` ya detecta `plan_divergence` → `recoveryHint: 'reconcile'`. El `AdminDriftBanner` (frontend) ramifica hoy solo `'reprovision'` (botón "Re-aprovisionar"). Fase F (que añade el endpoint reconcile-all + el overview) puede cablear el botón "Reconciliar este servicio" cuando `recoveryHint === 'reconcile'` (invoca el cron L3 single-shot). El contrato ya está; falta solo el wiring del CTA.

## A.10.5. Gaps audit estado actual (post Fase E)

| ID | Estado |
|---|---|
| **G1** vaporware endpoint manual cron | ✅ Cerrado Fase B |
| **G2** sanitización data.password en wrapper auditor | ✅ Cerrado Fase D |
| **G3** capability flag `supports_suspend` + suspend/unsuspend actions | ⏳ Fase F |
| **G4** TTL cache 60s hardcoded | ⏳ Fase F |
| **G5** CircuitBreaker en EnhanceApiClient | ⏳ Fase F (evaluar criticidad) |
| **G6 / G6b / G7** | ✅ Cerrados Fase C round 1 |
| **G8** test-connection synthetic service sin metadata | ⏳ Fase F |
| **G9** `<CopyableId>` + `<AdminServiceDataCard>` heredables admin pages | Diferido a sprint Clients refactor |
| **BUG-15CII-I** heurística showReprovision | ✅ **Cerrado Fase E** (por contrato `recoveryHint`) |
| **GAP-15CII-J** UI admin cancelar servicio | ✅ **Cerrado Fase E** (modal + email cliente) |
| **GAP-15CII-K** UI admin force_resync | ✅ **Cerrado Fase E** (renombrada `recalculate_provider_metrics` + reubicada — corrige A4.2) |
| **GAP-15CII-L** UI admin DNS records CRUD | ✅ **Cerrado Fase E** (gold standard: presets + validación por kind + dedup + DNSSEC read-only) |
| **GAP-15CII-M** página `/admin/services/[id]/audit` timeline per-service | ⏳ Fase F |
| **GAP-15CII-N** error_log persiste módulo origen (no `http`) | ⏳ Fase F |
| **DC.NEW-15C-DNSSEC** gestión DNSSEC (activar/rotar) | Diferido v1.x (Fase E añade solo visibilidad read-only del estado) |

## A.10.6. Validación end-to-end del estado actual (post Fase E)

**Validación local ejecutada (timestamp 2026-05-11) — bar del [`local-ci-playbook`](../90-meta/local-ci-playbook.md) §4 (cierre de fase) + §6 (bypass policy):**

| Check | Resultado | Comando |
|---|---|---|
| `pnpm ci:check:full` (raíz — backend typecheck+lint+tests+build, frontend typecheck+lint+build) | ✅ | `pnpm run ci:check:full` |
| └ Backend unit tests | ✅ **591/596 verde** + 5 skipped (45 suites, +1 nueva: notifications-on-service-cancelled.listener.spec) | (incluido en ci:check:full) |
| └ Backend `nest build` | ✅ | (incluido) |
| └ Frontend `next build` | ✅ "✓ Compiled successfully" (incl. ruta nueva `/admin/services/[id]/dns`) | (incluido) |
| Boot real backend | ✅ `Nest application successfully started`, DI sin errores de resolución (incl. listener nuevo `NotificationsOnServiceCancelledListener`), 4 rutas admin DNS mapeadas | `cd backend && npm run start` |
| E2E spec carga | ✅ 10 tests listados (`playwright test --list tests/e2e/sprint-15c-enhance-flow.spec.ts`) — +3 nuevos (8 admin DNS CRUD, 9 recalculate metrics, 10 deprovision + mailpit `service.cancelled` + audit `notify_client`) | `npx playwright test --list ...` |

**Estado CI / E2E:** el workflow GitHub Actions estaba bloqueado por el incidente billing externo (§A.9.10) — los jobs Backend/Frontend morían en ~4 s sin logs (misma firma que PR #57). PR #60 **mergeado a master vía bypass policy §6** (squash-merge `1250a2e` 2026-05-11) — las 3 condiciones cumplidas (ver comentarios del PR). El PR llevaba la **label `ready-for-e2e`** (creada en el repo en Fase E — no existía); cuando se resuelva el billing, la CI del push a master arranca Backend + Frontend + los 3 shards E2E (red de seguridad post-merge). Smoke real Yasmin contra mock-enhance-server + Enhance live recomendado antes de cerrar Sprint 15C.II en Fase G; corrida E2E local opcional vía `pnpm ci:e2e` (~10-15 min, requiere stack Docker levantado).

## A.10.7. Sesiones origen Fase E

- 2026-05-11 (Fase E gold standard — decisión Yasmin "cada punto al más alto estándar": ADR-077 A5 + ADR-083 A5 + recoveryHint + rename recalculate_provider_metrics + DNS UI hardening + CancelServiceModal con typing-confirm + email cancelación + tests + lint + typecheck verde) → este §A.10

---

# Apéndice A.11 — Fase F partida en F.1/F.2/F.3 + cierre F.1 + handoff a F.2 (2026-05-12)

> **Audiencia**: el siguiente agente que arranque Sprint 15C.II Fase F.2.
> **Decisión Yasmin (2026-05-12, vía AskUserQuestion):** Fase F es grande
> (suspend/unsuspend transversal + overview operativo + audit timeline GAP-M +
> GAP-N + G4/G5/G8 + wiring `recoveryHint`); se entrega en **3 sub-PRs
> encadenados** F.1 → F.2 → F.3 (NO un solo PR ni la rama monolítica
> `sprint15c-ii-fase-f-admin-overview-suspend` del handoff §A.10.1). También
> decidió: en el timeline GDPR del cliente, los eventos de impersonación admin
> se muestran **con detalle** (nombre del agente + motivo) — máxima transparencia.

## A.11.1. Fase F → F.1 / F.2 / F.3

| Sub-PR | Scope | Estado |
|---|---|---|
| **F.1** | suspend/unsuspend completo (capability `supports_suspend` materializada como **inline actions** + plugin Enhance + orquestador `suspendAsAdmin`/`unsuspendAsAdmin` + endpoints `POST /admin/services/:id/suspend\|unsuspend` + listeners email + 4 plantillas + frontend `SuspendServiceModal` + banner amarillo + i18n + contract test + `getInfoForUser` summary `suspended_at`/`suspension_reason` + `getServiceInfo` statusReason i18n key). | ✅ **CERRADA, mergeada a master** — PR [#63](https://github.com/yasmindanailov/dashboard/pull/63) squash-merge `b6675ed` 2026-05-12 (bypass policy §6 — CI GitHub bloqueada billing externo §A.9.10; `pnpm ci:check:full` verde + boot real backend + doc formal en el PR; rama temporal eliminada). Commits originales: round 1 `f5414fb` (backend) + round 2 `88594bd` (frontend) + round 3 `5470eea` (doc-sync + listener defensivo legacy + dossier) |
| **F.2** | admin overview operativo `/admin/settings/plugins/[slug]` (página existente — hoy solo config form + reconcile-all): componente reusable `<PluginOperationalOverview slug>` (ADR-083 A4.4) + badge salud top-line ("Operativo / Degradado / Caído" derivado de `CircuitBreakerRegistry.getState()` + última reconciliación OK + secret válido) + stats grid 4 cards (services activos / suspendidos / drifts 24h / circuit breaker state) + "última reconciliación hace Xh · próxima en Yh" + tabla recent drifts (query `audit_change_log WHERE action LIKE 'service.reconciled%' AND created_at > now()-24h` — no hay tabla `plugin_drift_log`, v1.x; cada fila enlaza a `/admin/services/[id]/audit` de F.3) + reconcile-all (ya existe) + test conexión (ya existe) + form config/secrets (ya existe). El breaker state vía `getState()` es in-process — etiquetar "estado en esta instancia". | ✅ **CERRADA, mergeada a master** — PR [#65](https://github.com/yasmindanailov/dashboard/pull/65) squash-merge `2a3cce8` 2026-05-12 (bypass policy §6 — CI GitHub bloqueada billing externo; `pnpm ci:check:full` verde + boot real backend + doc formal en el PR; rama temporal eliminada) + post-merge doc-sync PR [#66](https://github.com/yasmindanailov/dashboard/pull/66) `d619f2f`. [ADR-083 Amendment A6](../10-decisions/adr-083-plugin-enhance-cp-specifics.md#amendments). **Correcciones sobre el apuntado** (ver §A.11.7): (1) el query de drifts NO es `action LIKE 'service.reconciled%'` sino `entity_type='Service' AND action='reconciled_external_change' AND created_at > now()-24h` filtrado por `changes_after._meta.plugin_slug` — `service.reconciled_external_change` es el nombre del **evento**, no del `action` persistido; (2) componente en `frontend/app/_shared/plugins/PluginOperationalOverview.tsx` (no en `[slug]/_components/`) — A4.4 ya lo fijaba; (3) "última reconciliación" = **estado observado** vía evento rollup nuevo `plugin.reconcile_completed` (cron + manual) → audit `reconcile_completed` (no inferido del schedule — decisión Yasmin); (4) "próxima en Yh" derivada del `intervalSeconds` que el plugin declara a `ReconcileRegistryService.register(slug, executor, { intervalSeconds })`; (5) cada fila de drift enlaza a `/admin/services/[id]` (existe) — repunta a `…/audit` en F.3. `ci:check` verde (637 passed + 5 skipped, 48 suites). | 
| **F.3** | cierre Fase F: **GAP-15CII-M** `/admin/services/[id]/audit` (admin sin filtro) + `/dashboard/services/[id]/audit` (cliente con whitelist explícita de `action`s; **incluye `service.admin_sso_impersonation` con detalle** — decisión Yasmin 2026-05-12; cursor pagination `created_at`+`id`; renderer timeline reusable; **migración: índice de expresión `audit_access_log ((metadata->>'resource_id'))`** — la mitad access-log del union filtra hoy por path JSONB sin índice; `audit_change_log.entity_id` ya está indexado) + **GAP-15CII-N** (`ProvisionerPluginError.module?` opcional leído por `GlobalExceptionFilter` → log-once con el módulo correcto, no `module='http'`; el orquestador/wrapper setea `module` al construir/rethrow) + **G4** cache TTL configurable desde manifest opcional (sanity floor ~5s) + **G5** NO breaker anidado en `EnhanceApiClient` (ya tiene timeout 30s `AbortController` — evaluar bajarlo a ~15s para fail-fast BullMQ + documentar; mover el breaker único a envolver el HTTP client es refactor con blast-radius → diferido v1.1) + **G8** bug test-connection synthetic service sin metadata + **wiring CTA** "Reconciliar este servicio" en `AdminDriftBanner` cuando `info.recoveryHint === 'reconcile'` (el contrato ya está — `getServiceInfo` detecta `plan_divergence` → `'reconcile'`; falta el wiring del CTA single-shot del cron L3). | ✅ **CERRADA, mergeada a master** — PR [#67](https://github.com/yasmindanailov/dashboard/pull/67) squash-merge `2a33850` 2026-05-12 (bypass policy §6 — CI GitHub bloqueada billing externo §A.9.10: jobs Backend `fail 3s` / Frontend `fail 11s`; las 3 condiciones cumplidas: motivo externo + `pnpm ci:check:full` verde [49 suites, 664 passed + 5 skipped; `nest build` + `next build`] + boot real backend [rutas `/api/v1/(admin/)services/:id/audit` (GET) + `…/refresh` (POST) mapeadas, DI sin errores] + doc formal en el cuerpo del PR; rama temporal eliminada; label `ready-for-e2e`) → post-merge doc-sync (patrón #61/#64/#66). **Materializado**: GAP-M ✅ + GAP-N ✅ + G8 ✅ + G4/G5 ✅ + CTA reconcile ✅ + **B.1** (cooldown server-side del force-refresh per-`serviceId` en Redis — `ProvisioningCacheService.tryAcquireRefreshCooldown` `SET NX EX` fail-OPEN; `getInfoForUser` coalescing a cache si ventana activa; cliente+admin comparten ventana; decisión: Redis per-servicio, **NO `@Throttle` por IP**) ✅ + **B.2** (`plugin.reconcile_completed` en el catálogo §6 de ADR-080) ✅. **ADRs nuevos**: [ADR-083 Amendment A7](../10-decisions/adr-083-plugin-enhance-cp-specifics.md#amendments) (registro comprensivo de toda F.3 — A7.1-A7.9) + [ADR-077 Amendment A6](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments) (`testConnection?()` 7º método opcional + `ProvisionerPluginError.module?`) + [ADR-080 Amendment C](../10-decisions/adr-080-plugin-framework.md#amendments) (`PluginManifest.serviceInfoCacheTtlSeconds?` — patrón B.5 del propio ADR-080). Backlog nuevo `DC.NEW-15CII-RECONCILE-SINGLE` = **DC.45**. Commits originales en la rama: `6c84b13`/`c7b6b71`/`826a9ee`/`6e5752e`/`7d27607` (GAP-M) + `5c409f6` (GAP-N) + `ccf571b` (G8) + `36ab549` (G4+G5) + `a24ea48` (CTA) + `1179731` (handoff §A.11.9) + `5640a8e` (B.1) + `0532012` (B.2) + `25cc3e3` (doc-sync close-out). **Handoff/registro completo §A.11.9.** |
| **F.4** | **Robustez del status de suspensión** — `getInfoForUser` reconcilia el status administrativo (si `service.status==='suspended'` ⇒ `info.status='suspended'` override + `availableActions` re-filtrado [fuera `suspend_service`, dentro `unsuspend_service`] + flag `provider_state_desync` en el summary; `services.status` autoritativo para el lifecycle *administrativo*, distinto de DH-INV-6 que aplica al *operacional*; capa orquestador, heredable; NO toca el contrato `ProvisionerPlugin`) + banner de suspensión para el cliente con CTA por motivo (`overdue_payment`→regulariza pago / resto→soporte) + aviso de desync en la UI admin. **Arregla el estado roto descubierto en testing** (servicio suspendido con BD `suspended` pero proveedor `isSuspended:false` → banner sin botón "Reanudar"; desync inverso → `409 SERVICE_NOT_SUSPENDED` en un botón visible). Detalle §A.11.10.1. | ✅ **CERRADA, mergeada a master** — PR [#70](https://github.com/yasmindanailov/dashboard/pull/70) squash-merge `283791c` 2026-05-12 (bypass policy §6 — 6ª aplicación; CI GitHub billing-bloqueada §A.9.10; las 3 condiciones cumplidas: motivo externo + `pnpm ci:check:full` verde [49 suites, 674 passed + 5 skipped; `nest build` + `next build`] + boot real backend verificado [rutas `POST /api/v1/admin/services/:id/resync-provider-state` mapeada, DI sin errores] + sección formal en el cuerpo del PR; rama temporal eliminada; label `ready-for-e2e`) → post-merge doc-sync (patrón #61/#64/#66/#68). **Materializado**: F.4.1 (`getInfoForUser` override + `summary.provider_state_desync` — generalizado a "proveedor accesible e `info.status !== services.status`": cubre `active`↔`suspended` **y** `cancelled`/`expired` reportado por el proveedor mientras Aelium lo tiene `suspended`, caso del `MockEnhanceServer` reiniciado — + re-derivación de `availableActions` vía `filterActionsByStatus` promovido a `core/provisioning/plugin-utils.ts`) ✅ + **F.4.3b** (decisión 2 de la valoración pre-código — `resyncProviderStateAsAdmin` + `POST /admin/services/:id/resync-provider-state`, sin transición de lifecycle, idempotente, audit `service_provider_state_resync_admin`) ✅ + F.4.2 (banner suspensión cliente + CTA por motivo + oculta SSO/ActionsBar/DNS) ✅ + F.4.3 (`<AdminProviderStateDesyncBanner>` + botón "Realinear estado del proveedor") ✅ + tests backend (override en ambas direcciones + proveedor `cancelled` + proveedor `unknown` no afirma desync + plugin sin `supports_suspend`; resync 5 casos) ✅. **ADRs**: [ADR-082 Amendment A1](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md#amendments) (lifecycle administrativo vs operacional / alcance de DH-INV-6) + [ADR-070 Amendment A1](../10-decisions/adr-070-service-info-sso-acciones-curadas.md#amendments); **ADR-077 sin cambios** (capa orquestador + UI — el `provider_state_desync` vive en el summary, no en `ServiceInfo`). Decisiones de la valoración pre-código (4) + ampliación 2026-05-12 (caso mock reiniciado) en **§A.11.10.1.1**. Commit en la rama: `eba5cea`. |
| **F.5** | **`DC.44` billing-suspend-unify** — `ServiceLifecycleWorker.autoSuspendServices` (cron impago) → `ProvisioningService.suspendAsAdmin(serviceId,{reason:'overdue_payment'},<actor sistema>,{notify_client:true})` en vez de su propio `prisma.update` + forma reducida; convención "actor sistema" (`actor_user_id:null` + `metadata.actor:'system:billing-overdue-cron'`); auto-reactivación al pagar (`billing-on-invoice-paid` listener → `unsuspendAsAdmin`); decidir si `suspendAsAdmin` permite plugins `supports_suspend=false` para el caso impago. Toca el módulo billing — separada de F.4. Detalle §A.11.10.2. | ✅ **CERRADA, mergeada a master** — PR [#72](https://github.com/yasmindanailov/dashboard/pull/72) squash-merge `72a8b0f` 2026-05-13 (bypass policy §6, 7ª aplicación — CI GitHub billing-bloqueada §A.9.10; `pnpm ci:check:full` verde [51 suites, 691 passed + 5 skipped] + boot real verificado [`BillingModule`→`ProvisioningModule` sin ciclo; `ReactivateServicesOnInvoicePaidListener` registrado] + doc formal en el cuerpo del PR; rama temporal eliminada; label `ready-for-e2e`) → post-merge doc-sync (patrón #61/#64/#66/#68/#71). **Materializado**: F.5.1 worker→`suspendAsAdmin` (idempotente; arregla de paso el bug del `prisma.update` crudo que revivía servicios cancelados) ✅ + F.5.2 convención "actor sistema" (plumbing en `suspendAsAdmin`/`unsuspendAsAdmin`/`ExecuteActionContext`: `actorUserId: string \| null` + `actorLabel?`; sin `audit_access_log`; `notifications-on-service-suspended` sin path legacy) ✅ + F.5.3 `reactivateSuspendedServiceOnPayment` (solo reactiva si motivo `overdue_payment`) + `ReactivateServicesOnInvoicePaidListener` ✅ + decisión pre-código `allowUnsupported: true` (punto único de transición de estado) ✅ + refinamiento F.4.1 (override `info.status='suspended'` para todo plugin; flag `provider_state_desync` sigue gated en `supports_suspend`) ✅ + tests (`provisioning.service.spec` +7; `service-lifecycle.worker.spec` NUEVO ×5; `reactivate-services-on-invoice-paid.listener.spec` NUEVO ×4; `notifications-on-service-suspended.spec` actualizado). **ADR-077 sin cambios.** Detalle/decisiones en §A.11.10.2. Commit en la rama: `dbf5a3a`. (`DC.44` materializado; `backlog.md` actualizado.) Diferidos apuntados (fuera de scope F.5 — L18): `autoCancelServices`→`deprovisionAsAdmin` (sería destructivo; candidato a fase aparte) + unificar `service.resumed`↔`service.unsuspended` (conceptos distintos). |
| **F.6** | **Notas operativas vía `ClientNote`** (sistema transversal Sprint 16 / ADR-079) — cancelar/suspender/reactivar manual → nota **obligatoria** en el modal → `ClientNote` `source_system='service'` + `source_id=serviceId` + `triggered_by_action='service.cancelled'\|'service.suspended'\|'service.unsuspended'`; auto-suspensión por impago (F.5) → `ClientNote` auto (`triggered_by_action='service.auto_suspended_overdue'`); el motivo-enum sigue como **campo** del banner del servicio (categórico); el detalle del servicio renderiza sus notas inline + salen en `/admin/clients/[id]` → "Notas" como las de los demás módulos; "añadir nota" del admin = `ClientNote` `triggered_by_action='manual_entry'`. **Supersede el `service_notes` table** (no se crea tabla nueva). Detalle §A.11.10.3. | ✅ **CERRADA, mergeada a master** — PR [#75](https://github.com/yasmindanailov/dashboard/pull/75) squash-merge `c9802e4` 2026-05-13 (bypass policy §6, **9ª aplicación** — CI GitHub billing-bloqueada §A.9.10; las 3 condiciones cumplidas: motivo externo + `pnpm ci:check:full` verde [backend 51 suites, 691 passed + 5 skipped + `nest build`; frontend typecheck + lint + `next build`] + boot real backend verificado [rutas `POST /api/v1/admin/services/:id/(suspend\|unsuspend)` aceptan el nuevo `internal_note` obligatorio, `GET /api/v1/admin/services/:id/notes` mapeada, `ClientsModule` importado en `ProvisioningModule` sin ciclo, `ReactivateServicesOnInvoicePaidListener` carga `invoice_number`, `DI` sin errores] + sección formal en el cuerpo del PR; rama temporal eliminada; label `ready-for-e2e`) → post-merge doc-sync (patrón #61/#64/#66/#68/#71/#73). **Materializado**: F.6.1 `ClientNote` para las 4 transiciones (`createFromServiceLifecycleAction(input, tx?)` direct-call desde `ProvisioningService.suspend\|unsuspend\|deprovisionAsAdmin` — patrón canónico Sprint 16; `source_system='service'`, `category='lifecycle'`, `triggered_by_action` ∈ 5 valores nuevos) ✅ + F.6.2 separación enum↔narrativa (`services.suspension_reason`/`cancellation_reason` guardan **solo** el motivo-enum; la nota libre vive en `ClientNote.body`; `parseSuspensionReasonCode` defensivo a ambos formatos) ✅ + F.6.3 dos vistas, una entidad (`<ServiceNotesCard>` SC nuevo inline en `/admin/services/[id]` consumiendo `GET /admin/services/:id/notes` con `@AuditAccess('Service')` — GDPR transparency; `<ClientNotesTab>` federada renderiza `service`/`lifecycle` + link `/admin/services/[id]`) ✅ + F.6.4 migración data one-shot (`20260513090001_..._data` split del `"<motivo>: <nota>"` legacy + `ClientNote` retroactivos con `author_id=NULL` + sufijo `[Migración 2026-05-13 — autor original no registrado]` + `created_at` preservado de `suspended_at\|cancelled_at`; idempotente — filas sin `": "` se ignoran) ✅ + **R1 firma simétrica** (`UnsuspendServiceDto { internal_note?: string }` + `unsuspendAsAdmin(id, dto, actor, ctx?, opts?)` paralela a sus hermanos; `unsuspendServiceAction` frontend pasa el body) ✅ + **R2 validación backend defense-in-depth** (`internal_note`/`notes` obligatorios si `actorUserId !== null` en `suspend`/`unsuspend`/`deprovisionAsAdmin`; path sistema exento — cron + listener auto-reactivar) ✅ + **R3 atomicidad** (`prisma.$transaction(async (tx) => { service.update + clientNote.create })`; plugin call + cache + eventos + audit quedan FUERA — asimétricos por naturaleza; `createFromServiceLifecycleAction` acepta `tx?: Prisma.TransactionClient` opcional) ✅. **Schema**: `NoteSourceSystem.service` (6º) + `NoteCategory.lifecycle` (8º) + `ClientNote.author_id` NULLABLE con FK `ON DELETE SET NULL` — convención "actor sistema = NULL" heredada de F.5 (`audit_change_log.user_id`). **Frontend**: `<SuspendServiceModal>` extendido modo `unsuspend` con nota obligatoria + modo `suspend` con nota obligatoria (antes opcional); `<CancelServiceModal>` regla `canSubmit = typedMatches && noteValid && !submitting`; `<ServiceNotesCard>` fail-soft (try/catch del fetch) + `<Link>` Next App Router. **Endpoint nuevo**: `GET /admin/services/:id/notes` (triple guard + `@CheckPolicies(Read Service)` + `@AuditAccess('Service')`). **Listener**: `ReactivateServicesOnInvoicePaidListener` carga `invoice.invoice_number` + `reactivateSuspendedServiceOnPayment(serviceId, invoiceNumber)` compone el body como `"Reactivado automáticamente al pagar la factura N"`. **Cron** `autoSuspendServices` pasa body self-descriptive `"Suspendido automáticamente por impago — Factura N"` que aterriza directo en `ClientNote.body`. **ADRs**: [ADR-079 Amendment A4](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md#a4--notas-operativas-de-lifecycle-de-servicio--actor-sistema-nullable-2026-05-13) (formaliza enums + `author_id` nullable + 5 nuevos `triggered_by_action` + `createFromServiceLifecycleAction(input, tx?)` + `findByService` + endpoint + separación enum↔narrativa + migración data + L19 candidata). **ADR-077 sin cambios** (R1/R2/R3 son capa orquestador + DTOs; el contrato `ProvisionerPlugin` intacto). **Lección heredable candidata L19** (a confirmar en G.4 retro): *"Las transiciones de lifecycle de un servicio + su `ClientNote` correspondiente viven en la misma transacción Prisma. Plugin call + eventos + cache invalidations + audit quedan FUERA (asimétricos por naturaleza: provider call idempotente por contrato A4.4, listeners consumen estado committed, audit con política propia). Heredable a cualquier futuro plugin que añada operaciones de lifecycle admin."* Cierre commit-by-commit + decisiones reales tomadas en **§A.11.10.3.3**. Backlog: `DC.46` apuntado (auto-cancel-unify deferido — destructivo, decisión Yasmin 2026-05-13) + naming `notes`↔`internal_note` (`DeprovisionDto`) apuntado para alineación post-15C.II. Commits originales en la rama: `e308b19` (feat F.6) + `eb5fd8b` (chore fixes auditoría — `@AuditAccess` en endpoint notes + Next `<Link>` en ServiceNotesCard). |
| **F.7** | **SSL/TLS status read-only** — `EnhanceApiClient` lee el estado del cert que Enhance gestiona (path orchd a verificar en el OAS); `getServiceInfo` gana `ssl?: { status: 'valid'\|'expiring_soon'\|'expired'\|'none'; expiresAt?; autoRenew?; issuer? }` (additivo opcional, mismo patrón que `metrics`/`recoveryHint`) + card en el detalle cliente/admin (`_shared/services/SslStatusCard.tsx`, prop `isAdmin` — L16) con badge verde/ámbar/rojo. Read-only — Aelium NO gestiona el cert (DH-INV-6); para renovar/cambiar → SSO al panel. Detalle §A.11.10.4. | ✅ **CERRADA, mergeada a master** — PR [#77](https://github.com/yasmindanailov/dashboard/pull/77) squash-merge `8b8bc47` 2026-05-14 (bypass policy §6, **10ª aplicación** — CI GitHub billing-bloqueada §A.9.10; las 3 condiciones cumplidas: motivo externo + `pnpm ci:check:full` verde [backend 51 suites, **712 passed + 5 skipped** = +21 vs F.6, + `nest build`; frontend `tsc --noEmit` + `eslint --max-warnings=0` + `next build`] + boot real backend verificado [`Nest application successfully started`, DI sin errores] + **smoke real Yasmin** verificado contra `MockEnhanceServer` (3/3 escenarios visuales: card `valid` cliente con LE auto-seedeado 60d + admin tooltip ISO + servicio terminal sin card) + sección formal en el cuerpo del PR; rama temporal eliminada; label `ready-for-e2e`) → post-merge doc-sync (patrón #61/#64/#66/#68/#71/#73/#76). **Materializado**: F.7.1 backend (`ServiceSslStatus`/`ServiceSslSummary`/`ServiceInfo.ssl?` en `core/provisioning/types.ts` + `EnhanceApiClient.getDomainSsl(domainId)` que captura `INVALID_STATE` 404 → `null` y re-lanza el resto + `getServiceInfo` añade `getWebsite` al `Promise.all` + helpers exportados `buildSslSummary`/`detectAutoRenew`/`parseEnhanceCertDate` + constante `SSL_EXPIRING_SOON_MS = 14 * 24 * 60 * 60 * 1000` server-side; `MockEnhanceServer` extendido con `state.domainSsls` Map + endpoint `GET /v2/domains/:domainId/ssl` + auto-seed LE 60d con `forceHttps:true` al `POST /websites` + `seed.domainSsls` opcional + cleanup en `DELETE /websites/:id`) ✅ + F.7.2 frontend (`<SslStatusCard>` SC nuevo en `_shared/services/` con prop `isAdmin` — L16 NO duplicación; server-component compatible sin hooks ni estado, patrón `<MetricsBar>` puro; badge variant por status; auto-renew sólo si definido; issuer display-only; admin extras condicionales [tooltip con fecha ISO + CTA SSO opcional `ssoPanelHref`]; +13 keys `service.ssl.*` en `translations-es.ts` patrón canónico Sprint 15C Fase 15C.I `t()`; barrel `_shared/services/index.ts`; types espejo en `lib/api.ts`; wired en `/dashboard/services/[id]` y `/admin/services/[id]` gateado `!isTerminal && info.ssl`) ✅ + **R1** umbral fijo 14d (industry standard ACME/LE; YAGNI vs setting per-plugin; cálculo server-side) ✅ + **R2** card único `_shared/` con prop `isAdmin` (admin gana tooltip ISO + CTA SSO opcional) ✅ + **R3** `status='none'` muestra card visible (badge gris + texto informativo "Sin certificado SSL — el sitio aparecerá como 'No seguro' en navegadores"); NO `AlertBanner` aparte (UI_SPEC §4.3) ✅ + tests (+21 casos: 8 `getServiceInfo > ssl` deterministas con `jest.useFakeTimers()` cubriendo `valid`/`expiring_soon`/`boundary 14d`/`expired`/`none`/`website-fails`/`ssl-throws-no-INVALID_STATE`/`expires-ilegible` + 3 `detectAutoRenew` + 3 `parseEnhanceCertDate` + 1 invariante de contrato A7.3 [`status ∈ enum + expiresAt parseable + status='none' ⇒ sin expiresAt`] + 4 client unit [200/404→null/500→throws/401→PROVIDER_AUTH_FAILED] + 3 client integration [auto-seed LE end-to-end + unknown domainId → null + seed.domainSsls custom DigiCert]) ✅. **ADRs**: [ADR-077 Amendment A7](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments) (`ServiceInfo.ssl?` opcional, mismo patrón A5/A6 — additivo, NO bumpea `contractVersion`) + [ADR-083 Amendment A8](../10-decisions/adr-083-plugin-enhance-cp-specifics.md#amendments) (probe SSL Enhance — endpoint OAS line 8452 + mapeo de campos + heurística `detectAutoRenew` regex `/let'?s\s*encrypt/i` + threshold canónico 14d). **ADR-077 A7 + ADR-083 A8 frozen 2026-05-13.** **Tests RTL ausentes por diseño**: frontend NO tiene runner Jest/Vitest (verificación = `tsc --noEmit` + `eslint --max-warnings=0` + `next build`); comportamiento visual del card se cubre en G.2 (E2E spec extension). **Decisión**: commit 5 (validación) plegado en el PR body porque no requirió bumps de fixtures ni updates `wc -l` material; el patrón heredable (ver §A.11.10.4.3) es "commit 5 opcional cuando ci:check:full + boot smoke no requieren cambios de archivos". **Heredable** a 15D RC / 15E Docker / 15G Plesk: cualquier plugin que pueda leer el cert puebla `ssl?`; los que no, lo omiten y el card no aparece (capability-driven sin flag nuevo en `PluginCapabilities`). Cierre commit-by-commit + decisiones reales en **§A.11.10.4.3**. Commits originales en la rama: `849ba51` (docs) + `492bd8a` (feat backend) + `32fd353` (test backend) + `46c9cf4` (feat frontend). |
| **F.8** | **Alertas de cuota** — setting `provisioning.enhance_cp.quota_alert_threshold_pct` (default 85, editable en `/admin/settings/plugins/enhance-cp`) + aviso visual en `MetricsBar` cuando un recurso (disco/ancho-banda) cruza el umbral (barra ámbar/roja + "estás al X% de tu cuota de disco") + notificación al cliente al cruzar (el reconcile L3 o un cron detecta el cruce; persiste "última notif por recurso" para no spamear → emite `service.quota_threshold_crossed` → listener `notifications-on-service-quota-threshold` → email + campana + plantilla seedeada). Heredable a cualquier plugin con `has_metrics`. Detalle §A.11.10.5. | ⏳ — rama `sprint15c-ii-fase-f8-quota-alerts`. Posible tabla `service_quota_alerts` o campo en `services.metadata` (decidir pre-código). |
| **F.9** | **Reconciliación per-servicio (`DC.45`)** — `ProvisionerPlugin.reconcileOne?(service)` opcional (ADR-077 amendment, mismo patrón que A6 `testConnection?()`) + `ReconcileRegistryService.reconcileOne(slug,service)` + `ProvisioningService.reconcileServiceAsAdmin` + endpoint `POST /admin/services/:id/reconcile` + Enhance implementa `reconcileOne` + **wire del CTA**: el botón "Reconciliar contra el proveedor" del `AdminDriftBanner` (cuando `recoveryHint==='reconcile'`) y cada fila de drift del `<PluginOperationalOverview>` (F.2) → endpoint single-shot in-place — cierra el cabo de F.3 (hoy el CTA linka a la página de settings = reconcile-all). Detalle §A.11.10.6. | ⏳ — rama `sprint15c-ii-fase-f9-reconcile-single`. ADR-077 amendment (`reconcileOne?()`) + posible ADR-083 amendment. (`DC.45` promovido del backlog.) |
| **F.10** | **Deep-links curados al panel del proveedor** — en vez del único "Abrir panel del proveedor", un grupo de atajos curados ("Gestionar email", "Gestionar bases de datos", "Administrador de archivos", "Logs del sitio"…, las que orchd exponga vía SSO) — materialización a decidir pre-código: nuevas inline actions plugin-internas (`sso_email`/`sso_databases`/… — slugs plugin-internos, sin ADR, L14) o `getSsoUrl` gana parámetro `section?` (ADR-077 amendment + ADR-083). Cliente + admin (`_shared/`); capability-driven (si una sección no existe → no se muestra; ADR-070). Detalle §A.11.10.7. | ⏳ — rama `sprint15c-ii-fase-f10-curated-deeplinks`. ADR amendment según la materialización elegida. |
| **F.11** | **Conveniencias operativas del detalle de servicio + plugins** — mini-badge de salud del proveedor en `/admin/services/[id]` ("Proveedor: operativo/degradado/caído" del `CircuitBreakerRegistry.getState()`, etiquetado "en esta instancia", link al `<PluginOperationalOverview>` completo) + reenviar notificación al cliente (`/admin/services/[id]` → modal con selector de plantilla [whitelist de las de service-lifecycle] → `POST /admin/services/:id/notifications/resend` + audit; reusa el historial de `notifications`) + cross-link a billing en la página del servicio (cliente + admin: "Próxima renovación: X · €Y · [Ver factura]" leyendo la subscription/invoice del service → link a `/dashboard/billing/[id]` o admin). Detalle §A.11.10.8. | ⏳ — rama `sprint15c-ii-fase-f11-service-conveniences`. |
| **F.12** | **Layout canónico** (última fase de features) — diseño: secciones nuevas en `UI_SPEC.md` para las 3 familias (`/services/[id]` admin+cliente discriminado por rol §4.13, lista de plugins `/admin/settings/plugins`, detalle de plugin `/admin/settings/plugins/[slug]`) — jerarquía de componentes + orden/prioridad de secciones + responsive + estados empty/error/loading + qué es admin-only — con **wireframes ASCII**; iterar con Yasmin; **FREEZE**; luego refactor de las 3 familias de páginas a la composición congelada (pura composición, cero cambio de comportamiento; reutiliza DS + cards `_shared/`; componentes nuevos solo donde haya hueco real; los slots con nombre que dejó este layout reciben lo de F.4-F.11). Detalle §A.11.10.9. | ⏳ — rama `sprint15c-ii-fase-f12-canonical-layout`. Nuevas secciones `UI_SPEC.md` (el diseño es el deliverable). **Fase con freeze gate** (diseño → iteración con Yasmin → freeze → implementación). |
| **G** | **Cierre Sprint 15C.II** — tests críticos faltantes (las 8 áreas del audit técnico Fase A — los que sigan sin cubrir tras F.1-F.12) + E2E spec extension cubriendo Fases E + F.1-F.12 (label `ready-for-e2e` en el PR) + smoke real Yasmin (contra mock + Enhance live si aplica) + retrospectiva (lecciones heredables L19+...) + mover el dossier a `docs/60-roadmap/completed/sprint-15c-ii-hardening-enhance.md` (header retrospectiva + dossier original como anexo de trazabilidad — patrón Sprint 15C) + `current.md`/`backlog.md`/`MEMORY.md`/`project-state.md` (15C.II ✅ CERRADO, **Sprint 15D RC DESBLOQUEADO**). DoD del sprint: todos los DoD de fase (A→F.12) ✓ + `pnpm ci:check:full` + `pnpm ci:e2e` verdes + smoke OK. Detalle §A.11.10.10. | ⏳ — última fase. |

## A.11.2. Reconciliación con §A.9.6.1 — inline actions, NO métodos dedicados (frozen 2026-05-12)

§A.9.6.1 (2026-05-10) proponía métodos dedicados del contrato `suspendService`/
`unsuspendService` + wrappers `suspendServiceWithAudit`/`unsuspendServiceWithAudit`
+ `reason` string libre. **Al materializar F.1 se siguió ADR-077 Amendment A4.4
(frozen 2026-05-10 — "inline actions"):**

1. **Inline actions, NO métodos dedicados del contrato** — añadir `suspendService`/
   `unsuspendService` a la interfaz `ProvisionerPlugin` sería un cambio breaking del
   shape. Las inline actions `suspend_service`/`unsuspend_service` (vía `executeAction`,
   ambas `adminOnly: true`, idempotentes) son la materialización canónica — coherente
   con cómo `has_dns_management` exige las 4 DNS actions.
2. **NO `suspendServiceWithAudit` en `plugin-utils.ts`** — la transición de estado vive
   en el **orquestador** (`ProvisioningService.suspendAsAdmin`/`unsuspendAsAdmin`, igual
   que `deprovisionAsAdmin`/`reprovisionAsAdmin`), NO en `plugin-utils.ts` (librería pura
   sin `prisma`). El método del orquestador invoca la inline action vía
   `executeActionWithCacheInvalidation` (reusa breaker + cache invalidate + audit
   `service.action_executed:<slug>` + enforcement adminOnly) y además hace el `prisma.update`
   + emite `service.suspended`/`service.unsuspended` + audit del cambio de estado.
3. **`reason` como enum canónico `SuspensionReason`, NO string libre** — mejora sobre el
   apuntado: i18n-limpio, analytics-limpio, defendible legalmente, coherente con L13. El
   `internal_note` (free text) va al audit + `services.suspension_reason` combinado
   `"<reason>: <internal_note>"` (mismo patrón que `cancellation_reason`), NUNCA al cliente.
4. **`services.suspended_at`/`suspension_reason` ya existían en el schema** (no migración —
   confirmado contra `prisma/schema.prisma`).
5. **`DC.NEW-15CII-BILLING-SUSPEND-UNIFY`** (diferido): `ServiceLifecycleWorker.autoSuspendServices`
   (impago vencido — Sprint 6.5) emite `service.suspended` con forma reducida
   `{service_id, invoice_id, reason: 'payment_exhausted'}`. F.1 NO lo migra (toca billing);
   el listener `notifications-on-service-suspended` tolera ambas formas (deriva `user_id`,
   normaliza `reason` legacy → `'overdue_payment'`). Cuando se toque billing: migrar
   `autoSuspendServices` para que llame a `suspendAsAdmin` con `reason: 'overdue_payment'` +
   actor "sistema" (también `service.resumed` ↔ `service.unsuspended` podrían unificarse).

## A.11.3. Frase canónica de arranque Fase F.2 (verbatim)

> *"Lee `docs/60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md` Apéndice A §A.11 (Fase F partida + cierre F.1 + handoff F.2) y §A.10 (cierre Fase E). Vamos con Sprint 15C.II Fase F.2 — admin overview operativo del plugin Enhance en `/admin/settings/plugins/[slug]` (página existente, hoy solo config form + reconcile-all button): componente reusable `<PluginOperationalOverview slug>` (ADR-083 A4.4) con badge de salud top-line (Operativo / Degradado / Caído derivado de `CircuitBreakerRegistry.getState()` + última reconciliación OK + secret válido) + stats grid 4 cards (services activos / suspendidos / drifts en 24h / circuit breaker state) + 'última reconciliación hace Xh · próxima en Yh' + tabla recent drifts (query `audit_change_log WHERE action LIKE 'service.reconciled%' AND created_at > now()-24h`, cada fila enlaza a `/admin/services/[id]/audit` que llega en F.3) + reconcile-all (ya existe) + test conexión (ya existe) + form config/secrets (ya existe). Crea rama `sprint15c-ii-fase-f2-admin-overview` desde master post merge PR F.1. Procede con rigor."*

## A.11.4. Estado real al cierre F.1

**ADR**: [ADR-077 Amendment A4.5](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#a45-materialización-sprint-15cii-fase-f1-2026-05-12) (materialización de A4 — inline actions, no métodos dedicados; `SuspensionReason` enum; orquestador `suspendAsAdmin`/`unsuspendAsAdmin`; reconciliación con §A.9.6.1).

**Backend**: `core/provisioning/types.ts` (+ `PluginCapabilities.supports_suspend` + `SuspensionReason`); `enhance.plugin.ts` (`supports_suspend: true` + 2 inline actions + `actionSuspendService`/`actionUnsuspendService` vía `patchSubscription({isSuspended})` + `filterActionsByStatus` + `getServiceInfo` statusReason → `plugin.enhance_cp.status_reason.suspended`); `internal`/`manual` plugins + `provisioning.service.ts` fallbacks (`supports_suspend: false`); `provisioning.service.ts` (`suspendAsAdmin`/`unsuspendAsAdmin` + summary `suspended_at`/`suspension_reason` + `adminServiceSummarySelect` + `executeActionForUser` rechaza los 2 slugs); `dto/provisioning.dto.ts` (`SuspensionReasonDto` + `SuspendServiceDto`); `admin-provisioning.controller.ts` (`POST /admin/services/:id/suspend|unsuspend`); listeners `notifications-on-service-suspended`/`-unsuspended` (NUEVOS, patrón L11+L12, R7; el suspended tolera la forma legacy del `ServiceLifecycleWorker`) + `notifications.module.ts`; `prisma/seeds/notification-templates.ts` (+ 4 plantillas, email ramifica CTA por motivo con `{{#if}}`).

**Frontend**: `app/lib/api.ts` (+ `ServiceInfoCapabilities.supports_suspend` + `SuspensionReason` + `ServiceDetailResponse.service.suspended_at`/`suspension_reason`); `_actions.ts` (`suspendServiceAction`/`unsuspendServiceAction`); `SuspendServiceModal.tsx` (NUEVO, `mode: 'suspend' | 'unsuspend'`); `AdminServiceOperationsCard.tsx` (botones suspender/reanudar — ramifica por presencia de las inline actions en `availableActions`); `admin/services/[id]/page.tsx` (banner amarillo + `isDrift` excluye `suspended` + helper `parseSuspensionReason`); `ActionsBar.tsx` (`INTERNAL_HELPER_SLUGS += suspend_service, unsuspend_service`); `translations-es.ts` (+ `plugin.enhance_cp.actions.suspend_service*`/`unsuspend_service*` + `plugin.enhance_cp.status_reason.suspended` + `service.suspension_reason.*` ×5).

**Tests/build**: contract spec extendido (invariantes A4 — corre ×3 plugins) + `provisioning.service.spec` (6 tests) + 2 listener specs nuevos (incl. forma legacy) + `enhance.plugin.spec` (suspend/unsuspend executeAction + getServiceInfo suspended) + literales `PluginCapabilities` de specs actualizados. Suite **625/630 unit verde + 5 skipped** (47 suites). `pnpm ci:check:full` verde + boot real backend verificado (DI sin errores incl. 2 listeners nuevos; rutas admin suspend/unsuspend mapeadas).

**Gaps**: G3 ✅ cerrado F.1. Abiertos (F.2/F.3): G4 / G5 / G8 / GAP-15CII-M / GAP-15CII-N + wiring CTA `recoveryHint === 'reconcile'`. Diferido nuevo: `DC.NEW-15CII-BILLING-SUSPEND-UNIFY`.

## A.11.5. Lección heredable F.1 — el ADR frozen gana sobre el apuntado del dossier

**Doctrina canónica (frozen 2026-05-12):** cuando un apuntado de trabajo del dossier
(escrito antes de codear, exploratorio) propone una materialización que contradice un
Amendment de ADR ya **frozen**, **gana el ADR frozen** — salvo que se abra un Amendment
nuevo que lo modifique conscientemente. En F.1: §A.9.6.1 (2026-05-10) decía "métodos
dedicados + `suspendServiceWithAudit`"; ADR-077 A4.4 (frozen 2026-05-10) decía "inline
actions" → se siguió el ADR + se añadió Amendment A4.5 documentando la materialización
(incluida la mejora `reason` string→enum). El dossier es el *thinking*; el ADR es el
*contrato*. Si al implementar descubres una mejora real sobre el ADR, materialízala como
Amendment (no como desvío silencioso). Heredable: cualquier fase futura que arranque de un
apuntado de dossier debe cotejarlo contra los ADRs frozen relevantes ANTES de codear.

## A.11.6. Sesiones origen F.1

- 2026-05-12 (Fase F.1 — decisión Yasmin: partir Fase F en F.1/F.2/F.3 + impersonación admin con detalle en timeline cliente; valoración pre-código "¿es estándar de industria? qué mejorar" → 9 refinamientos, 4 implementados [reason enum / GAP-N log-once approach / índice expresión audit / breaker no anidado], resto diferidos a F.2/F.3): ADR-077 A4.5 + contrato + plugin Enhance + orquestador + endpoints + listeners + plantillas + frontend + tests + doc-sync → este §A.11

## A.11.7. Estado real al cierre F.2

**ADR:** [ADR-083 Amendment A6](../10-decisions/adr-083-plugin-enhance-cp-specifics.md#amendments) (materialización de A4.4 — admin overview operativo + evento rollup `plugin.reconcile_completed`).

**Backend:**
- `core/provisioning/plugin-audit-id.util.ts` (NUEVO — `deriveAuditEntityId(slug)` UUID v5 determinístico, extraído de `AdminPluginsService` para reuso por el listener nuevo).
- `core/provisioning/reconcile-registry.service.ts` (`register(slug, executor, scheduleMeta?: { intervalSeconds })` + `getScheduleMeta(slug)` — campo opcional, additivo).
- `plugins/provisioners/enhance_cp/crons/enhance-reconciliation.cron.ts` (`INTERVAL_SECONDS = 21600` declarado al registry en `onModuleInit`; `emitReconcileCompleted(trigger, summary, durationMs)` invocado desde `handleScheduled` (`trigger='cron'`) y `runAsExecutor` (`trigger='manual'`) — `runOnce()` se queda puro).
- `modules/audit/audit-on-plugin-reconcile-completed.listener.ts` (NUEVO — `@OnEvent('plugin.reconcile_completed')` → `audit_change_log` `entity_type='Plugin'` `action='reconcile_completed'` `user_id=null`; R7 no-relanza) + registrado en `audit.module.ts`.
- `modules/admin-plugins/dto/plugin-operational-overview.dto.ts` (NUEVO — shape `PluginOperationalOverview` plugin-agnóstico + `PluginHealthStatus` + `PluginReconcileChangeType`).
- `modules/admin-plugins/admin-plugins.service.ts` (`getOperationalOverview(slug)` + helpers `collectSecretsStatus` + file-private `readMetaString`/`readNumber`/`normalizeChangeType`/`readReconcileSummary`/`deriveHealth`; importa `deriveAuditEntityId` del util nuevo en vez de definirlo inline).
- `modules/admin-plugins/admin-plugins.controller.ts` (`GET /admin/plugins/:slug/operational-overview`).

**Frontend:**
- `app/lib/api.ts` (+ `PluginOperationalOverview` + `PluginHealthStatus` + `PluginReconcileChangeType`, espejo del DTO backend).
- `app/_shared/plugins/PluginOperationalOverview.tsx` (NUEVO — Server Component reusable: badge salud + razones i18n + stats grid 4 cards + reconciliación última/próxima + tabla drifts 24h; `serverFetch` autocontenido con degradación inline; estados breaker etiquetados "estado en esta instancia"; helper `serviceDetailHref` → `/admin/services/[id]`, repuntable a `…/audit` en F.3).
- `app/admin/settings/plugins/[slug]/page.tsx` (monta `<PluginOperationalOverview slug={detail.slug} />` entre header y la sección reconcile-all).
- `app/_shared/i18n/translations-es.ts` (+ `admin.plugins.overview.*` — section/health/health_reason/stat/circuit.state/reconcile/drifts/drift).

**Tests/build:** `admin-plugins.service.spec` (+6 tests `getOperationalOverview`: operational / disabled / down-secret-faltante / down-circuit-open / degraded-reconcile-errors / filtrado `_meta.plugin_slug` / NotFound); `audit-on-plugin-reconcile-completed.listener.spec` (NUEVO — persiste con `user_id=null` + trigger manual + R7); `enhance-reconciliation.cron.spec` (+2 tests: `handleScheduled` emite `plugin.reconcile_completed` `trigger='cron'`; executor manual `trigger='manual'` + `getScheduleMeta` = `{ intervalSeconds: 21600 }`). `pnpm ci:check` verde: **637 passed + 5 skipped, 48 suites**. Frontend `tsc --noEmit` + `eslint --max-warnings=0` verdes.

**Gaps:** abiertos para F.3: GAP-15CII-M (audit timeline admin + cliente) + GAP-15CII-N (`ProvisionerPluginError.module?`) + G4 (cache TTL desde manifest) + G5 (NO breaker anidado / bajar timeout) + G8 (bug test-connection synthetic sin metadata) + wiring CTA `recoveryHint === 'reconcile'` en `AdminDriftBanner`. Diferido vigente: `DC.NEW-15CII-BILLING-SUSPEND-UNIFY` (F.1).

**Apuntados del dossier corregidos al materializar** (todos en §A.11.1 fila F.2 + ADR-083 A6.2): query de drifts (`action='reconciled_external_change'`, no `LIKE 'service.reconciled%'`); ubicación del componente (`_shared/plugins/`, no `[slug]/_components/`); fuente de "última reconciliación" (evento rollup persistido, no inferencia del schedule). Coherente con la lección L18 (§A.11.5): el código real / el ADR ganan sobre el apuntado exploratorio del dossier; las mejoras se materializan como Amendment (A6), no como desvío silencioso.

## A.11.8. Sesiones origen F.2

- 2026-05-12 (Fase F.2 — admin overview operativo: valoración pre-código "¿es estándar de industria? qué mejorar" → decisión Yasmin: persistir el resultado del cron en BD vía evento rollup nuevo + enlazar drifts a destino existente y repuntar en F.3 + endpoint/componente plugin-agnósticos): ADR-083 A6 + util `plugin-audit-id` + registry scheduleMeta + cron emit + listener nuevo + DTO + `getOperationalOverview` + endpoint + frontend type/componente/page/i18n + tests + doc-sync → este §A.11.7/§A.11.8

## A.11.9. Fase F.3 — CERRADA, mergeada (PR [#67](https://github.com/yasmindanailov/dashboard/pull/67) squash-merge `2a33850`, 2026-05-12)

> **Registro de cierre de la Fase F.3** (= cierre de la Fase F: F.1+F.2+F.3 en master). PR #67 mergeado vía bypass policy §6 (CI GitHub bloqueada billing externo §A.9.10 — jobs Backend `fail 3s` / Frontend `fail 11s`; las 3 condiciones cumplidas: motivo externo + `pnpm ci:check:full` verde [49 suites, 664 passed + 5 skipped; `nest build` + `next build`] + boot real backend [rutas `/api/v1/(admin/)services/:id/audit` (GET) + `…/refresh` (POST) mapeadas, DI sin errores] + sección formal en el cuerpo del PR; rama temporal eliminada; label `ready-for-e2e`) → post-merge doc-sync en su propio PR (patrón #61/#64/#66 — flip de la fila §A.11.1, `current.md`, `backlog.md` [`DC.45`], `MEMORY.md`/`project-state.md`). Las decisiones de §A.11.9.3 NO se re-litigan. **Después de F.3 viene F.4** (SSL/TLS status read-only + alertas de cuota — decidido con Yasmin 2026-05-12, arranca desde master post este post-merge-sync) y luego **G** (tests críticos + E2E + retrospectiva + cierre Sprint 15C.II).

### A.11.9.1. Commits ya en la rama (lo HECHO de F.3)

| Commit | Item | Resumen |
|---|---|---|
| `6c84b13` | GAP-15CII-M (1/5) | Migración `prisma/migrations/20260512090000_…audit_resource_id_index`: índice de expresión parcial `audit_access_log ((metadata->>'resource_id')) WHERE metadata ? 'resource_id'`. `migrate deploy` aplicado contra dev DB. NO se modela en `schema.prisma` (Prisma 7 no expresa índices de expresión). |
| `c7b6b71` | GAP-15CII-M (2/5) | Backend timeline: `AuditService.getServiceTimeline(serviceId, {isAdmin, cursor, limit})` — `UNION ALL` `$queryRaw` de `audit_change_log` (`entity_type='Service'`+`entity_id`) y `audit_access_log` (`metadata ? 'resource_id' AND metadata->>'resource_id' = :id`), keyset cursor `(created_at, id)` DESC con `limit+1`, actor enrich (batch `user.findMany`), **recorte GDPR** cuando `!isAdmin` (whitelist `CLIENT_VISIBLE_TIMELINE_ACTIONS` = `read`/`admin_sso_impersonation`/`service.suspended`/`service.unsuspended`/`service.deprovisioned_admin` + `reconciled_external_change` solo si `changes_after._meta.gdpr_visible_to_data_subject===true`; sin `changes_*`/`correlation_id`/IP staff; `metadata` recortado por acción). `ProvisioningService.getServiceTimelineForUser` (ownership). Endpoints `GET /admin/services/:id/audit` (con `@AuditAccess('Service')`) + `GET /services/:id/audit` (`?cursor=&limit=`). DTO `modules/audit/dto/service-timeline.dto.ts`. |
| `826a9ee` | GAP-15CII-M (3/5) | Tests: `audit.service.spec` (5: admin full / cliente whitelist / cursor parse `BadRequestException` / next_cursor / actor desconocido→{user_id,name:null,role:null}); `provisioning.service.spec` (4: NotFound / Forbidden / dueño isAdmin=false / admin ignora ownership). |
| `6e5752e` | GAP-15CII-M (4/5) | Frontend: `_shared/services/_components/ServiceAuditTimeline.tsx` (Server Component reusable, paginación URL `?cursor=`, discrimina `isAdmin`) + páginas `/admin/services/[id]/audit` + `/dashboard/services/[id]/audit` + tipos `api.ts` (`ServiceTimelinePage`/`ServiceTimelineEntry`/`ServiceTimelineActor`) + i18n `service.audit.*` + `role.*` + link "Ver historial de auditoría →" en ambos detalles + `serviceDetailHref` del overview F.2 repuntado de `/admin/services/[id]` a `/admin/services/[id]/audit`. |
| `7d27607` | GAP-15CII-M (5/5) | Lint fixup (prettier wrap) en `audit.service.ts`/`.spec.ts` — las ediciones mezclaron EOL. Sin cambio de comportamiento. (Heredable: tras tandas de Edit en archivos CRLF, correr `pnpm --dir backend lint` antes de commitear evita el rechazo del pre-push.) |
| `5c409f6` | **GAP-15CII-N** | `ProvisionerPluginError` gana `module?: string` (mutable). `GlobalExceptionFilter`: helper exportado `resolveErrorModule(exception)` — recorre el error y su cadena `cause` (máx. 5 niveles, defensivo contra ciclos) buscando el primer `module` string (duck-typed, no acoplado a provisioning); lo registra en `error_log.module` en vez de `'http'`. El wrapper `getServiceInfoWithCache` marca `err.module = provisioning.<slug>` antes de re-lanzar (si no venía ya seteado). Tests: `plugin-utils.spec` (2) + `global-exception.filter.spec` (NUEVO, 4). |
| `ccf571b` | **GAP-15CII-G8** | `ProvisionerPlugin` gana método opcional `testConnection?(): Promise<{ok, message}>` — obligatorio si `manifest.testConnectionMethod === 'custom'`; probe ligero contra el proveedor con las credenciales, sin servicio, sin side-effects, captura sus propios errores. `AdminPluginsService.testConnection`: rama `'custom'` (invoca `plugin.testConnection()`; 400 si declarado pero no implementado) + rama `'getStatus'` (sintético, ahora con `metadata: {}` defensivo) + `null`⇒400. `EnhanceProvisionerPlugin`: `testConnectionMethod` `'getStatus'`→`'custom'` + `testConnection()` con el probe canónico ADR-083 §1 dec.5 (`GET /version` vivo + `GET /orgs/{masterOrgId}` token válido + RBAC). Contract test: `testConnectionMethod==='custom'` ⇒ `testConnection` es función. Tests: `enhance.plugin.spec`, `admin-plugins.service.spec` (4 rama 'custom'), `plugin-contract.spec`. |
| `36ab549` | **G4 + G5** | G4: `PluginManifest.serviceInfoCacheTtlSeconds?` opcional — TTL del cache L1 `service_info` por plugin; `ProvisioningService.resolveServiceInfoTtl(plugin)` precedencia manifest>setting global>60s, sanity floor 5s (`Math.max(...,5)`). Enhance NO lo declara → usa el global. G5: `EnhanceHttpClient` default timeout 30s→15s (fail-fast workers BullMQ; orchd responde <5s); NO breaker anidado (anti-patrón blanket protection; envolver el client en breaker propio diferido v1.1 — ADR-080 doctrine). Tests: `provisioning.service.spec` (TTL manifest / floor 5s / fallback al setting), `plugin-contract.spec` (invariante). |
| `a24ea48` | **CTA reconcile** | `AdminDriftBanner` gana props `showReconcile?` + `pluginSlug?`; cuando `info.recoveryHint === 'reconcile'` ofrece botón "Reconciliar contra el proveedor" → `router.push('/admin/settings/plugins/${pluginSlug}')` (donde vive reconcile-all + overview F.2; consistente con el patrón Fase E para `invalid_state`). `admin/services/[id]/page.tsx` computa los props (`isDrift && recoveryHint==='reconcile'` + `provisioner_slug ?? product_provisioner`). i18n `service.drift.admin_banner.reconcile_cta`/`.reconcile_help`. **Una reconciliación per-servicio single-shot queda diferida** — nuevo apuntado de backlog `DC.NEW-15CII-RECONCILE-SINGLE` (endpoint `POST /admin/services/:id/reconcile` que reconcilie solo ese servicio; hoy no hay método de contrato "reconcile one service", solo el `reconcile-all` del registry; revisar al tocar el contrato). |
| `5640a8e` | **B.1 — cooldown del force-refresh** | `ProvisioningCacheService.tryAcquireRefreshCooldown(serviceId, ttlSec)` (`SET refresh_cooldown:<id> 1 EX ttl NX`, DB 2; `true`=adquirida, `false`=ventana activa; **fail-OPEN** si Redis falla). `ProvisioningService.getInfoForUser`: si `options.forceRevalidate` y la ventana está activa (`REFRESH_COOLDOWN_SECONDS = 15`) → degrada a una **lectura cacheada normal** (*coalescing* — el usuario recibe el valor actual ≤15s, sin tocar al proveedor, SIN error; respuesta sigue siendo `ServiceDetailResponse` válido → sin cambios en el frontend). Cache frío → fetch igualmente (correcto). Cliente y admin comparten la ventana — ambos endpoints `refresh` ya pasan por `getInfoForUser`, cubiertos sin tocar controllers (solo docstrings). Tests: `provisioning.service.spec` +3. **Decisión: cooldown per-`serviceId` en Redis (coalescing), NO `@Throttle` por IP** (el throttle por IP no acota lo que cuesta —1 llamada a orchd por servicio—, se rompe bajo NAT, y `forceRevalidate` bypasea el cache → stampede concurrente que el `SET NX` resuelve gratis; en cooldown-hit no hay 429 ni `Retry-After`, solo cache → menos código + menos info-leak). Sin spec dedicado de `ProvisioningCacheService` (no existe; cubierto vía mock en `provisioning.service.spec`). |
| `0532012` | **B.2 — `plugin.reconcile_completed` en ADR-080 §6** | Doc-only: fila nueva en la tabla "Eventos canónicos del framework" (§6) de ADR-080 con el payload cross-chequeado contra el emisor real (`EnhanceReconciliationCron.emitReconcileCompleted`), el listener (`AuditOnPluginReconcileCompletedListener`) y ADR-083 A6.1. Nota explícita de que `plugin.reconcile_triggered_manually` NO va en esa tabla (no es evento del bus — es un `action` de `audit_change_log` que `AdminPluginsService.reconcileAll` escribe síncronamente; verificado: no hay `events.emit(...)` de ese nombre). |
| `25cc3e3` | **doc-sync close-out** | ADR-083 Amendment A7 (registro comprensivo de toda F.3 — GAP-M/N + G4/G5/G8 + CTA + B.1 + B.2 + backlog + validación) + ADR-077 Amendment A6 (`testConnection?()` + `ProvisionerPluginError.module?` — superficie de contrato) + ADR-080 Amendment C (`PluginManifest.serviceInfoCacheTtlSeconds?` — superficie de manifest, por el patrón B.5 de ADR-080) + este §A.11 (estado close-out). Fue en el PR #67. |
| _(post-merge, PR aparte)_ | **post-merge doc-sync** | Patrón #61/#64/#66: flip de la fila F.3 §A.11.1 → ✅ mergeada `2a33850` PR #67 + fila F.4 nueva + cierre de este §A.11.9 + `current.md` (Fase F cerrada) + `backlog.md` (`DC.45`/`DC.NEW-15CII-RECONCILE-SINGLE`) + `MEMORY.md`/`project-state.md`. Rama `sprint15c-ii-fase-f3-postmerge-docsync`. |

**Verificación**: `pnpm ci:check:full` verde — backend 49 suites, 664 passed + 5 skipped (typecheck + `eslint --max-warnings=0` + test + `nest build`), frontend `tsc --noEmit` + `eslint --max-warnings=0` + `next build` verdes (rutas `/admin|/dashboard/services/[id]/audit` en el build). **Boot real** verificado (`node dist/src/main.js`): `Nest application successfully started`, sin errores DI; rutas mapeadas `GET /api/v1/services/:id/audit`, `POST /api/v1/services/:id/refresh`, `GET /api/v1/admin/services/:id/audit`, `POST /api/v1/admin/services/:id/refresh`. `migrate deploy` aplicado. Pre-push hook verde en cada push.

### A.11.9.2. Estado — Fase F.3 CERRADA

✅ **TODO HECHO** — item B completo (`5640a8e` B.1 cooldown + `0532012` B.2 catálogo ADR-080) + `pnpm ci:check:full` verde (49 suites, 664+5) + boot real verificado + ADR-083 Amendment A7 + ADR-077 Amendment A6 + ADR-080 Amendment C + dossier §A.11. **Mergeada a master**: PR [#67](https://github.com/yasmindanailov/dashboard/pull/67) squash-merge `2a33850` 2026-05-12 (bypass policy §6 — CI GitHub bloqueada billing externo; las 3 condiciones cumplidas + sección formal en el cuerpo del PR; rama temporal eliminada; label `ready-for-e2e`). **Post-merge doc-sync** (este flip de §A.11 + `current.md` + `backlog.md` `DC.45` + memory files) en su propio PR — patrón #61/#64/#66. **Fase F COMPLETA (F.1+F.2+F.3) en master.** Siguiente: **F.4** (SSL status + alertas de cuota — ver fila F.4 en §A.11.1).

### A.11.9.3. Decisiones tomadas en F.3 (NO re-litigar)

- **GAP-N — `module?` mutable en `ProvisionerPluginError`, no en options bag**: los plugins lanzan `new ProvisionerPluginError(msg, code, retriable)` sin conocer su contexto; el wrapper que sí sabe el slug lo setea (`err.module = provisioning.<slug>`). El filtro lo lee duck-typed recorriendo `cause` — NO importa `ProvisionerPluginError` (mantiene el filtro genérico). Solo el wrapper `getServiceInfoWithCache` lo setea hoy (es el único que re-lanza a HTTP; `executeAction`/`getSsoUrl` swallow). El path del orquestador (jobs BullMQ) no pasa por el filtro HTTP — fuera de scope GAP-N.
- **G8 — `testConnectionMethod: 'custom'` + método opcional de contrato, no overload de `getStatus`**: el `getStatus` de Enhance requiere `provider_reference` real → un servicio sintético siempre reportaba "sin metadata" (falso negativo). Lo correcto es un probe dedicado contra el proveedor. `buildSyntheticService` ahora lleva `metadata: {}` (defensivo — ningún plugin que lea `service.metadata` en `getStatus` debe romper ante el sintético). El probe de Enhance es exactamente ADR-083 §1 dec.5 (los docstrings de `getVersion`/`getOrg` ya lo anticipaban).
- **G4 — TTL desde manifest, precedencia manifest > setting > 60s, floor 5s**: el manifest es la recomendación del autor del plugin; el setting es el override del operador. Floor 5s aplicado en runtime (`Math.max`) — un plugin puede declarar 2 y el runtime lo sube a 5; el contract test solo exige entero positivo si declarado. Enhance no lo declara.
- **G5 — 30s→15s, sin breaker anidado**: el circuit breaker del wrapper (`getServiceInfo`/`executeAction`) ya cubre fallos repetidos; un segundo breaker dentro del HTTP client es "blanket protection" (anti-patrón ADR-080) → diferido v1.1.
- **CTA reconcile — link a plugin settings, no acción inline ni endpoint per-servicio nuevo**: consistente con el patrón Fase E (`invalid_state` → "Reconciliar todos los servicios ahora" en settings). Llamar `reconcileAllPluginAction` desde el banner de un servicio sería un sledgehammer ("clico 'reconciliar este servicio' y reconcilia todos"). La reconciliación per-servicio single-shot queda en backlog (`DC.NEW-15CII-RECONCILE-SINGLE`) — requiere tocar el contrato (no hay método "reconcile one service" hoy).
- **Frase canónica de continuación**: *"Lee `docs/60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md` §A.11.9 (handoff F.3). La rama `sprint15c-ii-fase-f3-audit-timeline` ya tiene GAP-M + GAP-N + G8 + G4/G5 + CTA reconcile (9 commits). Falta: (1) B — throttle server-side en `POST /services/:id/refresh` (cliente+admin) + añadir `plugin.reconcile_completed` al catálogo `plugin.*` de ADR-080; (2) close-out — `ci:check:full` + boot real + ADR-083 Amendment A7 + cierre del §A.11 + PR (bypass §6 si CI billing-bloqueada) + merge + post-merge sync. Luego F.4 (SSL status read-only en `getServiceInfo` + card cliente/admin + alertas de cuota disco/ancho-banda) y G (cierre 15C.II). Procede con rigor."*

### A.11.9.4. Apuntados de backlog nuevos en F.3

- **`DC.NEW-15CII-RECONCILE-SINGLE`** — endpoint `POST /admin/services/:id/reconcile` que reconcilie un único servicio (single-shot, no todos los del plugin). Hoy no hay método de contrato "reconcile one service" — solo el `reconcile-all` del `ReconcileRegistryService` (que invoca el cron L3 completo). Materializar al tocar el contrato `ProvisionerPlugin` (probablemente un método opcional `reconcileOne(service)?`). Mientras tanto, el CTA del `AdminDriftBanner` lleva a la página de settings del plugin (reconcile-all). **→ Promovido del backlog a Sprint 15C.II Fase F.6 (re-plan 2026-05-12 — §A.11.10.3).**

## A.11.10. Plan de continuación — Fases F.4 → G (re-plan 2026-05-12, refinado)

> **Por qué este re-plan:** (1) el testing de F.1 destapó un agujero de robustez del estado de suspensión — `getServiceInfo` deriva el status (→ `availableActions` → el botón "Reanudar servicio" → el badge del header) **solo del proveedor** (`mapSubscriptionStatus(subscription)`), mientras `services.status`, el banner amarillo y el guard de `unsuspendAsAdmin` van **solo de la BD**; cuando discrepan (flujo de F.1 a medio terminar, `MockEnhanceServer` in-memory reiniciado perdiendo el `patchSubscription`, el cron de billing, o un cambio directo en el panel de Enhance) la UI muestra el banner pero **no hay forma de deshacerlo**, y el desync inverso (BD `active`, proveedor `isSuspended`) da `409 SERVICE_NOT_SUSPENDED` en un botón visible — esto no es "feature pendiente", es un estado roto sin salida. (2) Decisión Yasmin 2026-05-12: las mejoras que estaban como deuda diferida (`DC.44` billing-suspend-unify, `DC.45` reconcile-single, deep-links curados, notas de servicio, mini-badge de salud, reenviar notificación, cross-link a billing) **se traen a este sprint** — el plugin Enhance y el módulo de servicios se cierran a estándar alto, sin cabos sueltos, antes de desbloquear Sprint 15D RC. (3) Refinamiento Yasmin 2026-05-12 (sesión 2): además — (a) las acciones críticas de servicio (cancelar/suspender/reactivar) deben integrarse con el **sistema transversal de notas `ClientNote`** (Sprint 16 / ADR-079), igual que cerrar-ticket / delegar-chat / completar-tarea (la nota es **obligatoria** en el modal, sale en `/admin/clients/[id]` → "Notas" con el proceso de origen + link al servicio); (b) una **fase de layout canónico** al final (antes de cerrar) para componer las páginas de servicio y plugins según `UI_SPEC.md`; (c) **más fases, más pequeñas** — cada una desarrollable con robustez.
>
> **Orden y agrupación** (por prioridad = riesgo descendente): **F.4** robustez del status de suspensión (arregla un estado roto **actual** — máxima prioridad) → **F.5** `DC.44` billing-suspend-unify (separada de F.4 — toca el módulo billing; debe ir **antes** de F.6 para que la suspensión por impago ya pase por `suspendAsAdmin`) → **F.6** notas operativas vía `ClientNote` → **F.7** SSL/TLS status read-only → **F.8** alertas de cuota → **F.9** reconcile per-servicio (`DC.45` — toca el contrato; cierra el cabo del CTA de F.3) → **F.10** deep-links curados al panel → **F.11** conveniencias operativas del detalle de servicio + plugins (mini-badge salud + reenviar notif + cross-link billing) → **F.12** layout canónico (última fase de features, antes de cerrar — refactoriza la composición de todo lo de F.4-F.11) → **G** cierre del sprint. **1 rama por fase** (patrón heredado). Cada fase materializa sus ADR amendments **dentro de la fase** (patrón desde Fase E — no hay fase doc-only separada), y arranca con una **valoración pre-código** que coteja el apuntado contra los ADRs frozen relevantes (L18 — si descubre una mejora real sobre el ADR, la materializa como Amendment, no como desvío silencioso). Cada fase tiene su PR; si la CI de GitHub sigue billing-bloqueada, bypass policy §6 (3 condiciones + doc formal) + post-merge doc-sync PR (patrón #61/#64/#66). F.12 (layout) tiene además un **freeze gate** (diseño → iteración con Yasmin → freeze → implementación) — no se toca código de refactor hasta que el layout esté congelado.

### A.11.10.1. Fase F.4 — Robustez del status de suspensión

> ✅ **CERRADA, mergeada a master** — PR [#70](https://github.com/yasmindanailov/dashboard/pull/70) squash-merge `283791c` 2026-05-12 (bypass policy §6, 6ª aplicación → post-merge doc-sync patrón #61/#64/#66/#68). Materialización + decisiones de la valoración pre-código + ampliación del caso "mock reiniciado" en §A.11.10.1.1 abajo. Las decisiones no se re-litigan. **Después de F.4 viene F.5** (`DC.44` billing-suspend-unify — §A.11.10.2).

**Tema:** el estado de suspensión es consistente y recuperable a través de BD ↔ proveedor ↔ cliente ↔ admin — sin estados rotos sin salida. (La unificación con el cron de billing es la fase siguiente F.5; las notas operativas, F.6.)

- **F.4.1 — Reconciliación del status administrativo (capa orquestador).** `ProvisioningService.getInfoForUser`: si `service.status === 'suspended'` ⇒ `info.status = 'suspended'` (override del valor que reportó el plugin/proveedor) + `availableActions` re-filtrado (fuera `suspend_service`, dentro `unsuspend_service`) + nuevo campo del **summary** `provider_state_desync: boolean` (`true` cuando el plugin reportó un status que no coincide con `services.status` para la dimensión de suspensión). Capa orquestador → heredable a TODOS los plugins sin que cada uno lo implemente. **NO toca el contrato `ProvisionerPlugin`** — el flag vive en el summary (contrato frontend), no en `ServiceInfo` (contrato plugin). Doctrina canónica: `services.status` es **autoritativo** para el lifecycle *administrativo* (`suspended` / `cancelled` — decisión de Aelium); DH-INV-6 ("Enhance gana en conflicto") aplica al estado *operacional* (plan, refs, métricas, drift) — son dimensiones distintas; se documenta esta distinción (nota en ADR-082 §DH-INV-6 y/o ADR-070). (Mismo espíritu que el shortcircuit terminal de `cancelled`/`terminated` que ya existe — F.4.1 lo extiende a `suspended`, pero sin shortcircuitar el plugin: a un service suspendido sí le pedimos `getServiceInfo` para las métricas.)
- **F.4.2 — Banner de suspensión para el cliente** en `/dashboard/services/[id]`: `AlertBanner` "Tu servicio está suspendido" + el motivo (etiqueta cliente-segura del enum `SuspensionReason`, **NUNCA** la nota interna) + CTA según motivo (`overdue_payment` → "Regulariza tu pago" con link a `/dashboard/billing`; resto → "Contacta con soporte"); avisar/ocultar en SSO + ActionsBar mientras esté suspendido (un cliente suspendido no debería poder operar como si nada). Coherente con el banner `cancelled` que ya existe (Fase C round 4, §A.8). Header ↔ banner coherentes (consecuencia automática de F.4.1 — `info.status` ya viene corregido).
- **F.4.3 — Aviso de desync en la UI admin** (`/admin/services/[id]`): cuando `summary.provider_state_desync === true`, `AlertBanner` variant="warning" "El proveedor no refleja el estado de suspensión de este servicio — re-aplica la suspensión en el proveedor (Reanudar y volver a suspender) o contacta soporte si persiste." Informa, no bloquea. El botón "Reanudar servicio" ya aparece (gracias a F.4.1) y `unsuspendAsAdmin` ya funciona (su guard `status === 'suspended'` coincide ahora con lo que muestra la UI).
- **ADR amendments / doc-sync:** ninguno del contrato `ProvisionerPlugin` (el `provider_state_desync` es summary). Doc: nota en ADR-082 §DH-INV-6 (y/o ADR-070) sobre lifecycle *administrativo* vs *operacional*; dossier §A.11.
- **DoD F.4:** status reconciliado verificado en **ambas** direcciones de desync (BD `suspended` ↔ proveedor `active`, y viceversa); banner de suspensión cliente (F.4.2) + aviso de desync admin (F.4.3); `info.status`/header/banner/`availableActions` coherentes; tests (unit del override en `getInfoForUser` + `provider_state_desync` en ambas direcciones; render del banner cliente por motivo; render del aviso de desync admin); `pnpm ci:check:full` + boot real; PR (+ bypass §6 si aplica) + post-merge sync.
- **Valoración pre-código (L18):** (1) `provider_state_desync` en el summary vs campo nuevo del contrato `ServiceInfo` → recomendado: summary (no es contrato plugin, evita un ADR-077 amendment). (2) ¿el aviso de desync admin ofrece una acción "re-aplicar la suspensión en el proveedor" además de informar, o solo informa? (3) cotejar la doctrina "lifecycle administrativo vs operacional" contra ADR-082 DH-INV-6 + ADR-070 — ¿amendment formal o nota inline? (4) ¿el banner del cliente oculta SSO/ActionsBar mientras suspendido, o solo avisa?

#### A.11.10.1.1. Decisiones de la valoración pre-código + materialización (sesión 2026-05-12, rama `sprint15c-ii-fase-f4-lifecycle-robustness`)

> Las 4 preguntas resueltas con Yasmin ("¿cuál es la decisión más robusta/profesional según estándar del sector?") + lo materializado. L18: las mejoras sobre el apuntado se registran aquí + como Amendment de ADR, no como desvío silencioso.

1. **`provider_state_desync` → `summary` (no `ServiceInfo`).** Decisión por capas, no solo por evitar un ADR: el flag es una *observación derivada de comparar dos fuentes de verdad* (`services.status` vs lo que reporta el plugin); el plugin solo ve su lado — no puede conocerlo. El orquestador es el único que ve ambos. ⇒ vive en el summary del orquestador (contrato frontend). **ADR-077 sin cambios.**
2. **Aviso de desync admin → informa + acción (opción 2).** El workaround "Reanudar y volver a suspender" no es solo peor UX: genera *dos transiciones de lifecycle falsas* (`service.unsuspended` + `service.suspended`), ensucia audit + notificaciones, y a partir de F.6 crearía `ClientNote`s espurios; además durante la ventana intermedia el cliente podría operar. Materializado: `ProvisioningService.resyncProviderStateAsAdmin` + `POST /admin/services/:id/resync-provider-state` — re-aplica la inline action canónica `suspend_service`/`unsuspend_service` para que el proveedor coincida con `services.status`, **sin transición de lifecycle** (no escribe la BD, no emite eventos de lifecycle, no crea notas), idempotente, audit de acceso `service_provider_state_resync_admin`. Reutiliza `executeActionWithCacheInvalidation` (breaker + invalidación de cache + audit `service.action_executed` + evento `service.action_executed` — eso SÍ ocurrió). Blast radius contenido.
3. **Doctrina "lifecycle administrativo vs operacional" → amendment formal.** Es un refinamiento sustantivo del alcance de DH-INV-6 (que decía "el proveedor gana" sin calificar la dimensión) que heredan 15D/15E/15G — debe ser una decisión de primera clase localizable, no enterrada inline, y coherente con que todas las fases previas (E/F.1/F.2/F.3) produjeron amendments. Materializado: **[ADR-082 Amendment A1](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md#amendments)** (lifecycle administrativo autoritativo vs operacional/DH-INV-6 + nota cross-ref en la tabla de §"Aplicación práctica de DH-INV-6") + **[ADR-070 Amendment A1](../10-decisions/adr-070-service-info-sso-acciones-curadas.md#amendments)** (el gateway curado reconcilia el status en read-time; el cliente no opera "como si nada" sobre un servicio suspendido). ADR-077 sin amendment (F.4 es capa orquestador + UI).
4. **Banner cliente → oculta SSO + ActionsBar + DNS mientras suspendido**, dejando visible solo el CTA del banner. Coherente con la doctrina de ADR-070 (las acciones curadas existen para servicios operativos) y con el banner `cancelled` que ya oculta acciones futiles.

**Refactor adicional (pure move, mencionado en la materialización de A1):** `filterActionsByStatus` se promovió de `enhance.plugin.ts` (privado) a `core/provisioning/plugin-utils.ts` (exportado) para que el orquestador lo reutilice al re-derivar `availableActions` desde el estado administrativo — heredable a 15D/15E/15G (el plugin lo importa de ahí; se actualizó la R4 del docstring de `enhance.plugin.ts` para incluir `plugin-utils`, que su propio docstring ya lista como librería de helpers que los plugins pueden importar).

**Detalles de implementación que matizan el apuntado:** (a) el override + el flag aplican cuando el proveedor está *accesible* (`info.status ∉ {unknown, failed}`) y discrepa de `services.status` — incluido el caso del proveedor reportando un estado **terminal** (`cancelled`/`expired`) mientras Aelium lo tiene `suspended`/`active` (ver "ampliación 2026-05-12" abajo); si el proveedor está caído / circuit open no se afirma desync — no lo sabemos — y el admin ve el `AdminDriftBanner` normal de "proveedor inaccesible"; (b) solo se aplica a plugins con `supports_suspend` (los demás no modelan la suspensión); (c) `availableActions` se re-deriva del estado administrativo en **todas** las direcciones del desfase (auto-curativo: clicar "Suspender" sobre algo que el proveedor ya suspendió es idempotente; clicar "Reanudar" sobre algo que Aelium tiene suspendido aplica el `unsuspend_service` que realinea); (d) cuando Aelium lo tiene `suspended` se fuerza `info.status='suspended'` (header + banner + badge coherentes, también si el proveedor lo da por cancelado/eliminado por una desincronización); cuando Aelium lo tiene `active` y el proveedor reporta algo MÁS restrictivo (`suspended`/`cancelled`/`expired`) **no** se baja `info.status` a `active` — el cliente realmente no puede usar el servicio ahora; el admin lo resuelve con "Realinear" (suspensión) o re-aprovisionar / cancelar formalmente (proveedor lo da por eliminado).

**Ampliación 2026-05-12 (testing Yasmin — `MockEnhanceServer` reiniciado):** el caso real que destapó el alcance: se suspende un servicio (`services.status='suspended'` + `patchSubscription({isSuspended:true})` al mock, ambos OK en el audit), luego el proceso del mock in-memory se reinicia y pierde el estado → la suscripción vuelve a reportar (en este caso) `deleted` → `info.status='cancelled'` mientras `services.status` sigue `suspended`. Antes la página `/admin/services/[id]` mezclaba badges (header "Cancelado" de `info.status`, banner "Suspendido" de `services.status`) y no ofrecía ninguna acción de salida. La condición de la reconciliación de F.4.1 se generalizó de "proveedor reporta `active`/`suspended` y discrepa" a "proveedor *accesible* y `info.status !== services.status`" — cubre `cancelled`/`expired` además de `active`. En producción contra Enhance real esta causa concreta (mock que olvida estado) no ocurre, pero el equivalente sí (alguien des-suspende o elimina la suscripción directamente en el panel del proveedor) — F.4.1 lo trata igual: `services.status` manda para el lifecycle administrativo, la UI lo muestra coherente, y el desfase se señala + se ofrece realinear (proveedor←Aelium, nunca al revés — el reconcile cron tampoco auto-des-suspende, que desharía la decisión administrativa). El "Realinear" sobre una suscripción que el proveedor da por eliminada fallará con error claro (`PROVIDER_RESYNC_FAILED`) → el admin sabe que necesita re-aprovisionar; pulir ese mensaje específico ("la suscripción ya no existe en el proveedor → re-aprovisionar") queda para la era F.9 (reconcile per-servicio) — F.4 ya elimina el "estado roto sin salida".

**Refinamiento posterior (Fase F.5, 2026-05-12):** F.5 introduce el escenario "servicio `internal`/`manual` suspendido por impago" (el cron de billing migrado a `suspendAsAdmin` con `allowUnsupported: true` → suspensión solo del lado de Aelium para plugins sin `supports_suspend`). Para que el cliente lo vea suspendido en `/dashboard/services/[id]` (donde `isSuspended` se deriva de `info.status`), el override de `info.status='suspended'` de F.4.1 dejó de estar gateado en `plugin.capabilities.supports_suspend` — ahora aplica a **cualquier** plugin cuando `services.status==='suspended'` (re-derivando también `availableActions` desde `'suspended'`, que para un plugin sin la capability = sus inline actions tal cual, normalmente `[]`). El flag `provider_state_desync`, en cambio, sigue gateado en `supports_suspend` (un plugin que no modela la suspensión no tiene "estado de proveedor" con el que estar en sync). Es la materialización del principio ya enunciado en F.4 ("`services.status` es autoritativo para el lifecycle administrativo") — F.5 lo extiende al caso de plugins no-suspend porque es la fase que lo necesita.

### A.11.10.2. Fase F.5 — `DC.44` billing-suspend-unify

> ✅ **CERRADA, mergeada a master** — PR [#72](https://github.com/yasmindanailov/dashboard/pull/72) squash-merge `72a8b0f` 2026-05-13 (bypass policy §6, 7ª aplicación → post-merge doc-sync patrón #61/#64/#66/#68/#71). Las decisiones no se re-litigan. **Después de F.5 viene F.6** (notas operativas vía `ClientNote` — §A.11.10.3). **Materializado**: F.5.1 (`autoSuspendServices` → `suspendAsAdmin(serviceId, {reason:'overdue_payment', internal_note:'Factura N', notify_client:true}, null, undefined, {actorLabel:'system:billing-overdue-cron', allowUnsupported:true})` — punto único de transición de estado; idempotente; arregla de paso el bug del `prisma.update` crudo que revivía servicios cancelados) ✅ + F.5.2 (convención "actor sistema": `actorUserId: null` + `opts.actorLabel` → `audit_change_log.changes_after.actor` + evento con `actor` + `actor_user_id: null`; sin `audit_access_log`; plumbing en `suspendAsAdmin`/`unsuspendAsAdmin` + `ExecuteActionContext` — `actorUserId: string | null` + `actorLabel?`; `notifications-on-service-suspended` simplificado — sin path legacy) ✅ + F.5.3 (`ProvisioningService.reactivateSuspendedServiceOnPayment(serviceId)` + `ReactivateServicesOnInvoicePaidListener` `@OnEvent('invoice.paid')` en `ProvisioningModule` → reactiva **solo si** `suspended` con motivo `overdue_payment`, vía `unsuspendAsAdmin` actor `'system:billing-on-invoice-paid'`) ✅ + **decisión pre-código resuelta**: `allowUnsupported: true` (un único punto de transición de estado — `suspendAsAdmin`/`unsuspendAsAdmin` aceptan plugins `supports_suspend=false`, sin inline action que invocar; para el caso humano se omite → 409 `SUSPEND_NOT_SUPPORTED`) ✅ + **refinamiento F.4.1** (`getInfoForUser` fuerza `info.status='suspended'` para *cualquier* plugin cuando `services.status` lo está — el cliente ve suspendido un servicio `internal`/`manual` suspendido por impago; el flag `provider_state_desync` sigue gated en `supports_suspend`) ✅ + tests (`provisioning.service.spec` — suspend/unsuspend actor sistema + `allowUnsupported` + `reactivateSuspendedServiceOnPayment` ×4; `service-lifecycle.worker.spec` NUEVO ×5; `reactivate-services-on-invoice-paid.listener.spec` NUEVO ×4; `notifications-on-service-suspended.spec` actualizado) ✅ + `pnpm ci:check:full` verde (51 suites, 691 passed + 5 skipped; `nest build` + `next build`) + boot real verificado (`BillingModule` importa `ProvisioningModule` — sin ciclo; DI ok; `ReactivateServicesOnInvoicePaidListener` registrado). **ADR-077 sin cambios** (no toca el contrato). **No unificado** (deliberado, fuera de scope F.5 — L18): `service.resumed` (flujo pause) ↔ `service.unsuspended` (conceptos distintos); `autoCancelServices` sigue con su `prisma.update` (migrarlo a `deprovisionAsAdmin` sería destructivo — DELETE en el proveedor — candidato a fase/`DC.NEW` aparte). `backlog.md` (`DC.44` → materializado en F.5) actualizado. Pendiente: merge (bypass §6 si la CI sigue billing-bloqueada) + post-merge doc-sync.

**Tema:** la suspensión por impago va por el mismo camino canónico que la suspensión manual — la BD y el proveedor no divergen para el caso impago, y se reactiva sola al pagar. (Va **antes** de F.6 para que la suspensión por impago ya pase por `suspendAsAdmin` y la creación del `ClientNote` de F.6 la cubra automáticamente.)

- **F.5.1 — `ServiceLifecycleWorker.autoSuspendServices` → `suspendAsAdmin`.** El cron de impago (diario 03:00, retries agotados) hoy hace su propio `prisma.service.update(status:'suspended')` + emite la forma reducida `{service_id, invoice_id, reason:'payment_exhausted'}`. Tras F.5.1: llama a `ProvisioningService.suspendAsAdmin(serviceId, { reason: 'overdue_payment' }, <actor sistema>, { notify_client: true })` — pasa por la inline action `suspend_service` del plugin (`patchSubscription({isSuspended:true})` en Enhance), `prisma.update`, `service.suspended` con la forma completa, audit. → BD y proveedor coinciden.
- **F.5.2 — Convención "actor sistema".** Para acciones del orquestador sin actor humano (este cron, y futuros): `actor_user_id: null` + `metadata.actor: 'system:billing-overdue-cron'` en el audit (taxonomía `system:<dominio>-<cron|job>`). El listener `notifications-on-service-suspended` ya tolera `user_id` derivado — tras F.5 ya viene en la forma completa, sin el path legacy.
- **F.5.3 — Auto-reactivación al pagar.** Nuevo listener (o ampliar `billing-on-invoice-paid`): si el service estaba `suspended` con `suspension_reason` derivado de impago → `ProvisioningService.unsuspendAsAdmin(serviceId, <actor sistema>)`. (Evaluar también unificar `service.resumed` [flujo pause] ↔ `service.unsuspended` [flujo suspend].)
- **Decisión pre-código:** ¿`suspendAsAdmin` permite suspender plugins `supports_suspend=false` (`internal`/`manual`) para el caso impago (parámetro `allowUnsupported: true` que el worker pasa), o el worker hace su propio `prisma.update` para esos y solo delega a `suspendAsAdmin` los que tienen la capability? Recomendado evaluar lo primero (mantiene un único punto de transición de estado).
- **ADR amendments:** ninguno del contrato. Doc: actualizar `DC.44` en `backlog.md` (→ "materializado en Fase F.5"); dossier §A.11.
- **DoD F.5:** `autoSuspendServices` migrado a `suspendAsAdmin`; convención "actor sistema" documentada; auto-reactivación al pagar; tests (`autoSuspendServices` migrado; listener de auto-reactivación; el actor-sistema en el audit); `pnpm ci:check:full` + boot; PR + post-merge sync.
- ⚠ Toca el módulo billing (`ServiceLifecycleWorker`, `billing-on-invoice-paid`) — scope expansion **justificada**: es el fix de raíz del agujero de robustez de suspensión (no un nice-to-have). El desync (F.4.1) queda como red de seguridad para los casos no-impago.

### A.11.10.3. Fase F.6 — Notas operativas vía `ClientNote` (sistema transversal de notas)

> ✅ **CERRADA, mergeada a master** — PR [#75](https://github.com/yasmindanailov/dashboard/pull/75) squash-merge `c9802e4` 2026-05-13 (bypass policy §6 — 9ª aplicación; patrón #61/#64/#66/#68/#71/#73). Cierre commit-by-commit + decisiones reales tomadas en **§A.11.10.3.3**.

**Tema:** las acciones críticas de lifecycle de servicio dejan rastro en el **sistema transversal de notas `ClientNote`** (Sprint 16 / ADR-079 §3.8), igual que cerrar-ticket / delegar-chat / completar-tarea — todas las notas operativas sobre un cliente en un mismo sitio.

- **F.6.1 — `ClientNote` para las transiciones de lifecycle.** `ClientNotesService` (`modules/clients/`) gana un método `createFromServiceLifecycleAction({ user_id: <dueño del servicio>, author_id: <admin | null sistema>, source_id: <serviceId>, triggered_by_action, body, category })` — análogo a `createFromMaintenanceCompletion(...)` / el de ticket-close. Lo invocan:
  - **Cancelar / suspender / reactivar manual** (admin): el modal (`CancelServiceModal` / `SuspendServiceModal` `mode='suspend'|'unsuspend'`) pide la nota — **obligatoria** (toda transición de lifecycle manual se documenta) — y al ejecutar la acción se crea el `ClientNote` (`source_system='service'`, `source_id=serviceId`, `triggered_by_action='service.cancelled'|'service.suspended'|'service.unsuspended'`, `author_id=<admin>`, `body=<texto del modal, prefijado con el contexto: "Servicio <dominio> <acción> — Motivo: <enum label> — <nota>">`).
  - **Auto-suspensión por impago** (F.5, automático — sin modal): se crea el `ClientNote` igual pero con `triggered_by_action='service.auto_suspended_overdue'`, `author_id=null` (actor sistema), `body` con la factura ("Suspendido automáticamente por impago — Factura #X").
  - **"Añadir nota" del admin** en `/admin/services/[id]`: crea un `ClientNote` con `source_system='service'`, `source_id=serviceId`, `triggered_by_action='manual_entry'` (caso que el schema ya soporta) — esto **supersede** el `service_notes` table que se había apuntado: NO se crea tabla nueva.
- **F.6.2 — El motivo-enum sigue siendo un campo (categórico), separado de la nota (narrativa).** `services.suspension_reason` / `cancellation_reason` pasan a guardar **solo el enum** (no el `"<motivo>: <nota>"` combinado actual). El motivo-enum se renderiza como etiqueta destacada en el banner del servicio + alimenta la etiqueta cliente-segura (el email + el banner del cliente de F.4.2). La nota libre vive en el `ClientNote`. (Separación limpia categórico/narrativa — L13.)
- **F.6.3 — Dos vistas, una entidad.** El `ClientNote` se renderiza en (a) `/admin/services/[id]` — las notas de *este* servicio inline (`WHERE source_system='service' AND source_id=serviceId`, con el form "añadir nota"), y (b) `/admin/clients/[id]` → "Notas" — *todas* las del cliente (servicio + tickets + tareas + …), como las de los demás módulos, con el tag de proceso (`triggered_by_action`) + el link (`source_system='service'` + `source_id` → `/admin/services/[id]`). **No duplicación** — un solo `ClientNote`, dos vistas. **Staff-internal** — el cliente NUNCA ve el `ClientNote` (solo el motivo-enum localizado en su banner F.4.2).
- **F.6.4 — Migración (one-shot).** Recorre las filas de `services` con `cancellation_reason` / `suspension_reason` no-null: parte el string `"<motivo>: <nota>"` → deja `<motivo>` (el enum) en la columna y crea un `ClientNote` retroactivo con `<nota>` (`source_system='service'`, `source_id=serviceId`, `triggered_by_action='service.cancelled'|'service.suspended'`, `created_at=cancelled_at|suspended_at`, `author_id=`<superadmin como fallback — autor original desconocido, anotado en el body>). Fallback: filas sin `": "` → todo va al enum, sin nota. Sin esto, los servicios cancelados/suspendidos *antes* de F.6 no aparecerían en `/admin/clients/[id]` → "Notas" — vista incompleta.
- **ADR amendments:** ADR-079 amendment — `NoteSourceSystem.service` (valor nuevo del enum) + nuevos `triggered_by_action` (`service.cancelled` / `service.suspended` / `service.unsuspended` / `service.auto_suspended_overdue`) + (si hace falta) un `NoteCategory` nuevo (`lifecycle` o reutilizar uno existente) + el renderizado del link `source_system='service'` → `/admin/services/[id]` en la vista consolidada.
- **DoD F.6:** los 4 caminos crean `ClientNote` correctamente (cancel/suspend/unsuspend manual con nota obligatoria; auto-suspend con nota auto; "añadir nota" admin); el motivo-enum desacoplado del campo; el servicio renderiza sus notas inline + salen en `/admin/clients/[id]` → "Notas"; migración aplicada (con fallback); el cliente NO ve el `ClientNote`; tests (`createFromServiceLifecycleAction`; los modales obligan la nota; el desacople enum/nota; la migración); `pnpm ci:check:full` + boot; PR + post-merge sync.
- **Valoración pre-código:** (1) ¿el `ClientNote` se crea desde el orquestador (`suspendAsAdmin`/`deprovisionAsAdmin` llaman a `ClientNotesService`) o vía evento (`service.suspended`/`service.cancelled` → listener `notes-on-service-lifecycle`)? — seguir el patrón que use Sprint 16 para ticket-close (probablemente evento, dado DC.40 skip-sync). (2) `author_id` para la migración de filas viejas: ¿superadmin con anotación, o `null` si el schema lo permitiera (no — FK no-null)? (3) ¿`unsuspend` obligatoria también? — sí (coherencia: toda transición de lifecycle manual se documenta). (4) ¿`NoteCategory` nuevo `lifecycle` o reutilizar?

#### A.11.10.3.1. Hallazgos del audit pre-código F.6 (sesión 2026-05-13, post-merge F.5)

> Antes de arrancar F.6 (en otra conversación), este audit del estado real del código + ADR-079 cierra ambigüedades y refina las preguntas pre-código. **El siguiente agente NO necesita re-descubrir nada de esto** — solo confirmar las opciones recomendadas con Yasmin (o aceptar la recomendación por defecto) y materializarlas.

**Estado real del código (verificado contra master `72a8b0f` + ADR-079 §3.8):**

1. **`ClientNote` existe** (modelo Prisma en [`backend/prisma/schema.prisma:706-736`](../../backend/prisma/schema.prisma)) con el shape final de ADR-079 §3.8: `user_id` (cliente), `author_id` (staff, NOT NULL + FK a `User`), `category: NoteCategory`, `body: text`, `source_system: NoteSourceSystem`, `source_id: uuid?`, `triggered_by_action: varchar(100)?`, `is_pinned: bool`, `created_at`. Índices `(user_id, created_at desc)`, `(source_system, source_id)`, `(category)`. **NoteSourceSystem enum actual: `ticket | chat | maintenance_log | task_completion | exceptional`** — F.6 añade `service` como 6º valor.

2. **`ClientNotesService` existe** ([`backend/src/modules/clients/client-notes.service.ts`](../../backend/src/modules/clients/client-notes.service.ts)) con la API canónica: `createFromTicketCompletion` / `createFromMaintenanceCompletion` / `createFromTaskCompletion` / `createExceptional`. **Patrón canónico = DIRECT CALL desde el módulo originador** (NO event-driven): `SupportService.resolveTicket(...)` llama a `clientNotesService.createFromTicketCompletion(...)`, `MaintenanceLogService.recordCompletion(...)` llama a `createFromMaintenanceCompletion(...)`, etc. F.6 sigue el mismo patrón: añadir `createFromServiceLifecycleAction(...)` y que `ProvisioningService.suspendAsAdmin` / `unsuspendAsAdmin` / `deprovisionAsAdmin` lo llamen **directamente**. **Esto resuelve pre-código (1)**: direct-call confirmado por el codebase — NO se usa event-listener. (Razón: el caller tiene el `body` del modal en la mano y propaga el `author_id` real; un listener requeriría re-resolver ambas cosas vía el payload del evento, lo cual es más frágil. El bridge-pattern DC.40 / `skipXxxSync` aplica a *loops* event↔service del mismo módulo — no aplica aquí, que es service A llama a service B sin que B emita de vuelta.)

3. **`author_id` es `String @db.Uuid` NOT NULL con FK** a `User` (sin `onDelete`). El dossier original asumía `author_id: null` para el actor sistema (auto-suspend por impago cron) — **el schema NO lo permite hoy**. Decisión pre-código necesaria (NUEVA, no estaba antes):
   - **Opción A — schema migration**: `author_id String? @db.Uuid` (nullable) + actualizar FK a `onDelete: SetNull`; ADR-079 amendment formaliza "actor sistema = `author_id: null`". Coherente con la convención "actor sistema" que F.5 ya estableció en `audit_change_log.changes_after.actor` (allí `user_id` ya es nullable). Toca: migración Prisma + `ClientNotesService` + tests + frontend `ClientNotesTab` ("autor: Sistema (`actor`)").
   - **Opción B — usuario "sistema" sintético**: seedear un `User` con email `system@aelium.internal` + `role: superadmin` (o un rol dedicado `system_actor`) y usarlo como `author_id` para las notas auto. Sin schema change. Contra: ese `User` aparece en listings, audits, etc. — contaminación + necesidad de filtrar.
   - **Recomendado**: opción **A** (schema nullable). Es la materialización honesta del patrón "actor sistema" ya aceptado en F.5 (`actor_user_id: string|null` en eventos + audit). ADR-079 amendment lo registra como decisión canónica heredable. (Opción B contamina el modelo `User`.)

4. **`NoteCategory` actual**: `support | maintenance | onboarding | billing | project | technical_incident | exceptional` (7 valores, ADR-079 §3.8). Pre-código (4): ¿reutilizar uno o añadir `lifecycle`/`service_lifecycle`? **Recomendado**: añadir `lifecycle` (nuevo 8º valor) — las notas de cancel/suspend/unsuspend de servicio NO son `support` (no es atención al cliente), NO son `billing` (la nota del cron de impago es operacional, no contabilidad), NO son `exceptional` (no son notas libres del agente; son trazas de acciones canónicas). Una categoría nueva refleja honestamente la dimensión "lifecycle del servicio" — heredable cuando F.5+ era una era. ADR-079 amendment añade el valor.

5. **`unsuspend` con nota obligatoria** (pre-código 3): **sí — confirmado**. Toda transición de lifecycle manual deja traza con razón humana. El `SuspendServiceModal` ya pide nota en el modo `suspend`; F.6 extiende a `unsuspend` (mismo modal, modo='unsuspend', textarea nota obligatoria).

6. **Migración** (pre-código 2 + F.6.4): `author_id` para filas viejas con `cancellation_reason`/`suspension_reason` no-null. Si la opción A (schema nullable) se materializa, **la migración usa `author_id: null`** (el autor original es desconocido; un fallback "superadmin" sería mentir sobre quién escribió la nota). El `body` del `ClientNote` retroactivo incluye `"[Migración 2026-05-XX — autor original no registrado]"` + la nota parseada. (Si opción B se elegiera, `author_id` = el usuario "sistema" sintético.)

**Decisiones pre-código consolidadas (recomendadas):** (1) **direct-call** (codebase ya lo usa para los otros 4 casos). (2) **`author_id: null`** vía schema nullable (opción A). (3) **`unsuspend` obligatoria** sí. (4) **`NoteCategory.lifecycle`** nuevo. (5 — NUEVA) **Schema migration** para `author_id String? @db.Uuid` + `onDelete: SetNull` + ADR-079 amendment "actor sistema = `author_id: null`".

**Decisión adicional sobre el `body` del actor sistema** (no estaba en el apuntado original): para el auto-suspend por impago, el `body` se compone en el call site del cron — `\`Suspendido automáticamente por impago — Factura ${invoice.invoice_number}\`` (la misma cadena del antiguo `suspension_reason`, ahora alojada en el `ClientNote` en vez de en la columna combinada). El llamador es `ServiceLifecycleWorker.autoSuspendServices` → pasa el body en el DTO `internal_note` (que ya viaja a `suspendAsAdmin` desde F.5) → `suspendAsAdmin` invoca `clientNotesService.createFromServiceLifecycleAction({ body: dto.internal_note ?? '<sin nota>', author_id: actorUserId, ... })`. Para `unsuspendAsAdmin` (que hoy no tiene DTO), F.6 le añade un parámetro `internal_note?: string` opcional (obligatorio en el path admin/modal — el modal pide la nota; ausente en el path auto-reactivación al pagar, donde el body lo compone el listener: `\`Reactivado automáticamente al pagar la factura ${invoice.invoice_number}\``).

#### A.11.10.3.2. Refinamientos pre-código F.6 — Amendment (sesión 2026-05-13, post-handoff `9c9a639`)

> Tres refinamientos al apuntado original consolidados como **Amendment** (L18 — el dossier debe estar al día con las decisiones consolidadas ANTES de abrir la rama F.6, sin desvío silencioso). Sesión continuación del handoff F.5→F.6 sobre la misma rama de docsync `sprint15c-ii-fase-f5-postmerge-docsync`.

**R1 — Firma `unsuspendAsAdmin` con DTO (simetría con `suspend`/`deprovision`).**

El handoff propuso "añadir parámetro `internal_note?: string` opcional a `unsuspendAsAdmin`". Refinamiento: **crear `UnsuspendServiceDto`** y pasar el DTO posicional como en sus dos hermanos. Razón: hoy [`suspendAsAdmin(serviceId, dto, actorUserId, ctx?, opts?)`](../../backend/src/modules/provisioning/provisioning.service.ts#L976) y [`deprovisionAsAdmin(serviceId, dto, actorUserId, ctx)`](../../backend/src/modules/provisioning/provisioning.service.ts#L855) reciben DTO; añadir un parámetro suelto `internal_note` a `unsuspend` rompe la simetría de las tres firmas paralelas y dispersa la validación (`class-validator` viviría en dos sitios distintos). Firma resultante:

```ts
class UnsuspendServiceDto {
  @IsOptional() @IsString() @MaxLength(1000) internal_note?: string;
}

unsuspendAsAdmin(
  serviceId: string,
  dto: UnsuspendServiceDto,
  actorUserId: string | null,
  ctx?: { ipAddress?: string; userAgent?: string | null },
  opts?: { actorLabel?: string; allowUnsupported?: boolean },
)
```

El path auto-reactivar al pagar ([`reactivateSuspendedServiceOnPayment` línea 1310](../../backend/src/modules/provisioning/provisioning.service.ts#L1310)) pasa `{ internal_note: \`Reactivado automáticamente al pagar la factura ${invoice.invoice_number}\` }` — el listener resuelve el `invoice_number` de la factura pagada y compone el body en el call site (paralelo perfecto a `autoSuspendServices` de F.5). El path admin/modal pasa el `internal_note` del modal directamente.

**R2 — Validación backend "nota obligatoria" (defense-in-depth).**

La obligatoriedad de la nota NO puede vivir solo en el modal: alguien con curl saltándose el modal llegaría al endpoint con `internal_note` vacío. Regla canónica:

| Path | `actorUserId` | `internal_note` obligatorio en backend |
|------|---------------|---------------------------------------|
| Admin/modal (`suspendAsAdmin`/`unsuspendAsAdmin`/`deprovisionAsAdmin`) | `string` (admin) | **Sí** |
| Sistema (cron `autoSuspendServices`, listener auto-reactivar) | `null` | **No** (el listener/cron compone el body con datos canónicos) |

Materialización: la validación vive **en el método de servicio**, no en el DTO (el mismo DTO sirve para ambos paths; no podemos marcar `@IsNotEmpty()` global). Patrón:

```ts
if (actorUserId !== null && !dto.internal_note?.trim()) {
  throw new BadRequestException({
    code: 'NOTE_REQUIRED',
    message: 'La nota interna es obligatoria para acciones manuales de lifecycle.',
  });
}
```

Aplica a las tres operaciones admin (`suspend`/`unsuspend`/`deprovision`). El frontend modal sigue validando `required` antes de submit (UX); el backend lo refuerza (R7 — defense-in-depth). NOTA: `deprovisionAsAdmin` hoy usa [`DeprovisionDto.notes?`](../../backend/src/modules/provisioning/dto/provisioning.dto.ts#L119-L122) (naming distinto a `internal_note`); F.6 NO toca ese nombre (scope creep — apunte separado al backlog: alinear naming `notes`↔`internal_note` en una pasada post-15C.II), pero la misma regla aplica.

**R3 — Atomicidad: `service.update` + `ClientNote.create` en `$transaction`.**

Hoy `suspendAsAdmin` ejecuta: invoca plugin → `prisma.service.update` (status + suspension_reason + suspended_at) → cache invalidate → emit evento → audit. F.6 añade un 6º paso (crear `ClientNote`). Si la nota falla (BD caída, FK rota, validación), **el status YA cambió + el plugin YA suspendió + el cliente YA recibió email** — el `ClientNote` quedaría como eslabón débil y el timeline de `/admin/clients/[id]` → "Notas" tendría huecos sin explicación.

Decisión: envolver **`service.update` + `clientNote.create` en `prisma.$transaction([...])`**. Ambas ops o ninguna — son del mismo modelo (`Service`/`ClientNote`) en la misma BD, baratas (sin I/O externo dentro). Si la nota falla, el status no transita; un retry del admin (`suspendAsAdmin` es idempotente por el guard `'suspended' → no-op`) re-aplica el `suspend_service` en el proveedor (el provider call es idempotente por contrato — A4.4 ADR-077).

Lo que queda **fuera** de la transacción:

| Paso | ¿En tx? | Razón |
|------|--------|-------|
| `plugin.executeAction('suspend_service')` | No | I/O externo (HTTP al proveedor); puede tardar segundos; bloquearía el row lock. Idempotente por contrato A4.4. |
| `prisma.service.update` | **Sí** | Transición de estado canónica. |
| `clientNote.create` (vía `ClientNotesService.createFromServiceLifecycleAction`) | **Sí** | Traza de la transición. |
| `cache.invalidate` | No | Side effect en Redis; se ejecuta tras commit. |
| `events.emit('service.suspended')` | No | Side effect; los listeners (notificaciones) consumen el estado ya committed. |
| `audit.logChange` + `audit.logAccess` | No | Tabla separada con su propia política de consistencia (mismo patrón que F.1-F.5). |

Si el evento/audit/cache fallan post-commit: log-warn (no revierte — el estado es la fuente de verdad operacional). Patrón canónico Sprint 15C.II — aceptado en F.1-F.5.

**Implicación para `ClientNotesService`:** `createFromServiceLifecycleAction` debe poder ejecutarse dentro de una `$transaction` ajena. Patrón: el método acepta un `tx?: Prisma.TransactionClient` opcional y, si viene, usa `tx.clientNote.create(...)` en vez de `this.prisma.clientNote.create(...)`. Los otros 4 `createFromXxx` siguen funcionando sin cambio (no necesitan transacción). Ejemplo:

```ts
async createFromServiceLifecycleAction(
  input: { user_id; author_id: string | null; service_id; triggered_by_action; body; category },
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? this.prisma;
  return client.clientNote.create({ data: { ... } });
}
```

Y en `suspendAsAdmin`:

```ts
const [updated, _note] = await this.prisma.$transaction([
  this.prisma.service.update({ where: { id }, data: { status: 'suspended', ... } }),
  // Se prepara la creación de la nota inline en lugar de delegar al service
  // helper para mantener una sola statement por op en la tx — alternativa:
  // pasar el `tx` al helper. Decidir en codificación.
]);
```

Decisión final entre "inline `clientNote.create` en la tx" vs "pasar `tx` al helper" — decidir en la implementación. Lo invariante es: ambas operaciones bajo el mismo commit.

**Lección heredable candidata (L19, a confirmar en G.4):** *"Las transiciones de lifecycle de un service + la traza operativa correspondiente (`ClientNote`, `audit_change_log` no — su consistencia es más laxa) viven en la misma transacción Prisma. Plugin calls + eventos + cache invalidations quedan fuera (asimétricos por naturaleza: el provider call es idempotente por contrato; los listeners consumen estado ya committed)."*

**Recap de las 5 decisiones pre-código + 3 refinamientos (consolidado final F.6):**

| # | Decisión | Origen |
|---|----------|--------|
| 1 | `ClientNotesService.createFromServiceLifecycleAction` invocado **direct-call** desde `ProvisioningService` | handoff §A.11.10.3.1 |
| 2 | `ClientNote.author_id` **nullable** (`String? @db.Uuid` + `onDelete: SetNull`) | handoff §A.11.10.3.1 |
| 3 | `unsuspend` con **nota obligatoria** en path admin/modal | handoff §A.11.10.3.1 |
| 4 | `NoteCategory.lifecycle` (8º valor) | handoff §A.11.10.3.1 |
| 5 | Schema migration + **ADR-079 amendment** "actor sistema = `author_id: null`" + `NoteSourceSystem.service` + `NoteCategory.lifecycle` | handoff §A.11.10.3.1 |
| **R1** | **`UnsuspendServiceDto`** + firma simétrica `unsuspendAsAdmin(id, dto, actor, ctx?, opts?)` | refinamiento §A.11.10.3.2 |
| **R2** | **Validación backend `internal_note` obligatorio si `actorUserId !== null`** (defense-in-depth) en `suspend`/`unsuspend`/`deprovision` | refinamiento §A.11.10.3.2 |
| **R3** | **`$transaction([service.update, clientNote.create])`** (plugin + eventos + cache + audit fuera) — `createFromServiceLifecycleAction` acepta `tx?: Prisma.TransactionClient` opcional | refinamiento §A.11.10.3.2 |

#### A.11.10.3.3. Cierre F.6 — commit-by-commit + decisiones reales (sesión 2026-05-13)

> Registro de cierre canónico (patrón §A.11.9 cierre F.3, §A.11.10.1.1 cierre F.4, §A.11.10.2.1 cierre F.5). Lo que la próxima sesión IA necesita saber sin re-litigar.

**Commits en la rama** `sprint15c-ii-fase-f6-client-note-lifecycle` (squash en `c9802e4`):

| # | SHA local | Tipo | Resumen |
|---|-----------|------|---------|
| 1 | `e308b19` | feat | Implementación F.6 completa — 21 archivos, +946 / -107: schema migrations (×2) + service + DTOs + R1/R2/R3 + F.6.2 + listener + cron body + frontend modals + `<ServiceNotesCard>` + `<ClientNotesTab>` + types + ADR-079 A4 + tests existentes actualizados |
| 2 | `eb5fd8b` | chore | Fixes de auditoría profesional pre-merge: (1) `@AuditAccess('Service')` faltaba en `GET /admin/services/:id/notes` — los demás endpoints admin de lectura sí lo tenían (GDPR transparency); (2) `<a href>` → Next `<Link>` en `ServiceNotesCard` (client navigation + prefetch + scroll restoration) |

**Decisiones reales tomadas durante la implementación** (vs apuntado del dossier original §A.11.10.3 + refinamientos §A.11.10.3.2):

1. **Patrón de invocación canónico = direct-call (confirmado contra master).** El audit pre-código §A.11.10.3.1 ya lo había verificado contra los 4 `createFromXxx` existentes (`createFromTicketCompletion`, `createFromMaintenanceCompletion`, `createFromTaskCompletion`, `createExceptional`); F.6 mantiene la coherencia — `ProvisioningService.suspend|unsuspend|deprovisionAsAdmin` llaman directamente al helper, NO via event-listener. Argumento que cerró el debate: el caller tiene el `body` y el `author_id` ya resueltos en el call site; un listener requeriría re-resolverlos vía el payload del evento (más frágil + redundante).

2. **`author_id` nullable (Opción A schema migration, no Opción B "usuario sistema" sintético).** Materializado: `ClientNote.author_id String? @db.Uuid` + FK `ON DELETE SET NULL`. Razón: alinea con la convención que F.5 ya estableció en `audit_change_log.user_id` + eventos `service.*` (`actor_user_id: string|null` + `actor: 'system:<label>'`). `ON DELETE SET NULL`: si un admin se elimina, sus notas se preservan (historial operativo del cliente intacto) — la UI las renderiza como `'Sistema'` (`findByClient` enriquece). Opción B descartada por contaminación del modelo `User` (listings, audits, FKs).

3. **`NoteCategory.lifecycle` (8º valor, nuevo).** Las transiciones de servicio NO son `support` (no es atención al cliente), NO son `billing` (operacional, no contabilidad), NO son `exceptional` (son trazas canónicas de una acción, no nota libre del agente). Categoría nueva refleja honestamente la dimensión "lifecycle del servicio" — heredable para futuros plugins SaaS que añadan operaciones de lifecycle admin.

4. **`unsuspend` con nota obligatoria (sí).** Toda transición de lifecycle manual deja traza con razón humana — coherencia con `suspend`/`cancel`. El path auto (`reactivate-services-on-invoice-paid` listener) NO pasa por modal: el listener compone el body backend-side con el nº de factura.

5. **R1 materializado como `UnsuspendServiceDto` (no parámetro suelto).** El handoff §A.11.10.3.2 proponía "añadir parámetro `internal_note?: string` opcional"; el refinamiento mejoró a "crear DTO" por simetría con `SuspendServiceDto` / `DeprovisionDto`. Beneficios verificados: (a) las 3 firmas paralelas (`suspendAsAdmin(id, dto, ...)`, `unsuspendAsAdmin(id, dto, ...)`, `deprovisionAsAdmin(id, dto, ...)`) son ahora idénticas en shape; (b) la validación `class-validator` vive en un solo sitio; (c) el path auto-reactivar al pagar pasa `{ internal_note: \`Reactivado automáticamente al pagar la factura ${invoiceNumber}\` }` como cualquier otro caller.

6. **R2 vive en el servicio, no en el DTO.** El mismo DTO sirve a dos paths: admin/modal (donde la nota es obligatoria) y sistema (cron + listener — el caller compone el body). No se puede marcar `@IsNotEmpty()` en el DTO sin romper el path sistema. Materialización: `if (actorUserId !== null && !dto.internal_note?.trim()) throw new BadRequestException(...)` en cada uno de los 3 métodos `suspendAsAdmin`/`unsuspendAsAdmin`/`deprovisionAsAdmin`. **Naming**: `deprovisionAsAdmin` usa `dto.notes` (no `dto.internal_note`) — heredado del `DeprovisionDto` anterior. **Apunte al backlog**: alinear naming `notes`↔`internal_note` en una pasada post-15C.II (fuera de scope F.6 — scope creep).

7. **R3 callback-form de `$transaction` (no array-form).** Materializado: `await this.prisma.$transaction(async (tx) => { ... })` con `tx.service.update(...)` + `await this.clientNotes.createFromServiceLifecycleAction({...}, tx)`. La opción array-form (`$transaction([promiseA, promiseB])`) habría requerido inline en cada caller — el callback-form permite usar el helper `createFromServiceLifecycleAction` con `tx` propagado vía parámetro opcional. Lo que queda **dentro** de la tx: solo `service.update` + `clientNote.create`. Lo que queda **fuera**: `executeActionWithCacheInvalidation` (plugin call HTTP, idempotente por contrato A4.4), `cache.invalidate`, `events.emit`, `audit.logChange`, `audit.logAccess`. Tabla de razones en §A.11.10.3.2 — R3.

8. **`triggered_by_action` discrimina manual vs auto.** 5 valores nuevos: `service.cancelled` / `service.suspended` / `service.unsuspended` / `service.auto_suspended_overdue` / `service.auto_unsuspended_overdue`. Heurística en el servicio: `actorUserId === null && opts?.actorLabel?.startsWith('system:billing-')` → variante `auto_*`. Asimetría observada y aceptada: `suspendAsAdmin` usa `startsWith('system:billing-')` (genérico — futuros crons billing-* lo heredan); `unsuspendAsAdmin` usa `=== 'system:billing-on-invoice-paid'` (más estricto — hoy es el único path auto unsuspend). Ambas correctas para F.6.

9. **F.6.2 ejecutado: `suspension_reason`/`cancellation_reason` solo enum.** `parseSuspensionReasonCode` queda **defensivo** a ambos formatos (split por `": "` devuelve el string completo si no hay separador, que coincide con el enum). Útil contra rollback parcial y para el listener `notifications-on-service-suspended` que sigue siendo defensivo (`normalizeReason` mantiene la guarda — heredada de F.5).

10. **F.6.4 migración data en archivo separado (no inline).** Postgres no permite usar enum value nuevo en la misma transacción que `ALTER TYPE ADD VALUE` — el `INSERT INTO client_notes (..., 'lifecycle', 'service', ...)` necesita commit aparte. Solución: 2 archivos de migración con timestamps consecutivos (`20260513090000_*_schema` + `20260513090001_*_data`), cada uno corre en su propia transacción Prisma. Migración data idempotente: filas sin `": "` se ignoran (formato F.6.2 ya limpio).

11. **`createFromServiceLifecycleAction(input, tx?)` — `tx` opcional.** Diseño deliberado: los 4 `createFromXxx` existentes no necesitan tx (sus callers no envuelven en `$transaction`). El parámetro nuevo es additivo + opcional — el helper hace `const client = tx ?? this.prisma` y usa el cliente correspondiente. Patrón heredable para futuros helpers que deban poder vivir dentro de tx ajenas.

12. **Endpoint `GET /admin/services/:id/notes` con `@AuditAccess('Service')` (descubierto en auditoría profesional).** Detectado revisando el commit antes de mergear: los otros 2 endpoints admin de lectura del controller (`detail`, `audit`) ya tenían el decorator; el nuevo no — pero las notas operativas contienen contexto sensible del cliente (motivos, contexto de impago) y la lectura admin debe quedar en el log GDPR de transparencia. Fix aplicado en commit `eb5fd8b`.

13. **`<ServiceNotesCard>` usa Next `<Link>` (descubierto en auditoría profesional).** Detectado revisando el SC nuevo: `<a href>` provoca full page reload + pierde prefetch / scroll restoration. Fix aplicado en commit `eb5fd8b` (mismo PR antes de merge).

**Cobertura de tests** (state del PR #75):
- `provisioning.service.spec.ts`: 3 firmas de `unsuspendAsAdmin` actualizadas + 4 sitios de `reactivateSuspendedServiceOnPayment(id, invoiceNumber)` + mock de `ClientNotesService` inyectado en el constructor + mock de `$transaction` dual (array + callback form, `tx === prisma` en el callback) + verify de `createFromServiceLifecycleAction` en el camino feliz de `suspend` con `triggered_by_action='service.suspended'` + `body='3 avisos sin respuesta'` + `prisma` como tx + `suspension_reason: 'overdue_payment'` (solo enum, no concatenado) + R2 guard tests (admin con dto vacío → 400 NOTE_REQUIRED; el guard de `SUSPEND_NOT_SUPPORTED` ahora viaja con `internal_note` poblado en el test específico).
- `service-lifecycle.worker.spec.ts`: assert del body self-descriptive `"Suspendido automáticamente por impago — Factura INV-2026-1"` (antes `"Factura INV-2026-1"`).
- `reactivate-services-on-invoice-paid.listener.spec.ts`: verify de `reactivateSuspendedServiceOnPayment(serviceId, invoice.invoice_number)` (firma cambiada).

**Cobertura adicional R1/R2/R3 apuntada al DoD G.1** (no en F.6 — scope creep contenido):
- Path negativo R2 exhaustivo en `deprovisionAsAdmin` (paralelo al de suspend).
- Rollback del `$transaction` si la nota falla — fixture con `clientNotes.createFromServiceLifecycleAction` que lance, verificar que `service.status` NO transita.
- `createFromServiceLifecycleAction` sin `tx` (path direct sin transaction ajena) — coverage del `?? this.prisma`.
- Fixture de la migración data one-shot (split del `"<motivo>: <nota>"`) — verifica el `created_at` preservado + autor null + body con sufijo.

**Bugs detectados / arreglados de paso en F.6:**
- (a) `ClientNotesService.findByClient` rompía cuando `author_id` era null (tras la migración schema) — el `[...new Set(notes.map(n => n.author_id))]` incluía `null` y el `prisma.user.findMany({ where: { id: { in: [...] } } })` recibía un `null` en el array. **Fix**: filtrar nulls antes del findMany + UI renderiza `'Sistema'` para autor null. Cubre el path admin borrado (`ON DELETE SET NULL` deja notas viejas con autor null) y el path actor sistema (notas auto del cron / listener).
- (b) Bug operacional: las migraciones F.6 no estaban aplicadas a la BD local cuando el usuario probó suspender → `prisma.clientNote.create({ category: 'lifecycle' })` falló con Postgres `invalid input value for enum NoteCategory` → la `$transaction` rollback → frontend recibió genérico 500 "Internal server error" (`GlobalExceptionFilter` no surfacea el `PrismaClientKnownRequestError`). **Lección operativa heredable**: `prisma migrate deploy` debe correr ANTES del primer arranque local tras `git pull` de un PR con migrations nuevas. `prisma generate` solo regenera tipos TS (suficiente para `tsc --noEmit` y `nest build`), NO aplica el SQL. Posible apunte al `local-ci-playbook.md` (ver §4 pre-PR canónico).

**ADR-079 Amendment A4 frozen 2026-05-13.** Formaliza:
- `NoteSourceSystem.service` (6º valor) + `NoteCategory.lifecycle` (8º valor).
- `ClientNote.author_id` nullable + FK `ON DELETE SET NULL` ("actor sistema = NULL" canónico).
- 5 nuevos `triggered_by_action`.
- `createFromServiceLifecycleAction(input, tx?)` con `tx?: Prisma.TransactionClient` opcional.
- `findByService(serviceId, options?)`.
- Endpoint `GET /admin/services/:id/notes`.
- Separación enum↔narrativa F.6.2.
- Migración data F.6.4 (idempotente).
- L19 candidata (a confirmar en G.4).

**Compatible hacia atrás:** `parseSuspensionReasonCode` defensivo a ambos formatos; listeners existentes (`createFromTicketCompletion` etc.) intactos — la nueva firma es additiva + el parámetro `tx?` es opcional; `unsuspendAsAdmin` ahora exige body con `internal_note` para el path admin — el cliente legacy (sin body) recibiría 400 `NOTE_REQUIRED` (comportamiento esperado).

### A.11.10.4. Fase F.7 — SSL/TLS status read-only

> ✅ **CERRADA, mergeada a master** — PR [#77](https://github.com/yasmindanailov/dashboard/pull/77) squash-merge `8b8bc47` 2026-05-14 (bypass policy §6, **10ª aplicación** — patrón #57/#60/#63/#65/#67/#70/#72/#74/#75; las 3 condiciones cumplidas: motivo externo + `pnpm ci:check:full` verde + boot real + **smoke real Yasmin 3/3 escenarios** verificado contra `MockEnhanceServer` + sección formal en el cuerpo del PR). Materialización + decisiones reales en **§A.11.10.4.3** abajo. Las decisiones no se re-litigan. **Después de F.7 viene F.8** (alertas de cuota — §A.11.10.5).

**Tema:** cliente y admin ven el estado del certificado que el proveedor gestiona, read-only — sin que Aelium lo gestione (DH-INV-6).

- **F.7.1 — `EnhanceApiClient` lee el estado del cert** de la subscription/website (verificar el path en el OAS de orchd v12.21.3). `getServiceInfo` gana un campo **opcional** `ssl?: { status: 'valid' | 'expiring_soon' | 'expired' | 'none'; expiresAt?: string /* ISO */; autoRenew?: boolean; issuer?: string }` (additivo opcional, mismo patrón que `metrics` / `recoveryHint` — **ADR-077 amendment**). La presencia del campo `ssl` es la señal de capability (si ausente, no card — mismo patrón que `metrics`; NO se añade un flag nuevo a `PluginCapabilities`).
- **F.7.2 — Card SSL** en el detalle de servicio cliente y admin (`frontend/app/_shared/services/SslStatusCard.tsx` + prop `isAdmin` — L16, NO duplicación): badge verde/ámbar/rojo + "expira en X días" + "renovación automática: sí/no" + emisor. **Read-only** — para renovar/cambiar el cert → SSO al panel del proveedor (DH-INV-6).
- **ADR amendments:** ADR-077 amendment (`ServiceInfo.ssl?` campo opcional — patrón A5/A6) + ADR-083 amendment (specifics del probe SSL de Enhance — path orchd, mapeo de campos, threshold de "expiring_soon" p.ej. ≤14 días).
- **DoD F.7:** card SSL cliente + admin (badge + expiry + autoRenew + issuer); tests (`getServiceInfo` puebla `ssl`; el card discrimina por estado; ausencia de `ssl` → no card); contract test (invariante `ssl` opcional); `pnpm ci:check:full` + boot; PR + post-merge sync.
- **Valoración pre-código:** (1) ¿el threshold de "expiring_soon" es fijo (≤14d) o configurable (setting)? (2) ¿el card admin muestra algo más que el cliente (issuer técnico, fecha exacta) o es idéntico? (3) ¿`status: 'none'` (sin cert) merece un aviso o solo el badge gris?

#### A.11.10.4.1. Refinamientos pre-código F.7 — R1/R2/R3 (Amendment al dossier, 2026-05-13)

> **Sesión pre-código 2026-05-13 sesión 1** — Yasmin aprueba arrancar F.7. Patrón heredado de F.6 §A.11.10.3.2 (refinamientos pre-código formalizados como Amendment al dossier antes de codear; mejoras detectadas al cotejar el apuntado contra los ADRs frozen — L18). Las 3 valoraciones pre-código del bloque anterior se resuelven a continuación con razón doctrinal explícita.

**R1 — Threshold `expiring_soon` fijo: 14 días naturales (NO setting per-plugin).**

- **Decisión:** umbral canónico **14 días** entre `valid` y `expiring_soon`, definido como constante `SSL_EXPIRING_SOON_MS = 14 * 24 * 60 * 60 * 1000` en el plugin (NO setting en `/admin/settings/plugins/enhance-cp`, NO entrada en `PluginManifest`).
- **Razón doctrinal:**
  - **Industry standard.** LetsEncrypt + ACME emiten certs de 90 días con auto-renovación 30 días antes; un umbral de 14d da ~2 semanas de aviso antes de cualquier expiración real (LE no debería llegar nunca a `expiring_soon` salvo fallo de renovación — útil precisamente para detectar esos fallos).
  - **YAGNI.** F.8 ya introducirá un setting per-plugin (`provisioning.enhance_cp.quota_alert_threshold_pct`); añadir un 2º setting aquí sin caso de uso real complica el contrato (regla "don't design for hypothetical future requirements"). Si un plugin pide un umbral distinto en el futuro, se promueve a setting con su propio Amendment.
  - **Cálculo server-side.** El plugin compara `expires` vs `now` y decide el `status` — el frontend NUNCA hace aritmética de fechas (evita races UTC/local + permite tests deterministas con `MockDate` mockeando `Date` o pasando `now` como parámetro testable a `buildSslSummary`).
- **Materialización:** `ADR-077 A7.4` + constante en `enhance.plugin.ts`.

**R2 — Card admin vs cliente: mismo componente `_shared/`, admin gana solo extras display-only.**

- **Decisión:** `frontend/app/_shared/services/SslStatusCard.tsx` con prop `isAdmin?: boolean`. Cliente y admin renderizan el mismo card (L16 — NO duplicación). Admin extras:
  - Tooltip en el badge (`<span title={ssl.expiresAt}>`) mostrando `expiresAt` ISO exacto (cliente solo ve "expira en X días" relativo).
  - CTA footer "Gestionar SSL en el panel del proveedor →" (link `ssoPanelHref`, abre nueva pestaña) — solo si el caller pasa el href (capability `hasSsoPanel` true).
- **Razón doctrinal:**
  - L16 (Fase F.3, doctrina F) — `_shared/` + prop `isAdmin`, no duplicación; coherente con `<MetricsBar>` y `<ActionsBar>` (mismo patrón).
  - El cliente no necesita la fecha exacta (relativo "en 12 días" cubre 99% del entendimiento). El admin sí (auditoría / planificación).
  - El CTA de gestión vive en admin porque DH-INV-6 — el cliente típico NO entra en el panel del proveedor (UX simplificada Aelium); el admin sí (mantenimiento operativo). Si emerge demanda de exponer el CTA al cliente, se evalúa fase aparte.
- **Materialización:** `ADR-077 A7.5` + `ADR-083 A8.8` + componente nuevo.

**R3 — `status='none'` muestra card visible (badge gris) + texto informativo, NO `AlertBanner` aparte.**

- **Decisión:** cuando `ssl.status === 'none'` (cert ausente), el `SslStatusCard` SE RENDERIZA (no se oculta) con badge gris + línea "Sin certificado SSL — el sitio aparecerá como 'No seguro' en navegadores". NO se crea un `AlertBanner` independiente (UI_SPEC §4.3).
- **Razón doctrinal:**
  - El cliente DEBE enterarse (seguridad / SEO — Chrome marca HTTP como "No seguro" desde 2018). Silenciarlo sería una mala práctica profesional.
  - NO es feedback efímero (no Toast) ni aviso persistente independiente (no AlertBanner aparte) — es **estado del recurso**, vive en el card SSL como un estado más (paralelo a "expirado" pero con causa distinta). Coherente con el patrón `MetricsBar`: nunca se "oculta" si no hay datos; muestra el estado real (incluso cuando es "sin datos").
  - La diferencia con `ssl: undefined` (card no renderiza) es clara: `undefined` = el plugin **no pudo leer** el cert (error técnico, no exponer parcial); `status: 'none'` = el plugin leyó OK y **confirmó que no hay cert** (estado real, exponer al usuario).
- **Materialización:** `ADR-077 A7.1` (enum `'none'`) + `ADR-083 A8.4` (`cert === null → { status: 'none' }`; `cert ilegible → undefined`) + `ADR-083 A8.8` (línea i18n `service.ssl.status.none`).

**Decisiones derivadas (NO re-litigar):**

- **D.7.1** — Endpoint orchd: `GET /v2/domains/{domain_id}/ssl` (operationId `getWebsiteDomainSslCert`), NO `mail_ssl` ni listado de aliases (ver `ADR-083 A8.1` decisión).
- **D.7.2** — `domain_id` NO se persiste en `services.metadata` — se resuelve runtime vía `getWebsite(orgId, websiteId).domain.id` (cache 60s absorbe; ver `ADR-083 A8.2`).
- **D.7.3** — `autoRenew` se deriva por heurística sobre `issuer` (LE → true, resto → false). Determinístico, sin `undefined` salvo emisor vacío (no se inventa "no" sin razón).
- **D.7.4** — MockEnhanceServer extiende `state.domainSsls` Map + auto-siembra cert LE al `POST /websites` (60d, `forceHttps:true`).

#### A.11.10.4.2. Commit-plan F.7

> Orden estricto. 1 rama `sprint15c-ii-fase-f7-ssl-status` desde `master` post-merge de F.6 (commit `109f7f7`). Patrón heredado de F.6: doc-only Amendment opcionalmente separado del code; aquí se hace **todo en un PR** porque el código es de tamaño contenido (~400 LOC backend + ~250 LOC frontend + tests) y los Amendments son strictly additive — separarlos añadiría overhead sin valor (heredable: L18 dice "ADR amendments dentro de la fase").

1. **Commit 1 — `docs(sprint-15c-ii): refinamientos pre-código F.7 — R1/R2/R3 + ADR amendments`** (este commit). Doc-only.
   - `docs/10-decisions/adr-077-contrato-provisioner-plugin-v2.md` — Amendment A7 (campo `ssl?` opcional).
   - `docs/10-decisions/adr-083-plugin-enhance-cp-specifics.md` — Amendment A8 (probe SSL Enhance).
   - `docs/60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md` — §A.11.10.4.1/§A.11.10.4.2 (este Amendment + commit-plan).
2. **Commit 2 — `feat(sprint-15c-ii): F.7 backend — ServiceInfo.ssl? + EnhanceApiClient.getDomainSsl`**.
   - `backend/src/core/provisioning/types.ts` — `ServiceSslStatus` + `ServiceSslSummary` + `ServiceInfo.ssl?`.
   - `backend/src/plugins/provisioners/enhance_cp/api/types.ts` — `EnhanceDomainSslCert`.
   - `backend/src/plugins/provisioners/enhance_cp/api/client.ts` — `getDomainSsl()`.
   - `backend/src/plugins/provisioners/enhance_cp/enhance.plugin.ts` — `getServiceInfo` añade `getWebsite` al `Promise.all` + `buildSslSummary` + `detectAutoRenew` + `parseEnhanceCertDate`.
   - `backend/test/mocks/enhance-server/server.ts` — `state.domainSsls` Map + endpoint `GET /v2/domains/:domainId/ssl` + auto-seed LE al `POST /websites` + `seed.domainSsls` opcional.
3. **Commit 3 — `test(sprint-15c-ii): F.7 backend tests — ssl en getServiceInfo + contract invariant + client + mock`**.
   - `backend/src/plugins/provisioners/enhance_cp/enhance.plugin.spec.ts` — +8 casos `getServiceInfo > ssl` + +3 casos `detectAutoRenew`.
   - `backend/src/plugins/provisioners/plugin-contract.spec.ts` — invariante A7.3.
   - `backend/src/plugins/provisioners/enhance_cp/api/client.spec.ts` — `getDomainSsl` 404 → null + otros re-lanzan.
   - `backend/src/plugins/provisioners/enhance_cp/api/client.integration.spec.ts` — `getDomainSsl` lee del mock (200, 404, 500).
4. **Commit 4 — `feat(sprint-15c-ii): F.7 frontend — SslStatusCard + wire en /dashboard|/admin/services/[id]`**.
   - `frontend/app/_shared/services/SslStatusCard.tsx` — componente nuevo (badge + texto + admin extras). Server-component compatible (sin hooks).
   - `frontend/app/_shared/services/index.ts` — barrel exporta `SslStatusCard`.
   - `frontend/app/lib/api.ts` — añade `ServiceSslStatus`, `ServiceSslSummary`, `ServiceInfo.ssl?` (espejo del backend types.ts).
   - `frontend/app/dashboard/services/[id]/page.tsx` — wire `<SslStatusCard ssl={info.ssl} />` condicional (gateado por `!isTerminal && info.ssl`).
   - `frontend/app/admin/services/[id]/page.tsx` — wire `<SslStatusCard ssl={info.ssl} isAdmin />` condicional. `ssoPanelHref` se deja para F.12 (el admin ya tiene `<SsoButton>` general más abajo; F.12 evaluará si compactar SSL+SSO en una "card de operaciones de cert").
   - **Sin tests RTL nuevos:** el frontend NO tiene runner Jest/Vitest (verificación = `tsc --noEmit` + `eslint --max-warnings=0` + `next build`). El comportamiento visual del card se cubre en G.2 (E2E spec extension — flujos cliente/admin con `info.ssl` en cada estado). El typecheck enforce el shape, el lint enforce las reglas a11y/react.
   - **i18n vía `t()` (`frontend/app/_shared/i18n/translations-es.ts`):** sigue el patrón canónico Sprint 15C Fase 15C.I (verificado contra `AdminDriftBanner.tsx`). 13 keys nuevas en el bloque `service.ssl.*` (card_title + 4 status labels + 5 message variants + 2 auto_renew + issuer_prefix + expires_tooltip_prefix + admin_cta_manage_in_provider). El sufijo dinámico "en N días"/"hace N horas" se compone en el componente (sin templating) — `formatRelativeExpiry` devuelve string libre que se concatena al prefijo i18n. Compatible con la futura migración a `next-intl`/EN sub-sprint (`t()` tiene firma estable).
5. **Commit 5 — `chore(sprint-15c-ii): F.7 validación — ci:check:full + boot smoke`**.
   - Bumps de fixtures si los integration tests piden nuevos UUIDs determinísticos.
   - Notas de boot smoke (no es un cambio de código en sí, pero el commit puede incluir el `wc -l` updates de `MEMORY.md`/`project-state.md` si la métrica de cobertura cambia material).
6. **PR + post-merge sync** (patrón canónico F.6): PR `feat(sprint-15c-ii): Fase F.7 — SSL/TLS status read-only (ADR-077 A7 + ADR-083 A8)` con label `ready-for-e2e` (toca contract types) + bypass CI §6 si Actions sigue caído (10ª aplicación — añadir nota explícita en el PR). Tras merge, post-merge sync separado `docs(sprint-15c-ii): post-merge sync Fase F.7 — PR #N mergeado a master`.

**DoD F.7 actualizado (sustituye al de §A.11.10.4):**

- ADR-077 A7 + ADR-083 A8 frozen.
- Backend: `ServiceSslStatus`/`ServiceSslSummary`/`ServiceInfo.ssl?` declarados + `EnhanceApiClient.getDomainSsl` + `getServiceInfo` puebla `ssl` con los 4 estados + cálculo server-side (umbral 14d) + heurística `detectAutoRenew`.
- MockEnhanceServer: endpoint SSL + auto-seed LE + `seed.domainSsls` opcional.
- Frontend: `SslStatusCard` cliente (mismo card sin extras) + admin (tooltip + CTA SSO) wired en ambas páginas; ausencia de `info.ssl` → no card.
- Tests: 8 casos plugin SSL + 3 casos `detectAutoRenew` + contract invariant + client unit + client integration + RTL del card.
- `pnpm ci:check:full` verde + boot real verificado.
- PR mergeado + post-merge sync.

#### A.11.10.4.3. Cierre F.7 — commit-by-commit + decisiones reales (sesión 2026-05-13/14)

> Registro de cierre canónico (patrón §A.11.9 cierre F.3, §A.11.10.1.1 cierre F.4, §A.11.10.2.1 cierre F.5, §A.11.10.3.3 cierre F.6). Lo que la próxima sesión IA necesita saber sin re-litigar.

**Commits en la rama** `sprint15c-ii-fase-f7-ssl-status` (squash en `8b8bc47`):

| # | SHA local | Tipo | Resumen |
|---|-----------|------|---------|
| 1 | `849ba51` | docs | Refinamientos pre-código F.7 — R1/R2/R3 + ADR-077 Amendment A7 (`ServiceInfo.ssl?`) + ADR-083 Amendment A8 (probe SSL Enhance) + dossier §A.11.10.4.1/§A.11.10.4.2. Doc-only. |
| 2 | `492bd8a` | feat | Backend F.7 — `ServiceSslStatus`/`ServiceSslSummary`/`ServiceInfo.ssl?` en `core/provisioning/types.ts` + `EnhanceApiClient.getDomainSsl(domainId)` + `getServiceInfo` añade `getWebsite` al `Promise.all` + helpers `buildSslSummary`/`detectAutoRenew`/`parseEnhanceCertDate` exportados + constante `SSL_EXPIRING_SOON_MS = 14d` + `MockEnhanceServer` extendido (state.domainSsls + endpoint + auto-seed LE 60d + cleanup). |
| 3 | `32fd353` | test | +21 casos backend — 8 `getServiceInfo > ssl` deterministas + 3 `detectAutoRenew` + 3 `parseEnhanceCertDate` + 1 invariante de contrato A7.3 + 4 client unit + 3 client integration. Default `getWebsite`/`getDomainSsl` mocks ahora retornan `Promise.resolve(null)` (necesario porque el `.catch` sobre `jest.fn()` no configurado rompía). |
| 4 | `46c9cf4` | feat | Frontend F.7 — `<SslStatusCard>` SC nuevo (199 LOC, server-component compatible) + barrel + `lib/api.ts` espejo de tipos + +13 keys i18n `service.ssl.*` + wire en `/dashboard/services/[id]` y `/admin/services/[id]` gateado `!isTerminal && info.ssl`. |

**Decisiones reales tomadas durante la implementación** (vs apuntado del dossier original §A.11.10.4 + refinamientos §A.11.10.4.1):

1. **Commit 5 (validación) plegado en el PR body, no como commit separado.** El commit-plan §A.11.10.4.2 contemplaba un "Commit 5 — chore F.7 validación" para eventuales bumps de fixtures o updates `wc -l` material. La implementación no requirió ninguno: los integration tests no piden UUIDs nuevos (el mock tiene determinismo propio para SSL via `apiToken`/`masterOrgId` heredados), `MEMORY.md`/`project-state.md` se actualizan en el post-merge sync separado (este PR), no en el PR de feat. El PR body recoge la validación inline (`pnpm ci:check:full` verde + boot smoke). **Patrón heredable**: cuando ci:check:full + boot smoke no requieren cambios de archivos, el "commit 5 de validación" puede plegarse en el PR body. Si requiere cambios (ej. `pnpm-lock.yaml` bumps, fixture UUIDs nuevos), commit aparte.

2. **`SSL_EXPIRING_SOON_MS = 14 * 24 * 60 * 60 * 1000` constante en el plugin, NO setting.** R1 ratificada. Industry standard ACME/LE (Let's Encrypt envía notificaciones de renovación a partir de 14d antes — el plugin se alinea con ese mismo umbral); YAGNI vs entrada en `PluginManifest` o setting per-plugin (no hay caso de negocio que justifique umbrales distintos por plugin/instancia); cálculo server-side en `getServiceInfo` para que el card sea puramente render (sin lógica de tiempo en el frontend, evita drift cliente↔servidor). Materialización: `Math.max(0, validNotAfter.getTime() - Date.now())` → `<= SSL_EXPIRING_SOON_MS` ⇒ `'expiring_soon'`; `<= 0` ⇒ `'expired'`. Boundary 14d cubierto por test específico (`boundary14d`).

3. **`detectAutoRenew` heurística regex `/let'?s\s*encrypt/i` sobre el `issuer`.** R1 derivada (D.7.3 §A.11.10.4.1). Razón: orchd v12.21.3 NO expone explícitamente un flag `auto_renew` en `/v2/domains/{id}/ssl` (verificado contra OAS); el cert LE en Enhance se renueva automáticamente vía ACME por defecto (comportamiento canónico del orchd). La heurística "issuer matches Let's Encrypt" cubre el caso 99% sin sobre-prometer en plugins/instancias custom; cualquier issuer que no matchee → `autoRenew: undefined` (el card omite la línea "Renovación automática", no afirma "no" — comportamiento honesto). El regex acepta variantes ortográficas (`Let's Encrypt` / `Lets Encrypt` / `Let'S Encrypt` / `Let's   Encrypt Authority X3`).

4. **`getDomainSsl` captura `INVALID_STATE` 404 → `null`, re-lanza el resto.** Razón: orchd devuelve `404 + body { code: 'INVALID_STATE' }` cuando el website existe pero NO tiene cert (estado canónico, no error). Re-lanzar como `null` permite al plugin discriminar "no cert" vs "fallo de comunicación con el proveedor". Cualquier otro error (`401` PROVIDER_AUTH_FAILED, `500`, timeout, network) sí se relanza vía el wrapper canónico → el `getServiceInfo` decide si propagar `unknown`/fallback al caller. Cubierto por 4 client unit + 3 integration.

5. **Auto-seed LE en el `MockEnhanceServer` al `POST /websites` — D.7.4.** Razón: cualquier servicio Enhance nuevo provisionado contra el mock fresco tiene cert LE válido por defecto (60d, `forceHttps: true`), reflejando el comportamiento real de orchd. Esto hace que el smoke real de F.7 funcione "out of the box" sin pasos adicionales de seed manual. Cleanup en `DELETE /websites/:id` para evitar leaks de state entre tests. `seed.domainSsls` opcional para tests que necesiten estados custom (ej. el test de DigiCert custom issuer).

6. **Tests RTL ausentes por diseño documentado.** Frontend NO tiene runner Jest/Vitest (decisión Sprint 15A — verificación frontend = `tsc --noEmit` + `eslint --max-warnings=0` + `next build`). El comportamiento visual del card se cubre en G.2 (E2E spec extension cubriendo Fases E + F.1-F.12). El typecheck enforce el shape (gating `!isTerminal && info.ssl`); el lint enforce las reglas a11y/react. Cobertura backend deterministe vía `jest.useFakeTimers()` cubre los 4 estados sin necesidad de RTL.

7. **Default `getWebsite`/`getDomainSsl` mocks ahora retornan `Promise.resolve(null)` (no `undefined`).** Detectado durante la implementación de los tests: el `.catch` sobre `jest.fn()` no configurado rompía con `TypeError: Cannot read properties of undefined (reading 'catch')` porque `jest.fn()` por defecto devuelve `undefined` (no Promise). Solución: `mockResolvedValue(null)` en el setup `beforeEach` de los suites que usan `getServiceInfo`. Patrón heredable para cualquier futuro test que use `Promise.all` con catch sobre métodos del client mockeado.

8. **`F.7.2` wire admin no añade `ssoPanelHref` a la card SSL** (diferido a F.12). Razón: el `SsoButton` general ya está más abajo en `/admin/services/[id]`; añadir un CTA SSO específico SSL ahora duplicaría visualmente. F.12 (layout canónico) evaluará si compactar SSL+SSO en una "card de operaciones de cert" o mantener el `SsoButton` general. La capability `ssoPanelHref` está implementada en `<SslStatusCard>` (acepta el prop) — solo no se está pasando hoy desde la página admin. Cero deuda técnica, decisión de scope.

**Cobertura de tests** (state del PR #77):
- `enhance.plugin.spec.ts`: +14 casos (8 `getServiceInfo > ssl` + 3 `detectAutoRenew` + 3 `parseEnhanceCertDate`) — todos deterministas con `jest.useFakeTimers()` + dates fijas en 2026-05-13. Default mocks `getWebsite`/`getDomainSsl` retornan `null`.
- `plugin-contract.spec.ts`: +1 invariante A7.3 (`info.ssl` opcional + `status ∈ enum` + `expiresAt` parseable + `status='none' ⇒ sin expiresAt`).
- `client.spec.ts`: +4 (`getDomainSsl` 200/404→null/500→throws/401→PROVIDER_AUTH_FAILED).
- `client.integration.spec.ts`: +3 (auto-seed LE end-to-end + unknown domainId → null + `seed.domainSsls` custom DigiCert).
- **Total**: 51 suites / **712 passed + 5 skipped** (vs 691 antes de F.7 = +21 casos).

**Smoke real Yasmin (sesión 2026-05-14)** — verificado contra `MockEnhanceServer` con stack completa (backend 3001 + frontend 3002 + mock 3099 + Postgres + Redis + Mailpit + MinIO):
- ✅ **Cliente — `valid`**: `/dashboard/services/<nuevo>` muestra "SSL activo — expira en 60 días. Renovación automática activa. Emitido por Let's Encrypt Authority X3" (literalmente coincide con el copy del componente — `service.ssl.status_valid` + `service.ssl.expires_in_days` + `service.ssl.auto_renew_active` + `service.ssl.issuer_prefix`).
- ✅ **Admin — tooltip ISO**: `/admin/services/<nuevo>` mismo card + tooltip con fecha ISO al pasar ratón sobre la fecha de expiración (R2 — prop `isAdmin` activa el `<span title="...">`).
- ✅ **Servicio terminal — sin card**: `/dashboard/services/8f1c9f78-…` (cancelled) NO muestra card SSL en absoluto (gate `!isTerminal` impide la llamada a `getServiceInfo`).
- ⚠️ **Comportamiento adicional observado** (esperado): los servicios `cancelled` previos no aparecen con card; el servicio `active` previo creado contra una instancia anterior del mock tampoco — el mock arranca con state vacío, su `getWebsite` falla → el plugin no puebla `info.ssl` y el card se omite. Comportamiento correcto del gate `info.ssl?` capability-driven.

**ADR-077 Amendment A7 frozen 2026-05-13.** Formaliza:
- `ServiceInfo.ssl?: ServiceSslSummary` opcional.
- `ServiceSslStatus = 'valid' | 'expiring_soon' | 'expired' | 'none'`.
- `ServiceSslSummary = { status; expiresAt?; autoRenew?; issuer? }`.
- Mismo patrón que A5 (`recoveryHint?`) y A6 (`testConnection?()`): additivo opcional, NO bumpea `contractVersion` (capability-driven sin flag nuevo en `PluginCapabilities` — la presencia del campo es la capability, mismo molde que `metrics?`).

**ADR-083 Amendment A8 frozen 2026-05-13.** Formaliza:
- Probe SSL Enhance: endpoint `GET /v2/domains/{domain_id}/ssl` (OAS line 8452).
- Mapeo a `ServiceSslSummary`: `validNotAfter` → `expiresAt`; `issuer` → `issuer`; status derivado server-side.
- Heurística `detectAutoRenew`: regex `/let'?s\s*encrypt/i` sobre `issuer` → `true`/`undefined` (no `false` para no sobre-prometer).
- Threshold canónico 14d (`SSL_EXPIRING_SOON_MS = 14 * 24 * 60 * 60 * 1000`).
- `MockEnhanceServer` materializa todo: state.domainSsls Map + endpoint + auto-seed LE 60d al POST /websites + cleanup al DELETE.

**Compatible hacia atrás:** plugin sin `getDomainSsl` o sin `ssl` populado en `getServiceInfo` → el frontend simplemente no muestra la card (gating `info.ssl?` capability-driven). Plugins legacy (15D RC, 15E Docker, 15G Plesk — aún no escritos) NO requieren cambios para ser compatibles con F.7 — solo necesitan poblar `ssl?` cuando sepan leerlo.

**Heredable a futuros plugins SaaS:** patrón A5/A6/A7 — campo opcional en `ServiceInfo`, presencia = señal de capability, sin contaminar `PluginCapabilities`. Cualquier plugin que pueda leer cert/métrica/recoveryHint lo puebla; los que no, omiten el campo y el card no aparece. Cero `if (provisioner === 'X')` en el frontend (capability-driven, ADR-070).

### A.11.10.5. Fase F.8 — Alertas de cuota (disco / ancho de banda)

**Tema:** el cliente recibe aviso — visual y por notificación — antes de quedarse sin recursos.

- **F.8.1 — Setting de umbral.** `provisioning.enhance_cp.quota_alert_threshold_pct` (default 85, editable en `/admin/settings/plugins/enhance-cp`).
- **F.8.2 — Aviso visual en `MetricsBar`.** Cuando un recurso con cuota dura (disco) cruza el umbral, la barra se pone ámbar (≥ umbral) / roja (≥ 95%) + texto "Estás al X% de tu cuota de disco". (Ancho de banda: ver valoración pre-código — es mensual y se "resetea"; quizá solo informativo, sin barra de aviso.)
- **F.8.3 — Notificación al cliente al cruzar el umbral.** El reconcile L3 (o un cron dedicado) detecta el cruce comparando el snapshot actual contra el anterior — necesita persistir "última notificación enviada por recurso" para no spamear (campo en `services.metadata` o tabla `service_quota_alerts`) → emite `service.quota_threshold_crossed { service_id, user_id, resource: 'disk'|'bandwidth', used_pct }` → listener `notifications-on-service-quota-threshold` → email + campana + plantilla seedeada `service.quota_threshold_crossed` (R7 — el listener no relanza). Heredable a cualquier plugin con `has_metrics`.
- **ADR amendments:** ninguno del contrato (es comportamiento + setting + evento + listener). Doc: el evento `service.quota_threshold_crossed` al catálogo de eventos de `provisioning`; dossier.
- **DoD F.8:** setting; aviso visual en `MetricsBar`; notificación sin spam (con persistencia de "última enviada por recurso", verificada con un test de "cruza el umbral dos pasadas seguidas → un solo email"); plantilla seedeada; tests; `pnpm ci:check:full` + boot; PR + post-merge sync.
- **Valoración pre-código:** (1) persistencia de "última notif por recurso": ¿`services.metadata` o tabla dedicada `service_quota_alerts`? — recomendado tabla dedicada si se quiere historial de alertas. (2) ¿quién detecta el cruce: el reconcile L3 (ya corre cada 6h) o un cron dedicado más frecuente? — reutilizar el reconcile L3. (3) ¿el aviso de cuota aplica a ancho de banda (mensual) o solo a disco?

#### A.11.10.5.1. Refinamientos pre-código F.8 (frozen 2026-05-16)

Resolución de las 3 valoraciones del dossier + 4 decisiones adicionales que el código real exige congelar antes de tocar nada. Mismo patrón que §A.11.10.3.2 R1/R2/R3 de F.6 y §A.11.10.4.1 R1/R2/R3 de F.7. Citas canónicas: `ADR-077`, `ADR-080`, `ADR-083`, `R7`, `L13`/`L14`/`L16`/`L18`, doctrina §A.10.3. L18 aplicado: el catálogo canónico del evento `service.quota_threshold_crossed` va en `docs/20-modules/_events.md` + `docs/20-modules/provisioning/contract.md` (eventos de **provisioning**, no de framework de plugins) — el catálogo `plugin.*` de ADR-080 §6 NO se toca en F.8, contrario al apuntado original.

##### R1 — Persistencia "última notif por recurso": tabla dedicada `ServiceQuotaAlert`, NO `services.metadata`

Schema canónico:

```prisma
enum QuotaAlertResource {
  disk
  // 'bandwidth' fuera de scope F.8 — ver R3. Cuando se promocione, se añadirá aquí.
}

enum QuotaAlertKind {
  crossed_up   // pasa de <threshold a ≥threshold — dispara email
  crossed_down // pasa de ≥threshold a <threshold — solo state, sin email
}

model ServiceQuotaAlert {
  id            String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  service_id    String              @db.Uuid
  resource      QuotaAlertResource
  kind          QuotaAlertKind
  used_pct      Decimal             @db.Decimal(5,2)
  threshold_pct Decimal             @db.Decimal(5,2)
  detected_at   DateTime            @default(now()) @db.Timestamptz()

  service       Service             @relation(fields: [service_id], references: [id], onDelete: Cascade)

  @@index([service_id, resource, detected_at])
  @@map("service_quota_alerts")
}
```

**Por qué tabla dedicada (vs `services.metadata.quotaAlerts`)**:

- (a) **Edge-triggered alerting canónico** (patrón Prometheus/AlertManager): `crossed_up` cuando el snapshot pasa de `<threshold` a `≥threshold`; `crossed_down` cuando vuelve por debajo. Solo se emite email en `crossed_up`. Si dos pasadas consecutivas siguen por encima → la última fila es `crossed_up`, no se re-emite. Cumple el DoD literal F.8 ("cruza el umbral dos pasadas seguidas → un solo email"). Sin la fila `crossed_down`, no se podría distinguir "estamos above por primera vez" de "ya notificado y seguimos above".
- (b) **Historial trazable + auditable** (patrón establecido en el codebase — `AuditChangeLog` / `FailedJob`). `services.metadata` se sobreescribe en cada ciclo y pierde historial; G.1 (tests críticos del sprint) querrá tests sobre la traza.
- (c) **Foreign key + `onDelete: Cascade`** garantiza integridad referencial cuando un servicio se elimina físicamente (no operación normal — los servicios se marcan `cancelled`/`terminated`, no se borran; pero la garantía cuesta cero declararla). Con `metadata` Json esto no es posible.

##### R2 — Detector del cruce: extender `EnhanceReconciliationCron` + servicio transversal `QuotaThresholdDetectorService`

El cron Enhance ([enhance-reconciliation.cron.ts:113](../../backend/src/plugins/provisioners/enhance_cp/crons/enhance-reconciliation.cron.ts#L113) — `runAsExecutor`) añade un paso final tras el `runOnce()`: por cada service procesado, llama `plugin.getServiceInfo(service)` con `forceRevalidate: true` (lectura fresca; el cache L1=60s se ignora porque la siguiente pasada del cron son 6h después de todos modos) y delega a `QuotaThresholdDetectorService.detectAndNotify(service, info.metrics, thresholdPct)`.

`QuotaThresholdDetectorService` vive en `backend/src/core/provisioning/` (transversal — heredable a 15E Docker / 15G Plesk; 15D RC no aplica, sin métricas). Lógica edge-trigger:

1. Si `metrics.diskTotalMb` no está definido o es `<= 0` → no-op (sin total no hay umbral; **M8**).
2. `pct = (metrics.diskUsedMb / metrics.diskTotalMb) * 100`.
3. `lastAlert = prisma.serviceQuotaAlert.findFirst({ where: { service_id, resource: 'disk' }, orderBy: { detected_at: 'desc' } })`.
4. **`pct >= threshold` (umbral inclusivo, M4)** AND (`lastAlert == null` OR `lastAlert.kind === 'crossed_down'`) → insertar `crossed_up` + emitir `service.quota_threshold_crossed` (en la misma `$transaction`).
5. `pct < threshold` AND `lastAlert?.kind === 'crossed_up'` → insertar `crossed_down` (solo state, sin emit).
6. Resto de casos → no-op (idempotente).

**M2 — Idempotency operativa: `$transaction` con isolation `Serializable`** alrededor del par `findFirst` + `create` para que dos detectores concurrentes (cron + `runOnce()` manual del admin) no inserten dos `crossed_up` consecutivos. El cron no tiene concurrencia natural (`@Cron` instancia única), pero el grado profesional exige defensa explícita.

**Por qué reconcile L3 (vs cron dedicado o detección en `getServiceInfo` on-demand)**:

- El reconcile L3 ya tiene cadencia controlada (6h, sin "doble disparo" cuando el cliente recarga su página 10 veces).
- Detectar en `getServiceInfo` on-demand introduce races con el cache L1=60s y posibles emisiones múltiples bajo carga concurrente. **L18**: no inventar mecanismo nuevo cuando el existente encaja.
- **Heredable**: cada plugin con métricas extiende su propio cron de reconciliación con el mismo hook al servicio transversal. Mismo patrón que F.5 `actorLabel` (capa orquestador agnóstica al plugin).

##### R3 — Scope F.8: solo disco. Bandwidth queda fuera (visual y notif)

**Por qué solo disco**:

- Disco es **cuota dura**: llenarlo cuelga el servicio (no se pueden escribir logs, DB, uploads).
- Bandwidth es **mensual con reset el 1º del mes**. Notificar al 85% el día 28 da 2 días de margen — alerta sin acción posible. Edge-triggered alerting con reset mensual requiere lógica adicional (¿qué hacer cuando el reset hace `crossed_down` artificial? ¿se considera transición real?) — YAGNI hoy (regla doctrinal "Don't design for hypothetical future requirements"). 
- **L18**: F.8 entrega valor inmediato sobre el caso que más impacta al cliente (disco). Si en el futuro se quiere bandwidth, se promueve como F.8.x con la semántica del reset mensual resuelta entonces (añadir `bandwidth` al enum `QuotaAlertResource` + handler especial en el detector que ignore `crossed_down` artificial por reset).

**Implicación visual**: `MetricsBar` colorea **solo la barra de disco** (ámbar `≥threshold` / rojo `≥95%`). Bandwidth, RAM, CPU, email/DB cuentas → sin coloreo (igual que hoy). Heredable: cuando se promocione bandwidth, se añadirá la lógica al componente.

##### R4 — Setting `quota_alert_threshold_pct`: manifest del plugin Enhance (`configSchema` ADR-080), default 85

Añadido a `ENHANCE_CONFIG_SCHEMA` en [enhance.plugin.ts:110](../../backend/src/plugins/provisioners/enhance_cp/enhance.plugin.ts#L110):

```typescript
quota_alert_threshold_pct: {
  type: 'integer',
  default: 85,
  minimum: 50,
  maximum: 95,
  title: 'plugin.enhance_cp.config.quota_alert_threshold_pct.label',
  description: 'plugin.enhance_cp.config.quota_alert_threshold_pct',
},
```

- Vive en el manifest del plugin Enhance, NO en `ConfigService` global. Razón canónica: el dossier dice "editable en `/admin/settings/plugins/enhance-cp`" — esa página solo edita el `configSchema` del manifest (ADR-080 §1 "Manifest declarativo JSON-Schema 7"). Si fuera setting global, se editaría en otra UI.
- `minimum: 50, maximum: 95` evitan que el admin desactive el aviso o pise el umbral crítico hardcoded (95% rojo, ver R7).
- Persistencia: `plugin_installs.config` ya cubre esto (ADR-080).
- **95% hardcoded como umbral crítico (rojo)** — no configurable. **L18 + YAGNI**: si en el futuro algún plugin pide un 2º umbral configurable, se promueve.
- **Heredable**: cualquier plugin con `has_metrics` declara su propio `quota_alert_threshold_pct` en su manifest (mismo nombre canónico, distinto default si quisiera).

##### R5 — Shape del evento `service.quota_threshold_crossed` + catálogo canónico

Shape:

```typescript
{
  service_id: string,
  user_id: string,
  plugin_slug: string,                    // 'enhance_cp'
  resource: 'disk',                       // R3 — solo disk en F.8
  used_pct: number,                       // ej. 87.4
  threshold_pct: number,                  // ej. 85 (snapshot del setting al detectar)
  used_mb: number,                        // ej. 8740
  total_mb: number,                       // ej. 10000
  detected_at: string                     // ISO-8601
}
```

- **R5.1**: nombre del evento literal del dossier — `service.quota_threshold_crossed`. `resource` singular (alineado con el listener y la plantilla que procesan un único recurso por evento).
- **R5.2 — corrección sobre el apuntado**: el evento se registra en `docs/20-modules/_events.md` (catálogo `service.*` del módulo provisioning, donde viven `service.suspended`, `service.unsuspended`, `service.reconciled_external_change`, etc.) + `docs/20-modules/provisioning/contract.md` §6 "Emite". **NO va en ADR-080 §6** — esa tabla es exclusiva del framework de plugins (`plugin.installed`/`config_changed`/`uninstalled`/`circuit_opened`/`circuit_closed`/`reconcile_completed`). El apuntado original era incorrecto; L18 lo corrige.
- **R5.3 — R7**: el listener no relanza excepciones; el detector tampoco. Cualquier fallo del dispatch a la cola NO debe deshacer el state-tracking (la fila `ServiceQuotaAlert` se inserta antes del `emit` dentro de la `$transaction`; si el `emit` post-tx falla, la fila queda y la siguiente pasada NO re-emite por el edge-trigger — el cliente pierde un email pero el sistema no se desincroniza).

##### R6 — Listener + plantilla seedeada

**Listener** `NotificationsOnServiceQuotaThresholdCrossedListener` en `backend/src/modules/notifications/listeners/` — patrón idéntico a `NotificationsOnServiceSuspendedListener` ([notifications-on-service-suspended.listener.ts:90](../../backend/src/modules/notifications/listeners/notifications-on-service-suspended.listener.ts#L90)):

- `@OnEvent('service.quota_threshold_crossed')`.
- `@Injectable()` con `NotificationsService` + `PrismaService` + `ConfigService` inyectados.
- `try/catch` que loguea + traga (R7); la fila `ServiceQuotaAlert` ya capturó el estado.
- Llama `this.notifications.dispatchToUser('service.quota_threshold_crossed', { service_id, domain, used_pct, used_mb_label, total_mb_label, service_url, support_url }, user_id)`. La firma canónica de `dispatchToUser` ([notifications.service.ts:60](../../backend/src/modules/notifications/notifications.service.ts#L60)) encola en BullMQ `notifications-dispatch`; el processor resuelve recipient + plantilla.

**Plantilla seedeada** en [notification-templates.ts](../../backend/prisma/seeds/notification-templates.ts) (email + campana, locale `es`):

- Subject: `⚠ Estás al {{used_pct}}% de almacenamiento en {{domain}}`.
- Variables: `service_id`, `domain`, `used_pct`, `used_mb_label`, `total_mb_label`, `service_url` (→ `/dashboard/services/[id]`), `support_url`, `recipient.first_name?`.
- CTA primario: "Ver detalles del servicio" → `service_url`.
- **EC-T8-17 (seed guard)**: solo `{{var}}` (escape Handlebars), nunca triple-stash. El test `notification-templates.security.spec.ts` falla el build si no.
- Solo se seedea **disco** (R3). Cuando se promocione bandwidth, se añadirá su plantilla o se ramifica con `{{#if resource_is_disk}}` (decisión al promocionar).

##### R7 — Frontend `MetricsBar`: gradación visual capability-driven, sin duplicar el componente

[MetricsBar.tsx](../../frontend/app/_shared/services/MetricsBar.tsx) gana props **`quotaThresholdPct?: number`** (opcional — si `undefined`, comportamiento legacy sin coloreo). La página `/dashboard/services/[id]` y `/admin/services/[id]` leen el threshold del manifest del plugin (vía `plugin_installs.config.quota_alert_threshold_pct`) y lo pasan como prop. Para plugins que NO declaran el setting, el prop queda `undefined` y `MetricsBar` no colorea (capability-driven, heredable).

Solo la barra de disco recibe el coloreo (R3). Lógica server-side (el componente sigue siendo Server Component puro — sin hooks, sin state, patrón `<SslStatusCard>` heredado de F.7):

- `pct < threshold` → verde (actual, sin cambio).
- `threshold ≤ pct < 95` → ámbar + texto auxiliar "Estás al X% de tu cuota de disco — considera ampliar o liberar espacio".
- `pct ≥ 95` → rojo + mismo texto + énfasis (font-weight 600).

**Accesibilidad (estándar profesional, mejora añadida)**: la barra coloreada recibe `role="progressbar"` + `aria-valuenow={pct}` + `aria-valuemin={0}` + `aria-valuemax={100}` + `aria-label` localizado ("Almacenamiento al 87% — alerta"). Hoy `MetricsBar` no expone ningún `aria-*` (es texto puro `used / total`); F.8 lo arregla solo para la fila de disco coloreada — el resto se cubrirá en F.12 al refactorizar layout.

**L13** — la UI ramifica por el **valor numérico de `pct`**, NUNCA por matching de `statusReason` ni strings del proveedor. **L16** — `_shared/` + prop `isAdmin` (ya existe en el componente desde Sprint 15C.II Fase C), no duplicado en `admin/` y `client/`. Coherente con el patrón F.7 (`SslStatusCard` con prop `isAdmin`).

Frontend AGENTS.md ("This is NOT the Next.js you know"): se leerá `node_modules/next/dist/docs/` para confirmar Server Components conventions antes de tocar el componente — el patrón actual del archivo es ya correcto Server Component (sin hooks, sin `"use client"`), F.8 mantiene esa naturaleza.

##### ADR amendments F.8 — ninguno

- **`ProvisionerPlugin` (ADR-077)**: ningún cambio. F.8 es comportamiento + setting + evento + listener + tabla — todo additivo al orquestador, sin tocar el contrato del plugin.
- **`ADR-080` (Plugin Framework)**: ningún cambio. El catálogo §6 es exclusivo de eventos `plugin.*` framework — `service.quota_threshold_crossed` es del módulo provisioning. Corrige el apuntado original (L18).
- **`ADR-083` (Plugin Enhance specifics)**: ningún cambio. El setting `quota_alert_threshold_pct` se añade al `configSchema` del manifest y es operación rutinaria de configuración del plugin, no decisión arquitectónica.

##### Plan de commits F.8 (Opción A — todo en una rama, patrón F.7)

Rama: `sprint15c-ii-fase-f8-quota-alerts` (creada desde `master` `2258fdb`).

1. **Commit 1** (doc-only): este refinamiento + fila `service.quota_threshold_crossed` en `_events.md` + entrada en `provisioning/contract.md` §6.
2. **Commit 2** (schema): migración Prisma `service_quota_alerts` + enums + relación inversa `Service.quota_alerts` + manifest `quota_alert_threshold_pct`.
3. **Commit 3** (backend lógica): `QuotaThresholdDetectorService` (transversal en `core/provisioning/`) + listener + plantilla seedeada + wire en `EnhanceReconciliationCron.runAsExecutor()` + tests unit (edge-trigger two-pass + serializable lock + sin-total = no-op + threshold inclusivo `>=`).
4. **Commit 4** (frontend): `MetricsBar` prop `quotaThresholdPct` + coloreo disco + `role="progressbar"` + aria-label + i18n keys + wire en cliente/admin.
5. **Commit 5** (cierre, opcional según patrón F.7): `pnpm ci:check:full` + boot smoke + dossier §A.11.1 flip F.8 ✅ + memory.

PR único; bypass policy §6 si CI GitHub Actions sigue billing-bloqueada (11ª aplicación si aplica); post-merge doc-sync (patrón heredado).

##### DoD F.8 (refinado de §A.11.10.5)

- Setting en manifest Enhance + UI admin funcionando vía ADR-080.
- Aviso visual ámbar/rojo en `MetricsBar` (solo disco) + accesibilidad ARIA.
- Notif anti-spam vía edge-triggered en `ServiceQuotaAlert`.
- Plantilla seedeada (email + campana) con guard EC-T8-17.
- Tests unit: (1) edge-trigger "cruza umbral dos pasadas seguidas → un solo email"; (2) "above → below → above → 2º email"; (3) `pct >= threshold` boundary inclusivo; (4) sin `diskTotalMb` → no-op; (5) `$transaction` serializable previene doble emit; (6) listener despacha con variables correctas; (7) seed test cubre la nueva plantilla.
- `pnpm ci:check:full` verde + boot smoke + PR + post-merge sync.

### A.11.10.6. Fase F.9 — Reconciliación per-servicio (`DC.45`) + cierre del cabo del CTA reconcile

**Tema:** la reconciliación contra el proveedor es granular — el admin reconcilia un servicio concreto sin disparar la pasada completa del cron L3.

- **F.9.1 — ADR-077 Amendment:** `ProvisionerPlugin` gana método **opcional** `reconcileOne?(service: ServiceWithRelations): Promise<ReconcileResult>` — análogo al executor del `ReconcileRegistryService` pero para un único servicio (el plugin re-lee el ground truth del proveedor para ese servicio y devuelve los cambios aplicados; DH-INV-6 — actualiza Aelium, no al revés). Additivo opcional, NO bumpea `contractVersion` (mismo patrón que A6 `testConnection?()`); contract test: `reconcileOne` estrictamente opcional (o, si se decide, obligatorio cuando `supports_reconciliation: true`).
- **F.9.2 — Backend:** `ReconcileRegistryService.reconcileOne(slug, service)` delega a `plugin.reconcileOne?.(service)` (400 si el plugin no lo implementa). `ProvisioningService.reconcileServiceAsAdmin(serviceId, actorUserId)` (carga el service — `NotFound` si no existe; shortcircuit terminal si `cancelled`/`terminated`; resuelve el plugin; llama `reconcileRegistry.reconcileOne`; invalida cache `service_info`; audit `reconciled_single` con el actor real; emite evento `service.reconciled_single`). Endpoint `POST /admin/services/:id/reconcile` (admin, `@CheckPolicies(Update Service)`).
- **F.9.3 — Enhance implementa `reconcileOne(service)`:** extrae las refs, re-lee `getSubscription`, compara contra `services.metadata` / `product.provisioner_config`, aplica los mismos checks que el cron L3 pero para un service (`subscription_missing` / `status_divergence` / `plan_divergence` → actualiza la metadata local / status según corresponda), devuelve `ReconcileResult`.
- **F.9.4 — Wire frontend:** el CTA "Reconciliar contra el proveedor" del `AdminDriftBanner` (cuando `recoveryHint === 'reconcile'`) llama a `reconcileServiceAction(serviceId)` → `POST /admin/services/:id/reconcile` (single-shot, in-place, toast + `router.refresh()`) **en vez de** `router.push` a la página de settings del plugin (cierra el cabo de F.3 — el linkeo a settings era el placeholder). Cada fila de drift del `<PluginOperationalOverview>` (F.2) gana un botón "Reconciliar este servicio" → mismo endpoint.
- **ADR amendments:** ADR-077 amendment (`reconcileOne?()`) — dentro de la fase. Posible ADR-083 amendment (specifics del `reconcileOne` de Enhance).
- **DoD F.9:** contrato extendido + Enhance implementa + endpoint + CTA wired (banner + overview); tests (contract invariant, `reconcileServiceAsAdmin` incl. shortcircuit terminal + NotFound, Enhance `reconcileOne`); `pnpm ci:check:full` + boot; PR + post-merge sync.
- **Valoración pre-código:** (1) ¿`reconcileOne` estrictamente opcional u obligatorio si `supports_reconciliation: true`? (2) nombre del evento (`service.reconciled_single` vs reusar `service.reconciled_external_change` con un marcador). (3) ¿el resultado de la reconciliación per-servicio también deja un `ClientNote` (vía F.6) si aplicó cambios? — evaluar.

### A.11.10.7. Fase F.10 — Deep-links curados al panel del proveedor

**Tema:** en vez del único "Abrir panel del proveedor" genérico, atajos curados a las secciones más usadas — estándar de panel reseller.

- **F.10.1 — Atajos curados.** "Gestionar email", "Gestionar bases de datos", "Administrador de archivos", "Logs del sitio"… — las secciones que orchd exponga vía SSO (verificar en el OAS). Cliente + admin (`_shared/`). Capability-driven (ADR-070 — cero `if (provisioner === 'X')`): si una sección no existe para un plugin/instancia → no se muestra el atajo.
- **F.10.2 — Materialización (decidir pre-código):** (a) nuevas inline actions plugin-internas (`sso_email`, `sso_databases`, `sso_files`…) que internamente generan la URL SSO apuntando a la sección — slugs **plugin-internos**, NO contrato externo estable (L14), no necesita ADR; o (b) `getSsoUrl` gana un parámetro `section?: string` — esto SÍ es cambio del contrato (`ADR-077 amendment`) + posible ADR-083 amendment. Recomendado: la que menos toque el contrato si orchd lo permite (probablemente (a), salvo que el SSO de orchd ya acepte un `?section=` y entonces (b) sea trivial).
- **ADR amendments:** según la materialización elegida (ninguno si (a); ADR-077 + ADR-083 si (b)).
- **DoD F.10:** atajos curados (cliente + admin, capability-driven); tests; `pnpm ci:check:full` + boot; PR + post-merge sync.
- **Valoración pre-código:** (1) ¿qué secciones del panel Enhance soportan SSO directo (OAS)? (2) ¿materialización (a) inline actions o (b) `getSsoUrl({section})`? (3) ¿los atajos van en una card "Atajos al panel" propia o integrados en la card SSO existente?

### A.11.10.8. Fase F.11 — Conveniencias operativas del detalle de servicio + plugins

**Tema:** las conveniencias admin que esperarías de un panel reseller profesional, agrupadas (cada una pequeña).

- **F.11.1 — Mini-badge de salud del proveedor en `/admin/services/[id]`.** "Proveedor: operativo / degradado / caído" derivado del `CircuitBreakerRegistry.getState()` para el plugin de este servicio (etiquetado "estado en esta instancia" — el breaker es in-process) + link a `/admin/settings/plugins/[slug]` (el `<PluginOperationalOverview>` completo de F.2). Da contexto al admin cuando `getServiceInfo` devuelve `unknown`/fallback.
- **F.11.2 — Reenviar notificación al cliente.** En `/admin/services/[id]`, botón "Reenviar notificación al cliente" → modal con selector de plantilla — **whitelist** de las plantillas de service-lifecycle (`service.suspended` / `service.unsuspended` / `service.cancelled` / …), NO selector libre — → endpoint `POST /admin/services/:id/notifications/resend` con `{ template_key }` → re-renderiza la plantilla con el contexto del service y la envía + audit. Reusa el historial del módulo `notifications`.
- **F.11.3 — Cross-link a billing en la página del servicio** (cliente + admin): leyendo del módulo billing (la subscription/invoice del service), mostrar "Próxima renovación: X · €Y · [Ver factura]" (read-only en la página del servicio; el link lleva a `/dashboard/billing/[id]` o `/admin/...`). Si el service no tiene subscription/invoice asociada → no se muestra.
- **ADR amendments:** ninguno (todo composición + endpoints additivos).
- **DoD F.11:** mini-badge de salud; reenviar notificación (whitelist + audit); cross-link billing; tests; `pnpm ci:check:full` + boot; PR + post-merge sync.
- **Valoración pre-código:** (1) ¿el mini-badge solo en admin o también un indicador discreto para el cliente? — recomendado: solo admin (al cliente el banner de drift/suspendido ya le da el estado funcional). (2) ¿reenviar notificación reenvía la *última instancia enviada* o re-renderiza fresco? — re-renderiza fresco con el contexto actual.

### A.11.10.9. Fase F.12 — Layout canónico (página de servicio + páginas de plugins)

**Tema:** componer `/services/[id]` (admin + cliente), la lista de plugins (`/admin/settings/plugins`) y el detalle de plugin (`/admin/settings/plugins/[slug]`) en un layout canónico documentado en `UI_SPEC.md` — última fase de features, refactoriza la composición de todo lo que F.4-F.11 fueron añadiendo. **Fase con freeze gate.**

- **F.12.1 — Diseño (doc-first, iterativo).** Secciones nuevas en `UI_SPEC.md`: "§N — Layout canónico de `/services/[id]`" (admin + cliente, discriminado por rol per §4.13), "§N+1 — Layout de la lista de plugins (`/admin/settings/plugins`)", "§N+2 — Layout del detalle de plugin (`/admin/settings/plugins/[slug]`)". Cada una: jerarquía de componentes (árbol/wireframe), orden y prioridad de secciones, comportamiento responsive, qué es admin-only vs visible-cliente, estados empty/error/loading, y cómo compone con los patrones existentes (§4.2 Modal, §4.3 Toast/AlertBanner, §4.13 drift por rol, principios §1.2 — P4 "acción no contemplación", voz Aelium…). Con **wireframes ASCII** para iterar visualmente. **Freeze gate**: el agente IA produce una v1 sólida; Yasmin itera; se congela; hasta el freeze NO se toca código de refactor.
- **F.12.2 — Implementación (post-freeze).** Refactor de las 3 familias de páginas a la composición congelada — **pura composición, cero cambio de comportamiento**. Reutiliza los componentes DS y las cards `_shared/` que ya existen; componentes nuevos solo donde haya un hueco real (p.ej. un `<PageSectionGroup>` para el cromo consistente de secciones). El layout congelado deja **slots con nombre** que recibieron/recibirán: banner de suspensión (F.4), card SSL (F.7), aviso de cuota (F.8), CTA reconcile (F.9), atajos al panel (F.10), mini-badge salud + cross-link billing (F.11), notas inline (F.6).
- **ADR amendments:** ninguno (es UI_SPEC, no ADR). Las nuevas secciones de `UI_SPEC.md` son el deliverable.
- **DoD F.12:** secciones de layout en `UI_SPEC.md` (con wireframes) **congeladas**; las 3 familias de páginas refactorizadas a la composición canónica (sin regresión funcional — los E2E existentes siguen verdes); `pnpm ci:check:full` + boot; PR + post-merge sync.
- **Valoración pre-código:** la "valoración" aquí es el propio ciclo de iteración del diseño (v1 → feedback Yasmin → freeze). Cuestión doctrinal previa: ¿algún componente nuevo necesario (p.ej. `<PageSectionGroup>`) merece un §N en `UI_SPEC.md` como componente DS, o vive en `_shared/`? — decidir al congelar el diseño.

### A.11.10.10. Fase G — Cierre Sprint 15C.II

**Tema:** DoD del sprint completo — tests críticos, E2E, smoke real, retrospectiva, desbloqueo de Sprint 15D RC.

- **G.1 — Tests críticos faltantes.** Las 8 áreas del audit técnico Fase A (§A.2 coverage gaps) que sigan sin cubrir tras F.1-F.12 — típicamente: advisory lock concurrente real Postgres (`EnhanceCustomersService` 3-step), CircuitBreaker E2E con Enhance, SSO impersonation E2E (audit GDPR), AdminOnly enforcement E2E con bypass curl real, encryption key rotation, DNS edge cases (TTL bounds, conflicto CNAME), `change_package` metadata rollback en fallo, threshold race condition en reconciliación concurrente. Más: tests de F.4 (reconciliación de status, ambas direcciones), F.5 (billing-unify), F.6 (`ClientNote` los 4 caminos + migración), F.7 (SSL card states), F.8 (alertas de cuota sin spam), F.9 (`reconcileOne`), F.10/F.11.
- **G.2 — E2E spec extension.** Ampliar el spec E2E (`sprint-15c-enhance-flow.spec.ts` o el que corresponda) cubriendo los flujos de Fases E + F.1-F.12: suspender→reanudar (incl. el desync), banner de suspensión cliente, nota en el modal → `/admin/clients/[id]` → "Notas", SSL card, aviso de cuota, reconcile per-servicio, deep-links curados. Label `ready-for-e2e` en el PR.
- **G.3 — Smoke real Yasmin** (contra mock + Enhance live si aplica) — patrón Fases C/D/E. Los bugs que salgan se arreglan en G (o en una G.x).
- **G.4 — Retrospectiva** + lecciones heredables nuevas (L19+...) + **mover el dossier** completo a `docs/60-roadmap/completed/sprint-15c-ii-hardening-enhance.md` con header retrospectiva (resumen ejecutivo + métricas + lecciones + commit refs), preservando este dossier original como anexo de trazabilidad (patrón canónico Sprint 15C — ver `completed/sprint-15c-plugin-enhance-cp.md`).
- **G.5 — Doc-sync de cierre del sprint.** `current.md` (Sprint 15C.II ✅ CERRADO) + `backlog.md` (`DC.44`/`DC.45` → cerrados; cualquier nuevo apuntado de los smoke de G) + `MEMORY.md`/`project-state.md` (15C.II cerrado; **Sprint 15D RC DESBLOQUEADO** — cola P2.4 activa).
- **DoD del sprint 15C.II:** todos los DoD de fase (A→F.12) ✓ + `pnpm ci:check:full` verde + `pnpm ci:e2e` verde + smoke real OK + retrospectiva escrita + dossier en `completed/` + Sprint 15D RC desbloqueado.

### A.11.11. Sesiones origen del re-plan F.4→G

- 2026-05-12 (sesión 2 — post-merge de F.3 #67/#68; el testing de F.1 destapó el agujero de robustez del status de suspensión; decisión Yasmin: traer los apuntados de backlog [`DC.44`, `DC.45`, deep-links, notas, mini-badge, reenviar notif, cross-link billing] al sprint; auditoría "qué falta a estándar alto en el plugin Enhance + módulo de servicios cliente/admin"; refinamiento posterior — (a) integrar las acciones críticas de servicio con el sistema transversal `ClientNote` [no un `service_notes` table propio], (b) fase de layout canónico al final, (c) "más fases, más pequeñas" → este §A.11.10 reescrito con **10 fases ordenadas por prioridad: F.4 robustez del status de suspensión · F.5 `DC.44` billing-suspend-unify · F.6 notas `ClientNote` · F.7 SSL status · F.8 alertas de cuota · F.9 reconcile per-servicio `DC.45` · F.10 deep-links curados · F.11 conveniencias operativas · F.12 layout canónico · G cierre**).
