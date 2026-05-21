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
| **F.8** | **Alertas de cuota** — setting `provisioning.enhance_cp.quota_alert_threshold_pct` (default 85, editable en `/admin/settings/plugins/enhance-cp`) + aviso visual en `MetricsBar` cuando un recurso (disco/ancho-banda) cruza el umbral (barra ámbar/roja + "estás al X% de tu cuota de disco") + notificación al cliente al cruzar (el reconcile L3 o un cron detecta el cruce; persiste "última notif por recurso" para no spamear → emite `service.quota_threshold_crossed` → listener `notifications-on-service-quota-threshold` → email + campana + plantilla seedeada). Heredable a cualquier plugin con `has_metrics`. Detalle §A.11.10.5. | ✅ **CERRADA, mergeada a master** — PR [#79](https://github.com/yasmindanailov/dashboard/pull/79) squash-merge `46d2888` 2026-05-16 (bypass policy §6, **11ª aplicación** — patrón #57/#60/#63/#65/#67/#70/#72/#74/#75/#77; las 3 condiciones cumplidas: motivo externo + `pnpm ci:check:full` verde [53 suites, **731 passed + 5 skipped** = +19 vs F.7] + boot real backend verificado + **smoke real Yasmin 4/4 escenarios verificado contra `MockEnhanceServer`** (`MetricsBar` ámbar a 87% + 2 emails Mailpit + DoD anti-spam 4ª pasada NO duplica + hotfix UX toast Ajv descubierto) + sección formal en el cuerpo del PR; label `ready-for-e2e`). — rama `sprint15c-ii-fase-f8-quota-alerts` con 4 commits (`abf0240` doc / `0dae9dc` schema / `bbeab4d` lógica backend + tests / `78df064` frontend + summary). **Decisiones reales** (refinamiento pre-código §A.11.10.5.1 frozen 2026-05-16): R1 tabla dedicada `service_quota_alerts` (edge-triggered `crossed_up`/`crossed_down`, patrón Prometheus/AlertManager) sobre `services.metadata` — historial trazable + FK `ON DELETE Cascade`. R2 detector `QuotaThresholdDetectorService` transversal en `core/provisioning/` (heredable) invocado al final de `EnhanceReconciliationCron.runAsExecutor()` tras `runOnce()`; lectura per-service vía `api.calculateResourceUsage` (1 endpoint vs 5 de `getServiceInfo` — lean); `$transaction` con `isolationLevel: Serializable` (M2 — idempotency operativa explícita). R3 scope F.8 = solo disco; bandwidth diferido (reset mensual rompe edge-trigger sin handler especial, YAGNI). R4 setting en `configSchema` del manifest Enhance (`quota_alert_threshold_pct: integer, default:85, minimum:50, maximum:95`) — 95% hardcoded crítico. R5 evento `service.quota_threshold_crossed` registrado en `docs/20-modules/_events.md` + `provisioning/contract.md` §6, NO en ADR-080 §6 (corrige el apuntado: `service.*` ≠ framework `plugin.*`). R6 listener `NotificationsOnServiceQuotaThresholdCrossedListener` + plantilla seedeada (email + campana, EC-T8-17). R7 **mejora profesional sobre el dossier literal**: el threshold viaja por `summary.quota_alert_threshold_pct` de `getInfoForUser` (patrón paralelo a `provider_state_desync` F.4.1) en vez de endpoint nuevo — capa orquestador, **`ADR-077` contrato `ProvisionerPlugin` intacto**. `MetricsBar.tsx` Server Component puro con prop opcional capability-driven; coloreo solo en disco con `<QuotaIndicatorBlock>` (`role="progressbar"` + aria-label + advisory ámbar/rojo); colores DS coherentes con `invoice.paid/failed/overdue`. **+20 tests F.8** (12 detector + 8 listener; verificados patrones M2 serializable, M4 inclusivo, M8 sin total, R7 emit-fail-tras-persist, DoD anti-spam dos pasadas seguidas, re-cross genera 2º email). **ADRs**: ninguno (todo additivo a capa orquestador). Heredable a 15D RC / 15E Docker / 15G Plesk: el detector + listener + summary field se reutilizan; cada plugin solo añade su hook en su cron L3. Flip a ✅ definitivo en post-merge sync con commit SHA del squash. |
| **F.9** | **Reconciliación per-servicio (`DC.45`)** — `ProvisionerPlugin.reconcileOne?(service)` opcional (ADR-077 amendment, mismo patrón que A6 `testConnection?()`) + `ReconcileRegistryService.reconcileOne(slug,service)` + `ProvisioningService.reconcileServiceAsAdmin` + endpoint `POST /admin/services/:id/reconcile` + Enhance implementa `reconcileOne` + **wire del CTA**: el botón "Reconciliar contra el proveedor" del `AdminDriftBanner` (cuando `recoveryHint==='reconcile'`) y cada fila de drift del `<PluginOperationalOverview>` (F.2) → endpoint single-shot in-place — cierra el cabo de F.3 (hoy el CTA linka a la página de settings = reconcile-all). Detalle §A.11.10.6. | ✅ **CERRADA, mergeada a master** — PR [#82](https://github.com/yasmindanailov/dashboard/pull/82) squash-merge `55b3f86` 2026-05-16 (bypass policy §6, **12ª aplicación** — patrón heredado #57/#60/#63/#65/#67/#70/#72/#74/#75/#77/#79; CI GitHub billing-bloqueada §A.9.10; las 3 condiciones cumplidas: motivo externo + `pnpm ci:check:full` verde [backend 53 suites, **754 passed + 6 skipped** = +23 vs F.8 + `nest build`; frontend `tsc --noEmit` + `eslint --max-warnings=0` + `next build` 32 static pages + 13 dynamic routes] + boot real backend verificado [PID 35364 post `nest build`; rutas `POST /api/v1/admin/services/:id/reconcile` mapeada + executor `reconcileOne` registrado para `enhance_cp`; smoke automatizado 7/10 escenarios via curl + Mailpit + DB: E1 reconcile sin drift HTTP 200 shape correcto ✓ + E2 cooldown R6 coalesced ✓ + E3 race no reproducible (mock fast — path cubierto unit) + E4 shortcircuit terminal 409 SERVICE_TERMINAL_NOT_RECONCILABLE ✓ + E8 audit timeline F.3 con 3 entries `service_reconcile_admin`/`service.reconciled_single`/`reconciled_external_change` ✓ + E9 ClientNotes vacío driftsApplied=0 (R3 frozen) ✓ + E10 admin overview supports_reconcile_one=true ✓] + sección formal en el PR body; rama temporal eliminada; label `ready-for-e2e`) → post-merge doc-sync (este PR, patrón heredado #61/#64/#66/#68/#71/#73/#76/#78/#80). **Materializado**: R1 contrato opcional capability-driven por presencia ([ADR-077 Amendment A8](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments), mismo patrón A6/A7) + R2 reusa evento `service.reconciled_external_change` con discriminator `trigger: 'manual_single' \| 'cron'` payload-level (ADR-080 sin cambios) + R3 `ClientNote` automática vía `createFromServiceLifecycleAction` con `NoteCategory.reconciliation` 9º + `triggered_by_action.service.reconciled_single` 6º ([ADR-079 Amendment A5](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md#amendments)) + R4 doctrina safe-adopt espejo cron L3 (`active`/`suspended` auto-adopt sobre `services.status`, resto emit-only DH-INV-6) + R4.1 `plan_divergence` emit-only Enhance specifics (billing implication, Amendment IV) + R5 Toast UX 3 ramas (success/warning/info) + redirect timeline F.3 (1.5s delay) cuando `driftsApplied>0` o `driftsDetected>0` + coalesced prefix R6 + R6 cooldown 30s `SET NX EX` per-`serviceId` Redis con coalescing al cache (fail-OPEN) + R7 endpoint admin re-mapea `ConflictException(RECONCILE_IN_PROGRESS)` → HTTP 429 Too Many Requests con `Retry-After: 30` (transformación capa REST de presentación; service intacto) + R8 refactor cron L3 `reconcileService` privado → `reconcileOneInternal` público shape `ServiceReconcileResult` DRY entre cron L3 (`runFor` reconcile-all) y endpoint admin (Sub-amendment III A8.5: plugin aplica drifts safe-adopt + orquestador maneja transversales — cache/audit/evento/`ClientNote`) + R9 admin overview F.2 expone `reconciliation.supports_reconcile_one: boolean` derivado server-side vía `reconcileRegistry.hasReconcileOneExecutor(slug)` (NO toca `PluginManifest` declarativo, capability-driven por presencia coherente con A6/A7). **Backend**: nuevos types `ServiceDriftType` (3 valores) + `ServiceDrift` + `ServiceReconcileResult` + `ProvisionerErrorCode.RECONCILE_ONE_NOT_SUPPORTED` + `ProvisionerPlugin.reconcileOne?()` interface en `core/provisioning/types.ts`; `ReconcileRegistryService.reconcileOne(slug,service)` + `registerReconcileOne(slug,executor)` + `hasReconcileOneExecutor(slug)` con executor map paralelo (Amendment II DI clash: `ReconcileRegistryModule` leaf-importable, NO inyectar `PluginRegistryService`); `ProvisioningCacheService.tryAcquireReconcileSingleCooldown` + `cacheServiceReconcileResult` + `getCachedServiceReconcileResult` (30s TTL Redis, fail-OPEN); `ProvisioningService.reconcileServiceAsAdmin(serviceId, actorUserId)` constructor +1 arg (10 total) — carga service + shortcircuit terminal (`cancelled`/`terminated`) + cooldown R6 + delega a `reconcileRegistry.reconcileOne` + `$transaction` con `clientNote` si `driftsApplied>0` + cache invalidation + emit evento + audit; endpoint `POST /admin/services/:id/reconcile` con `@CheckPolicies(Update Service)` + `@AuditAccess('Service')` + re-mapeo 409→429 R7; `AdminPluginsService.getOperationalOverview` suma `supports_reconcile_one` derivado. **Plugin Enhance**: `enhance-reconciliation.cron.ts` refactor — `reconcileService` privado renombrado a `reconcileOneInternal` público con return `ServiceReconcileResult` (3 drift types mutuamente excluyentes, `driftsDetected.length ∈ {0,1}`, `plan_divergence applied=false` R4.1) + `runOnce` adapta conteo del summary leyendo `result.driftsDetected[].type` + `onModuleInit` añade `reconcileRegistry.registerReconcileOne('enhance_cp', (service) => this.reconcileOneInternal(service))` paralelo al `register()` existente. Plugin Enhance NO declara `reconcileOne` en `enhance.plugin.ts` — el executor se registra desde el cron directamente vía registry (preserva arquitectura plugin↔cron sin `forwardRef` bidireccional). **Frontend**: `<AdminDriftBanner>` nueva prop `supportsReconcileOne?: boolean` + handler `executeReconcileSingle` (Toast UX R5 3 ramas + redirect timeline F.3 + coalesced prefix R6 + 429 handler R7) en lugar de redirect placeholder F.3; `<DriftRowReconcileButton>` Client Component nuevo en `_shared/plugins/` (paralelo al banner, ~60 LOC, duplicación intencional vs hook compartido — 2 callers); `<PluginOperationalOverview>` añade columna "Acción" condicional a `overview.reconciliation.supports_reconcile_one`; Server Action federada `reconcileServiceAction(serviceId)` en `_shared/services/_actions.ts` (re-hidrata `reconciledAt` ISO→Date, propaga `coalesced?` + `retry_after_seconds`); `frontend/app/lib/api.ts` shapes espejo + `PluginOperationalOverview.reconciliation.supports_reconcile_one`. **Polish post-review canónico (commit `9f6f455`)**: 10 fixes MAJOR aplicados tras review profesional con 3 agentes review (backend + frontend + tests/ADRs) — sin bugs funcionales ni violaciones doctrinales R1..R9 frozen ni issues seguridad. **B1** `humanizeServiceDriftType()` helper localizado en `provisioning.service.ts` — `noteBody` muestra etiquetas humanas ("estado del servicio", "plan del producto", "suscripción del proveedor ausente") en lugar de enums técnicos crudos. **B2** Exportar `RECONCILE_SINGLE_COOLDOWN_SECONDS=30` + usarla en `admin-provisioning.controller.ts` header `Retry-After` (eliminar magic number duplicado). **B3** Guard defensivo `SERVICE_HAS_NO_PROVISIONER` para servicios legacy pre-Sprint 15A + comentario doctrinal exhaustivo sobre atomicidad weak vs F.5/F.6 (plugin aplica drifts FUERA `$transaction` orquestador). **F1+F3** Helper canónico nuevo `_shared/services/_reconcile-toast.ts` con `reconcileToastFor({coalesced, appliedCount, detectedCount, withTimelineCta})` centraliza Toast UX 3 ramas R5 + coalesced R6 + 14 keys i18n nuevas en `translations-es.ts` (singular/plural × with/without timeline + button labels + column header); el parámetro `withTimelineCta` modeliza explícitamente la divergencia intencional banner (`true` → redirect timeline) vs row button (`false` → refresh in-place); elimina ~60 LOC duplicadas. **F2** Eliminado flash UX en `setReconciling(false)` — botón mantiene `disabled=true` durante los 1500ms `setTimeout(router.push)` cuando hay redirect, evitando doble-disparo. **F4** Comentario engañoso en `_actions.ts:reconcileServiceAction` reemplazado por doc del comportamiento defensivo real. **+M6** `aria-busy={reconciling}` en `<DriftRowReconcileButton>` (a11y mínima). **T1** Tests usan `ProvisionerPluginError` canónico (no `Error` plano) con assertions estrictas `instanceof` + `code` + `module='reconcile'` + `retriable`. **T2** Test coalesced verifica TODOS los campos del result cacheado vía `toEqual({...result, coalesced:true})` + asserts cache/audit NO se invocan en flujo de lectura. **A1** [ADR-077 Amendment A8.3](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments) frase pendiente reemplazada por doctrina canónica R9 frozen: capability-driven por presencia (NO flag manifest), coherente con A6/A7. **Schema**: `prisma/migrations/20260516130000_sprint15c_ii_f9_note_category_reconciliation` añade `reconciliation` al enum `NoteCategory` (9º) + `service.reconciled_single` al enum `triggered_by_action` (6º). **+23 tests F.9** (`reconcile-registry.service.spec.ts` 13 nuevos + `provisioning.service.spec.ts` +8 nuevos (NotFound + shortcircuit terminal + cooldown 429 + happy path con `driftsApplied>0` → `ClientNote` creada + coalesced) + `enhance-reconciliation.cron.spec.ts` +6 nuevos (5 drift types + `onModuleInit` registra ambos executors) + `plugin-contract.spec.ts` +1 invariante capability-driven A8 + `admin-plugins.service.spec.ts` +1 supports_reconcile_one=true tras registerReconcileOne). **4 Amendments doctrinales** descubiertos durante implementación: I naming clash `ReconcileResult`→`ServiceReconcileResult` (sufijo `Service*` heredable; el `ReconcileResult` agregado del reconcile-all NO se renombra) + II DI clash módulo leaf — executor map paralelo en `ReconcileRegistryService` capturando instancia plugin en closure desde `onModuleInit` del cron + III R7..R9 frozen post-handoff §A.11.10.6.3 + IV R4.1 `plan_divergence` emit-only Enhance specifics (R4 genérico preserva auto-adopt como doctrina para plugins sin billing implication). **ADRs**: [ADR-077 Amendment A8](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments) (additivo, NO bumpea `contractVersion`) + [ADR-079 Amendment A5](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md#amendments). ADR-080 sin cambios (evento reusado con discriminator). ADR-083 sin Amendment A9 explícito (specifics documentados inline en docstring de `reconcileOneInternal` con refs a R4/R4.1/R8 frozen — no se descubrió lógica frozen-worthy del provider durante implementación). **Refinamiento pre-código R1..R9 + Amendments en §A.11.10.6.2** + handoff mid-implementación §A.11.10.6.3 (commit `02f18f3`). **Heredable a fases futuras 15D RC / 15E Docker / 15G Plesk**: (a) patrón "plugin aplica drifts safe-adopt + orquestador maneja transversales" para cualquier futuro método opcional del contrato que mute estado; (b) sufijo `Service*` para shapes per-servicio (vs agregado sin prefijo del reconcile-all); (c) executor map paralelo en `ReconcileRegistryService` cuando el módulo leaf preserva ausencia de ciclo DI; (d) capability gating UI vía flag derivado en admin overview F.2 (NO en manifest declarativo) — coherente A6/A7. **Smoke real automatizado Yasmin 7/10**: backend funcionalmente verificado end-to-end via curl + Mailpit auth flow + DB queries — E5/E6/E7 (3 drift types runtime) requieren manipular state Enhance, diferidos a Fase G E2E spec con `MockEnhanceServer` seed dinámico (DC.49). (`DC.45` materializado.) **Total**: rama tuvo 21 commits (5 doc + 12 feat + 4 chore — el último `9f6f455` polish 10 fixes review). **Materializado**: R1 contrato opcional capability-driven por presencia ([ADR-077 Amendment A8](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments), mismo patrón A6/A7) + R2 reusa evento `service.reconciled_external_change` con discriminator `trigger: 'manual_single' \| 'cron'` payload-level (ADR-080 sin cambios) + R3 `ClientNote` automática vía `createFromServiceLifecycleAction` con `NoteCategory.reconciliation` 9º + `triggered_by_action.service.reconciled_single` 6º ([ADR-079 Amendment A5](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md#amendments)) + R4 doctrina safe-adopt espejo cron L3 (`active`/`suspended` auto-adopt sobre `services.status`, resto emit-only DH-INV-6) + R4.1 `plan_divergence` emit-only Enhance specifics (billing implication, Amendment IV) + R5 Toast UX 3 ramas (success/warning/info) + redirect timeline F.3 (1.5s delay) cuando `driftsApplied>0` o `driftsDetected>0` + coalesced prefix R6 + R6 cooldown 30s `SET NX EX` per-`serviceId` Redis con coalescing al cache (fail-OPEN) + R7 endpoint admin re-mapea `ConflictException(RECONCILE_IN_PROGRESS)` → HTTP 429 Too Many Requests con `Retry-After: 30` (transformación capa REST de presentación; service intacto) + R8 refactor cron L3 `reconcileService` privado → `reconcileOneInternal` público shape `ServiceReconcileResult` DRY entre cron L3 (`runFor` reconcile-all) y endpoint admin (Sub-amendment III A8.5: plugin aplica drifts safe-adopt + orquestador maneja transversales — cache/audit/evento/`ClientNote`) + R9 admin overview F.2 expone `reconciliation.supports_reconcile_one: boolean` derivado server-side vía `reconcileRegistry.hasReconcileOneExecutor(slug)` (NO toca `PluginManifest` declarativo, capability-driven por presencia coherente con A6/A7). **Backend**: nuevos types `ServiceDriftType` (3 valores) + `ServiceDrift` + `ServiceReconcileResult` + `ProvisionerErrorCode.RECONCILE_ONE_NOT_SUPPORTED` + `ProvisionerPlugin.reconcileOne?()` interface en `core/provisioning/types.ts` (commit `9a33b32`); `ReconcileRegistryService.reconcileOne(slug,service)` + `registerReconcileOne(slug,executor)` + `hasReconcileOneExecutor(slug)` con executor map paralelo (Amendment II DI clash: `ReconcileRegistryModule` leaf-importable, NO inyectar `PluginRegistryService`); `ProvisioningCacheService.tryAcquireReconcileSingleCooldown` + `cacheServiceReconcileResult` + `getCachedServiceReconcileResult` (30s TTL Redis, fail-OPEN); `ProvisioningService.reconcileServiceAsAdmin(serviceId, actorUserId)` constructor +1 arg (10 total) — carga service + shortcircuit terminal (`cancelled`/`terminated`) + cooldown R6 + delega a `reconcileRegistry.reconcileOne` + `$transaction` con `clientNote` si `driftsApplied>0` + cache invalidation + emit evento + audit (commit `0ba780f`); endpoint `POST /admin/services/:id/reconcile` con `@CheckPolicies(Update Service)` + `@AuditAccess('Service')` + re-mapeo 409→429 R7 (commits `d11fce6` + `ef53704`); `AdminPluginsService.getOperationalOverview` suma `supports_reconcile_one` derivado (commit `8939a97`). **Plugin Enhance**: `enhance-reconciliation.cron.ts` refactor — `reconcileService` privado renombrado a `reconcileOneInternal` público con return `ServiceReconcileResult` (3 drift types mutuamente excluyentes, `driftsDetected.length ∈ {0,1}`, `plan_divergence applied=false` R4.1) + `runOnce` adapta conteo del summary leyendo `result.driftsDetected[].type` + `onModuleInit` añade `reconcileRegistry.registerReconcileOne('enhance_cp', (service) => this.reconcileOneInternal(service))` paralelo al `register()` existente (commit `aab7c6f`). Plugin Enhance NO declara `reconcileOne` en `enhance.plugin.ts` — el executor se registra desde el cron directamente vía registry (preserva arquitectura plugin↔cron sin `forwardRef` bidireccional). **Frontend**: `<AdminDriftBanner>` nueva prop `supportsReconcileOne?: boolean` + handler `executeReconcileSingle` (Toast UX R5 3 ramas + redirect timeline F.3 + coalesced prefix R6 + 429 handler R7) en lugar de redirect placeholder F.3; `<DriftRowReconcileButton>` Client Component nuevo en `_shared/plugins/` (paralelo al banner, ~60 LOC, duplicación intencional vs hook compartido — 2 callers); `<PluginOperationalOverview>` añade columna "Acción" condicional a `overview.reconciliation.supports_reconcile_one`; Server Action federada `reconcileServiceAction(serviceId)` en `_shared/services/_actions.ts` (re-hidrata `reconciledAt` ISO→Date, propaga `coalesced?` + `retry_after_seconds`); `frontend/app/lib/api.ts` shapes espejo + `PluginOperationalOverview.reconciliation.supports_reconcile_one` (commit `cd75441`). **Schema**: `prisma/migrations/20260516101500_add_reconciliation_note_category` añade `reconciliation` al enum `NoteCategory` (9º) + `service.reconciled_single` al enum `triggered_by_action` (6º) (commit `7425acf`). **+23 tests F.9** (`reconcile-registry.service.spec.ts` 13 nuevos + `provisioning.service.spec.ts` +8 nuevos (NotFound + shortcircuit terminal + cooldown 429 + happy path con `driftsApplied>0` → `ClientNote` creada + coalesced) + `enhance-reconciliation.cron.spec.ts` +6 nuevos (5 drift types + `onModuleInit` registra ambos executors) + `plugin-contract.spec.ts` +1 invariante capability-driven A8 + `admin-plugins.service.spec.ts` +1 supports_reconcile_one=true tras registerReconcileOne). **Cobertura**: 53 suites / **754 passed + 6 skipped** (+23 passed vs master 731+5) + backend `nest build` ✓ + frontend `tsc --noEmit` + `eslint --max-warnings=0` + `next build` ✓ (32 static pages + 13 dynamic routes). **4 Amendments doctrinales** descubiertos durante implementación: I naming clash `ReconcileResult`→`ServiceReconcileResult` (sufijo `Service*` heredable; el `ReconcileResult` agregado del reconcile-all NO se renombra, commit `d3be27b`) + II DI clash módulo leaf — executor map paralelo en `ReconcileRegistryService` capturando instancia plugin en closure desde `onModuleInit` del cron (commit `e97b521`) + III R7..R9 frozen post-handoff §A.11.10.6.3 (commit `76c9eee`) + IV R4.1 `plan_divergence` emit-only Enhance specifics (descubierto en commit feat 10c, R4 genérico preserva auto-adopt como doctrina para plugins sin billing implication, commit `aab7c6f`). **ADRs**: [ADR-077 Amendment A8](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments) (additivo, NO bumpea `contractVersion`) + [ADR-079 Amendment A5](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md#amendments). ADR-080 sin cambios (evento reusado con discriminator). ADR-083 sin Amendment A9 explícito — los specifics del `reconcileOne` Enhance están documentados en el docstring del `reconcileOneInternal` con refs a R4/R4.1/R8 frozen (no requería un Amendment formal porque no se descubrió lógica frozen-worthy del provider; el refactor preserva el comportamiento observable del cron L3 existente). **Refinamiento pre-código R1..R9 + Amendments en §A.11.10.6.2** + handoff mid-implementación §A.11.10.6.3 (commit `02f18f3`). **Heredable a fases futuras 15D RC / 15E Docker / 15G Plesk**: (a) patrón "plugin aplica drifts safe-adopt + orquestador maneja transversales" para cualquier futuro método opcional del contrato que mute estado; (b) sufijo `Service*` para shapes per-servicio (vs agregado sin prefijo del reconcile-all); (c) executor map paralelo en `ReconcileRegistryService` cuando el módulo leaf preserva ausencia de ciclo DI; (d) capability gating UI vía flag derivado en admin overview F.2 (NO en manifest declarativo) — coherente A6/A7. **Smoke real Yasmin**: ⏳ pendiente — verificación manual en navegador contra `MockEnhanceServer` de los 3 drift types (`status_divergence active→suspended` safe-adopt + `subscription_missing` emit-only + `plan_divergence` emit-only R4.1) + Toast UX 3 ramas + cooldown R6 + 429 R7 + `ClientNote` `reconciliation` aparece en `<ClientNotesTab>` federada + evento `service.reconciled_external_change` con `trigger:'manual_single'` aparece en timeline F.3 con detalle. Flip a ✅ definitivo en post-merge sync con commit SHA del squash. (`DC.45` materializado.) |
| **F.10** | **Capa base de App Management — deep-links a apps CMS instaladas** — pivot pre-código 2026-05-18 (§A.11.10.7.2 R1..R6 frozen): el plan original "deep-links curados al panel" inviable tras investigación rigurosa OAS orchd (endpoints SSO panel agnósticos a sección). Pivota a "capa base App Management" sobre endpoints contractuales documentados: `ServiceInfo.apps?: AppPresence[]` capability-driven (ADR-077 Amendment A9, mismo molde A5/A6/A7/A8 — NO bumpea `contractVersion`) + action canónica `open_app_admin` slug fijo + payload `{ appId }` (dispatcher interno WP SSO `getWordpressUserSsoUrl` / Joomla URL canónica `${site_url}/administrator`) + `<AppShortcutsCard>` SC `_shared/services/` cliente+admin L16 + audit per-app `metadata.app_id` JSON path (cero schema change). Detalle §A.11.10.7. | ✅ **CERRADA, mergeada a master** — PR [#85](https://github.com/yasmindanailov/dashboard/pull/85) squash-merge `f1f75d5` 2026-05-18 (bypass policy §6, **13ª aplicación** — patrón heredado #57/#60/#63/#65/#67/#70/#72/#74/#75/#77/#79/#82; CI GitHub billing-bloqueada §A.9.10; las 3 condiciones cumplidas: motivo externo + `pnpm ci:check:full` verde [backend 53 suites, **767 passed + 6 skipped** = +13 vs F.9 + `nest build`; frontend `tsc --noEmit` + `eslint --max-warnings=0` + `next build` 32 static pages + dynamic routes] + boot real backend verificado [backend :3001 healthy 200 `/api/v1/health` + `MockEnhanceServer` :3099 healthy 200 `/version` + ruta `GET /orgs/.../websites/.../apps` mapeada correctamente con semántica canónica orchd] + sección formal en el PR body; rama temporal eliminada; label `ready-for-e2e`) → post-merge doc-sync (este PR, patrón heredado #61/#64/#66/#68/#71/#73/#76/#78/#80/#83). **Materializado**: R1 hallazgo OAS rigoroso (orchd NO documenta SSO con sección — endpoints SSO panel `getOrgMemberLogin` + `createOtpSession` agnósticos a destino, construir sobre `?next=`/`?goto=` no-documentado violaría doctrina de robustez heredable ADR-070+ADR-077) + R2 `AppPresence`+`ServiceInfo.apps?` contrato genérico capability-driven por presencia (ADR-077 Amendment A9.4) + R3 `kind: string` libre plugin-internal (mismo patrón `ServiceAction.slug`) + detalles per-kind (`WordPressInfo`/`JoomlaInfo`/futuros) FUERA del contrato genérico (A9.5 doctrina) + R4 acciones per-app en `AppPresence.actions[]` separadas del `ServiceInfo.availableActions[]` (D4 frozen — acciones del servicio entero vs acciones de una instalación específica) + R4 (cont.) slug fijo `open_app_admin` + payload discriminator `{ appId }` (D5 frozen — heredable a futuras actions per-app `update_app_version`/`install_app_plugin`/`uninstall_app` `DC.NEW-53` sin diversificar shape) + R5 Joomla incluido (URL canónica `${site_url}/administrator` estándar CMS Joomla desde 2005 — estable a nivel del CMS, NO del panel; doctrina agnóstica al kind: el plugin decide URL fresh per-kind en `executeAction`) + DC.NEW-51..54 backlog futuro apuntados (stats UI per-app F.10.x + install/uninstall F.10.y + ops mutación F.10.z + modelo BD per-app trigger condicional) + R6 audit per-app via `audit_access_log.metadata.app_id` JSON path (cero schema change, coherente con `target_user_id` que vive como JSON path desde Sprint 9 Fase E; entry adicional `service.app_admin_opened` cuando admin actúa sobre service ajeno con `result.success=true` — ADITIVO al `audit_change_log` del wrapper, distinta dimensión read vs change). **Backend**: nuevos types `AppPresence` shape contractual mínimo `{ appId, kind: string libre, label, path?, version?, actions: readonly ServiceAction[] }` + `ServiceInfo.apps?: readonly AppPresence[]` en `core/provisioning/types.ts` (additivo, NO bumpea `contractVersion`); 4 nuevos métodos cliente Enhance `getWebsiteApps`/`getWordpressInfo`/`getDefaultWpSsoUser` (404 defensive → null, mismo patrón `getDomainSsl` F.7)/`getWordpressUserSsoUrl`/`getJoomlaInfo`; plugin Enhance declara inline action canónica `open_app_admin` (slug fijo + NO destructive + NO confirmRequired + NO adminOnly — cliente self-service); `getServiceInfo` extiende `Promise.all` con `getWebsiteApps` (fail-soft — apps NO bloquean SSL/quota/status) + helper `buildAppPresence` (WP requiere `defaultWpUserId` presente para declarar action `open_app_admin` — capability-driven por presencia: si falta → `actions: []` → frontend renderiza disabled state con tooltip + CTA panel; Joomla siempre habilita action; kinds futuros default omiten action defensive); `executeAction('open_app_admin')` switch case → `actionOpenAppAdmin` dispatcher: validar payload `{ appId }` → re-query `getWebsiteApps` para localizar app → discriminator por kind (WP → `getDefaultWpSsoUser` + `getWordpressUserSsoUrl(defaultUserId)` → `{ url, appKind:'wordpress', urlKind:'sso', opensIn:'new_tab' }`; Joomla → `getJoomlaInfo` + URL canónica `${site_url.replace(/\/$/,'')}/administrator` → `{ url, appKind:'joomla', urlKind:'canonical', opensIn:'new_tab' }`; kind desconocido defensive → `ProvisionerPluginError NOT_IMPLEMENTED` heredabilidad). **Mock**: `MockEnhanceServer` extendido con `state.websiteApps: Map<websiteId, EnhanceWebsiteApp[]>` + `state.wordpressInfoByAppId: Map<appId, EnhanceWordPressInfo>` + `state.joomlaInfoByAppId: Map<appId, EnhanceJoomlaInfo>` + 5 endpoints `registerWebsiteAppsRoutes` (GET `/apps` lista vacía si sin apps + GET `/wordpress/info` defaults sintéticos derivados del primary domain + GET `/wordpress/users/default` 404 si `defaultWpUserId === undefined` permite testing del path "WP sin default user" canónico + GET `/wordpress/users/:userId/sso` text/plain string JSON-encoded mismo shape que `/members/.../sso` existente + GET `/joomla/info` defaults sintéticos); seed opt-in `MockEnhanceSeed.websiteApps`/`wordpressInfoByAppId`/`joomlaInfoByAppId` (NO se auto-siembran apps al `POST /websites` — las apps las instala el cliente explícitamente o via F.10.y futuro install desde dashboard `DC.NEW-52`); cleanup canónico en `DELETE /websites/:id` borra apps + caches per-app (coherente con cleanup SSL F.7). **Orquestador audit per-app**: `ProvisioningService.executeActionForUser` añade `audit_access_log` enriquecido cuando se cumplen 4 condiciones canónicas (R6 + A9.11 frozen): `actionSlug === 'open_app_admin'` + `isAdmin === true` + `service.user_id !== actorUserId` + `result.success === true`. Entry shape: `action='service.app_admin_opened'`, `metadata.app_id` (del payload) + `metadata.app_kind` (de `result.data.appKind`) + `metadata.url_kind` + `target_user_id` (GDPR portal visibility). Entry ADITIVO al `audit_change_log` que el wrapper `executeActionWithCacheInvalidation` genera para TODAS las actions — distinta dimensión (read vs change), NO duplicación. Heredable a F.10.x: cuando emerjan actions admin sobre apps (`DC.NEW-53` `update_app_version`/`install_plugin`/`set_default_wp_sso_user`), el predicado canónico se generaliza a "action que opera sobre sub-recurso identificado por `payload.appId`" — mismo patrón sin refactor. **Frontend**: tipos espejo `AppPresence` + `ServiceInfo.apps?` en `frontend/app/lib/api.ts`; Server Action `openAppAdminAction(serviceId, appId): Promise<OpenAppAdminResult>` tipado result-discriminated (`ok+success+data` / `ok+!success+message?` / `!ok+error`) en `_shared/services/_actions.ts` — patrón paralelo a `requestSsoUrlAction`; `<AppShortcutsCard>` SC nuevo `_shared/services/` (~110 LOC, paralelo a `<SslStatusCard>` F.7 — capability-driven por presencia: devuelve `null` si `apps` vacío + título card + lista de N `<AppShortcutButton>` diferenciados por `appId+path`; L16 prop `isAdmin` pass-through); `<AppShortcutButton>` Client Component nuevo (maneja onClick → server action → `window.open(url, '_blank', 'noopener,noreferrer')` security best-practice con fallback defensive si browser bloquea popup; `useTransition` loading state `aria-busy={isPending}`; `errorMessage` con `role="alert"` + `aria-live="polite"` (a11y mínima); estado disabled si `hasOpenAction=false` — Button disabled + tooltip + CTA fallback opcional al panel con `ssoPanelFallbackHref`); +13 i18n keys ES nuevas (`service.apps.card_title`, `service.apps.open_app_admin.label_prefix`, `.title.sso`/`.canonical`, `.disabled_no_default_user` + `.cta_label`, `service.apps.path_prefix`/`.version_prefix`/`.error_opening`/`.opening_tooltip`, `plugin.enhance_cp.apps.wordpress`/`.joomla`/`.unknown`, `plugin.enhance_cp.actions.open_app_admin.label` + `.description`); barrel `_shared/services/index.ts` exporta `AppShortcutsCard` + `AppShortcutButton`; wire en `/dashboard/services/[id]/page.tsx` (cliente — render si `!isTerminal && !isSuspended && info.apps?.length > 0`; `isAdmin` derivado de `isStaffRole(role)`) + `/admin/services/[id]/page.tsx` (admin — render si `!isTerminal && info.apps?.length > 0` permitiendo `suspended` para investigación; `isAdmin={true}` fijo). **Amendment doctrinal I (commit 4 descubierto durante implementación)**: rename `ActionResult.data.kind` → `data.appKind` + nuevo `data.urlKind` — separación rigurosa QUÉ app vs CÓMO se generó URL ([ADR-083 A9.10](../10-decisions/adr-083-plugin-enhance-cp-specifics.md#amendments)). Compatible hacia atrás porque F.10 es la primera implementación que consume el shape. Heredable a futuras actions: `{ url, <subject>Kind, urlKind?, opensIn }` — separar QUÉ del CÓMO. **+13 tests F.10**: `describe('getServiceInfo() — apps F.10')` 7 tests (sin apps `getWebsiteApps null` → `info.apps undefined` capability-driven por presencia / array vacío `getWebsiteApps {items:[]}` → `info.apps undefined` NO array vacío misleading / WP con `defaultWpUserId` → `AppPresence` con action `open_app_admin` + label canónico / WP sin `defaultWpUserId` → `actions: []` frontend disabled / Joomla → `AppPresence` con action `open_app_admin` siempre disponible / multi-instancia 2 WP root+/blog + 1 Joomla → 3 entries diferenciadas por path / fail-soft `getWebsiteApps` throws → `info.apps undefined` status active preservado) + `describe('executeAction open_app_admin')` 6 tests (WP con default user → invoca `getWordpressUserSsoUrl(defaultUserId)` + returns `{url, appKind:'wordpress', urlKind:'sso'}` / WP sin default user 404 defensive → throws `INVALID_STATE` / Joomla → URL canónica `${site_url}/administrator` + `appKind:'joomla', urlKind:'canonical'` / Joomla `site_url` con trailing slash → normaliza no double slash / `appId` no existe en website → throws `INVALID_STATE` / payload sin `appId` → throws `INVALID_PAYLOAD`) + 3 tests existentes ajustados al sumar la 11ª action `open_app_admin` (`inlineActions` len 10→11; `clientSlugs` len 5→6 cliente self-service NO adminOnly; `availableActions` active 9→10 incluye `open_app_admin` post filter). `buildApiMock` extendido con defaults canónicos: `getWebsiteApps: null` = "website sin apps" → capability-driven por presencia; `getDefaultWpSsoUser: null` = "no default user configurado"; rest `jest.fn()` para `mockResolvedValueOnce` en tests específicos (coherente con patrón heredado F.7). **Cobertura**: 53 suites / **767 passed + 6 skipped** (+13 passed vs master 754+6) + backend `nest build` ✓ + frontend `tsc --noEmit` + `eslint --max-warnings=0` + `next build` ✓ (32 static pages + dynamic routes). **ADRs**: [ADR-077 Amendment A9](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments) (genérico — `AppPresence` shape + `ServiceInfo.apps?` + `open_app_admin` canónica + doctrina detalles per-kind FUERA contrato + extensibilidad A9.6 actions/status additivos + A9.7 audit per-sub-recurso JSON path) + [ADR-083 Amendment A9](../10-decisions/adr-083-plugin-enhance-cp-specifics.md#amendments) (Enhance specifics — 4 endpoints orchd consumidos + flow WP SSO + flow Joomla URL canónica + mock extension + UI card + A9.10 naming clarity I + A9.11 implementación audit per-app + A9.9 heredabilidad 15D/15E/15G). ADR-080 sin cambios (no eventos nuevos del framework; `audit_access_log` action `service.app_admin_opened` es access-level, no `audit_change_log`/event). **Heredable a fases futuras 15D RC / 15E Docker / 15G Plesk** (ADR-077 A9.9): (1) plugin enumera apps en `getServiceInfo()` con kinds plugin-internos (string libre) cuando upstream las expone; (2) action canónica `open_app_admin` declarada con payload `{ appId }`; (3) URLs fresh on-demand en `ActionResult.data` NO cacheadas (SSO one-shot, canónicas re-generadas para consistencia); (4) mock extendido análogamente con seed opt-in + cleanup en delete del recurso padre; (5) capability gating UI vía presencia de `info.apps`; (6) audit per-app via `metadata.app_id` cero schema change heredado. 15D RC no aplica (registro de dominios). 15E Docker SÍ (containers con apps web instaladas). 15G Plesk SÍ (Application Vault con catálogo extensivo — kinds adicionales sin amendment del contrato). **Smoke real automatizado contra MockEnhanceServer 11/11 OK** (2026-05-18, observación pre-F.11 de Yasmin sobre el patrón heredado F.7/F.8 que exige smoke real antes de avanzar — `backend/scripts/smoke-f10-mock.ts` ejecutable vía `pnpm --dir backend exec ts-node --transpile-only -P tsconfig.build.json scripts/smoke-f10-mock.ts`): el script extiende `MockEnhanceSeed` con `websites?: readonly EnhanceWebsite[]` (smokes E2E sin flujo de provisioning real) + `mock-enhance-runner.ts` con env vars `E2E_MOCK_ENHANCE_SEED_WEBSITES_JSON` + `E2E_MOCK_ENHANCE_SEED_WEBSITE_APPS_JSON` JSON parseables (cierra parcialmente `DC.49` — el housekeeping del mock seed dinámico apuntado en F.9), arranca mock standalone en puerto ephemeral con 1 customer + 2 websites + 3 apps seedeadas (WP root con `defaultWpUserId:42` + WP `/blog` sin default user + Joomla), y verifica los 5 endpoints F.10 vía fetch HTTP directo cubriendo los **4 escenarios canónicos del dossier** ([§A.11.10.7](#a-11-10-7-fase-f-10--capa-base-de-app-management--deep-links-a-apps-cms-instaladas) DoD): E1 website sin apps → `{items:[]} 200` (NO 404) ✓ + E5 multi-instancia 3 entries diferenciadas por `appId+path` (WP root sin path + WP /blog con path + Joomla) ✓ + WP root tiene `defaultWpUserId=42` ✓ + WP /blog NO tiene `defaultWpUserId` (canónico path "sin default user") ✓ + E2 `getDefaultWpSsoUser` WP con default 200 + `user.id=42` ✓ + `getWordpressUserSsoUrl` returns URL string JSON-encoded `"http://mock-panel.aelium.test/wp-admin/index.php?token=..."` ✓ + E3 `getDefaultWpSsoUser` WP sin default → 404 `NotFound` (path defensive del frontend disabled state) ✓ + E4 `getJoomlaInfo` devuelve `site_url='https://smoke-apps.aelium.test'` + `version='5.0.0'` ✓ + URL canónica `${site_url}/administrator` construible (heredada doctrina A9.2) ✓ + bonus `getWordpressInfo` shape completo `version`+`site_url`+`plugin_count`+`user_count`+`has_woocommerce` (heredable a F.10.x DC.NEW-51 stats UI sin refactor) ✓ + defensive GET `/apps` en website inexistente → 404 NotFound semántica canónica orchd ✓. **El backend side** (orquestador `executeActionForUser` + dispatcher por kind + audit per-app + cooldown F.10) está cubierto por los +13 tests unit del plugin (53 suites / 767 passed total). **El frontend visual end-to-end** (login → 2FA → service Enhance → ver `<AppShortcutsCard>` aparece → click → `window.open` abre URL correcta) sigue diferido a Fase G.2 E2E spec extension contra browser (patrón heredado F.9 que difirió E5/E6/E7 escenarios runtime a Fase G). Justificación: la suite test rigurosa +13 con todas las ramas dispatcher + capability gating + audit per-app + fail-soft + payload defensive + `ci:check:full` verde + boot smoke real verde dan cobertura profesional robusta de la lógica; el smoke visual cubre regresiones UI que `tsc` + `eslint` + tests unit no pueden capturar — su lugar canónico es el E2E suite Playwright. **Backlog DC.NEW-51..54 apuntados rigurosamente** ([`backlog.md`](../60-roadmap/backlog.md)): DC.NEW-51 (stats UI per-app F.10.x condicionado a demanda funcional), DC.NEW-52 (install/uninstall apps desde dashboard F.10.y condicionado a demanda comercial), DC.NEW-53 (operaciones mutación per-app F.10.z post F.10.x stats UI), DC.NEW-54 (modelo BD `app_observations` o `services.metadata.apps_seen[]` trigger condicional post F.10.x/y). **Total rama**: 7 commits (`04afa1c` doc-only pivot + R1..R6 + ADRs A9 + DC.NEW-51..54 + 6 tests críticos F.10 al `§A.11.10.10 G.1`; `025f216` feat backend types + plugin enumera + cliente API 4 métodos + executeAction dispatch; `f366d3e` feat mock 5 endpoints + state + seed + cleanup; `6eab31e` feat orquestador audit per-app + Amendment doctrinal I rename `kind`→`appKind`+`urlKind`; `d6741c2` feat frontend `<AppShortcutsCard>` SC + `<AppShortcutButton>` Client + Server Action + i18n + wire; `42853a9` test +13 F.10 + ajuste 3 existentes; `38a394c` style prettier auto-fix tras `ci:check:full`). |
| **F.11** | **Conveniencias operativas del detalle de servicio + plugins** — 3 sub-features cerradas: F.11.1 mini-badge salud del plugin in-process en `/admin/services/[id]` (agregado canónico `derivePluginHealth` worst-case `open>half-open>closed` sobre los breakers del `CircuitBreakerRegistry` Sprint 15A ADR-080 §5; "Proveedor: ● operativo/degradado/caído → Ver detalle del plugin"; **admin-puro** R1 frozen ADR-070 separación admin/cliente — `<ProviderHealthBadge>` SC en `_components/` admin-only NO en `_shared/`; doctrina heredable L16 NO universal); F.11.2 reenviar notificación al cliente desde panel admin (whitelist canónica defense-in-depth `NOTIFICATION_TEMPLATE_WHITELIST_SERVICE_LIFECYCLE` con `@IsIn` validator — 3 plantillas V1 frozen tras Amendment I: `service.suspended`/`service.unsuspended`/`service.cancelled`; re-render fresh contra estado actual del Service R2 frozen NO re-encola render histórico del `notification_log`; audit `audit_access_log.metadata.{template_key, target_user_id}` R5 frozen — extensión ADR-077 A9.7 JSON path multi-sub-recurso heredada F.10 R6 + Amendment II P1 rate limiting cooldown 60s per `(actor, service, template)` con HTTP 429 `RESEND_TOO_FREQUENT` + header `Retry-After`); F.11.3 cross-link Service↔billing (card "Facturación" con "Próxima renovación: <fecha> · €<importe> · Ver factura →" + Badge por status invoice — cliente + admin con L16 prop `isAdmin` ramifica solo el `href` del link `/dashboard/billing/[id]` vs `/admin/billing/[id]`). Detalle §A.11.10.8. | ✅ **CERRADA, mergeada a master** — PR [#90](https://github.com/yasmindanailov/dashboard/pull/90) squash-merge [`b4b2941`](https://github.com/yasmindanailov/dashboard/commit/b4b2941) 2026-05-19 (bypass policy §6, **14ª aplicación** — patrón heredado #57/#60/#63/#65/#67/#70/#72/#74/#75/#77/#79/#82/#85; CI GitHub billing-bloqueada §A.9.10; las 3 condiciones cumplidas: motivo externo + `pnpm ci:check:full` verde [backend 55 suites · **798 passed + 6 skipped** = +44 tests netos vs F.10 master 767+5 + `nest build`; frontend `tsc --noEmit` + `eslint --max-warnings=0` + `next build` 32 static pages + dynamic routes] + boot real backend verificado + sección formal en el PR body; rama temporal eliminada) → post-merge doc-sync (este PR, patrón heredado #61/#64/#66/#68/#71/#73/#76/#78/#80/#83/#86). **Materializado**: R1 mini-badge SOLO admin (cliente NO ve indicador técnico de breaker — ADR-070 separación cubierta por banner drift + recoveryHint + statusReason) + R2 reenvío re-renderiza fresh contra estado actual del Service (NO re-encola render histórico del `notification_log`; NO se re-emite el evento original — eso dispararía OTROS listeners; coherente F.4 A1 lifecycle administrativo vs operacional) + R3 `<ProviderHealthBadge>` admin-puro en `_components/` admin-only (doctrina heredable nueva: **L16 NO universal** — admin-only puro NO va en `_shared/` con prop `isAdmin`, va directo en `_components/` admin-only; F.11.3 `BillingCrossLinkCard` SÍ va en `_shared/` porque cliente lo necesita igualmente — decisión funcional por feature) + R4 whitelist en backend con `@IsIn(WHITELIST)` (defense-in-depth — curl con `template_key='task.assigned'` → 400 `INVALID_TEMPLATE_KEY` antes de tocar el service; frontend solo refleja la lista pero el enforce real vive en backend) + R5 audit metadata enriquecido `{resource_type, resource_id, target_user_id, template_key}` SIN `rendered_subject`/`rendered_body` (cero PII en audit log; extensión ADR-077 A9.7 doctrina heredada F.10 R6 — JSON path admite múltiples sub-recursos identificables en el mismo audit row). **Amendment I 2026-05-18** (L18 frozen — durante implementación del NotificationResendService): whitelist V1 reduce a 3 plantillas vs 5 R4 original. `service.password_reset` EXCLUIDA (flow propio con OTP fresh — action `reset_account_password` Sprint 15C.II Fase D ya cubre el caso del cliente que perdió el email; re-renderizar con OTP histórico expirado degradaría UX). `service.quota_threshold_crossed` EXCLUIDA (payload requiere snapshot in-flight de `used_pct`/`used_mb`/`total_mb` que NO deriva del Service entity — vive en lectura `getServiceInfo.metrics` cacheada o última fila `ServiceQuotaAlert`, ambas con TTL distintos al evento original; reenviar con datos desactualizados confundiría al cliente). Apuntado `DC.NEW-55` para post-15C.II (extender whitelist con snapshot persistido de `ServiceQuotaAlert(crossed_up)`). **Amendment II 2026-05-19** (L18 frozen — durante self-review profesional post-PR original): P1 rate limiting sobre `POST /admin/services/:id/notifications/resend` cerrando gap de seguridad detectado (admin con curl/script podía disparar N reenvíos al cliente sin protección server-side — spam vector real). Cooldown server-side per **3-tupla `(actor_user_id, service_id, template_key)`** TTL 60s en Redis (`SET NX EX`) — más restrictivo que F.9 reconcile single (30s) porque reenviar es side-effect sobre el cliente vs read-mostly. Granularidad doctrinal canónica: el actor responsable del spam es quien dispara — otros admins pueden reenviar otra plantilla; el mismo admin no puede repetir la misma plantilla al mismo cliente en <60s. Fail-OPEN si Redis cae (patrón canónico heredado F.3 B.1 + F.9). Defense-in-depth orden de checks (frozen): INVALID_TEMPLATE_KEY (DTO `@IsIn` → 400 antes de tocar el service) → NotFound (anti enumeration attack — service inexistente NO consume cuota) → cooldown (R7 fail-OPEN) → dispatch → audit. HTTP 429 `RESEND_TOO_FREQUENT` con shape `{code, message, retry_after_seconds}` + header HTTP estándar `Retry-After: <segundos>` re-mapeado en el controller via `@Res({passthrough:true})` (mismo patrón canónico F.9 `RECONCILE_IN_PROGRESS`). Frontend Server Action `ResendNotificationResult` extendido con `{rateLimited?: true, retryAfterSeconds?: number}`; toast accionable "Esta misma plantilla se reenvió hace pocos segundos. Reintenta en N s." vs error genérico. **Hot-fix DI clash post-Amendment II** (commit [`5d72e89`](https://github.com/yasmindanailov/dashboard/commit/5d72e89) — detectado por boot smoke real, NO por `ci:check:full`): `NotificationResendService` inyectaba `ProvisioningCacheService` (Amendment II), pero el provider vivía en `ProvisioningModule` sin ser importable desde `NotificationsModule` (Global) → `UnknownDependenciesException` runtime, backend NO arrancaba. Solución canónica módulo leaf — nuevo `core/provisioning/provisioning-cache.module.ts` con `@Module({ providers: [ProvisioningCacheService], exports: [...] })` (cero deps propias — solo `ConfigService` Global). `ProvisioningModule` lo importa + re-exporta como módulo (cero refactor en consumidores existentes, mismo patrón canónico `ReconcileRegistryModule` introducido F.9 Amendment II DI clash precedente). `NotificationsModule` lo importa también. **Lección operativa heredable nueva (anotada inline)**: `ci:check:full` cubre TS + lint + unit tests + builds, **NO el DI graph runtime de NestJS** — el único detector canónico es el boot real del backend dev (`pnpm run dev` + verificar `Aelium API running` sin `UnknownDependenciesException`). Boot smoke OBLIGATORIO antes de mergear PRs que tocan @Module/imports/exports. Heredable a 15D RC / 15E Docker / 15G Plesk. **Smoke real Yasmin (commits [`00ff811`](https://github.com/yasmindanailov/dashboard/commit/00ff811))** — 4 bugs UX latentes detectados por primer testing manual completo: (#1) "Abrir admin" en `<ActionsBar>` lanzaba `INVALID_PAYLOAD` porque la action `open_app_admin` (F.10) requiere `{appId}` pero el ActionsBar genérico la invocaba con `{}` — fix añadiendo a `INTERNAL_HELPER_SLUGS` blacklist (patrón canónico ya usado por `add_dns_record`/`suspend_service`/etc.); (#2)+(#3) "Restablecer contraseña" + "Abrir panel Enhance" devolvían INVALID_STATE — **NO bug código, gap arquitectónico**: la tabla `enhance_customers` (mapping User → enhance_owner_login_id + enhance_owner_member_id) persiste IDs creados en el provisioning original; mock Enhance in-memory reiniciado pierde state → IDs en Aelium quedan stale; `reconcile-all` F.9 reconcilia services/subscriptions pero NO valida `enhance_customers` (vive a nivel de User, no de Service). Apuntado `DC.NEW-58` con propuesta arquitectónica rigurosa (NO auto-healing automático por riesgo false-positive en producción — Enhance dando false 404 invalidaría customer correcto; en su lugar comando admin dedicado de reconcile enhance_customers). Path de resolución manual: `DELETE FROM enhance_customers WHERE user_id=...` + Reaprovisionar el servicio (re-ejecuta flow 6-step que recrea customer en Enhance + repuebla la tabla con IDs frescos); (#4) "Probar conexión" en `/admin/settings/plugins/[slug]` sin feedback — anti-pattern React 18 `startTransition(async () => ...)` (NO marca setState como transition; según versión React/Next puede perderse setState en race conditions del unmount); fix refactor a `async function` plain + onClick wrapper sync `() => { void handle(); }` + try/catch/finally defensivo. **Doctrina heredable nueva (anotada inline)**: cualquier handler `await + setState` en client components sigue el patrón canónico `async function handle()` + `<Button onClick={() => { void handle(); }} />`; NO usar `startTransition(async)`; cualquier slug en `inlineActions[]` que requiera payload no-trivial debe entrar a `INTERNAL_HELPER_SLUGS`. **Backend**: nuevos tipos `PluginHealthState`/`PluginHealthBreaker`/`PluginHealthSummary` + función pura `derivePluginHealth(slug, registry)` worst-case aggregation NO crea breakers (read-only) en `core/provisioning/circuit-breaker.ts`; `ProvisioningService.getPluginHealthForService(serviceId)` con resolución canónica del slug `service.provisioner_slug ?? service.product.provisioner` (services sin plugin asociado → `pluginSlug=''` operational por default + array vacío — UI ramifica por presencia del slug pero el endpoint no falla); endpoint `GET /admin/services/:id/plugin-health` read-only sin `@AuditAccess`; `notification-resend.constants.ts` con whitelist + tipo `ServiceLifecycleTemplateKey` + guard `isServiceLifecycleTemplateKey`; `dto/notification-resend.dto.ts` con `@IsIn(WHITELIST)`; `NotificationResendService.resendServiceLifecycleNotification(serviceId, templateKey, actorUserId, ctx)` con dispatcher map per template (fresh re-render espejando los listeners F.1-F.8 + `parseSuspensionReasonCode` defensivo a cadenas legacy "<reason>: <internal_note>" + `SUSPENSION_REASON_LABEL_ES` locales) + `audit.logAccess` con metadata enriquecida tras dispatch OK (fail-open R7) + cooldown Amendment II via `ProvisioningCacheService.tryAcquireResendNotificationCooldown` + `getResendNotificationCooldownRemainingSeconds`; endpoint `POST /admin/services/:id/notifications/resend` con `@CheckPolicies(Update Service)` + re-map 429 con header `Retry-After`; `BillingInvoiceService.getServiceBillingCrossLink(serviceId, userId, isAdmin)` con owner check espejo `getInfoForUser` (!isAdmin && service.user_id !== userId → 403) + lookup última `Invoice` via `items.some({service_id})` ordered by `created_at DESC` (Decimal serializado como string patrón Prisma canónico); endpoint unificado `GET /billing/services/:id/cross-link` con `isAdmin` derivado del role del JWT (patrón canónico `BillingController.findAll`/`findOne` — evita duplicar admin twin). **Frontend**: tipos espejo backend en `lib/api.ts`; `<ProviderHealthBadge>` SC admin-puro en `_components/` admin-only (R3 doctrina L16 NO universal — Badge variant `operativo=success`/`degradado=warning`/`caído=danger` + tooltip listando breakers individuales `getServiceInfo=X · executeAction=Y` o "Sin actividad reciente" si no hay breakers + link `/admin/settings/plugins/[slug]` al overview F.2 completo); `<ResendNotificationCard>` admin-only Client Component (`_components/` Card + Modal con `<Select>` de 3 plantillas + AlertBanner info + footer Cancel/Submit + Toast success/error/rate_limited con cuenta atrás); `<BillingCrossLinkCard>` SC en `_shared/services/` con prop `isAdmin` (L16 SÍ aplica — cliente y admin necesitan la MISMA información, solo `href` ramifica; capability-driven por presencia: si `nextDueDate===null && lastInvoice===null` → `null`; Badge por status invoice paid=success/pending=warning/overdue=danger; `formatCurrency`/`formatDate` con `Intl.NumberFormat` es-ES + fallback defensivo si Decimal/currency inválido); Server Actions `resendNotificationAction(serviceId, templateKey)` typed con `ResendNotificationResult` rate-limited handling; wire dual `/admin/services/[id]/page.tsx` (badge salud junto breadcrumb + ResendNotificationCard antes de ServiceNotesCard + BillingCrossLinkCard admin) + `/dashboard/services/[id]/page.tsx` (BillingCrossLinkCard cliente solo); **36 i18n keys ES nuevas**: 7 `service.provider_health.{label,operational,degraded,down,link_to_overview,tooltip_in_process,tooltip_no_breakers}` + 17 `service.notifications.resend.{card_title,card_description,card_button,modal_title,modal_help_prefix,modal_help_suffix,template_field_label,template_field_help,template_label.{suspended,unsuspended,cancelled},cancel,submit,submitting,toast_success_prefix,toast_rate_limited_prefix,toast_rate_limited_suffix}` + 12 `service.billing_cross_link.{card_title,next_renewal_prefix,last_invoice_prefix,due_prefix,view_invoice,no_invoice_yet,invoice_status.{draft,pending,paid,overdue,cancelled,refunded}}`. **+30 tests netos F.11** (vs 754+6 master post-F.10 → **+44 tests** post-merge contando ajustes de specs existentes): `circuit-breaker.spec.ts` +5 `derivePluginHealth` (operational/degraded/down/aislamiento prefix/slug vacío); `notification-resend.service.spec.ts` +15 (10 base R2 fresh re-render por template + R4 defense-in-depth + R5 audit sin PII + NotFound; **+5 Amendment II rate limiting**: cooldown libre con args canónicos + cooldown activo 429 + granularidad 3-tupla + anti timing-attack NotFound + anti behavior-mapping INVALID_TEMPLATE_KEY); `billing-invoice.service.cross-link.spec.ts` +6 (owner check + isAdmin bypass + NotFound + sin facturas + lookup query verification); `provisioning.service.spec.ts` +4 `getPluginHealthForService` (NotFound + resolución slug + fallback product.provisioner + pluginSlug vacío). Cobertura post-F.11: **55 suites / 798 passed + 6 skipped** (vs 53/754+6 master post-F.10). **ADRs**: ninguno (F.11 es composición sobre framework existente — ADR-077/079/080/083 sin cambios). Doctrina heredable nueva inline en §A.11.10.8.2: L16 NO universal + audit metadata JSON path multi-key (extensión ADR-077 A9.7) + DI runtime detection via boot smoke + async handlers canonical pattern + slug payload no-trivial → INTERNAL_HELPER_SLUGS. **Backlog DC.NEW-55..58 apuntados rigurosamente** ([`backlog.md`](../60-roadmap/backlog.md)): DC.NEW-55 (quota threshold reenvío con snapshot persistido + extender whitelist V2 a 4 plantillas — trigger demanda admin); DC.NEW-56 (tests integración HTTP supertest del endpoint resend — Retry-After header en wire real + AdminOnlyGuard rechaza agent_support + `@IsIn` desde ValidationPipe global); DC.NEW-57 (Idempotency-Key header Stripe-style para reintentos seguros — requiere persistencia (idempotency_key, response) con TTL, trabajo no trivial); DC.NEW-58 (reconcile enhance_customers mapping — gap arquitectónico detectado en smoke real F.11 — propuesta NO auto-healing automático por riesgo false-positive). **Total rama**: 10 commits (`a2b6993` doc-only refinamiento R1..R5 frozen pre-código + `a3153c8` F.11.1 mini-badge salud admin + `94ecca0` F.11.2 reenviar notificación + Amendment I whitelist 3 plantillas + `cab6336` F.11.3 cross-link billing + `6f13df4` tests backend +25 + `fbd31a9` style lint fix + `1236e55` docs Amendment I formal en dossier + `70d3027` F.11.2 Amendment II P1 rate limiting + `5d72e89` hot-fix DI clash ProvisioningCacheModule leaf + `00ff811` smoke real Yasmin fixes #1 open_app_admin + #4 test connection). |
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

#### A.11.10.6.1. Handoff F.9 — arranque pre-código en conversación nueva (frozen 2026-05-16)

**Propósito**: esta sección permite que una conversación nueva del agente arranque F.9 con rigor profesional leyendo SOLO este bloque + §A.11.10.6 (plan canónico arriba). Patrón heredado de §A.11.9 (handoff F.3 — sirvió como modelo).

**Estado del repo al arranque** (master 2026-05-16 post PR #80 mergeado):

- Master HEAD: PR #80 (`docs(sprint-15c-ii): post-merge sync Fase F.8`) sobre PR #79 squash `46d2888` (`feat(sprint-15c-ii): Fase F.8 — Alertas de cuota (disco) edge-triggered`).
- Sprint 15C.II Hardening A→F mergeada: F.1 (suspend/unsuspend) + F.2 (admin overview) + F.3 (audit timeline + cierre Fase F) + F.4 (robustez status suspensión) + F.5 (`DC.44` billing-suspend-unify) + F.6 (notas `ClientNote`) + F.7 (SSL status read-only) + F.8 (alertas de cuota disco edge-triggered).
- Cobertura backend master: **53 suites / 731 passed + 5 skipped** (+19 vs F.7 — detector + listener F.8).
- Frontend: `tsc --noEmit` + `eslint --max-warnings=0` + `next build` verde.
- ADRs frozen en master relevantes para F.9: [ADR-077 v2 contrato `ProvisionerPlugin`](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) con Amendments A1-A7 (último: A7 `ServiceInfo.ssl?` F.7); [ADR-080 Plugin Framework](../10-decisions/adr-080-plugin-framework.md) con Amendments B+C; [ADR-083 Plugin Enhance specifics](../10-decisions/adr-083-plugin-enhance-cp-specifics.md) con Amendments A1-A8 (último: A8 probe SSL F.7); [ADR-082 Domain↔Hosting + DNS doctrine](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) con A1 (lifecycle administrativo vs operacional F.4); [ADR-079 ClientNote source-tracking](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) con A4 (lifecycle de servicio F.6).
- Diferidos vigentes en `backlog.md`: `DC.46` (`autoCancelServices`→`deprovisionAsAdmin` destructivo), `DC.47` (naming `notes`↔`internal_note` `DeprovisionDto` housekeeping), **`DC.48` bandwidth como F.8.x** (apuntado en F.8 post-merge), **`DC.49` `MockEnhanceServer` seed dinámico** (apuntado en F.8 post-merge).

**Resumen del plan F.9 (§A.11.10.6)**: 4 piezas — F.9.1 contrato (`ProvisionerPlugin.reconcileOne?(service)` opcional, **ADR-077 Amendment A8** del contrato — primer amendment de F.9 a F.12 que toca contrato) + F.9.2 backend orquestador (`ReconcileRegistryService.reconcileOne` + `ProvisioningService.reconcileServiceAsAdmin` + endpoint `POST /admin/services/:id/reconcile`) + F.9.3 Enhance implementa `reconcileOne` (espejo de la lógica `runOnce` del cron L3 pero per-service) + F.9.4 wire del CTA (`AdminDriftBanner` con `recoveryHint==='reconcile'` cierra el cabo de F.3 + filas drift del `<PluginOperationalOverview>` F.2 ganan botón).

**Q1..Q6 — Valoración pre-código que la conversación nueva DEBE resolver con Yasmin ANTES de codear** (L18 frozen — mejoras como Amendment, no desvío silencioso). Las 3 primeras vienen del dossier original (§A.11.10.6); las 3 siguientes son refinamientos detectados a partir de las lecciones operativas de F.8:

- **Q1** — ¿`reconcileOne` estrictamente opcional o obligatorio si `manifest.supportsReconciliation === true`? **Recomendación**: estrictamente opcional (mismo patrón A6 `testConnection?()` y A7 `ServiceInfo.ssl?` — capability-driven por presencia, no por flag); plugins que NO lo implementen, el endpoint admin devuelve `400 RECONCILE_ONE_NOT_SUPPORTED` con mensaje claro al admin. Razón canónica: la consistencia con A6/A7 facilita los plugins futuros (15D RC / 15E Docker / 15G Plesk) — si un plugin tiene el método, lo expone; si no, el frontend oculta el CTA via capability. Decidir.

- **Q2** — Nombre del evento: `service.reconciled_single` (nuevo) vs reusar `service.reconciled_external_change` con marcador `trigger: 'manual_single'`. **Recomendación**: reusar el existente con marcador (heredable de la convención `plugin.reconcile_completed.trigger: 'cron' | 'manual'` que ya tenemos en F.2). Razón: evita duplicar listeners de audit/notif; el `change_type` (subscription_missing/status_divergence/plan_divergence) ya distingue por sub-tipo; el `trigger: 'manual_single' | 'cron'` añade dimensión sin contrato nuevo. Decidir.

- **Q3** — ¿`reconcileOne` genera `ClientNote` automática si aplicó cambios? **Recomendación**: SÍ, vía `ClientNotesService.createFromServiceLifecycleAction(input, tx?)` reutilizando el patrón F.6 — `triggered_by_action: 'service.reconciled_single'` (6º valor del enum) + `body: "Reconciliación manual contra el proveedor — N cambios aplicados: <plan_divergence|status_divergence|...>"`. Razón: el admin pulsa el botón con intención clara de "fix this drift" — la nota es el registro de esa intención + de qué se cambió. Pero solo si `result.driftsApplied > 0` — sin cambios, no hay nota. Decidir (afecta a `NoteCategory` — ¿`lifecycle` o nuevo `reconciliation`?).

- **Q4 (refinamiento nuevo F.9)** — Doctrina safe-to-adopt para `reconcileOne` cuando el proveedor reporta status fuera del set `{active, suspended}` (típicamente `cancelled`/`subscription_missing`). El cron L3 actual emite evento SIN actualizar `services.status` (DH-INV-6 con respeto al lifecycle administrativo — F.4 A1). `reconcileOne` debe seguir la **misma doctrina** o el admin pulsa el botón sobre un servicio en drift y termina con un `cancelled` automático que no quería. **Recomendación**: `reconcileOne` aplica los mismos checks que el cron L3 + el mismo set de safe-adopt (`active`/`suspended` auto-adopt, resto emit-only) + devuelve `ReconcileResult.driftsDetected` con TODOS los drifts detectados y `driftsApplied` con solo los aplicados. El frontend muestra "X drifts detectados, Y aplicados" en el toast — admin entiende qué se hizo y qué no. Decidir.

- **Q5 (refinamiento nuevo F.9)** — UX del toast post-reconcile. Opciones: (a) toast simple "Reconciliación completada · sin cambios" / "Reconciliación completada · 2 cambios aplicados" + `router.refresh()`; (b) toast con detalle ("plan_divergence aplicado: Web Starter→Web Pro · status: sin cambios"); (c) toast simple + redirect al timeline del service (`/admin/services/:id/audit` — F.3) para ver el rastro detallado. **Recomendación**: (a) por defecto + (c) si `driftsApplied > 0` (admin recibe feedback inmediato + tiene 1 clic al detalle). Decidir.

- **Q6 (refinamiento nuevo F.9)** — Rate-limit del endpoint. Patrón canónico Aelium: el admin puede martillar el endpoint (caso "el admin pulsa el botón 10 veces porque no ve feedback"). F.3 B.1 introdujo cooldown `SET NX EX` per-`serviceId` Redis para `force-refresh` (15s). **Recomendación**: aplicar el mismo patrón a `reconcileOne` — `ProvisioningCacheService.tryAcquireReconcileSingleCooldown(serviceId, 30)` (más generoso que force-refresh porque la pasada implica más calls al proveedor); si ventana activa, devolver el último `ReconcileResult` cacheado (también Redis, 30s TTL) o `429 RECONCILE_IN_PROGRESS` con `Retry-After`. Heredable a 15D RC / 15E Docker / 15G Plesk. Decidir.

**Patrón heredado de cierre F.1→F.8** (aplicable a F.9):

1. **1 rama por fase**: `sprint15c-ii-fase-f9-reconcile-single`.
2. **Commit 1 doc-only** (refinamiento pre-código §A.11.10.6.2 — frozen R1..R6 = resolución de Q1..Q6).
3. **Commits 2..N código** (schema si aplica → backend lógica + tests → frontend + wire).
4. **`pnpm ci:check:full`** verde + boot smoke + smoke real Yasmin contra `MockEnhanceServer`.
5. **PR** único (bypass policy §6 si CI Actions sigue billing-bloqueada — **12ª aplicación** previsible; las 3 condiciones canónicas: motivo externo + `ci:check:full` verde + sección formal en el body).
6. **Post-merge sync PR** doc-only (patrón heredado #61/#64/#66/#68/#71/#73/#76/#78/#80) — flip §A.11.1 fila F.9 a ✅ con commit SHA del squash + `current.md` + `backlog.md` + `MEMORY.md` + `project-state.md`.

**Comandos exactos para arrancar la conversación nueva**:

```bash
cd /c/Users/yasmi/Desktop/proyectos_tecnologiasdigital/aelium/dashboard
git checkout master && git pull --ff-only
git checkout -b sprint15c-ii-fase-f9-reconcile-single
# Leer dossier §A.11.10.6 + §A.11.10.6.1 (este handoff).
# Resolver Q1..Q6 con Yasmin pre-código.
# Materializar §A.11.10.6.2 con R1..R6 frozen (commit 1 doc-only).
# Proceder con commits feat según patrón heredado.
```

**Frase canónica de continuación** (Yasmin pega esto en chat nuevo):

> *"Lee `docs/60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md` §A.11.10.6 (plan F.9) + §A.11.10.6.1 (handoff). Fase F.8 cerrada en master (PR [#79](https://github.com/yasmindanailov/dashboard/pull/79) squash `46d2888` + post-merge sync [#80](https://github.com/yasmindanailov/dashboard/pull/80) `8f92dbf`). Próxima fase F.9 — reconcile per-servicio (`DC.45`): `ProvisionerPlugin.reconcileOne?(service)` opcional como **ADR-077 Amendment A8** + endpoint `POST /admin/services/:id/reconcile` + Enhance implementa + wire del CTA en `AdminDriftBanner` (cierra el cabo de F.3) + filas drift del `<PluginOperationalOverview>` F.2. **Resuelve Q1..Q6 de la valoración pre-código con Yasmin ANTES de codear** (frozen R1..R6 en §A.11.10.6.2). Patrón heredado: rama `sprint15c-ii-fase-f9-reconcile-single` + commit 1 doc-only (refinamiento) + commits feat + tests + `pnpm ci:check:full` + boot smoke + smoke real contra `MockEnhanceServer` + PR (bypass §6 si CI Actions billing-bloqueada — 12ª aplicación) + post-merge sync. Sé riguroso y profesional."*

**Notas críticas para la conversación nueva** (sin las cuales el smoke real F.8 se complicó):

- **`pnpm seed`** post-`pnpm prisma migrate deploy` si la fase añade plantillas nuevas a `notification-templates.ts` (el `upsert update:{}` solo inserta si no existe). F.9 NO añade plantilla nueva (reusa la convención del catálogo de eventos existentes), pero F.10/F.11 podrían — anotar.
- **Backend dist desfasado**: si hay un proceso `node dist/src/main` corriendo desde antes del `nest build`, reiniciar manualmente antes del smoke (el watch `nest start --watch` puede no estar sirviendo el puerto en dev — verificar con `Get-NetTCPConnection -LocalPort 3001`).
- **2FA admin**: TODOS los admins en seed tienen 2FA habilitado (superadmin + agent_full + agent_billing). Curl-login con código TOTP es frágil por chat (TOTP rota cada 30s) — preferir que Yasmin haga los disparos autenticados en navegador y el agente verifique vía `psql` + Mailpit API + audit log.
- **`MockEnhanceServer`**: corre vía `pnpm --dir backend exec ts-node -P ../tests/e2e/fixtures/tsconfig.mock-runner.json --transpile-only ../tests/e2e/fixtures/mock-enhance-runner.ts`. Para semillar dinámicamente la respuesta de `getSubscription` (caso F.9 — el smoke real necesitará simular drifts), HOY hay que editar el archivo + reiniciar (DC.49 promociona la mejora futura; F.9 puede arrastrarla si conviene — decidir en pre-código).
- **Bypass §6**: protocolo en `docs/90-meta/local-ci-playbook.md` §6. Las 3 condiciones canónicas + sección formal en el PR body. 11 aplicaciones a 2026-05-16 (#57/#60/#63/#65/#67/#70/#72/#74/#75/#77/#79).

#### A.11.10.6.2. Refinamiento pre-código F.9 — R1..R6 frozen (2026-05-16)

**Contexto:** §A.11.10.6.1 mergeado a master vía PR [#81](https://github.com/yasmindanailov/dashboard/pull/81) squash `b45d946` 2026-05-16. Las Q1..Q6 de la valoración pre-código se resolvieron con Yasmin en la sesión inaugural de la rama `sprint15c-ii-fase-f9-reconcile-single`. Este bloque congela R1..R6 antes del primer commit feat (L18 frozen — mejoras como Amendment, no desvío silencioso; patrón heredado del refinamiento pre-código F.6 [#74](https://github.com/yasmindanailov/dashboard/pull/74) R1/R2/R3).

**R1 (resolución Q1) — `reconcileOne` estrictamente opcional, capability-driven.**
- Firma frozen: `reconcileOne?(service: ServiceWithRelations): Promise<ServiceReconcileResult>` (additivo al contrato, mismo patrón que A6 `testConnection?()` y A7 `ServiceInfo.ssl?`). **ADR-077 Amendment A8** — NO bumpea `contractVersion`.
- Backend: `ReconcileRegistryService.reconcileOne(slug, service)` busca un `ReconcileOneExecutor` en un map paralelo (`reconcileOneExecutors`); si no existe, lanza `ProvisionerPluginError({ code: 'RECONCILE_ONE_NOT_SUPPORTED', module: 'reconcile', http: 400 })` (módulo set explícito — heredable de A6 + GAP-N F.3). El executor lo registra el cron del propio plugin en su `onModuleInit` vía `registerReconcileOne(slug, (service) => plugin.reconcileOne!(service))` — capturando la instancia del plugin en una closure. Patrón heredado del `ReconcileExecutor` (reconcile-all) existente — evita inyectar `PluginRegistryService` en el `ReconcileRegistryModule` leaf-importable (Amendment II abajo).
- Frontend: el CTA "Reconciliar contra el proveedor" en `<AdminDriftBanner>` (cuando `info.recoveryHint === 'reconcile'`) y los botones por fila de `<PluginOperationalOverview>` (F.2) se gatean leyendo la capability del manifest derivada del admin overview (sin flag explícito en `PluginCapabilities` — la capability se infiere por presencia del método; coherente con A6/A7).
- Contract test (invariante en `provisioner-contract.spec.ts`): cualquier plugin que declare la capability en el manifest expone el método; los que no lo expongan NO declaran la capability.
- Razón canónica: consistencia A6/A7 — capability-driven por presencia facilita los plugins futuros (15D RC / 15E Docker / 15G Plesk) sin contaminar `PluginCapabilities` con flags redundantes.

**R2 (resolución Q2) — Reusar evento `service.reconciled_external_change` + nuevo discriminador `trigger` en payload.**
- Payload extendido: `{ serviceId, pluginSlug, trigger: 'manual_single' | 'cron', driftsDetected: ServiceDrift[], driftsApplied: ServiceDrift[], actorUserId: number | null }`. El campo `actorUserId` es `null` para `trigger:'cron'` (sistema), populado para `trigger:'manual_single'` (admin que pulsó el botón).
- Heredable de la convención `plugin.reconcile_completed.trigger: 'cron' | 'manual'` introducida en F.2 (ADR-083 Amendment A6).
- Listeners actuales de `service.reconciled_external_change` (audit + notif F.3 GAP-M) siguen funcionando sin cambios; el `trigger` es discriminador opcional para los que necesiten diferenciar (ej. audit con actor real vs cron, notif solo en `manual_single` para no spammear).
- Cero contrato nuevo en catálogo §6 [ADR-080](../10-decisions/adr-080-plugin-framework.md). Sin amendment.

**R3 (resolución Q3) — `ClientNote` automática vía F.6 con `NoteCategory.reconciliation` NUEVA.**
- Disparo: dentro de la `$transaction` de `reconcileServiceAsAdmin` (R3 F.6: "transiciones lifecycle + `ClientNote` en misma tx Prisma; plugin/eventos/cache/audit FUERA"); solo si `result.driftsApplied > 0` (sin cambios aplicados, NO hay nota).
- Helper: `ClientNotesService.createFromServiceLifecycleAction(input, tx?: Prisma.TransactionClient)` ya canónico (F.6) — reutilizado tal cual.
- Migration Prisma `*_add_reconciliation_note_category`: añade `reconciliation` al enum `NoteCategory` (9º valor) + añade `service.reconciled_single` al enum `triggered_by_action` (6º valor). **ADR-079 Amendment A5** registra ambos.
- Body autogenerado: `"Reconciliación manual contra el proveedor — N cambio(s) aplicado(s): <change_types separados por coma>"` (ej. `"Reconciliación manual contra el proveedor — 1 cambio aplicado: plan_divergence"`).
- `triggered_by_action: 'service.reconciled_single'` (6º del enum) — coherente con el discriminador del evento (R2 `trigger:'manual_single'`).
- `<ClientNotesTab>` federada (F.6) renderiza la nueva categoría con etiqueta en español **"Reconciliación"**; filtros UI ganan el nuevo valor; href de la nota → `/admin/services/[id]` (igual que `source_system:'service'` de F.6).
- Razón canónica de category **NUEVO** (vs reusar `lifecycle`): separación granular — facilita filtrar el historial sin mezclar con suspensiones/cancelaciones humanas que llevan intención del usuario; al admin le permite auditar "qué reconciliaciones manuales han generado cambios" de un vistazo.

**R4 (resolución Q4) — Doctrina safe-to-adopt espejo del cron L3 (DH-INV-6 + F.4 A1).**
- `ServiceReconcileResult` frozen: `{ driftsDetected: ServiceDrift[]; driftsApplied: ServiceDrift[]; reconciledAt: Date }` (separación explícita — `driftsApplied ⊆ driftsDetected`). **Nombre frozen tras Amendment al final de esta sección** — colisión descubierta con `ReconcileResult` agregado del reconcile-all (`reconcile-registry.service.ts:74`) que NO se renombra.
- Set safe-adopt: status del proveedor `active` o `suspended` → auto-adopt sobre `services.status` (alineado a la doctrina F.4 A1 "lifecycle administrativo vs operacional"). Cualquier otro status (`cancelled`, `subscription_missing`, `terminated`, `expired`) → drift detectado y emitido en `driftsDetected`, **NO mutado** sobre `services.status` (transiciones destructivas requieren intención humana explícita vía `deprovisionAsAdmin` — `DC.46`).
- Drift `plan_divergence`: en el plugin Enhance es **emit-only** (matiz R4.1 descubierto durante implementación commit feat 10c — ver Amendment IV abajo). El R4 original asumía "auto-adopt sobre `services.metadata.plan_id`" pero el cron L3 actual mantiene emit-only por implicación billing (cambiar `services.metadata.plan_id` sin sincronizar `product.provisioner_config` rompe la coherencia billing-provisioning). El refactor del cron L3 (R8 frozen) preserva esta doctrina — `reconcileOneInternal` retorna `applied: false` para `plan_divergence`. Plugins futuros pueden optar por auto-adopt si su billing no se ve afectado por el plan declarado en el provider.
- Drift `subscription_missing` (proveedor reporta 404 para el `subscription_id` del service): SOLO emit-only — el cron L3 no lo adopta automáticamente y `reconcileOne` mantiene la doctrina. Admin decide vía botón explícito de cancelación.
- El frontend (R5) muestra `"X drifts detectados, Y aplicados"` — admin entiende qué se hizo y qué no; los no aplicados quedan en el audit timeline (F.3 GAP-M) para revisión humana.
- Razón canónica: la doctrina DH-INV-6 + F.4 A1 protege contra desyncs transitorios destructivos (caso `MockEnhanceServer` reiniciado perdiendo `patchSubscription` → `subscription_missing` espurio); el admin NO debe poder cancelar un servicio activo solo por pulsar "reconciliar".

**R5 (resolución Q5 — confirmada por defecto del dossier) — Toast simple + redirect condicional al timeline.**
- Caso `driftsApplied === 0 && driftsDetected === 0`: toast neutro **"Sin cambios — el servicio está sincronizado con el proveedor"** + `router.refresh()` (re-poblar UI por si la cache de `getServiceInfo` cambió).
- Caso `driftsApplied > 0`: toast éxito **"Reconciliación completada · N cambio(s) aplicado(s)"** + CTA secundario **"Ver detalle en timeline"** → `/admin/services/[id]/audit` (F.3 GAP-M) + `router.refresh()`.
- Caso `driftsApplied === 0 && driftsDetected > 0` (todos los drifts detectados son `cancelled`/`subscription_missing` no aplicables): toast warning **"N drift(s) detectado(s) · ninguno aplicado automáticamente (revisar timeline)"** + CTA "Ver detalle en timeline" (forzar revisión humana).
- Implementación: extender el handler del botón `<AdminDriftBanner>` (y filas drift de `<PluginOperationalOverview>`) para llamar `POST /admin/services/:id/reconcile` vía la action federada del frontend, capturar el `ServiceReconcileResult`, y switchear el toast según los 3 casos.

**R6 (resolución Q6 — confirmada por defecto del dossier) — Cooldown 30s Redis `SET NX EX` per-`serviceId` con coalescing a cache.**
- Método nuevo: `ProvisioningCacheService.tryAcquireReconcileSingleCooldown(serviceId: number, ttlSeconds: number = 30): Promise<boolean>` (paralelo a `tryAcquireRefreshCooldown` introducido en F.3 B.1).
- Almacenamiento del `ServiceReconcileResult` por servicio: `ProvisioningCacheService.cacheServiceReconcileResult(serviceId, result, ttlSeconds = 30)` + `getCachedServiceReconcileResult(serviceId): Promise<ServiceReconcileResult | null>`.
- Comportamiento en ventana activa:
  - Si hay `ServiceReconcileResult` cacheado → **devolverlo** (coalescing, alineado a F.3 force-refresh) + flag `coalesced: true` en respuesta HTTP para el frontend (toast neutro especial: "Resultado en caché — reconciliación reciente").
  - Si NO hay cacheado (primera llamada en curso, race) → `429 RECONCILE_IN_PROGRESS` con `Retry-After: <segundos restantes>`.
- TTL 30s vs F.3 B.1 force-refresh 15s: `reconcileOne` implica más calls al proveedor (re-leer subscription + comparar metadata + posibles mutaciones); el cooldown más generoso protege del N×load por martilleo del admin.
- Estrategia fail-OPEN: si Redis no responde, el endpoint procede (igual que F.3 B.1) — la disponibilidad del endpoint admin no debe depender del cooldown.
- Heredable a 15D RC / 15E Docker / 15G Plesk — mismo patrón.

**ADR amendments consolidados de F.9** (todos dentro de la fase, patrón heredado desde Fase E):
- **[ADR-077](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) Amendment A8** — `reconcileOne?(service): Promise<ServiceReconcileResult>` opcional capability-driven + shapes `ServiceReconcileResult` + `ServiceDrift` + `ServiceDriftType` + nuevo `ProvisionerErrorCode.RECONCILE_ONE_NOT_SUPPORTED`. Additivo, NO bumpea `contractVersion`. **Nombre `ServiceReconcileResult` frozen tras Amendment** — ver bloque al final de esta sección.
- **[ADR-079](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) Amendment A5** — `NoteCategory.reconciliation` (9º del enum) + `triggered_by_action.service.reconciled_single` (6º del enum) + reutilización de `createFromServiceLifecycleAction(tx?)` (helper F.6, sin cambios de firma).
- **ADR-080** — SIN amendment. Reusamos evento existente `service.reconciled_external_change`; el discriminador `trigger: 'manual_single' | 'cron'` es payload-level.
- **[ADR-083](../10-decisions/adr-083-plugin-enhance-cp-specifics.md) posible Amendment A9** — specifics del `reconcileOne` Enhance (decidir al implementar F.9.3 según si se descubre lógica frozen-worthy del provider en el smoke real; sino, NO se materializa).

**Mapa de implementación derivado de R1..R6** (orden tentativo de commits feat — no exhaustivo):
1. **Schema + migration**: `prisma/migrations/*_add_reconciliation_note_category` (enum `NoteCategory.reconciliation` + enum `triggered_by_action.service.reconciled_single`).
2. **Tipos backend** (`backend/src/core/provisioning/types.ts`): `ServiceDriftType`, `ServiceDrift`, `ServiceReconcileResult`, `ProvisionerErrorCode.RECONCILE_ONE_NOT_SUPPORTED`; ampliación de `ProvisionerPlugin` interface con `reconcileOne?()`.
3. **ADRs amendments** (commit doc dentro de la fase, paralelo al schema): ADR-077 A8 + ADR-079 A5.
4. **Contract test invariante** (`provisioner-contract.spec.ts`): capability-driven invariant.
5. **`ReconcileRegistryService.reconcileOne(slug, service)`**: delega al plugin con guard 400.
6. **`ProvisioningCacheService.tryAcquireReconcileSingleCooldown` + `cacheServiceReconcileResult`/`getCachedServiceReconcileResult`**: cooldown 30s + coalescing.
7. **`ProvisioningService.reconcileServiceAsAdmin(serviceId, actorUserId)`**: carga service (NotFound), shortcircuit terminal (`cancelled`/`terminated`), cooldown (R6), delega a `reconcileRegistry.reconcileOne`, dentro de `$transaction` aplica drifts + `createFromServiceLifecycleAction` si `driftsApplied>0` (R3), invalida cache `service_info`, emite `service.reconciled_external_change` con `trigger:'manual_single'` (R2), retorna `ServiceReconcileResult` con flag `coalesced` si aplica.
8. **Endpoint** `POST /admin/services/:id/reconcile` con `@CheckPolicies(Update Service)` + `@AuditAccess('Service')`.
9. **Tests backend**: `ReconcileRegistryService.reconcileOne` (plugin sin soporte → 400; con soporte → delega correctamente), `ProvisioningService.reconcileServiceAsAdmin` (NotFound + shortcircuit terminal + cooldown 429 + happy path con `driftsApplied>0` → `ClientNote` creada + cooldown coalesced → último resultado cacheado), Enhance plugin `reconcileOne` (mocks `EnhanceApiClient.getSubscription` con drifts simulados).
10. **Enhance plugin** (`backend/src/integrations/enhance/plugins/enhance.plugin.ts`): implementa `reconcileOne(service)` espejo del cron L3 — re-lee `getSubscription`, compara contra `services.metadata.subscription_id` + `product.provisioner_config.subscription_plan_id`, aplica safe-adopt según R4.
11. **Frontend**: extender `<AdminDriftBanner>` con handler del botón + extender filas drift de `<PluginOperationalOverview>` con botón inline + Server Action federada para el endpoint + Toast UX según R5.
12. **Smoke real** contra `MockEnhanceServer`: simular drifts vía edit + restart del mock (DC.49 NO arrastrado — confirmado en pre-código; F.9 ya tiene blast radius suficiente sin housekeeping del mock).

**Decisiones explícitas adicionales tomadas en pre-código** (apuntadas aquí para no perder trazabilidad):
- **DC.49 NO arrastrado a F.9**: el smoke real de F.9 sigue con el patrón "edit `mock-enhance-server.ts` + reiniciar el runner". DC.49 (seed dinámico del mock) sigue diferido como housekeeping post-15C.II — promocionable a fase aparte cuando el coste de no tenerlo sea mayor que el de implementarlo (probablemente cuando se materialicen los tests E2E de la Fase G).
- **Bypass §6 anticipado**: si CI GitHub Actions sigue billing-bloqueada al cerrar F.9, será la **12ª aplicación** del bypass (suma sobre #57/#60/#63/#65/#67/#70/#72/#74/#75/#77/#79). El handoff doc-only PR #81 no contó como bypass porque NO toca código (no requiere CI verde por construcción).

**Amendment 2026-05-16 — naming clash discovery (post-init implementación F.9.2)**

Durante el arranque del commit feat 2 (tipos backend) se descubre que el nombre `ReconcileResult` que R4 usaba para el shape per-servicio **ya estaba en uso** en el codebase: existe en `backend/src/core/provisioning/reconcile-registry.service.ts:74` como el shape agregado del reconcile-all (`{ servicesProcessed: number; driftsDetected: number; durationMs: number; details: unknown }`), exportado y referenciado en 5 archivos (16 ocurrencias totales: `reconcile-registry.service.ts`, `enhance-reconciliation.cron.ts`, `admin-plugins.service.ts` + 2 specs). L18 frozen — mejora descubierta = Amendment, no desvío silencioso.

**Resolución frozen (Yasmin 2026-05-16)**: opción B — renombrar el shape per-servicio a **`ServiceReconcileResult`**; el `ReconcileResult` agregado existente NO se toca. Razón canónica:

- **Cero refactor del cron L3**: el `ReconcileResult` agregado es contrato canónico del registry de reconcile-all (heredable por 15D RC / 15E Docker / 15G Plesk para sus crons propios). Renombrar a `ReconcileAllResult` introduciría breaking interno en 5 archivos sin valor añadido.
- **Naming más descriptivo**: `ServiceReconcileResult` deja explícita la dimensión "per-servicio" vs el agregado. Coherente con el sufijo de `ServiceAction`, `ServiceCapabilities`, `ServiceInfo`, `ServiceWithRelations` ya canónicos del contrato.
- **Sin colisión semántica**: `ReconcileResult` (agregado) y `ServiceReconcileResult` (per-servicio) son shapes con propósitos distintos — el cron L3 produce el primero, `reconcileOne` el segundo; no hay relación de herencia o composición.

**Aplicación en este §A.11.10.6.2**: todas las referencias a `ReconcileResult` en los párrafos R1, R4, R5, R6, ADR amendments y mapa de implementación se han actualizado a `ServiceReconcileResult` tras este Amendment. Los métodos del cache (`cacheServiceReconcileResult` + `getCachedServiceReconcileResult`) usan el sufijo coherente con el tipo. El frontend Server Action devuelve `ServiceReconcileResult` (no `ReconcileResult`).

**Heredable a fases futuras**: cualquier plugin que añada un método "per-servicio" con resultado tipado (ej. `getBackupStatus(service)` futuro) debe usar el sufijo `Service*` para el shape. El reconcile-all existente queda como referencia del patrón "agregado" sin prefijo.

**Amendment 2026-05-16 (II) — DI clash con `ReconcileRegistryModule` leaf-importable (post-init implementación F.9.5)**

Durante el arranque del commit feat 5 (`ReconcileRegistryService.reconcileOne`) se descubre que la formulación literal de R1 — *"el registry valida la presencia del método del plugin"* — requeriría inyectar `PluginRegistryService` en `ReconcileRegistryService`, pero `PluginRegistryService` vive en `ProvisioningModule` que importa `EnhanceCpModule` que importa `ReconcileRegistryModule` (leaf, ver docstring `reconcile-registry.module.ts:7-27`). Inyectarlo crearía exactamente el ciclo que el módulo leaf está diseñado para evitar.

**Resolución frozen (2026-05-16)**: aplicar el patrón canónico ya existente de `ReconcileExecutor` (reconcile-all) — el registry NO conoce instancias de plugins. Cada plugin que implemente `reconcileOne` registra un `ReconcileOneExecutor` (closure que captura su instancia) en el `onModuleInit` de su cron L3, paralelo al `register()` existente del reconcile-all. El registry mantiene dos mappings:

- `executors: Map<string, ReconcileExecutor>` — reconcile-all (existente).
- `reconcileOneExecutors: Map<string, ReconcileOneExecutor>` — per-servicio (NUEVO Amendment II).

Razón canónica:

- **Cero ciclo DI**: `ReconcileRegistryModule` sigue como leaf importable por `EnhanceCpModule` + `ProvisioningModule` sin crear dependencia inversa hacia el registry de plugins.
- **Coherencia con el patrón existente**: el registry sigue siendo "plugin-agnostic broker de executors" — los plugins se auto-registran (boundaries limpios R4). NO se introduce un patrón nuevo de DI lookup.
- **Capability detection sin referencia al manifest**: la presencia del executor en el map = capability presente. Plugins que NO implementen `reconcileOne` simplemente NO llaman `registerReconcileOne` — coherente con la doctrina capability-driven por presencia (R1 + A6/A7).

**Aplicación en código**:

- `reconcile-registry.service.ts` exporta `ReconcileOneExecutor` (type) + `registerReconcileOne(slug, executor)` + `reconcileOne(slug, service)` + `hasReconcileOneExecutor(slug)`. Sin inyectar `PluginRegistryService` ni romper el módulo leaf.
- `enhance-reconciliation.cron.ts:onModuleInit` (commit feat 10) llamará `this.reconcileRegistry.registerReconcileOne('enhance_cp', (service) => this.plugin.reconcileOne!(service))` paralelo al `this.reconcileRegistry.register('enhance_cp', () => this.runAsExecutor(), {...})` ya existente.
- Frontend capability check: el admin overview F.2 (`/admin/settings/plugins`) ya derive la capability del manifest enriquecido — añadir un flag derivado `supportsReconcileOne` en la API admin será trabajo del commit feat 8 (endpoint), no del registry.

**Heredable a fases futuras**: cualquier nuevo método opcional del contrato `ProvisionerPlugin` que requiera invocación per-servicio desde un servicio leaf-importable (`core/provisioning/`) debe seguir el patrón "executor registrado por el cron del plugin" antes que inyectar el `PluginRegistryService`. Esto preserva la regla de no-ciclos canónica de la arquitectura módulo del backend.

**Amendment 2026-05-16 (III) — R7..R9 frozen (Q7..Q9 resueltas post-handoff §A.11.10.6.3, sesión 2 mismo día)**

Tras el handoff §A.11.10.6.3 (commit `02f18f3`), Yasmin decide continuar la implementación en la misma sesión. Las Q7..Q9 declaradas en el handoff se resuelven aquí — congeladas como R7..R9 extensión natural de R1..R6 (manteniendo la nomenclatura R/Q heredada de F.6).

**R7 (resolución Q7) — Endpoint admin re-mapea `409 RECONCILE_IN_PROGRESS` → `HTTP 429 Too Many Requests` con header `Retry-After`.**
- Más estándar HTTP: el frontend (y cualquier cliente CLI/automatización) puede leer `Retry-After` automáticamente.
- Implementación en `admin-provisioning.controller.ts:reconcileOne`: `try/catch` sobre `ConflictException`; si `getResponse().code === 'RECONCILE_IN_PROGRESS'` → `throw new HttpException(payload, HttpStatus.TOO_MANY_REQUESTS)`. Header `Retry-After: 30` vía `@Header()` decorator condicional o response interceptor.
- El `ConflictException` original del orquestador permanece intacto — la transformación a 429 es responsabilidad del endpoint REST (capa de presentación). El orquestador no cambia → tests del service siguen pasando sin modificación.
- Cambia el contrato HTTP público del endpoint (NO hay clientes pre-existentes — el endpoint es nuevo en F.9). Documentar en `provisioning/contract.md` + Swagger.

**R8 (resolución Q8) — Enhance plugin: refactor del cron L3 a `reconcileOneInternal` reutilizable + `EnhancePlugin.reconcileOne` thin wrapper.**
- DRY: el cron L3 (`runFor`) y el endpoint admin (`reconcileOne`) invocan la **misma lógica per-service**. Cero duplicación. Cambio interno aceptable (es código del propio módulo plugin — R4 boundaries).
- Cambios concretos:
  - `enhance-reconciliation.cron.ts`: extraer el método `reconcileService(service)` privado a `reconcileOneInternal(service): Promise<ServiceReconcileResult>` público (`async` con visibilidad expandida). La lógica interna (extractServiceRefs + getSubscription + detectar drift + aplicar safe-adopt) se mantiene; el shape de retorno cambia de `ReconcileChangeType | null` a `ServiceReconcileResult` completo.
  - `enhance-reconciliation.cron.ts:onModuleInit`: añadir `this.reconcileRegistry.registerReconcileOne('enhance_cp', (service) => this.reconcileOneInternal(service))` paralelo al `register()` ya existente (línea 113).
  - `enhance.plugin.ts`: nuevo método `reconcileOne(service): Promise<ServiceReconcileResult>` thin wrapper que delega a `this.cron.reconcileOneInternal(service)`. Requiere inyectar `EnhanceReconciliationCron` en el plugin (sin ciclo: el cron ya inyecta el plugin para acceder al API client — bidirectional injection vía `forwardRef()` si Nest lo requiere; sino, directo).
  - El método `runFor` (reconcile-all) del cron itera todos los services y para cada uno llama a `reconcileOneInternal` (refactor interno, mismo resultado externo). Conteo agregado en `ReconciliationSummary` se construye sumando los `ServiceReconcileResult` per-service.

**Sub-amendment III a §A.11.10.6.2 A8.5 ADR-077** (frozen aquí — formalizado en commit feat 10c): la doctrina canónica del Amendment A8.5 que escribimos originalmente — *"el orquestador (`ProvisioningService.reconcileServiceAsAdmin`) aplica los drifts safe-adopt sobre `services.status`/`services.metadata` dentro de su `$transaction`"* — **se matiza**:

- **El plugin** (en su método `reconcileOne`) **aplica los drifts safe-adopt directamente** (mismo patrón que el cron L3 actual — `prisma.service.update` plugin-side). Esto preserva DRY (R8) y la consistencia entre los 2 paths (cron L3 reconcile-all + endpoint admin reconcile-single).
- **El orquestador** (`ProvisioningService.reconcileServiceAsAdmin`) gestiona TODO lo transversal: cooldown + cache invalidation + audit + evento + `ClientNote` (R8 del Amendment A4 — R8 audit centralizado).
- **L19 candidato heredable F.6** (lifecycle + nota en misma tx Prisma) se preserva PARCIALMENTE: cuando hay plugin call que muta estado, la nota se crea POST plugin call en su propia tx (compatibilidad de eventual consistency aceptable — el plugin commitea su mutación, el orquestador commitea la nota inmediatamente después; el caso de fallo del orquestador entre ambas tx es teóricamente posible pero recuperable vía cron L3 + nota retroactiva). L19 puro aplica solo a transiciones admin lifecycle SIN plugin call que mute estado (suspend/unsuspend/cancel cuando el plugin call es idempotente A4.4 y muta el proveedor pero NO Aelium).
- **Implicación para el orquestador F.9.7** (commit `0ba780f`): el código ya implementado es **correcto** — el orquestador NO aplica drifts (no hay lógica `prisma.service.update` ni `services.status` mutation en `reconcileServiceAsAdmin`); solo invoca `reconcileRegistry.reconcileOne` (que invoca al plugin que aplica los drifts) + crea `ClientNote` + cache + emit + audit. Sin cambios al commit feat 7. ✓

**R9 (resolución Q9) — Capability gating del CTA frontend: derivado `supports_reconcile_one: boolean` server-side en admin overview.**
- `admin-plugins.service.ts:listForOverview` (o el método análogo que devuelve el payload del admin overview F.2) suma `supports_reconcile_one: this.reconcileRegistry.hasReconcileOneExecutor(plugin.slug)` por cada plugin del array de respuesta.
- NO toca `PluginManifest` declarativo — coherente con capability-driven por presencia (A6 `testConnection?()` / A7 `ServiceInfo.ssl?`). El flag es **derivado**, no declarado.
- Frontend (`<AdminDriftBanner>`, `<PluginOperationalOverview>`): lee `plugin.supports_reconcile_one` del overview ya disponible y gatea el CTA. Sin nueva llamada de capability descubierta.
- Inyectar `ReconcileRegistryService` en `AdminPluginsService` es legítimo — `AdminPluginsModule` ya importa `ProvisioningModule` que re-exporta `ReconcileRegistryModule` (line 142 `provisioning.module.ts`). Sin ciclo.

**Aplicación en código** (commits feat 10a/10b/10c + 11 + 12 + PR):

- **Commit feat 10a — Q7**: endpoint admin `reconcileOne` handler en `admin-provisioning.controller.ts` re-mapea `409 RECONCILE_IN_PROGRESS` → `429 Too Many Requests` con header `Retry-After: 30`. Test del controller añadido si applicable.
- **Commit feat 10b — Q9**: `AdminPluginsService` (o el service de overview F.2) expone `supports_reconcile_one` derivado en el payload del admin overview. Inyectar `ReconcileRegistryService` con `forwardRef()` si Nest lo requiere. Tests actualizados.
- **Commit feat 10c — Q8 + Sub-amendment III**: refactor cron L3 + EnhancePlugin.reconcileOne thin wrapper + registerReconcileOne en onModuleInit + tests del plugin extendidos + Sub-amendment III a ADR-077 A8.5 (commit doc plegado en el mismo commit feat según patrón heredado).
- **Commit feat 11 — Frontend wire**: AdminDriftBanner + PluginOperationalOverview filas + Server Action federada + Toast UX R5 (3 ramas) + redirect timeline F.3 cuando `driftsApplied > 0`. Gate por `plugin.supports_reconcile_one`.
- **Commit feat 12 — Smoke real**: contra MockEnhanceServer (edit + restart simulando los 3 drift types) + `pnpm ci:check:full` + boot smoke verificado.

**Heredable a fases futuras**: el patrón "plugin aplica drifts safe-adopt + orquestador maneja transversales" se aplica a cualquier futuro método opcional del contrato `ProvisionerPlugin` que mute estado (`detectAbuse?()`, `reapplyDnsZone?()`, etc.). La separación es clara: el plugin sabe el shape específico del proveedor (qué adoptar y cómo); el orquestador sabe los transversales (cache + audit + eventos + notas).

**Amendment 2026-05-16 (IV) — R4.1 plan_divergence emit-only para Enhance (descubierto en commit feat 10c)**

Durante el refactor del cron L3 (`enhance-reconciliation.cron.ts:reconcileOneInternal` — commit feat 10c materializando R8) se descubre que el R4 frozen ("plan_divergence auto-adopt sobre `services.metadata`") **contradice** la doctrina ya implementada del cron L3 actual, que mantiene `plan_divergence` como **emit-only** con razón canónica documentada inline (línea 305-308 del cron original — "NO auto-corrige Aelium — billing implication, admin decide"). L18 frozen — mejora descubierta = Amendment, no desvío silencioso.

**Resolución frozen (2026-05-16)**: aplicar el matiz **R4.1** al R4 frozen sin renegar de R4 (R4 sigue válido como doctrina genérica para plugins que NO tienen implicación billing por el plan declarado en el proveedor):

- **R4 genérico (sin cambios)**: el plugin aplica drifts safe-adopt según el set `{active, suspended}` para status, `subscription_missing` emit-only.
- **R4.1 Enhance specifics (nuevo matiz)**: `plan_divergence` para `enhance_cp` es **emit-only** (`applied: false` en el `ServiceDrift` retornado). Razón canónica: cambiar `services.metadata.plan_id` sin sincronizar `product.provisioner_config` rompe la coherencia billing-provisioning (Aelium cobraría el plan declarado en el product, pero el provider entregaría recursos del plan distinto). El admin decide qué hacer: upgrade real del plan en Aelium (vía `change_package` action), downgrade en el provider, o no hacer nada (drift conocido).
- **Heredable a plugins futuros**: cualquier plugin SaaS cuyo `plan_id` esté acoplado a su modelo billing (15D RC, 15G Plesk) seguirá R4.1 — `plan_divergence` emit-only. Plugins cuyo plan sea puro catálogo sin implicación billing (raro) pueden seguir R4 genérico y auto-adoptar.

**Aplicación en código** (commit feat 10c):
- `enhance-reconciliation.cron.ts:reconcileOneInternal` construye el `ServiceDrift` de tipo `plan_divergence` con `applied: false` + `message: 'plan divergence — admin decide upgrade/downgrade real (billing implication)'`.
- El docstring del método explícitamente referencia R4.1 ("matiz al R4 frozen original").
- Tests del cron (`enhance-reconciliation.cron.spec.ts`) verifican que `plan_divergence` retorna `applied: false` (test "plan_divergence → applied=false matiz R4.1: billing implication, admin decide").

**Sin cambio en el comportamiento observable**: el cron L3 anterior ya hacía emit-only para `plan_divergence`. R4.1 formaliza la doctrina sin alterar nada — solo documenta lo que el código ya hacía y lo extiende per-servicio (endpoint admin reconcile-single también lo respeta vía DRY R8).

#### A.11.10.6.3. Handoff F.9 — mid-implementación (frozen 2026-05-16)

**Propósito**: documentar el progreso mid-implementación de F.9 (13 de los 12+1 hitos canónicos completados — backend completo + tests) para que una conversación nueva del agente cierre los 3 hitos restantes (feat 10 plugin Enhance + feat 11 frontend wire + feat 12 smoke real + PR + post-merge sync) con rigor profesional, leyendo SOLO §A.11.10.6 + §A.11.10.6.1 (handoff arranque) + §A.11.10.6.2 (R1..R6 frozen + Amendment naming clash + Amendment II DI) + este bloque. Patrón heredado de §A.11.10.6.1 (a su vez heredado de §A.11.9 handoff F.3).

**Estado del repo al cierre de la sesión 1** (2026-05-16 13:30 UTC):

- Rama `sprint15c-ii-fase-f9-reconcile-single` partida desde master `b45d946` (post-handoff PR [#81](https://github.com/yasmindanailov/dashboard/pull/81) squash).
- **13 commits hechos en local + pusheados a origin** (4 docs + 7 feats + 2 chore prettier):

| # | SHA | Hito (referencia §A.11.10.6.2) |
|---|-----|------|
| 1 | `da15ac8` | doc R1..R6 frozen |
| 2 | `7425acf` | F.9.1 schema + migration `NoteCategory.reconciliation` (9º) |
| 3 | `d3be27b` | doc Amendment naming clash → `ServiceReconcileResult` |
| 4 | `9a33b32` | F.9.2 tipos contrato (`ServiceDrift*`, `ProvisionerPlugin.reconcileOne?()`, `ProvisionerErrorCode.RECONCILE_ONE_NOT_SUPPORTED`) |
| 5 | `055a64f` | F.9.3 ADR-077 Amendment A8 + ADR-079 Amendment A5 |
| 6 | `e9e3023` | F.9.4 contract test invariante capability-driven |
| 7 | `e97b521` | F.9.5 `ReconcileRegistryService.reconcileOne` + Amendment II (DI clash) |
| 8 | `abe530d` | F.9.6 `ProvisioningCacheService` cooldown 30s + result coalescing |
| 9 | `307be35` | chore prettier (registry) |
| 10 | `0ba780f` | F.9.7 orquestador `ProvisioningService.reconcileServiceAsAdmin` |
| 11 | `d11fce6` | F.9.8 endpoint `POST /admin/services/:id/reconcile` |
| 12 | `29016f5` | F.9.9 tests backend (6 registry + 8 orquestador) |
| 13 | `2225d2e` | chore prettier (specs) |

- Cobertura backend post-feat-9: **53 suites / 747 passed + 6 skipped** (+14 vs master 733+5 — los 6 nuevos del registry F.9 + 8 nuevos del orquestador F.9, todos en describes nuevos).
- **2 Amendments doctrinales** descubiertos durante implementación y frozen en §A.11.10.6.2:
  - **Amendment 2026-05-16** (naming clash): `ReconcileResult` ya existía en el codebase para el reconcile-all agregado (`reconcile-registry.service.ts:74`). El shape per-servicio de R4 frozen pasa a llamarse `ServiceReconcileResult` (sufijo `Service*` heredable a fases futuras).
  - **Amendment 2026-05-16 (II)** (DI clash): `ReconcileRegistryModule` es leaf-importable para evitar ciclo con `ProvisioningModule` (provee `PluginRegistryService`). Inyectar `PluginRegistryService` en el registry crearía exactamente ese ciclo. Resolución: el registry NO conoce instancias de plugins — cada plugin que implemente `reconcileOne` registra un `ReconcileOneExecutor` (closure capturando la instancia) en el `onModuleInit` del cron, paralelo al `register()` existente del reconcile-all. Implementación: `registerReconcileOne(slug, executor)` + `reconcileOne(slug, service)` + `hasReconcileOneExecutor(slug)`.

**Lo que queda — 4 hitos** (todos referenciados por número en §A.11.10.6.2 mapa de implementación):

- **Hito 10 — `EnhancePlugin.reconcileOne(service)` + registro en cron L3** (`backend/src/plugins/provisioners/enhance_cp/enhance.plugin.ts` + `crons/enhance-reconciliation.cron.ts`). Espejo per-servicio de la lógica del cron L3 actual (`reconcileService` método privado línea ~257). Re-lee `getSubscription` via `EnhanceApiClient`, compara contra `services.metadata.subscription_id` + `product.provisioner_config.subscription_plan_id`, aplica safe-adopt R4. En el `onModuleInit` del cron añadir `this.reconcileRegistry.registerReconcileOne('enhance_cp', (service) => this.plugin.reconcileOne!(service))` paralelo al `register()` ya existente (línea 113). Tests: extender `enhance.plugin.spec.ts` con casos de `reconcileOne` (mocks de `getSubscription` simulando los 3 drift types). **Decisión a tomar pre-código** (Q8 abajo).
- **Hito 11 — Frontend wire** (`frontend/src/_shared/services/` + `frontend/src/admin/`). Extender `<AdminDriftBanner>` con handler del botón "Reconciliar contra el proveedor" cuando `info.recoveryHint === 'reconcile'` (hoy linka a settings — placeholder F.3). Extender filas drift de `<PluginOperationalOverview>` (F.2) con botón inline "Reconciliar". Server Action federada que invoca `POST /api/v1/admin/services/:id/reconcile` y captura el `ServiceReconcileResult & { coalesced?: true }`. Toast UX según R5 frozen (3 ramas: sin cambios / N aplicados / N detectados sin aplicar) + redirect al timeline F.3 cuando `driftsApplied > 0`. Gating del CTA: capability del manifest enriquecido en admin overview F.2 (`supportsReconcileOne` derivado de la presencia del executor en el registry — exponer vía la API admin existente).
- **Hito 12 — Smoke real contra `MockEnhanceServer`** + `pnpm ci:check:full` + boot smoke. Edit + restart del mock para simular cada drift type (subscription_missing, status_divergence, plan_divergence). Verificar el Toast UX en navegador. Confirmar audit timeline F.3 muestra el evento `service.reconciled_external_change` con `trigger:'manual_single'` + el `ClientNote` con categoría `reconciliation` aparece en `<ClientNotesTab>` federada con etiqueta "Reconciliación".
- **PR + post-merge sync** — Apertura del PR (bypass §6 si CI Actions sigue billing-bloqueada — **12ª aplicación** previsible). Post-merge doc-sync patrón heredado (#61/#64/#66/#68/#71/#73/#76/#78/#80) — flip §A.11.1 fila F.9 a ✅ + `current.md` + `backlog.md` + `MEMORY.md` + `project-state.md`.

**Q7..Q9 — Decisiones pre-código a resolver con Yasmin en sesión nueva** (descubiertas durante implementación sesión 1):

- **Q7** — `ConflictException(RECONCILE_IN_PROGRESS)` del orquestador: el filter global lo mapea a HTTP 409 por defecto. **¿Re-mapearlo a HTTP 429 con header `Retry-After` explícito** en el endpoint admin (commit feat 8 actualmente devuelve 409)? La semántica "Too Many Requests" es más estándar para cooldowns. **Recomendación**: SÍ, mejor adherencia al estándar HTTP — modificar el `reconcileOne` handler del controller para `try/catch` la `ConflictException` con code `RECONCILE_IN_PROGRESS` y re-throw como `HttpException(..., 429)` con header. Coste: ~10 líneas. Decidir.

- **Q8** — Doctrina del Enhance plugin `reconcileOne` vs el cron L3 actual. El cron L3 (`enhance-reconciliation.cron.ts:reconcileService`) **ya aplica drifts safe-adopt directamente** (muta `services.status` / `services.metadata` plugin-side, vía `prisma.service.update`). El nuevo `reconcileOne` per-servicio puede:
  - **Opción A (recomendada)**: refactorizar `reconcileService` privado del cron a `reconcileOneInternal(service)` reutilizable, y exponer `EnhancePlugin.reconcileOne(service) = this.cron.reconcileOneInternal(service)`. DRY — el cron L3 y el endpoint admin invocan la misma lógica. Cambio interno aceptable (es código del propio módulo plugin). Tests del cron siguen pasando.
  - **Opción B**: implementar `reconcileOne` independiente, duplicando la lógica del cron (drift detection + safe-adopt). Coste: duplicación, riesgo divergencia futura.
  - **Sub-amendment a §A.11.10.6.2 A8.5 ADR-077** que decía "el orquestador aplica los drifts en su `$transaction`" — la realidad es que el cron L3 actual aplica drifts plugin-side, y `reconcileOne` debe ser consistente (opción A). El orquestador F.9.7 NO aplica drifts — solo invoca al plugin que ya los aplicó + maneja `ClientNote` + audit + evento + cache. **Aplicar Amendment III** en el commit feat 10 para frozen la doctrina (matiz a L19 candidato F.6: cuando hay plugin call que muta estado, la nota se crea POST plugin call en su propia tx; L19 puro aplica solo a transiciones admin lifecycle sin plugin call). Decidir.

- **Q9** — Capability detection en frontend para gatear el CTA. R1 frozen dice "frontend gatea leyendo la capability del manifest enriquecido vía admin overview F.2". **Pero la presencia de `reconcileOne` NO está hoy en el manifest** — el manifest declara `testConnectionMethod`, `serviceInfoCacheTtlSeconds`, capabilities (suspend/dns/etc), pero no expone si el plugin implementa `reconcileOne?()`. Opciones:
  - **Opción A**: añadir un campo derivado al admin overview response `supportsReconcileOne: boolean` calculado server-side (`typeof plugin.reconcileOne === 'function'` O `registry.hasReconcileOneExecutor(slug)` — ambos equivalentes). NO afecta el manifest declarativo (`PluginManifest` queda intacto). El frontend lee el campo derivado.
  - **Opción B**: el frontend invoca el endpoint y maneja el 400 RECONCILE_ONE_NOT_SUPPORTED renderizando un mensaje de error. UX peor (el usuario pulsa un botón que falla siempre).
  - **Opción C**: añadir flag explícito `supports_reconcile_one` a `PluginCapabilities`. Rompe la doctrina capability-driven por presencia (A6/A7).
  - **Recomendación**: Opción A — derivado server-side en la admin API. Coste: ~5 líneas en `admin-plugins.service.ts` (suma de un flag al payload del plugin instance) + lectura en el frontend. Decidir.

**Patrón heredado de cierre F.1→F.8** (aplicable a la sesión 2):

1. Resolver Q7..Q9 con Yasmin pre-código.
2. (Opcional pero recomendado) Commit doc-only con sub-amendments al §A.11.10.6.2 (similar al `d3be27b` naming clash + el `e97b521` Amendment II): "Amendment III — plugin aplica drifts vs orquestador (Q8 frozen)" + cualquier otro sub-amendment de Q7/Q9.
3. Commit feat 10 — Enhance plugin (espejo cron L3 según opción A Q8).
4. Commit feat 11 — Frontend wire.
5. Commit feat 12 — Smoke real + `pnpm ci:check:full` + boot smoke.
6. PR único con bypass §6 si CI Actions sigue billing-bloqueada (12ª aplicación previsible — sumando sobre #57/#60/#63/#65/#67/#70/#72/#74/#75/#77/#79).
7. Post-merge doc-sync PR (patrón heredado #61/#64/#66/#68/#71/#73/#76/#78/#80) — flip de §A.11.1 fila F.9 a ✅ con commit SHA del squash + `current.md` + `backlog.md` (cerrar `DC.45`) + `MEMORY.md` + `project-state.md`.

**Comandos exactos para arrancar la sesión 2**:

```bash
cd /c/Users/yasmi/Desktop/proyectos_tecnologiasdigital/aelium/dashboard
git checkout sprint15c-ii-fase-f9-reconcile-single
git pull --ff-only  # traer este handoff (commit pendiente al cerrar sesión 1)
# Leer §A.11.10.6 + §A.11.10.6.1 + §A.11.10.6.2 + §A.11.10.6.3 (este handoff).
# Resolver Q7..Q9 con Yasmin pre-código.
# Materializar sub-amendments + commits feat 10/11/12 + PR + post-merge sync.
```

**Frase canónica de continuación** (Yasmin pega esto en chat nuevo):

> *"Lee `docs/60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md` §A.11.10.6 (plan F.9) + §A.11.10.6.1 (handoff arranque) + §A.11.10.6.2 (R1..R6 frozen + Amendments I y II) + §A.11.10.6.3 (este handoff mid-implementación). Backend completo end-to-end en la rama `sprint15c-ii-fase-f9-reconcile-single` (13 commits + 14 tests F.9 verdes, 747 passed + 6 skipped). Resta: feat 10 Enhance plugin reconcileOne + feat 11 frontend wire + feat 12 smoke real + PR + post-merge sync. **Resuelve Q7..Q9 con Yasmin ANTES de codear** (decisiones pre-código descubiertas durante sesión 1: HTTP 429 vs 409 + plugin aplica drifts vs orquestador + capability detection frontend). Patrón heredado: commits feat + bypass §6 si CI Actions billing-bloqueada (12ª aplicación previsible) + post-merge sync. Sé riguroso y profesional."*

**Notas críticas operativas para la sesión 2** (extendido §A.11.10.6.1 "Notas críticas"):

- **Prisma client regenerado** post-feat-1 — `pnpm prisma generate` ya ejecutado en sesión 1 (necesario para que `NoteCategory.reconciliation` esté disponible en TS). Si la rama se borra/recrea, re-ejecutar.
- **Pre-push hook prettier**: ya disparado 2 veces en sesión 1 (commits chore `307be35` + `2225d2e`). Recomendación para sesión 2: ejecutar `pnpm exec prettier --write` sobre los archivos editados ANTES del commit feat (no tras el push fail) para evitar el extra commit chore.
- **Constructor de `ProvisioningService` ahora tiene 10 args** (commit feat 7) — tests futuros que instancian `new ProvisionerService(...)` deben pasar 10 args. El spec actual (`provisioning.service.spec.ts`) ya está actualizado.
- **`PluginManifest` NO declara `reconcileOne` capability** — gating del CTA frontend requiere derivar la señal server-side (Q9 a resolver). NO añadir flag al manifest sin decidirlo.

### A.11.10.7. Fase F.10 — Capa base de App Management — deep-links a apps CMS instaladas

> **Pivot 2026-05-18** (handoff §A.11.10.7.1 + refinamiento §A.11.10.7.2): el plan original "deep-links curados al panel del proveedor (email/DBs/files/logs)" se redefine tras la investigación rigurosa del OAS de orchd (`docs/_research/sprint-15c/orchd-oas3-api.yaml`). Los endpoints SSO del panel ([`GET /orgs/{org}/members/{member}/sso`](../_research/sprint-15c/orchd-oas3-api.yaml#L5039) `getOrgMemberLogin` que emite el OTP + [`GET /login/sessions/sso`](../_research/sprint-15c/orchd-oas3-api.yaml#L3626) `createOtpSession` que lo consume) son **agnósticos a sección**: NO declaran `section`/`target`/`return_to`/`redirect_uri`/`next` en query params. Construir F.10 sobre comportamiento no-documentado del proveedor violaría la doctrina de robustez heredable (ADR-070 + ADR-077). En cambio, el OAS SÍ documenta endpoints contractuales para **apps CMS instaladas dentro de un website** ([`GET /orgs/{org}/websites/{w}/apps`](../_research/sprint-15c/orchd-oas3-api.yaml#L9408) `getWebsiteApps` + [`GET /apps/{appId}/wordpress/users/{userId}/sso`](../_research/sprint-15c/orchd-oas3-api.yaml#L9945) `getWordpressUserSsoUrl` documentado). F.10 se redefine como **capa base de App Management** (read-only minimal): enumerar apps instaladas + deep-link al admin de la app (WordPress SSO contractual; Joomla URL canónica `/administrator` estándar CMS desde 2005). Heredable a fases futuras F.10.x (stats UI per-app — `DC.NEW-51`) y F.10.y (install/uninstall desde dashboard — `DC.NEW-52`) sin breaking changes contractuales.

**Tema:** primera capa del módulo App Management — capability-driven por presencia, contractual y heredable. Estándar profesional (cPanel/Softaculous + Plesk/Application Vault como referentes).

- **F.10.1 — `ServiceInfo.apps?: AppPresence[]` capability-driven por presencia.** Nuevo campo opcional en `ServiceInfo` (mismo patrón A5 `recoveryHint?` / A6 `testConnection?()` / A7 `ssl?` / A8 `reconcileOne?()` — additivo, NO bumpea `contractVersion`). Shape mínimo contractual: `AppPresence = { appId: string, kind: string (libre — 'wordpress' | 'joomla' | futuros), label: string (i18n key), path?: string (subdir si aplica), version?: string, actions: readonly ServiceAction[] }`. Plugin Enhance enumera apps en `getServiceInfo()` via `getWebsiteApps(orgId, websiteId)` paralelizado con calls existentes. Capability-driven: plugins que NO soporten apps instalables OMITEN el campo; cliente+admin gating UI por presencia (ADR-070 cero `if (provisioner === 'X')`).

- **F.10.2 — Acción canónica `open_app_admin` con discriminator interno por kind.** Slug fijo declarado en `inlineActions` del plugin; payload dinámico `{ appId: string }`. `executeAction('open_app_admin', { appId })` discrimina internamente: WordPress → SSO real vía `getDefaultWpSsoUser` + `getWordpressUserSsoUrl(defaultUserId)`; Joomla → URL construida `${site_url}/administrator` desde `getJoomlaInfo`. Retorna `ActionResult.data: { url: string, kind: 'sso' | 'canonical', opensIn: 'new_tab' }`. Manejo defensivo `404 NotFound` sobre `getDefaultWpSsoUser`: el plugin omite la action para esa `AppPresence` WP (`actions: []`) → frontend renderiza el atajo **disabled con tooltip** + CTA al panel para configurar el default user. Patrón heredado de `ActionResult.data: Record<string, unknown>` ya existente — cero amendment a `ActionResult` shape.

- **F.10.3 — `<AppShortcutsCard>` SC en `_shared/services/`.** Card paralela a `<SslStatusCard>` F.7 + `<ServiceNotesCard>` F.6 + `<AdminProviderStateDesyncBanner>` F.4. Renderiza N atajos diferenciados por `appId+path` (multi-instancia: 1 atajo por instalación, label con sufijo `(/blog)` cuando `path` define subdir; mismo patrón visual heredable). Cliente + admin (`_shared/`) — el admin recibe el flujo enriquecido con audit (F.10.4) sin duplicación de componentes. Card oculta si `info.apps === undefined` o `info.apps.length === 0`. Click → server action federada `openAppAdminAction(serviceId, appId)` → recibe `{ url }` → `window.open(url, '_blank')`.

- **F.10.4 — Telemetry/audit per-app (`audit_access_log.metadata.app_id` + `.app_kind`).** Cuando admin ejecuta `open_app_admin` sobre service ajeno, el orquestador `ProvisioningService.executeAction` (o capa equivalente) añade audit enriquecido con `{ app_id, app_kind }` en `metadata` JSON del `audit_access_log`. **Cero schema change** — el `metadata Json?` existente permite tracking arbitrario coherente con `target_user_id` que ya vive como JSON path (no columna). Queryable hoy via `metadata->'app_id'` Postgres operator; GIN index si volumen lo justifica más adelante. **Heredable**: F.10.x (`get_app_stats` action plugin-internal) y F.10.y (`app.installed`/`app.uninstalled` event en `audit_change_log.changes_after`) suman `metadata.app_id` igual sin refactor.

- **F.10.5 — Mock + Enhance plugin.** `MockEnhanceServer` extendido con `state.websiteApps: Map<websiteId, WebsiteApp[]>` + 5 endpoints simulados (`GET /websites/{w}/apps`, `GET /apps/{id}/wordpress/info`, `GET /apps/{id}/wordpress/users/default`, `GET /apps/{id}/wordpress/users/{userId}/sso`, `GET /apps/{id}/joomla/info`) + `seed.websiteApps` opcional. NO auto-seed apps al `POST /websites` (las apps las instala el cliente explícitamente, no son default). Plugin Enhance: 4 métodos nuevos en `EnhanceApiClient` + `enhance.plugin.ts` enumera apps en `getServiceInfo` (try/catch fail-soft — apps NO bloquean SSL/quota/status existentes) + `executeAction('open_app_admin')` con dispatch por kind.

- **ADR amendments F.10**:
  - **ADR-077 Amendment A9** (genérico al contrato) — `ServiceInfo.apps?: AppPresence[]` + shape `AppPresence` (D1-D6 frozen §A.11.10.7.2) + action canónica `open_app_admin` + doctrina "detalles per-kind FUERA del contrato genérico" + extensibilidad futura A9.6 (actions futuras additivas + `AppPresence.status?` additivo cuando F.10.y lo requiera). NO bumpea `contractVersion` — capability-driven por presencia coherente A5/A6/A7/A8.
  - **ADR-083 Amendment A9** (Enhance specifics) — 4 endpoints orchd consumidos (`getWebsiteApps` + `getWordpressInfo` + `getDefaultWpSsoUser` + `getWordpressUserSsoUrl` + `getJoomlaInfo`) + flow WP SSO `getDefaultWpSsoUser → getWordpressUserSsoUrl(userId)` + flow Joomla URL canónica `${site_url}/administrator` (estándar CMS Joomla desde 2005 — estable a nivel del CMS, no del panel; el cliente entra con credenciales Joomla) + manejo 404 `getDefaultWpSsoUser` defensivo.

- **DoD F.10:** `AppPresence` + `ServiceInfo.apps?` contractual; plugin Enhance enumera + `open_app_admin` dispatch por kind; `<AppShortcutsCard>` SC capability-driven (cliente + admin); audit per-app via `metadata.app_id`; mock extendido con 5 endpoints + state; +N tests; `pnpm ci:check:full` verde; boot smoke; smoke real Yasmin 4 escenarios (website sin apps → card oculta; WP con default user → SSO abre `/wp-admin`; WP sin default user → disabled + tooltip + CTA panel; Joomla → `/administrator` abre nueva pestaña); PR (bypass §6 si CI Actions billing-bloqueada — **13ª aplicación previsible**); post-merge sync.

- **Valoración pre-código (resuelta en §A.11.10.7.2 R1..R6 frozen 2026-05-18)**: D1 ¿`AppPresence` en contrato genérico o solo plugin Enhance? → contrato genérico (Amendment A9 — heredable a 15D/15E/15G). D2 ¿`kind` enum cerrado o string libre? → string libre plugin-internal (mismo patrón `ServiceAction.slug`). D3 ¿detalles per-kind en `AppPresence`? → NO (`WordPressInfo`/`JoomlaInfo`/futuros viven en endpoints/actions plugin-internos invocados on-demand cuando F.10.x stats lo requiera). D4 ¿acciones per-app dónde viven? → `AppPresence.actions[]` (NO en `ServiceInfo.availableActions[]` — separación limpia escalable). D5 ¿slug compuesto o payload discriminator? → slug fijo `open_app_admin` + payload `{ appId }`. D6 ¿Joomla incluido? → SÍ (URL canónica, agnósticos al kind — doctrina "el plugin decide la URL fresh per-kind"). R6 audit per-app via `metadata.app_id` JSON path (cero schema change).

#### A.11.10.7.1. Handoff F.10 — arranque pre-código en conversación nueva (frozen 2026-05-17, **pivot 2026-05-18**)

**Propósito**: esta sección permite que una conversación nueva del agente arranque F.10 con rigor profesional leyendo SOLO este bloque + §A.11.10.7 (plan canónico arriba) + §A.11.10.7.2 (refinamiento R1..R6 frozen abajo). Patrón heredado de §A.11.10.6.1 (handoff F.9 — sirvió como modelo, a su vez heredado de §A.11.9 handoff F.3). **Versión post-pivot 2026-05-18** que actualiza el handoff original (frozen 2026-05-17) tras la investigación rigurosa del OAS de orchd y la decisión de Yasmin de redefinir F.10 como **capa base de App Management** en lugar de "deep-links al panel" (orchd NO documenta SSO con sección — ver §A.11.10.7.2 R1).

**Estado del repo al arranque** (master 2026-05-17 post PR [#83](https://github.com/yasmindanailov/dashboard/pull/83) mergeado):

- Master HEAD: PR #83 (`docs(sprint-15c-ii): post-merge sync Fase F.9`) sobre PR [#82](https://github.com/yasmindanailov/dashboard/pull/82) squash `55b3f86` (`feat(sprint-15c-ii): Fase F.9 — Reconciliación per-servicio DC.45 + cierre del cabo del CTA reconcile`); PR [#84](https://github.com/yasmindanailov/dashboard/pull/84) `f67fa0a` doc-only handoff F.10 original (pre-pivot).
- Sprint 15C.II Hardening A→F mergeada: F.1 (suspend/unsuspend) + F.2 (admin overview) + F.3 (audit timeline + cierre Fase F) + F.4 (robustez status suspensión) + F.5 (`DC.44` billing-suspend-unify) + F.6 (notas `ClientNote`) + F.7 (SSL status read-only) + F.8 (alertas de cuota disco edge-triggered) + F.9 (reconcile per-servicio `DC.45`).
- Cobertura backend master: **53 suites / 754 passed + 6 skipped** (+23 vs F.8 — 13 registry + 8 orquestador + 6 cron L3 + 1 contract + 1 admin overview de F.9).
- Frontend: `tsc --noEmit` + `eslint --max-warnings=0` + `next build` verde (32 static pages + 13 dynamic routes).
- ADRs frozen en master relevantes para F.10: [ADR-077 v2 contrato `ProvisionerPlugin`](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) con Amendments A1-A8 (último: A8 `reconcileOne?()` capability-driven F.9 + Sub-amendment A8.5 "plugin aplica drifts + orquestador maneja transversales"); [ADR-070 Dashboard puerta unificada](../10-decisions/adr-070-service-info-sso-acciones-curadas.md) con A1 (gateway curado reconcilia status read-time F.4 — clave para F.10 por la doctrina "cero `if (provisioner === 'X')` en el frontend, todo capability-driven"); [ADR-080 Plugin Framework](../10-decisions/adr-080-plugin-framework.md) con Amendments B+C; [ADR-083 Plugin Enhance specifics](../10-decisions/adr-083-plugin-enhance-cp-specifics.md) con Amendments A1-A8 (último: A8 probe SSL F.7); [ADR-082 Domain↔Hosting + DNS doctrine](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) con A1 (lifecycle administrativo vs operacional F.4); [ADR-079 ClientNote source-tracking](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) con Amendments A4 (lifecycle F.6) + A5 (reconciliation F.9).
- **Patrones heredables F.9 aplicables a F.10**: (a) **"plugin aplica drifts + orquestador maneja transversales"** Sub-amendment III A8.5 — el plugin sabe el shape específico del proveedor (qué exponer y cómo), el orquestador sabe los transversales (cache + audit + eventos + notas); (b) **capability-driven por presencia** (A6/A7/A8 — `testConnection?()` / `ServiceInfo.ssl?` / `reconcileOne?()`) sin flag declarativo en `PluginCapabilities`; (c) **sufijo `Service*` para shapes per-servicio** vs agregado sin prefijo; (d) **capability gating UI vía flag derivado** en admin overview F.2 (NO en manifest). F.10 aplica (b) directamente — `ServiceInfo.apps?: AppPresence[]` capability-driven por presencia, mismo molde A5/A6/A7/A8 — y (c) implícitamente — shape `AppPresence` es per-app (un servicio puede tener N apps).
- Diferidos vigentes en `backlog.md`: `DC.46` (`autoCancelServices`→`deprovisionAsAdmin` destructivo, candidato a fase aparte), `DC.47` (naming `notes`↔`internal_note` `DeprovisionDto` housekeeping), `DC.48` (bandwidth como F.8.x cuando se resuelva semántica reset mensual), `DC.49` (`MockEnhanceServer` seed dinámico `usedResources` per-subscriptionId — housekeeping pre-G.2 E2E spec). **Nuevos apuntados F.10 (DC.NEW-51..54)**: ver §A.11.10.7.2 R5.

**Resumen del plan F.10 post-pivot (§A.11.10.7)**: 5 piezas — F.10.1 `ServiceInfo.apps?: AppPresence[]` capability-driven (Amendment ADR-077 A9 additivo) + F.10.2 acción canónica `open_app_admin` con discriminator interno por kind (WP SSO contractual / Joomla URL canónica) + F.10.3 `<AppShortcutsCard>` SC en `_shared/services/` (cliente+admin) + F.10.4 telemetry/audit per-app via `audit_access_log.metadata.app_id` (cero schema change) + F.10.5 mock extendido con 5 endpoints + plugin Enhance con 4 métodos cliente nuevos. **NO incluye**: stats UI per-app (`DC.NEW-51` futuro F.10.x), install/uninstall desde dashboard (`DC.NEW-52` futuro F.10.y), operaciones mutación per-app (`DC.NEW-53`), modelo BD per-app (`DC.NEW-54`).

**D1..D6 — Decisiones doctrinales pre-código resueltas con Yasmin 2026-05-18** (L18 frozen — mejoras como Amendment, no desvío silencioso). Frozen en §A.11.10.7.2 abajo:

- **D1** — ¿`AppPresence` en contrato genérico `ProvisionerPlugin` (Amendment ADR-077) o solo en plugin Enhance? → **contrato genérico Amendment A9**. Razón: capability del proveedor (apps instalables), no plugin-specific; mismo patrón A5/A6/A7/A8 — heredable a 15D RC / 15E Docker / 15G Plesk si su upstream las soporta.

- **D2** — ¿`AppPresence.kind` enum cerrado o string libre? → **string libre plugin-internal**. Razón: enum cerrado fuerza amendment por cada nuevo kind (futuros nodejs/python/drupal/mediawiki); string libre con convención plugin-internal (mismo patrón `ServiceAction.slug`).

- **D3** — ¿Detalles per-kind (`WordPressInfo`/`JoomlaInfo`/futuros) en `AppPresence`? → **NO — fuera del contrato genérico**. Razón: `AppPresence` shape mínimo contractual (`appId`, `kind`, `label`, `path?`, `version?`, `actions[]`); detalles per-kind viven en endpoints/actions plugin-internos invocados on-demand cuando F.10.x stats UI lo requiera. Preserva tamaño razonable de `getServiceInfo` response + permite cache TTL independiente.

- **D4** — ¿Acciones per-app dónde viven? → **`AppPresence.actions[]` (NO en `ServiceInfo.availableActions[]`)**. Razón: `ServiceInfo.availableActions[]` son acciones del **servicio entero** (suspend/reconcile/change_package); `AppPresence.actions[]` son acciones de **una instalación específica** (open_app_admin, futuras update_version/install_plugin/uninstall). Separación limpia + escalable. Mismo shape `ServiceAction` reutilizado (incluye `adminOnly`).

- **D5** — ¿Slug compuesto (`open_app_admin:<appId>`) o slug fijo + payload discriminator? → **slug fijo `open_app_admin` + payload `{ appId }`**. Razón: contrato `ServiceAction.slug` es estable; el payload es dinámico — heredable a F.10.x/y sin diversificar slugs. `ActionResult.data: { url, kind, opensIn }` lleva la URL fresh on-demand (one-shot SSO no cacheable). `ActionResult.data: Record<string, unknown>` ya existe — cero amendment del shape.

- **D6** — ¿Joomla incluido en F.10 (URL canónica sin SSO) o diferido? → **incluido**. Razón: doctrina agnóstica al kind. WordPress emite SSO (contractual orchd `getWordpressUserSsoUrl`); Joomla emite URL canónica `${site_url}/administrator` (estándar CMS Joomla desde 2005 — estable a nivel del CMS, NO del panel; el cliente entra con credenciales Joomla — standard reseller cPanel/Plesk se comportan igual). Mismo shape `AppPresence.actions = [{ slug: 'open_app_admin', ... }]` para ambos; el plugin decide URL fresh per-kind en `executeAction`. Si orchd añade SSO Joomla mañana, el plugin lo recibe transparente — frontend NO cambia.

- **R6 (refinamiento — telemetry/audit per-app)** — ¿Schema change `audit_access_log.app_id` columna nullable o `metadata.app_id` JSON path? → **`metadata.app_id` JSON path (cero schema change)**. Razón: el `metadata Json?` existente permite tracking arbitrario coherente con `target_user_id` que ya vive como JSON path. Cero migration. Queryable hoy via `metadata->'app_id'` Postgres operator; GIN index si volumen lo justifica más adelante. Heredable a F.10.x/y sin refactor (`audit_change_log.changes_after` lleva el mismo path en eventos futuros `app.installed`/`app.uninstalled`).

**Patrón heredado de cierre F.1→F.9** (aplicable a F.10):

1. **1 rama por fase**: `sprint15c-ii-fase-f10-curated-deeplinks` (nombre preservado del handoff original pese al pivot — refleja el origen conceptual; la rama YA está creada por la sesión 2026-05-18).
2. **Commit 1 doc-only** (refinamiento pre-código §A.11.10.7.2 — frozen R1..R6 + ADR-077 A9 draft + ADR-083 A9 draft + DC.NEW-51..54 en `backlog.md`).
3. **Commits feat 2..N código** — orden canónico heredado de F.9: types backend → MockEnhanceServer + 4 métodos cliente Enhance → orquestador `executeAction` + audit per-app → frontend `<AppShortcutsCard>` SC + wire cliente+admin + i18n → tests.
4. **`pnpm ci:check:full`** verde + boot smoke + smoke real Yasmin contra `MockEnhanceServer` 4 escenarios (sin apps / WP con default user / WP sin default user / Joomla).
5. **PR** único (bypass policy §6 si CI Actions sigue billing-bloqueada — **13ª aplicación** previsible; las 3 condiciones canónicas: motivo externo + `ci:check:full` verde + sección formal en el body).
6. **Post-merge sync PR** doc-only (patrón heredado #61/#64/#66/#68/#71/#73/#76/#78/#80/#83) — flip §A.11.1 fila F.10 a ✅ con commit SHA del squash + `current.md` + `backlog.md` (DC.NEW-51..54 cierre apuntado / nuevos descubiertos en smoke) + `MEMORY.md` + `project-state.md`.

**Comandos exactos para arrancar la conversación nueva** (si la actual se rompe / time-out):

```bash
cd /c/Users/yasmi/Desktop/proyectos_tecnologiasdigital/aelium/dashboard
git checkout sprint15c-ii-fase-f10-curated-deeplinks   # YA creada
# Verificar último commit de la rama; continuar desde donde quedó (commit 1 doc-only o posteriores feat).
# Leer dossier §A.11.10.7 (plan pivot) + §A.11.10.7.1 (este handoff) + §A.11.10.7.2 (R1..R6 frozen).
# Proceder con commits feat según patrón heredado.
```

**Frase canónica de continuación** (Yasmin pega esto en chat nuevo):

> *"Lee `docs/60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md` §A.11.10.7 (plan F.10 post-pivot) + §A.11.10.7.1 (handoff) + §A.11.10.7.2 (R1..R6 frozen 2026-05-18). Fase F.9 cerrada en master (PR [#82](https://github.com/yasmindanailov/dashboard/pull/82) squash `55b3f86` + post-merge sync [#83](https://github.com/yasmindanailov/dashboard/pull/83) + handoff F.10 original [#84](https://github.com/yasmindanailov/dashboard/pull/84) `f67fa0a`). **F.10 PIVOTADA 2026-05-18 tras investigación rigurosa OAS orchd**: NO deep-links al panel (orchd no documenta SSO con sección — endpoints `getOrgMemberLogin` + `createOtpSession` son agnósticos a destino); SÍ **capa base de App Management** — `ServiceInfo.apps?: AppPresence[]` capability-driven (Amendment ADR-077 A9 + ADR-083 A9 con WordPress SSO contractual via `getWordpressUserSsoUrl` + Joomla URL canónica `/administrator`). Patrón heredado: rama `sprint15c-ii-fase-f10-curated-deeplinks` (ya creada) + commit 1 doc-only (§A.11.10.7.2 R1..R6 frozen + ADRs A9 + DC.NEW-51..54 backlog) + commits feat (types + mock + plugin + frontend + tests) + `pnpm ci:check:full` + boot smoke + smoke real 4 escenarios contra `MockEnhanceServer` + PR (bypass §6 — 13ª aplicación) + post-merge sync. Sé riguroso y profesional."*

**Notas críticas para la conversación nueva** (heredadas + nuevas):

- **OAS de orchd**: endpoints contractuales F.10 confirmados — `getWebsiteApps` ([línea 9408](../_research/sprint-15c/orchd-oas3-api.yaml#L9408)) lista apps `{ id, app: 'wordpress'|'joomla', version, path?, defaultWpUserId? }`; `getWordpressInfo` ([10280](../_research/sprint-15c/orchd-oas3-api.yaml#L10280)) snapshot per-WP; `getDefaultWpSsoUser` ([9838](../_research/sprint-15c/orchd-oas3-api.yaml#L9838)) returns 404 si no hay default; `getWordpressUserSsoUrl` ([9945](../_research/sprint-15c/orchd-oas3-api.yaml#L9945)) **SSO contractual a WP-admin**; `getJoomlaInfo` ([10255](../_research/sprint-15c/orchd-oas3-api.yaml#L10255)) snapshot Joomla. NO existe `getJoomlaUserSsoUrl` — Joomla usa URL canónica `${site_url}/administrator`.
- **`MockEnhanceServer`**: hay que extenderlo con `state.websiteApps: Map<websiteId, WebsiteApp[]>` + 5 endpoints (`GET /websites/{w}/apps`, `GET /apps/{id}/wordpress/info`, `GET /apps/{id}/wordpress/users/default`, `GET /apps/{id}/wordpress/users/{userId}/sso`, `GET /apps/{id}/joomla/info`) + `seed.websiteApps` opcional. NO auto-seed al `POST /websites` — las apps las instala el cliente explícitamente (cuando F.10.y materialice install desde dashboard, el seed automático sigue siendo no — el flow lo crea via `POST /websites/{w}/apps`).
- **2FA admin**: TODOS los admins en seed tienen 2FA habilitado (superadmin + agent_full + agent_billing). Para el smoke real F.9 funcionó el flow `login → leer código Mailpit → verify-2fa → curl al endpoint` (smoke automatizado 7/10 escenarios verificado end-to-end) — heredable a F.10 si el smoke verifica que el endpoint `executeAction` devuelve la URL correcta via curl. Para clicks visuales (verificar que el atajo abre nueva pestaña), preferir navegador.
- **Bypass §6**: protocolo en `docs/90-meta/local-ci-playbook.md` §6. Las 3 condiciones canónicas + sección formal en el PR body. **12 aplicaciones a 2026-05-17** (#57/#60/#63/#65/#67/#70/#72/#74/#75/#77/#79/#82) — F.10 sería la 13ª previsible si CI Actions sigue billing-bloqueada.
- **Backend dist desfasado**: si hay un proceso `node dist/src/main` corriendo desde antes del `nest build`, reiniciar manualmente antes del smoke (heredado F.9 — `Stop-Process` + `pnpm --dir backend start:prod` en background; verificar con `Get-NetTCPConnection -LocalPort 3001`).
- **Setup local F.9 sigue válido**: Docker containers UP (postgres :5432 + redis :6379 + mailpit :1025/:8025 + minio :9000-9001 healthy); frontend :3002 listening; mock Enhance :3099 listening. F.10 hereda este setup; reiniciar backend tras añadir los nuevos métodos cliente Enhance + extender mock.
- **L18 frozen**: cualquier mejora descubierta durante implementación que diverja del apuntado original del dossier se documenta como **Amendment** dentro de la fase (no desvío silencioso). F.9 produjo 4 Amendments doctrinales — F.10 (pre-pivot) ya produjo el más significativo del sprint: redefinición completa del alcance basada en evidencia OAS rigurosa pre-código (este pivot). Amendments adicionales descubiertos durante implementación se documentan en §A.11.10.7.3 a continuación si emergen.

#### A.11.10.7.2. Refinamiento pre-código F.10 — R1..R6 frozen (2026-05-18)

**Propósito**: cerrar las 6 decisiones doctrinales pre-código antes de los commits feat. Patrón heredado de §A.11.10.6.2 F.9 (que materializó R1..R6 frozen). Cada R* responde a una D* del handoff §A.11.10.7.1 con la justificación rigurosa final.

**R1 — Hallazgo Q1 OAS orchd (investigación 2026-05-18)**: el OAS de orchd NO documenta SSO con sección en sus endpoints SSO del panel. Verificación rigurosa:

- [`GET /orgs/{org_id}/members/{member_id}/sso`](../_research/sprint-15c/orchd-oas3-api.yaml#L5039) (`getOrgMemberLogin`) — único endpoint que emite OTP login. **Cero query params** declarados (solo path params); devuelve URL OTP genérica al user realm. NO acepta `section`/`target`/`return_to`/`redirect_uri`/`next` ni equivalente.
- [`GET /login/sessions/sso`](../_research/sprint-15c/orchd-oas3-api.yaml#L3626) (`createOtpSession`) — endpoint que consume el OTP. Único query param documentado: `otp` (UUID, required). NO acepta deep-link params.
- [`GET /orgs/{org}/websites/{w}/emails/{email}/sso`](../_research/sprint-15c/orchd-oas3-api.yaml#L8121) (`ssoToRoundcube`) — SSO específico **por buzón de email** a Roundcube (302 redirect). Es SSO a un email concreto, NO "sección email del panel".
- NO existen endpoints `/sso/databases`, `/sso/files`, `/sso/logs`, `/sso/email` (panel-level).

**Conclusión R1**: el plan original "deep-links al panel del proveedor" violaría la doctrina de robustez heredable del proyecto (ADR-070 + ADR-077 + ADR-080) — cualquier implementación construiría sobre comportamiento no-documentado del proveedor o sobre paths internos del frontend del panel (frágiles ante upgrades). **Pivot a "capa base de App Management"** con endpoints contractuales documentados (apps CMS instaladas dentro de un website). Decisión confirmada por Yasmin: incluir WordPress (SSO contractual) + Joomla (URL canónica `${site_url}/administrator`) como base robusta heredable a futuros features de stats/install dashboard.

**R2 — D1 frozen (`AppPresence` en contrato genérico)**: `ServiceInfo.apps?: AppPresence[]` se añade al contrato `ProvisionerPlugin` v2 como **Amendment A9 additivo** (NO bumpea `contractVersion` — capability-driven por presencia coherente A5/A6/A7/A8). Razón: las apps instalables son capability del proveedor (Enhance las tiene, futuros plugins SaaS pueden tenerlas); modelarlas en plugin-internal violaría heredabilidad. Shape mínimo contractual (D3 frozen): `AppPresence = { appId: string, kind: string, label: string, path?: string, version?: string, actions: readonly ServiceAction[] }`.

**R3 — D2 frozen (`kind` string libre + D3 detalles per-kind fuera)**: `AppPresence.kind: string` es **string libre plugin-internal** (mismo patrón `ServiceAction.slug`). Plugins declaran sus kinds (WordPress: `'wordpress'`; Joomla: `'joomla'`; futuros: `'nodejs'`/`'drupal'`/`'mediawiki'`/...). El frontend renderiza por kind via mapeo i18n + switch defensivo con default "Abrir aplicación". `WordPressInfo`/`JoomlaInfo`/futuros NO entran en `AppPresence` — viven en endpoints/actions plugin-internos invocados on-demand cuando F.10.x stats UI lo requiera. Doctrina ADR-077 A9.5: "el shape `AppPresence` es contractual mínimo; los detalles per-kind son plugin-internal — vivirán en endpoints `GET /admin/services/:id/apps/:appId/details` o actions `executeAction('get_app_details')` cuando el feature lo justifique".

**R4 — D4 + D5 frozen (acciones per-app + action canónica `open_app_admin`)**:

- **D4**: las acciones de una instalación viven en `AppPresence.actions[]` (NO en `ServiceInfo.availableActions[]` — esas son del servicio entero). Mismo shape `ServiceAction` reutilizado (incluye `adminOnly`). Separación limpia + escalable.
- **D5**: slug fijo `open_app_admin` + payload `{ appId: string }` (NO slug compuesto). `executeAction('open_app_admin', { appId })` discrimina internamente por kind. `ActionResult.data = { url: string, kind: 'sso' | 'canonical', opensIn: 'new_tab' }`. Heredable: F.10.x (`update_app_version`, `install_app_plugin`, `set_default_wp_sso_user`...) y F.10.y (`install_app`, `uninstall_app`) suman al `actions[]` sin diversificar el shape canónico.

**R5 — D6 frozen (Joomla incluido) + alcance/no-alcance F.10**:

- **D6 frozen**: Joomla SÍ entra en F.10. Plugin Enhance: WP → `getDefaultWpSsoUser` (404 → action omitida) + `getWordpressUserSsoUrl(defaultUserId)` → `{ url, kind: 'sso' }`. Joomla → `getJoomlaInfo(appId).site_url` + concatena `/administrator` → `{ url, kind: 'canonical' }`. Frontend trata ambos uniformemente — `window.open(url, '_blank')`.

- **Alcance estricto F.10 hoy** (lo que SÍ se implementa):
  1. `AppPresence` shape + `ServiceInfo.apps?` (Amendment ADR-077 A9).
  2. Plugin Enhance: 4 métodos cliente nuevos (`getWebsiteApps`, `getWordpressInfo`, `getDefaultWpSsoUser`, `getWordpressUserSsoUrl`, `getJoomlaInfo`) + `getServiceInfo` enumera apps via `Promise.all` + `executeAction('open_app_admin')` dispatch por kind.
  3. `MockEnhanceServer` extendido (5 endpoints + state + opt-in seed).
  4. `<AppShortcutsCard>` SC + wire cliente + admin + i18n keys ES.
  5. Audit per-app via `metadata.app_id` JSON path (cero schema change — R6).
  6. Tests: cliente API + plugin `getServiceInfo` apps + `executeAction('open_app_admin')` 4 ramas + `AppShortcutsCard` server compat + contract test invariante A9 capability-driven.

- **Backlog apuntados (NO en F.10 hoy)**:
  - **`DC.NEW-51`** — Stats UI per-app (`WordPressInfo`/`JoomlaInfo` dashboard tab con plugin_count, user_count, has_woocommerce, themes/plugins listados, version updates). Cuándo: F.10.x condicionado a demanda funcional.
  - **`DC.NEW-52`** — Install/uninstall apps desde dashboard (form-driven `POST /websites/{w}/apps` + `DELETE /apps/{id}` + audit + eventos `app.installed`/`app.uninstalled`/`app.updated` en ADR-080 §6 + ciclo de vida + `AppPresence.status?: 'installed'|'installing'|'failed'|'uninstalling'` additivo). Cuándo: F.10.y condicionado a demanda comercial.
  - **`DC.NEW-53`** — Operaciones mutación per-app (update version, install plugin, set default WP SSO user — endpoints `updateWordpressAppVersion`/`getWordpressPlugins`/`setDefaultWpSsoUser` ya existen en OAS, requieren wrappers cliente + UI). Cuándo: F.10.z post F.10.x stats UI.
  - **`DC.NEW-54`** — Modelo BD `app_observations` o columna `services.metadata.apps_seen[]` (si UI persistente requiere preferences per-app o timeline histórico de versiones detectadas). Cuándo: trigger condicional — solo si F.10.x stats UI necesita persistencia entre lecturas de `getServiceInfo`.

**R6 — Telemetry/audit per-app via `metadata.app_id` JSON path (cero schema change)**: cuando admin ejecuta `open_app_admin` (o cualquier action futura plugin-internal que opere sobre sub-recurso del service identificado por payload), el orquestador `ProvisioningService.executeAction` (o capa equivalente que maneje el flow admin) añade audit enriquecido con `{ app_id, app_kind }` en `metadata` JSON del `audit_access_log`. Justificación rigurosa:

- **Cero migration** — el `metadata Json?` ya existe en `AuditAccessLog` (Sprint 9 Fase E + ADR-017). Coherente con `target_user_id` que vive como JSON path desde su creación.
- **Queryable hoy** via `metadata->'app_id'` Postgres operator. GIN index sobre `metadata` se añade si volumen lo justifica más adelante (mismo criterio que `audit_change_log.changes_after` JSON que tampoco tiene GIN inicial).
- **Coherente con audit existente** — F.9 ya añade audit enriquecido en `reconcileServiceAsAdmin` con `changes_after.driftsApplied` JSON. F.10 hereda el patrón.
- **Heredable a F.10.y futuro**: cuando install/uninstall desde dashboard emita `app.installed`/`app.uninstalled` en `audit_change_log`, lleva `changes_after: { app_id, app_kind, path, version }` JSON. Cero refactor.
- **Doctrina ADR-077 A9.7** (nueva): "acciones que operan sobre sub-recurso del service identificado por payload (`{ appId, ... }`) deben registrar el sub-recurso en `audit_access_log.metadata.<resource_kind>_id` cuando se invocan desde admin (cliente self-service no requiere audit per ADR-017)".

**Patrón heredado de cierre F.9 (aplicado a F.10)**:

1. **Commit 1 doc-only** (este refinamiento §A.11.10.7.2 frozen + ADR-077 Amendment A9 sections + ADR-083 Amendment A9 sections + `backlog.md` DC.NEW-51..54 entries + dossier §A.11.10.7 re-redactado + handoff §A.11.10.7.1 actualizado pivot + §A.11.10.10 G.1 lista tests críticos F.10).
2. **Commits feat 2..N código** (types backend → mock + cliente Enhance + 4 métodos → orquestador `executeAction` + audit per-app → frontend `<AppShortcutsCard>` SC + wire + i18n → tests).
3. **`pnpm ci:check:full`** + boot smoke + smoke real Yasmin 4 escenarios.
4. **PR único** (bypass §6 — 13ª aplicación previsible).
5. **Post-merge sync PR doc-only** (patrón heredado).

**Notas operativas heredables descubiertas en pre-pivot 2026-05-18**:

- **OAS rigor pre-código**: la investigación canónica del OAS de un proveedor externo es **L18 frozen** — si el OAS no documenta una capability, NO se construye sobre comportamiento no-documentado. F.10 original asumía SSO con sección documentado; la verificación reveló lo contrario y forzó el pivot. **Heredable a 15D RC / 15E Docker / 15G Plesk**: cualquier fase que dependa de capability del upstream debe abrir el OAS / docs canónicas del proveedor antes de freezer el plan.
- **Pivote pre-código vs Amendment durante implementación**: cuando el pivot es **doctrinal** (cambia el contrato + UI + alcance), se materializa en un **handoff updated + refinamiento §A.x.y.z** ANTES del primer commit feat. Cuando el pivot es **táctico** (cambia un detalle de implementación sin tocar contrato), se materializa como Amendment dentro de la fase. F.10 es doctrinal → handoff actualizado + R1..R6 frozen pre-código.
- **Doctrina "el plugin decide URL fresh per-kind"**: doctrina nueva derivada de D6 — los atajos a apps NO se cachean en `getServiceInfo` (las URLs SSO son one-shot/short-TTL; las URLs canónicas son determinísticas pero el plugin construye fresh para consistencia con SSO). `AppPresence` lleva metadata estable; URLs viven en `ActionResult.data` on-demand. **Heredable**: cualquier futuro shape `XxxPresence` que use action canónica `open_xxx` sigue el mismo patrón.

### A.11.10.8. Fase F.11 — Conveniencias operativas del detalle de servicio + plugins

**Tema:** las conveniencias admin que esperarías de un panel reseller profesional, agrupadas (cada una pequeña).

- **F.11.1 — Mini-badge de salud del proveedor en `/admin/services/[id]`.** "Proveedor: operativo / degradado / caído" derivado del `CircuitBreakerRegistry.getState()` para el plugin de este servicio (etiquetado "estado en esta instancia" — el breaker es in-process) + link a `/admin/settings/plugins/[slug]` (el `<PluginOperationalOverview>` completo de F.2). Da contexto al admin cuando `getServiceInfo` devuelve `unknown`/fallback.
- **F.11.2 — Reenviar notificación al cliente.** En `/admin/services/[id]`, botón "Reenviar notificación al cliente" → modal con selector de plantilla — **whitelist** de las plantillas de service-lifecycle (`service.suspended` / `service.unsuspended` / `service.cancelled` / …), NO selector libre — → endpoint `POST /admin/services/:id/notifications/resend` con `{ template_key }` → re-renderiza la plantilla con el contexto del service y la envía + audit. Reusa el historial del módulo `notifications`.
- **F.11.3 — Cross-link a billing en la página del servicio** (cliente + admin): leyendo del módulo billing (la subscription/invoice del service), mostrar "Próxima renovación: X · €Y · [Ver factura]" (read-only en la página del servicio; el link lleva a `/dashboard/billing/[id]` o `/admin/...`). Si el service no tiene subscription/invoice asociada → no se muestra.
- **ADR amendments:** ninguno (todo composición + endpoints additivos).
- **DoD F.11:** mini-badge de salud; reenviar notificación (whitelist + audit); cross-link billing; tests; `pnpm ci:check:full` + boot; PR + post-merge sync.
- **Valoración pre-código:** (1) ¿el mini-badge solo en admin o también un indicador discreto para el cliente? — recomendado: solo admin (al cliente el banner de drift/suspendido ya le da el estado funcional). (2) ¿reenviar notificación reenvía la *última instancia enviada* o re-renderiza fresco? — re-renderiza fresco con el contexto actual.

#### A.11.10.8.1. Handoff F.11 — arranque pre-código en conversación nueva (frozen 2026-05-18)

**Propósito**: esta sección permite que una conversación nueva del agente arranque F.11 con rigor profesional leyendo SOLO este bloque + §A.11.10.8 (plan canónico arriba). Patrón heredado de §A.11.10.7.1 (handoff F.10 — pivot doctrinal exitoso), §A.11.10.6.1 (handoff F.9), §A.11.9 (handoff F.3).

**Estado del repo al arranque** (master 2026-05-18 post PR [#85](https://github.com/yasmindanailov/dashboard/pull/85) mergeado):

- Master HEAD: PR post-merge sync F.10 doc-only (este PR) sobre PR [#85](https://github.com/yasmindanailov/dashboard/pull/85) squash `f1f75d5` (`feat(sprint-15c-ii): Fase F.10 — Capa base de App Management (deep-links a apps CMS + audit per-app)`).
- Sprint 15C.II Hardening A→F.10 mergeada: F.1 (suspend/unsuspend) + F.2 (admin overview) + F.3 (audit timeline + cierre Fase F) + F.4 (robustez status suspensión) + F.5 (`DC.44` billing-suspend-unify) + F.6 (notas `ClientNote`) + F.7 (SSL status read-only) + F.8 (alertas de cuota disco edge-triggered) + F.9 (reconcile per-servicio `DC.45`) + F.10 (capa base App Management — deep-links a apps CMS instaladas WordPress SSO contractual + Joomla URL canónica + audit per-app).
- Cobertura backend master: **53 suites / 767 passed + 6 skipped** (+13 vs F.9 — 7 getServiceInfo apps + 6 executeAction open_app_admin de F.10).
- Frontend: `tsc --noEmit` + `eslint --max-warnings=0` + `next build` verde (32 static pages + dynamic routes).
- ADRs frozen en master relevantes para F.11: [ADR-077 v2 contrato `ProvisionerPlugin`](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) con Amendments A1-A9 (último: A9 `ServiceInfo.apps?` + `AppPresence` + `open_app_admin` capability-driven F.10 + A9.7 doctrina audit per-sub-recurso JSON path — heredable a futuras actions admin sobre sub-recursos identificables por payload); [ADR-070 Dashboard puerta unificada](../10-decisions/adr-070-service-info-sso-acciones-curadas.md) con A1; [ADR-080 Plugin Framework](../10-decisions/adr-080-plugin-framework.md) con Amendments B+C; [ADR-083 Plugin Enhance specifics](../10-decisions/adr-083-plugin-enhance-cp-specifics.md) con Amendments A1-A9 (último: A9 Enhance specifics apps CMS + A9.10 naming clarity I rename `kind`→`appKind`+`urlKind` + A9.11 implementación audit per-app); [ADR-082 Domain↔Hosting + DNS doctrine](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) con A1; [ADR-079 ClientNote source-tracking](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) con Amendments A4+A5.
- **Patrones heredables F.10 aplicables a F.11**: (a) **capability-driven por presencia** (mismo molde A5/A6/A7/A8/A9 — additivo sin bumpear `contractVersion`); (b) **L16 — un solo componente `_shared/` con prop `isAdmin?`** (heredado SslStatusCard F.7 + AppShortcutsCard F.10 — el badge salud F.11.1 sigue el mismo patrón); (c) **audit JSON path enriquecido en `audit_access_log.metadata`** (R6 frozen F.10 + ADR-077 A9.7 doctrina — heredable a F.11.2 reenviar notificación con `metadata.template_key`); (d) **detalles per-feature FUERA del contrato genérico cuando aplica** (F.10 A9.5 — F.11 no añade campos al contrato).
- Diferidos vigentes en `backlog.md`: `DC.46` (`autoCancelServices`→`deprovisionAsAdmin` destructivo, candidato a fase aparte), `DC.47` (naming `notes`↔`internal_note` `DeprovisionDto` housekeeping), `DC.48` (bandwidth como F.8.x cuando se resuelva semántica reset mensual), `DC.49` (`MockEnhanceServer` seed dinámico `usedResources` per-subscriptionId housekeeping pre-G.2 E2E spec), **`DC.NEW-51..54` (App Management futuros — stats UI per-app F.10.x / install-uninstall F.10.y / ops mutación F.10.z / modelo BD `app_observations` o `services.metadata.apps_seen[]` trigger condicional)**.

**Resumen del plan F.11 (§A.11.10.8)**: 3 conveniencias operativas profesionales agrupadas (cada una pequeña) — F.11.1 mini-badge de salud del proveedor en `/admin/services/[id]` derivado del `CircuitBreakerRegistry.getState()` (etiquetado "estado en esta instancia" — el breaker es in-process) + link al `<PluginOperationalOverview>` completo de F.2. F.11.2 reenviar notificación al cliente (modal con selector de plantilla **whitelist** de service-lifecycle — `service.suspended`/`service.unsuspended`/`service.cancelled`/... — NO selector libre; endpoint `POST /admin/services/:id/notifications/resend` con `{ template_key }`; re-renderiza con contexto fresco + audit; reusa el historial del módulo notifications). F.11.3 cross-link a billing en la página del servicio (cliente + admin): "Próxima renovación: X · €Y · [Ver factura]" leyendo subscription/invoice del service → link a `/dashboard/billing/[id]` o `/admin/...`; si no hay subscription/invoice → no se muestra.

**Q1..Q5 — Valoración pre-código que la conversación nueva DEBE resolver con Yasmin ANTES de codear** (L18 frozen — mejoras como Amendment, no desvío silencioso). Las 2 primeras vienen del dossier original (§A.11.10.8); las 3 siguientes son refinamientos detectados a partir de las lecciones operativas de F.10:

- **Q1** — ¿El mini-badge de salud solo en admin (`/admin/services/[id]`) o también un indicador discreto para el cliente (`/dashboard/services/[id]`)? **Recomendación dossier**: solo admin (al cliente el banner de drift/suspendido + recoveryHint ya le da el estado funcional; un indicador técnico "breaker open" filtraría detalles operacionales que el cliente no necesita ni acciona). Decidir.

- **Q2** — Reenviar notificación: ¿reenvía la *última instancia enviada* (re-encolar la fila del `notification_log` con el render original cacheado) o re-renderiza fresco con el contexto actual del service? **Recomendación dossier**: re-renderiza fresco — el contexto del service puede haber cambiado (estado, plan, dominio) y el cliente espera info actualizada; re-encolar el render histórico sería confuso. Decidir.

- **Q3 (refinamiento nuevo F.11)** — ¿`F.11.1` usa el patrón canónico `<ProviderHealthBadge>` SC L16 con prop `isAdmin` (heredado SslStatusCard F.7 + AppShortcutsCard F.10) o un componente admin-puro sin variante cliente? Si el badge sigue siendo admin-only (Q1=admin), un componente admin-puro es coherente y más simple. Si Yasmin decide indicador discreto cliente, L16 prop `isAdmin` capability-driven. Decidir tras Q1.

- **Q4 (refinamiento nuevo F.11)** — ¿`F.11.2` whitelist de plantillas se declara en el backend (constante exportada `NOTIFICATION_TEMPLATE_WHITELIST_SERVICE_LIFECYCLE`) o en el frontend (lista hardcoded en el modal)? **Recomendación**: backend (defense-in-depth — un cliente con curl al endpoint NO puede enviar plantillas arbitrarias; el frontend solo refleja la lista pero el endpoint enforce); además permite tests del enforce. Decidir.

- **Q5 (refinamiento nuevo F.11)** — Audit per-template (heredado patrón F.10 R6 + ADR-077 A9.7): cuando admin reenvía notificación al cliente, `audit_access_log` enriquecido con `metadata.template_key` + `metadata.notification_id` (del log) cuando admin actúa sobre service ajeno. Misma doctrina capability-driven JSON path cero schema change. **Recomendación**: sí — coherente con F.10 R6 + heredable a futuros features admin sobre sub-recursos. Decidir si el shape exacto del audit incluye también `metadata.rendered_subject` para trazabilidad (sin contenido del cuerpo — sensible).

**Patrón heredado de cierre F.1→F.10** (aplicable a F.11):

1. **1 rama por fase**: `sprint15c-ii-fase-f11-service-conveniences`.
2. **Commit 1 doc-only** (refinamiento pre-código §A.11.10.8.2 — frozen R1..R5 = resolución de Q1..Q5).
3. **Commits feat 2..N código** (orden canónico heredado F.10: types/schema si aplica → backend lógica + endpoint admin → frontend Server Action + componentes + i18n → tests).
4. **`pnpm ci:check:full`** verde + boot smoke + smoke real Yasmin contra `MockEnhanceServer` (cuando aplique; F.11.1 mini-badge se puede verificar sin mock — basta `CircuitBreakerRegistry` state).
5. **PR** único (bypass policy §6 si CI Actions sigue billing-bloqueada — **14ª aplicación** previsible; las 3 condiciones canónicas: motivo externo + `ci:check:full` verde + sección formal en el body).
6. **Post-merge sync PR** doc-only (patrón heredado #61/#64/#66/#68/#71/#73/#76/#78/#80/#83 + #post-F.10) — flip §A.11.1 fila F.11 a ✅ con commit SHA del squash + `current.md` + `backlog.md` (si aplica nuevo `DC.NEW-*` apuntado) + `MEMORY.md` + `project-state.md`.

**Comandos exactos para arrancar la conversación nueva**:

```bash
cd /c/Users/yasmi/Desktop/proyectos_tecnologiasdigital/aelium/dashboard
git checkout master && git pull --ff-only
git checkout -b sprint15c-ii-fase-f11-service-conveniences
# Leer dossier §A.11.10.8 (plan F.11) + §A.11.10.8.1 (este handoff).
# Resolver Q1..Q5 con Yasmin pre-código.
# Materializar §A.11.10.8.2 con R1..R5 frozen (commit 1 doc-only).
# Proceder con commits feat según patrón heredado F.1→F.10.
```

**Frase canónica de continuación** (Yasmin pega esto en chat nuevo):

> *"Lee `docs/60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md` §A.11.10.8 (plan F.11) + §A.11.10.8.1 (handoff). Fase F.10 cerrada en master (PR [#85](https://github.com/yasmindanailov/dashboard/pull/85) squash `f1f75d5` + post-merge sync). Próxima fase F.11 — conveniencias operativas (mini-badge salud + reenviar notif + cross-link billing). Resuelve Q1..Q5 de la valoración pre-código con Yasmin ANTES de codear (frozen R1..R5 en §A.11.10.8.2). Patrón heredado: rama `sprint15c-ii-fase-f11-service-conveniences` + commit 1 doc-only (refinamiento) + commits feat + tests + `pnpm ci:check:full` + boot smoke + PR (bypass §6 si CI Actions billing-bloqueada — 14ª aplicación) + post-merge sync. Sé riguroso y profesional."*

**Notas críticas para la conversación nueva** (heredadas + nuevas):

- **`CircuitBreakerRegistry.getState(slug)` ya existe** (Sprint 15A ADR-080 §5): expone `'closed'`/`'open'`/`'half_open'` per-plugin-slug. F.11.1 lo lee + mapea a "operativo/degradado/caído" (etiqueta i18n). El breaker es in-process — el badge dice "estado en esta instancia" (heredable patrón F.2 admin overview).
- **`notifications/contract.md` lista las plantillas**: F.11.2 whitelist canónica son las plantillas con `category='service'` o `event_name LIKE 'service.%'`. Verificar contra `notification-templates.ts` (seed) — las plantillas seedeadas que aplican a service-lifecycle son ~4-5. **NO** incluir plantillas `service.action_executed` (es transaccional, no reenviable manualmente con sentido) ni `service.admin_sso_impersonation` (es admin-only, NO se reenvía al cliente).
- **Audit per-template (Q5)**: si Yasmin elige sí, el patrón canónico es heredado F.10 R6 + ADR-077 A9.7 — `audit_access_log.metadata.template_key` + `.notification_id`. Cero schema change.
- **2FA admin**: TODOS los admins en seed tienen 2FA habilitado (superadmin + agent_full + agent_billing). Smoke real F.11 requiere flow `login → leer código Mailpit → verify-2fa → curl al endpoint` (heredado F.9/F.10).
- **Bypass §6**: protocolo en `docs/90-meta/local-ci-playbook.md` §6. Las 3 condiciones canónicas + sección formal en el PR body. **13 aplicaciones a 2026-05-18** (#57/#60/#63/#65/#67/#70/#72/#74/#75/#77/#79/#82/#85) — F.11 sería la 14ª previsible si CI Actions sigue billing-bloqueada.
- **Backend dist desfasado**: si hay un proceso `node dist/src/main` corriendo desde antes del `nest build`, reiniciar manualmente antes del smoke (heredado F.7/F.9/F.10).
- **Setup local F.10 sigue válido**: Docker containers UP (postgres :5432 + redis :6379 + mailpit :1025/:8025 + minio :9000-9001 healthy); frontend :3002 listening; mock Enhance :3099 listening. F.11 hereda este setup.
- **L18 frozen**: cualquier mejora descubierta durante implementación que diverja del apuntado original del dossier se documenta como **Amendment** dentro de la fase (no desvío silencioso). F.10 produjo 1 Amendment doctrinal I (naming clarity `kind`→`appKind`+`urlKind`) + 1 pivot doctrinal pre-código (App Management base vs deep-links panel). F.11 probablemente produzca 0-1 Amendments dado el alcance menor + ausencia de cambios contractuales `ProvisionerPlugin`.

#### A.11.10.8.2. Refinamiento pre-código F.11 — R1..R5 frozen (2026-05-18)

**Propósito**: cerrar las 5 decisiones doctrinales pre-código antes de los commits feat. Patrón heredado de §A.11.10.7.2 (F.10 R1..R6 frozen) y §A.11.10.6.2 (F.9 R1..R6 frozen). Cada R* responde a una Q* del handoff §A.11.10.8.1 con la justificación rigurosa final.

**R1 (resolución Q1) — Mini-badge de salud SOLO en `/admin/services/[id]`.**
- El cliente NO ve un indicador de breaker en `/dashboard/services/[id]`. La capa cliente ya tiene los señalizadores funcionales canónicos: banner de drift discriminado por rol ([UI_SPEC §4.13](../../UI_SPEC.md) — ADR-077 Amendment A5 `recoveryHint`), banner de suspensión (F.4), banner desync provider state (F.4.1), y `info.statusReason` localizado en `ServiceHeader`. Un indicador técnico tipo "breaker open" filtraría detalles operacionales (estado in-process del wrapper de plugin) que el cliente no necesita ni puede accionar — el cliente espera que Aelium se las arregle internamente con el proveedor caído.
- Razón canónica: la doctrina ADR-070 (Dashboard como puerta unificada) define que el cliente ve **estado funcional curado** (active/suspended/drift con `recoveryHint`); el admin ve **estado operativo crudo** (drift técnico + `statusReason` literal + ahora breaker state). F.11.1 mantiene esa separación.
- Consecuencia doctrinal R3 abajo: componente `<ProviderHealthBadge>` es **admin-puro** (sin prop `isAdmin`).

**R2 (resolución Q2) — Reenviar notificación re-renderiza fresco con el contexto actual del service.**
- El endpoint `POST /admin/services/:id/notifications/resend` re-construye el payload del evento desde el estado actual del `Service` (status, `domain`, `suspension_reason`, `suspended_at`, `cancellation_reason`, `cancelled_at`, etc.) y llama `NotificationsService.dispatchToUser(template_key, payload, service.user_id)`. El dispatch processor BullMQ resuelve la plantilla por `(event_type, channel, locale)` y la renderiza fresca contra el payload **actual** — exactamente como lo hace el flow nativo del listener original.
- NO se re-encola el render histórico cacheado del `notification_log` (campo `body` de la fila persistida). Razones rigurosas:
  - El contexto del service puede haber cambiado desde el envío original (estado, plan, dominio). Re-encolar el render histórico daría al cliente info desactualizada → confusión.
  - El campo `body` del `notification_log` es el render del momento — no es un cache canónico para reuso. La fuente canónica del render es **la plantilla viva** en `NotificationTemplate` (admin pudo editarla post-envío vía Sprint 9.5 templates admin).
  - Coherente con la doctrina F.4 A1 ("lifecycle administrativo vs operacional"): el reenvío es una acción admin sobre el state ACTUAL del lifecycle del service, no una re-emisión de un evento histórico.
- Audit: la fila de `audit_access_log` resultante (R5) registra el `template_key` reenviado + el `notification_id` resultante; un humano que investigue puede correlacionar el `notification_log` original (timestamp anterior) con el reenvío (timestamp nuevo) por `service_id` + `user_id` + diferencia de payload.

**R3 (resolución Q3) — Componente `<ProviderHealthBadge>` admin-puro (consecuencia natural de R1).**
- Dado R1 (badge solo en admin), el componente vive en `frontend/app/admin/services/[id]/_components/ProviderHealthBadge.tsx` (admin-only path) **sin** prop `isAdmin`. NO entra en `_shared/services/` porque no hay variante cliente.
- **Doctrina heredable nueva (Lección F.11)** — el patrón L16 ("un solo componente `_shared/` con prop `isAdmin`") aplica cuando hay UNA UI que ramifica capa cliente/admin (SslStatusCard F.7, AppShortcutsCard F.10, MetricsBar F.8). Cuando un componente es **admin-only por contrato** (no hay variante cliente y nunca la habrá per ADR-070 alcance funcional), L16 NO aplica — `_components/` admin-only directo es la ubicación canónica.
- Server Component nativo (sin hooks ni client state). Recibe `pluginSlug: string` + se hidrata leyendo `ProvisioningService.getPluginHealth(pluginSlug)` server-side desde el SC padre. NO consume el endpoint público — el SC `/admin/services/[id]/page.tsx` ya tiene server-fetch del overview F.2; F.11.1 añade un fetch específico `GET /admin/services/:id/plugin-health` (path consistente con scope: la health relevante es la del plugin **de este service**, no la del plugin abstracto).
- Etiquetado canónico: "operativo" (todos los breakers cerrados o sin breakers registrados) / "degradado" (al menos un breaker half-open, ninguno open) / "caído" (al menos un breaker open). i18n keys: `service.provider_health.operational` / `service.provider_health.degraded` / `service.provider_health.down` + `service.provider_health.tooltip_in_process` ("Estado del breaker en esta instancia del backend"). Link → `/admin/settings/plugins/[slug]` (el `<PluginOperationalOverview>` completo F.2).
- Razón doctrinal del "peor estado" agregado: el badge resume CUALQUIER problema operativo del plugin para este service. Si `executeAction` está open pero `getServiceInfo` cerrado, las acciones del admin fallarán fail-fast — el badge dice "caído" para que el admin abra el detalle F.2 y decida (esperar reset, reset manual, investigar plugin config).

**R4 (resolución Q4) — Whitelist de plantillas declarada EN EL BACKEND (defense-in-depth).**
- Constante exportada canónica: `NOTIFICATION_TEMPLATE_WHITELIST_SERVICE_LIFECYCLE` en `backend/src/modules/notifications/notification-resend.constants.ts` (módulo dedicado para que la importen tanto el service como el spec sin atravesar boundaries arbitrarios).
- **Whitelist V1 frozen (post Amendment I — ver al final §A.11.10.8.2)**: 3 plantillas — `service.suspended`, `service.unsuspended`, `service.cancelled`. **NO incluye `service.password_reset` ni `service.quota_threshold_crossed`** (ver Amendment I para razones rigurosas).
- El endpoint `POST /admin/services/:id/notifications/resend` valida vía `class-validator` (`@IsIn(NOTIFICATION_TEMPLATE_WHITELIST_SERVICE_LIFECYCLE)`); cualquier `template_key` fuera de la lista → `400 INVALID_TEMPLATE_KEY` con mensaje "Plantilla no permitida para reenvío admin". El frontend solo refleja la misma lista (hardcoded en el modal) pero **el enforce real vive en el backend**: un cliente con curl al endpoint NO puede enviar plantillas arbitrarias (ej. `task.assigned` → spam al cliente con contexto inválido, o `auth.refresh_replay_detected` → expone telemetría interna).
- Razón canónica: separación frontend ↔ backend rigurosa (defense-in-depth). El frontend es UX, no enforcement. La lista frozen R4 deriva de los listeners de service-lifecycle existentes (Fase F.1-F.8); plantillas como `service.action_executed` quedan fuera porque son transaccionales sin sentido de reenvío manual; `service.admin_sso_impersonation` queda fuera porque es admin-only (audit interno, NO se reenvía al cliente).
- Razón secundaria: tests del enforce. El spec `notification-resend.service.spec.ts` verifica el rechazo de plantillas no whitelisted con curl-style bypass (test `R4 defense-in-depth → 400 INVALID_TEMPLATE_KEY`).

**R5 (resolución Q5) — Audit per-template en `audit_access_log.metadata` (cero schema change).**
- Endpoint anotado con `@AuditAccess('Service')` (interceptor canónico Sprint 9 Fase E). El interceptor produce una fila base con `entity_type='Service'`, `entity_id=service.id`, `actor_user_id`, `action='resend_notification'`, `metadata = { ... }`. F.11.2 enriquece `metadata` con:
  ```json
  {
    "template_key": "service.suspended",
    "notification_id": "00000000-0000-0000-0000-000000000000",
    "target_user_id": "<service.user_id>"
  }
  ```
- **NO** se incluye `rendered_subject` ni `rendered_body` en `metadata`. Razón rigurosa: el contenido renderizado puede contener PII (dominio del cliente, OTP, número de factura, recovery hints técnicos). El audit log es referencial, no un mirror del contenido — la trazabilidad rigurosa se logra con `template_key` (qué se reenvió) + `notification_id` (apuntador al `notification_log` donde sí vive el contenido para investigación on-demand con `READ` ACL).
- Coherente con doctrina ADR-077 A9.7 (F.10 R6 frozen) — "acciones que operan sobre sub-recurso del service identificado por payload deben registrar el sub-recurso en `audit_access_log.metadata.<resource_kind>_id` cuando se invocan desde admin". Aquí el sub-recurso es la **notification reenviada**, identificada por `template_key` + `notification_id`. Heredable: cualquier endpoint admin futuro que actúe sobre un sub-recurso identificable del service (ej. reenviar invoice, regenerar SSL cert, rotar credencial) sigue el mismo patrón JSON path → cero schema migration.
- **Doctrina heredable ADR-077 A9.7 (extensión)**: el JSON path `audit_access_log.metadata.<key>` admite múltiples sub-recursos del mismo audit row (ej. `{ app_id, template_key, notification_id }` si el flow combinara features). Postgres `metadata->>'template_key'` queryable hoy; GIN index opcional cuando volumen lo justifique (mismo criterio F.10).

**ADR amendments consolidados de F.11**: **ninguno**.
- ADR-077 — sin cambios. F.11 NO modifica el contrato `ProvisionerPlugin`. Solo añade endpoints admin (composición sobre features existentes) + un componente frontend.
- ADR-079 — sin cambios. F.11 NO crea `ClientNote` automáticas (el reenvío de notificación es un dispatch operativo, no una transición de lifecycle ni una intención humana persistente — vive en audit, no en ClientNote).
- ADR-080 — sin cambios. F.11 NO añade evento al catálogo §6 (el reenvío usa el mismo `NotificationsService.dispatchToUser` con el `event_type` whitelisted; el listener de ese event_type NO se re-dispara → el endpoint llama directamente al dispatch).
- ADR-083 — sin cambios. F.11 NO toca plugin Enhance ni mock; el badge salud lee del registry global de breakers (cualquier plugin lo expone igual).

**Mapa de implementación derivado de R1..R5** (orden tentativo de commits feat — no exhaustivo):

1. **Constante whitelist + tipo**: `backend/src/modules/notifications/notification-resend.constants.ts` (R4).
2. **DTO**: `backend/src/modules/notifications/dto/notification-resend.dto.ts` (`ResendNotificationDto { template_key: ServiceLifecycleTemplateKey }` con `@IsIn(NOTIFICATION_TEMPLATE_WHITELIST_SERVICE_LIFECYCLE)`).
3. **NotificationsService.resendServiceLifecycleNotification(serviceId, templateKey, actorUserId)**: carga service (NotFound), guard `service.user_id` no null (sin destinatario → 400), dispatcher map `{ template_key → buildPayloadFn(service) }` que construye payload fresh per template (espejo de los listeners F.1-F.8), llama `dispatchToUser(template_key, payload, service.user_id)`, devuelve `{ ok: true, dispatched_to: user_id, template_key }` (sin `notification_id` porque dispatch es asíncrono via BullMQ — el id se conoce solo tras processor consume; opcional ampliar a `pending: true` y dejar al frontend pollear si UX lo requiere — diferir).
4. **Endpoint `POST /admin/services/:id/notifications/resend`**: en `AdminProvisioningController` (donde ya vive `POST /admin/services/:id/suspend` etc.) — `@CheckPolicies(Update Service)` + `@AuditAccess('Service')` con metadata enriquecida R5. Devuelve `{ ok: true }`.
5. **ProvisioningService.getPluginHealth(pluginSlug)**: agrega breakers in-process (`getServiceInfo` + `executeAction` heredados, `reconcileOne` si futuro plugin lo añade) → estado canónico worst-case. Devuelve `{ state: 'operational' | 'degraded' | 'down', breakers: Array<{ name, state }> }`. Reusa `CircuitBreakerRegistry.get(name)?.getState()` sin crear breakers nuevos (no llamar `getOrCreate` aquí — el badge es read-only).
6. **Endpoint `GET /admin/services/:id/plugin-health`**: deriva el `pluginSlug` del service (`service.provisioner_slug ?? product.provisioner`) + delega a `getPluginHealth`. `@CheckPolicies(Read Service)` (admin policy ya enforced por ruta `/admin/*`). NO audit per-action (es read-only no sensible — siguiendo doctrina F.2 admin overview sin `@AuditAccess`).
7. **Service `billing-cross-link.service` (alt: método en `BillingService`/`BillingInvoiceService`) `getServiceBillingCrossLink(serviceId)`**: devuelve `{ nextDueDate: ISO | null, amount: Decimal | null, currency: string, lastInvoice: { id, invoice_number, status, total, due_date, paid_at | null } | null }`. Implementación: lee `services.next_due_date / amount / currency`; lookup `Invoice` ordered by `created_at DESC` filtrado por `InvoiceItem.service_id = serviceId`. Si no hay items → `lastInvoice: null` (cliente todavía no facturado / service legacy sin invoice asociado).
8. **Endpoint `GET /services/:id/billing-cross-link`** (cliente, owner-checked) + **endpoint `GET /admin/services/:id/billing-cross-link`** (admin sin owner check). Mismo service backing — el endpoint admin saltea `service.user_id === actor.id`. Devuelven el mismo shape; el frontend ramifica el href del link según rol (`/dashboard/billing/[id]` vs `/admin/billing/[id]`).
9. **Frontend SC `<ProviderHealthBadge>`** (admin-only — R3) en `frontend/app/admin/services/[id]/_components/ProviderHealthBadge.tsx`. Hidrata desde el SC padre vía server-fetch del endpoint #6. Sin client state.
10. **Frontend `<ResendNotificationButton>` + `<ResendNotificationModal>`** (admin-only) en `frontend/app/admin/services/[id]/_components/`. Botón → modal con `<select>` de las 5 plantillas whitelisted (i18n keys `service.notifications.resend.template_label.<key>`) + textarea preview opcional (NO requiere fetch del preview en F.11 — diferible). Server Action federada que llama el endpoint #4. Toast UX 2 estados: éxito ("Notificación reenviada al cliente · plantilla X") / error ("No se pudo reenviar la notificación: <message>").
11. **Frontend `<BillingCrossLinkCard>`** (`_shared/services/` con prop `isAdmin`) — aquí SÍ L16 aplica porque ambos cliente y admin ven el cross-link. Renderiza: "Próxima renovación: <fecha localizada> · €<amount> · <link 'Ver última factura' si lastInvoice no null>". `href` derivado de `isAdmin` (admin → `/admin/billing/[id]`; cliente → `/dashboard/billing/[id]`). Si `nextDueDate === null && lastInvoice === null` → no se muestra (early-return `null` — coherente patrón SslStatusCard / AppShortcutsCard capability-driven por presencia).
12. **Wire** en `/admin/services/[id]/page.tsx` (badge + modal + cross-link) y `/dashboard/services/[id]/page.tsx` (cross-link cliente solo).
13. **i18n keys ES**: `service.provider_health.{operational,degraded,down,tooltip_in_process,link_to_overview}` + `service.notifications.resend.{button_label,modal_title,template_field_label,template_label.<5 keys>,submit,cancel,success,error}` + `service.billing_cross_link.{title,next_renewal_label,view_last_invoice}`.
14. **Tests backend**: `NotificationsService.resendServiceLifecycleNotification` (happy path con todas las 5 plantillas; fallo `INVALID_TEMPLATE_KEY` para plantilla fuera de whitelist; service NotFound; service sin `user_id` → BadRequest). `notification-resend.security.spec.ts` (enforce defense-in-depth: curl con `template_key='task.assigned'` → 400). `ProvisioningService.getPluginHealth` (agregado worst-case con combinaciones closed/half-open/open; sin breakers → operational). `BillingCrossLinkService.getServiceBillingCrossLink` (sin invoices → `null`; con invoices → última ordered by created_at desc).
15. **Smoke real Yasmin** (automatizable contra MockEnhanceServer + Mailpit): (a) admin abre `/admin/services/[id]` → badge "operativo" verde + cross-link "Próxima renovación X · €Y · Ver última factura" si existe; (b) admin pulsa "Reenviar notificación" → selecciona "service.suspended" → Mailpit recibe el email + `audit_access_log` registra `template_key='service.suspended'`; (c) curl con `template_key='task.assigned'` → 400; (d) provocar `getServiceInfo` breaker open via Enhance mock 500 5 veces → badge "caído" rojo + link al overview F.2.

**Decisiones explícitas adicionales tomadas en pre-código** (apuntadas aquí para no perder trazabilidad):

- **Reenvío de `service.password_reset` con OTP fresh**: dispatcher map en `NotificationsService.resendServiceLifecycleNotification` distingue plantillas que requieren generación de side-effect (password_reset → re-issue OTP) de las puramente notificación (suspended → solo render). Si la complejidad excede ~30 LOC de mapping, **partir el endpoint** en 2 (`POST /admin/services/:id/notifications/resend-lifecycle` para las 4 simples + `POST /admin/services/:id/password-reset/reissue` para la especial) y eliminar `service.password_reset` de la whitelist canónica. Decisión durante implementación L18.
- **Sin paginación de `notification_log` en el endpoint admin**: F.11 NO añade vista admin del historial de notificaciones reenviadas (eso es G.4 retrospectiva / nuevo apuntado backlog si demanda admin lo justifica). El cross-check rigoroso post-reenvío vive en `audit_access_log` (R5) + Mailpit en desarrollo + el `notification_log` interno que ya pueblan los canales.
- **Bypass §6 14ª aplicación previsible**: si CI GitHub Actions sigue billing-bloqueada al cerrar F.11, será la 14ª aplicación (suma sobre #57/#60/#63/#65/#67/#70/#72/#74/#75/#77/#79/#82/#85). Patrón canónico — sección formal en el PR body cumpliendo las 3 condiciones.

**Notas operativas heredables descubiertas en pre-código 2026-05-18**:

- **L16 NO es universal**: hay componentes admin-only por contrato (sin variante cliente y sin posibilidad funcional de tenerla per ADR-070) donde L16 ("`_shared/` con prop `isAdmin`") fuerza acoplamiento artificial. F.11.1 `<ProviderHealthBadge>` es admin-only puro → vive en `_components/` admin-only. F.11.3 `<BillingCrossLinkCard>` SÍ tiene variante cliente → vive en `_shared/` con `isAdmin`. La decisión es **por feature**, no por convención ciega.
- **Audit `metadata.<key>` JSON path es el patrón canónico** para sub-recursos identificables sin schema change (ADR-077 A9.7 frozen en F.10 R6, extendido en F.11 R5 a "múltiples sub-recursos en el mismo audit row"). Heredable a 15D RC / 15E Docker / 15G Plesk.
- **Defense-in-depth en endpoints admin**: enforcement de whitelist/policies SIEMPRE en backend, NUNCA solo en frontend. Coherente con doctrina general (R5 ADR-078 cookies httpOnly, ADR-017 audit per-access, ADR-080 framework de plugins).
- **Reenvío de notificación NO crea ClientNote**: ClientNote captura intención humana persistente del lifecycle (ADR-079 — F.6 frozen). Reenviar una notificación es operativo/audit (ya existente lifecycle, sin nueva intención humana). El audit log canónico (R5) es la fuente de verdad. Heredable: cualquier feature admin tipo "re-dispatch operativo" sigue el patrón audit-only.

**Amendment I 2026-05-18 — whitelist V1 con 3 plantillas en vez de 5 (descubierto durante implementación)**

Durante la implementación del `NotificationResendService` (commit feat F.11.2 [`94ecca0`](https://github.com/yasmindanailov/dashboard/commit/94ecca0)) se descubrió que las 2 plantillas adicionales del R4 original (5 plantillas) requieren tratamiento especial que excedería el scope F.11. L18 frozen — mejora descubierta = Amendment, no desvío silencioso.

**Whitelist V1 frozen (3 plantillas)** que reemplaza el R4 original:
```ts
export const NOTIFICATION_TEMPLATE_WHITELIST_SERVICE_LIFECYCLE = [
  'service.suspended',
  'service.unsuspended',
  'service.cancelled',
] as const;
```

**Plantillas EXCLUIDAS de V1 con razones rigurosas**:

- **`service.password_reset` excluida** — esta plantilla cabalga sobre un flow propio con generación de OTP fresh (Sprint 15C.II Fase D). El admin que quiera "ayudar al cliente que perdió el email original" debe disparar la **action `reset_account_password`** sobre el servicio (que ya regenera OTP fresh end-to-end). Re-renderizar la plantilla con OTP histórico expirado degradaría UX ("código no válido"). Coherente con doctrina F.4 A1 (lifecycle administrativo vs operacional).

- **`service.quota_threshold_crossed` excluida** — el payload canónico requiere snapshot in-flight de `used_pct` / `used_mb` / `total_mb` del proveedor que NO deriva del Service entity (vive en la lectura `getServiceInfo.metrics` cacheada o en la última fila `ServiceQuotaAlert`, ambas con TTL distintos al evento original). Reenviar con datos desactualizados ("87% lleno" cuando ahora está al 92%) confundiría al cliente. Apuntado como sub-feature futura **DC.NEW-55**: reusar el último `ServiceQuotaAlert(kind='crossed_up')` como snapshot persistido + dispatcher per template, sin tocar el contrato whitelist.

**Apuntado al backlog DC.NEW-55** durante post-merge sync (housekeeping post-15C.II): Quota threshold reenvío con snapshot persistido (extiende whitelist V1).

**Heredabilidad de la doctrina**: L18 frozen — la whitelist V1 frozen está pensada para escalar additivamente. Cualquier plantilla de service-lifecycle nueva que cumpla "payload deriva trivialmente del Service entity" puede sumar a la constante sin tocar la lógica del dispatcher. Plantillas con side-effects (OTP, snapshots) requieren handling especial y NO se añaden directamente.

**Amendment II 2026-05-19 — P1 rate limiting (frozen post-PR original, pre-merge)**

Durante el self-review profesional posterior al PR #90 original, se detectó un **gap real de seguridad**: el endpoint `POST /admin/services/:id/notifications/resend` permitía spam vector — un admin con curl/script podía disparar N reenvíos al cliente sin protección server-side. L18 frozen — mejora descubierta = Amendment, no desvío silencioso.

**Cooldown server-side per `(actor_user_id, service_id, template_key)` — TTL 60s frozen**:

- **Granularidad doctrinal canónica**: la 3-tupla `(actor, service, template)` protege al cliente del spam burst sin frustrar coordinación legítima (otros admins pueden reenviar otra plantilla; el mismo admin no puede repetir la misma plantilla al mismo cliente en <60s).
- **TTL 60s**: corto para no frustrar al admin legítimo que se equivoca y reintenta tras un rato, pero suficiente para bloquear doble-click accidental y scripts de spam. Más restrictivo que F.9 reconcile (30s) porque reenviar es side-effect sobre el cliente (mailbox + campana), mientras `reconcileOne` es read-mostly.
- **Implementación canónica heredada de F.3 B.1 + F.9**:
  - `ProvisioningCacheService.tryAcquireResendNotificationCooldown(actor, service, template, ttl)` — `SET NX EX` Redis.
  - `ProvisioningCacheService.getResendNotificationCooldownRemainingSeconds(actor, service, template, fallback)` — `TTL` Redis para componer `Retry-After` exacto.
  - **Fail-OPEN si Redis cae** (devuelve `true`/`fallback`): coherente con `getInfoForUser` cooldown — el endpoint NO debe depender de Redis para responder.
- **Defense-in-depth orden de checks**:
  1. `INVALID_TEMPLATE_KEY` (DTO `@IsIn` → 400) **antes** del cooldown — plantilla inválida NO debe consumir cuota de rate limit (sería vector para mapear comportamiento del backend desde fuera).
  2. `NotFoundException` del service (Prisma) **antes** del cooldown — service inexistente tampoco debe consumir cuota (timing attack para mapear servicios).
  3. Cooldown check (R7 fail-OPEN).
  4. Dispatch + audit.
- **HTTP 429 RESEND_TOO_FREQUENT** con header `Retry-After: <segundos>` (estándar HTTP) — clientes CLI/automation lo leen automáticamente sin parsear body. Mismo patrón canónico que F.9 `RECONCILE_IN_PROGRESS`.
- **Frontend UX accionable**: Server Action captura `429` y devuelve shape estructurado `{ rateLimited: true, retryAfterSeconds }`. El modal muestra toast "Esta misma plantilla se reenvió hace pocos segundos. Reintenta en N s." — UX accionable vs error genérico.

**+5 tests Amendment II** (en `notification-resend.service.spec.ts`):
- Cooldown libre → cache.tryAcquire llamado con args canónicos (actor, service, template, ttl) + dispatch + audit.
- Cooldown activo → 429 RESEND_TOO_FREQUENT con shape canónico (code + retry_after_seconds) + NO dispatch + NO audit.
- Granularidad per (actor, service, template) — 3 combinaciones distintas adquieren ventanas separadas.
- Cooldown chequeado DESPUÉS del NotFound (defense — no consume cuota si service no existe).
- Cooldown chequeado DESPUÉS del INVALID_TEMPLATE_KEY (defense — no consume cuota si template inválido).

**Cobertura post-Amendment II**: 55 suites · 798 passed + 6 skipped (vs 793/6 pre-Amendment).

**ADR amendments**: ninguno (el rate limit es uso del framework canónico ProvisioningCacheService — no toca contratos).

**Heredable a 15D RC / 15E Docker / 15G Plesk**: cualquier endpoint admin futuro que dispare side-effects al cliente (reenviar invoice, regenerar credencial, etc.) sigue el mismo patrón:
1. Constante `<FEATURE>_COOLDOWN_SECONDS` exportada del service.
2. Cooldown per `(actor, target_resource, action_dimension)` via Redis `SET NX EX`.
3. 429 + `Retry-After` header en el controller.
4. Frontend captura 429 y muestra toast con cuenta atrás.

### A.11.10.9. Fase F.12 — Layout canónico (página de servicio + páginas de plugins)

**Tema:** componer `/services/[id]` (admin + cliente), la lista de plugins (`/admin/settings/plugins`) y el detalle de plugin (`/admin/settings/plugins/[slug]`) en un layout canónico documentado en `UI_SPEC.md` — última fase de features, refactoriza la composición de todo lo que F.4-F.11 fueron añadiendo. **Fase con freeze gate.**

- **F.12.1 — Diseño (doc-first, iterativo).** Secciones nuevas en `UI_SPEC.md`: "§N — Layout canónico de `/services/[id]`" (admin + cliente, discriminado por rol per §4.13), "§N+1 — Layout de la lista de plugins (`/admin/settings/plugins`)", "§N+2 — Layout del detalle de plugin (`/admin/settings/plugins/[slug]`)". Cada una: jerarquía de componentes (árbol/wireframe), orden y prioridad de secciones, comportamiento responsive, qué es admin-only vs visible-cliente, estados empty/error/loading, y cómo compone con los patrones existentes (§4.2 Modal, §4.3 Toast/AlertBanner, §4.13 drift por rol, principios §1.2 — P4 "acción no contemplación", voz Aelium…). Con **wireframes ASCII** para iterar visualmente. **Freeze gate**: el agente IA produce una v1 sólida; Yasmin itera; se congela; hasta el freeze NO se toca código de refactor.
- **F.12.2 — Implementación (post-freeze).** Refactor de las 3 familias de páginas a la composición congelada — **pura composición, cero cambio de comportamiento**. Reutiliza los componentes DS y las cards `_shared/` que ya existen; componentes nuevos solo donde haya un hueco real (p.ej. un `<PageSectionGroup>` para el cromo consistente de secciones). El layout congelado deja **slots con nombre** que recibieron/recibirán: banner de suspensión (F.4), card SSL (F.7), aviso de cuota (F.8), CTA reconcile (F.9), atajos al panel (F.10), mini-badge salud + cross-link billing (F.11), notas inline (F.6).
- **ADR amendments:** ninguno (es UI_SPEC, no ADR). Las nuevas secciones de `UI_SPEC.md` son el deliverable.
- **DoD F.12:** secciones de layout en `UI_SPEC.md` (con wireframes) **congeladas**; las 3 familias de páginas refactorizadas a la composición canónica (sin regresión funcional — los E2E existentes siguen verdes); `pnpm ci:check:full` + boot; PR + post-merge sync.
- **Valoración pre-código:** la "valoración" aquí es el propio ciclo de iteración del diseño (v1 → feedback Yasmin → freeze). Cuestión doctrinal previa: ¿algún componente nuevo necesario (p.ej. `<PageSectionGroup>`) merece un §N en `UI_SPEC.md` como componente DS, o vive en `_shared/`? — decidir al congelar el diseño.

#### A.11.10.9.1. Handoff F.12 — arranque pre-código en conversación nueva (frozen 2026-05-19)

**Propósito**: esta sección permite que una conversación nueva del agente arranque F.12 con rigor profesional leyendo SOLO este bloque + §A.11.10.9 (plan canónico arriba). Patrón heredado de §A.11.10.8.1 (handoff F.11), §A.11.10.7.1 (handoff F.10 — pivot doctrinal exitoso), §A.11.10.6.1 (handoff F.9), §A.11.9 (handoff F.3). **F.12 es la ÚLTIMA fase de features del Sprint 15C.II — fase con freeze gate (diseño doc-first → iteración con Yasmin → freeze → implementación pura composición). Tras F.12 → Fase G cierre Sprint.**

**Estado del repo al arranque** (master 2026-05-19 post PR [#91](https://github.com/yasmindanailov/dashboard/pull/91) mergeado):

- Master HEAD: PR [#91](https://github.com/yasmindanailov/dashboard/pull/91) `7c745a4` (`docs(sprint-15c-ii): post-merge sync Fase F.11`) sobre PR [#90](https://github.com/yasmindanailov/dashboard/pull/90) squash [`b4b2941`](https://github.com/yasmindanailov/dashboard/commit/b4b2941) (`feat(sprint-15c-ii): Fase F.11 — Conveniencias operativas`).
- Sprint 15C.II Hardening A→F.11 mergeada: F.1 (suspend/unsuspend) + F.2 (admin overview) + F.3 (audit timeline + cierre Fase F) + F.4 (robustez status suspensión) + F.5 (`DC.44` billing-suspend-unify) + F.6 (notas `ClientNote`) + F.7 (SSL status read-only) + F.8 (alertas de cuota disco edge-triggered) + F.9 (reconcile per-servicio `DC.45`) + F.10 (capa base App Management — deep-links a apps CMS instaladas WordPress SSO contractual + Joomla URL canónica + audit per-app) + F.11 (conveniencias operativas — mini-badge salud + reenviar notificación + cross-link billing + Amendment II P1 rate limiting + hot-fix DI clash leaf module).
- Cobertura backend master: **55 suites / 798 passed + 6 skipped** (+44 vs F.10 master 767+5 — 30 tests netos F.11 + 14 ajustes specs existentes: 5 `derivePluginHealth` + 15 `notification-resend.service` con 5 Amendment II rate limiting + 6 `billing-invoice.service.cross-link` + 4 `getPluginHealthForService`).
- Frontend: `tsc --noEmit` + `eslint --max-warnings=0` + `next build` verde (32 static pages + dynamic routes).
- ADRs frozen en master relevantes para F.12 (ninguno se toca — F.12 es UI_SPEC, no ADR; cotejar antes de codear refactor): [ADR-077 v2 contrato `ProvisionerPlugin`](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) con Amendments A1-A9 (último: A9 `ServiceInfo.apps?` + capability-driven coherente A5/A6/A7/A8 + A9.7 doctrina audit JSON path multi-sub-recurso extendida F.11 R5); [ADR-070 Dashboard puerta unificada](../10-decisions/adr-070-service-info-sso-acciones-curadas.md) con A1 — **clave para F.12** porque la separación admin (estado operativo crudo) vs cliente (estado funcional curado) determina el layout discriminado por rol §4.13; [ADR-080 Plugin Framework](../10-decisions/adr-080-plugin-framework.md) con Amendments B+C; [ADR-083 Plugin Enhance specifics](../10-decisions/adr-083-plugin-enhance-cp-specifics.md) con Amendments A1-A9; [ADR-082 Domain↔Hosting + DNS doctrine](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) con A1; [ADR-079 ClientNote source-tracking](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) con Amendments A4+A5.
- **Patrones heredables F.11 aplicables a F.12** (anotados inline §A.11.10.8.2): (a) **L16 NO universal** — admin-only puro va en `_components/` admin-only, NO en `_shared/` con prop `isAdmin`. La decisión es **funcional por feature**: F.12 debe respetar esto al congelar wireframes — banner drift admin-only vs banner suspensión cliente+admin son ejemplos canónicos. (b) **Audit metadata JSON path multi-sub-recurso** (extensión ADR-077 A9.7) — F.12 NO añade endpoints (solo refactor composición), pero hereda el patrón si algún componente de wireframe sugiere nueva acción admin. (c) **DI runtime detection via boot smoke OBLIGATORIO** — `ci:check:full` NO atrapa DI graph runtime de NestJS. F.12 es frontend-only (refactor composición), bajo riesgo de DI clash, pero CUALQUIER componente nuevo que requiera service backend obliga a boot smoke pre-merge. (d) **Async handlers canonical pattern** — `async function handle()` + `<Button onClick={() => { void handle(); }} />`; NO usar `startTransition(async)`. F.12 refactoriza cards existentes (que ya tienen este patrón); cualquier handler nuevo lo hereda. (e) **Slug payload no-trivial → INTERNAL_HELPER_SLUGS** — `<ActionsBar>` blacklist canónica. F.12 no toca `<ActionsBar>` pero conserva el patrón en el wireframe.
- Diferidos vigentes en `backlog.md`: `DC.46` (`autoCancelServices`→`deprovisionAsAdmin` destructivo, candidato a fase aparte), `DC.47` (naming `notes`↔`internal_note` `DeprovisionDto` housekeeping), `DC.48` (bandwidth como F.8.x cuando se resuelva semántica reset mensual), `DC.49` (`MockEnhanceServer` seed dinámico `usedResources` per-subscriptionId — housekeeping pre-G.2 E2E spec), `DC.NEW-51..54` (App Management futuros — stats UI / install-uninstall / ops mutación / modelo BD), **`DC.NEW-55..58`** (F.11 housekeeping — whitelist V2 quota threshold reenvío / supertest E2E endpoint resend / Idempotency-Key Stripe-style / reconcile enhance_customers cross-user state). Ninguno bloquea F.12 (todos son housekeeping post-15C.II o triggers condicionales). F.12 NO los aborda.

**Resumen del plan F.12 (§A.11.10.9)**: 2 sub-fases con freeze gate doctrinal entre ellas. **F.12.1 — Diseño (doc-first, iterativo)**: 3 secciones nuevas en `UI_SPEC.md` (1946 líneas actuales, estructura §1..§4 patrones de interacción + §5 especificación por página existente): "§N — Layout canónico de `/services/[id]`" admin+cliente discriminado por rol §4.13, "§N+1 — Layout de la lista de plugins (`/admin/settings/plugins`)", "§N+2 — Layout del detalle de plugin (`/admin/settings/plugins/[slug]`)". Cada una con jerarquía de componentes (árbol/wireframe ASCII), orden y prioridad de secciones (priorizar por riesgo: terminal > drift > suspended > activo), comportamiento responsive, qué es admin-only vs visible-cliente, estados empty/error/loading, y cómo compone con los patrones existentes (§4.2 Modal, §4.3 Toast/AlertBanner, §4.13 drift por rol, principios §1.2 — P4 "acción no contemplación", voz Aelium). **F.12.2 — Implementación (post-freeze)**: refactor de las 3 familias de páginas a la composición congelada — **pura composición, cero cambio de comportamiento**. Reutiliza DS + cards `_shared/` que ya existen; componentes nuevos solo donde haya hueco real (p.ej. `<PageSectionGroup>` para cromo consistente de secciones). El layout congelado deja **slots con nombre** que reciben: banner de suspensión (F.4), card SSL (F.7), aviso de cuota (F.8), CTA reconcile (F.9), atajos al panel (F.10), mini-badge salud + ResendNotificationCard + cross-link billing (F.11), notas inline (F.6).

**Q1..Q5 — Valoración pre-código que la conversación nueva DEBE resolver con Yasmin ANTES de codear** (L18 frozen — mejoras como Amendment, no desvío silencioso). Patrón heredado §A.11.10.8.2 Q1..Q5 (F.11), §A.11.10.7.2 D1..D6 (F.10). Las 5 cubren las decisiones doctrinales clave que F.12 debe congelar antes de iterar wireframes:

- **Q1** — ¿Algún componente nuevo necesario (p.ej. `<PageSectionGroup>` para cromo consistente entre secciones del service detail; `<DriftBannerStack>` para apilar banners con prioridad; `<AdminOnlyGuard>` SC para sections admin-only) merece un §N en `UI_SPEC.md` como componente DS canónico, o vive en `_shared/` por scope reducido? **Recomendación dossier**: componentes nuevos de propósito **general** (`<PageSectionGroup>` reutilizable a cualquier detail page del proyecto) van como §N en UI_SPEC + ubicación `components/ui/`; componentes específicos a `/services/[id]` (`<DriftBannerStack>`) viven en `_shared/services/` con doc inline. Yasmin decide caso a caso al congelar el diseño. Trigger: cada componente nuevo introduce overhead doctrinal — minimizar invenciones, maximizar composición de cards existentes.

- **Q2** — ¿`/admin/services/[id]` y `/dashboard/services/[id]` comparten layout **único discriminado por rol** (patrón canónico §4.13 con `isAdmin` prop pasado al `<PageLayout>`), o son **layouts gemelos parcialmente divergentes** (2 archivos `page.tsx` con composición distinta y secciones específicas por rol)? **Recomendación dossier**: layout único discriminado por rol (heredado §4.13 frozen + ADR-070 separación admin/cliente como capability del layout, no como duplicación). Razón: hoy ya hay duplicación parcial (cliente + admin tienen `page.tsx` distintos pero comparten ~70% via `_shared/`). F.12 puede consolidar a 1 `<ServiceDetailLayout>` SC con prop `isAdmin` que renderiza slots condicionales. Trade-off: componente padre con N condicionales `{isAdmin && ...}` vs 2 archivos `page.tsx` divergentes. Decidir con wireframes ASCII para visualizar el N de divergencias.

- **Q3** — ¿Cómo gestionar el **orden de secciones** (priorizar por riesgo decreciente: terminal cancelled → drift → suspended → suspended con desync → activo OK + apps + SSL + quota + notas + billing cross-link + audit) sin convertir el componente padre en mega-switch frágil de 200 LOC con todas las condiciones de visibilidad cableadas? **Recomendación dossier**: **router de secciones declarativo** — array de `{ id, shouldRender: (state) => bool, priority: number, component: ComponentType<Props> }` en un archivo `service-detail-sections.tsx` + el componente padre solo itera ordenando por priority y filtrando por shouldRender. Cada sección encapsula su lógica de render. Heredable: cuando una fase nueva (post-15C.II) añada un slot, simplemente registra el descriptor. Coste: 1 archivo nuevo + ~50 LOC de infraestructura. ROI alto: el padre actual ya tiene ~15 condiciones cableadas, mega-switch frágil heredado en cada fase. Yasmin decide si el ROI justifica el refactor o si "pura composición sin infra nueva" es preferible para F.12.

- **Q4** — ¿Los **wireframes ASCII** van **inline** en cada §N de `UI_SPEC.md` (formato compacto multi-página) o en **sub-archivos dedicados** `docs/40-design/wireframes-f12-services.md` linkados desde UI_SPEC.md? **Recomendación dossier**: inline (mismo patrón que §2.3..§2.7 que tienen ASCII inline). Razón: UI_SPEC.md ya integra patrones + wireframes en cada sección; partir a sub-archivos rompe la cohesión del documento maestro. Acepta longitud razonable (UI_SPEC.md crece de 1946 → ~2200 líneas estimadas). Trade-off: si los wireframes son MUY densos (>50 líneas cada uno × 3 secciones = +150 líneas solo en wireframes) sub-archivos pueden ser razonables. Decidir tras la v1 del primer wireframe.

- **Q5** — ¿F.12.2 implementación post-freeze es **monolítica** (1 PR con refactor de las 3 familias de páginas) o **partida en sub-PRs** (1 por familia: F.12.2.a `/services/[id]`, F.12.2.b lista plugins, F.12.2.c detalle plugin)? **Recomendación dossier**: **monolítica** porque la composición canónica debe ser coherente entre las 3 familias (el `<PageSectionGroup>` y los componentes nuevos se usan en todas). Partir aumenta riesgo de incoherencia entre PRs. Coste: PR más grande (1500-2000 LOC estimadas) pero refactor sin cambio funcional → review más fácil que features. Si el coste de review es alto, sub-PRs por familia son aceptables siempre con commits ordenados (refactor de componentes base primero, luego páginas que los consumen). Yasmin decide al congelar el diseño con la magnitud real del refactor.

**ADR amendments esperados F.12**: **ninguno** — F.12 es UI_SPEC + refactor de composición frontend, no toca contratos ProvisionerPlugin/ClientNote/Framework. Las nuevas secciones de `UI_SPEC.md` son el deliverable doctrinal. Si durante implementación se descubre que el refactor requiere un componente nuevo del DS, va a `docs/DESIGN_SYSTEM.md` (no ADR).

**Patrón heredado de cierre F.1→F.11 aplicable a F.12** (con la peculiaridad del **freeze gate**):

1. **1 rama por fase**: `sprint15c-ii-fase-f12-canonical-layout`.
2. **Sub-fase F.12.1 — Diseño doc-first**: rama dedicada. Commit 1 doc-only: §A.11.10.9.2 refinamiento R1..R5 frozen pre-código (resolución Q1..Q5 con Yasmin). Commit 2 doc-only: v1 de las 3 secciones nuevas en `UI_SPEC.md` con wireframes ASCII. Iterar con Yasmin (commits incrementales `docs(sprint-15c-ii): F.12.1 wireframe iteración N`). **FREEZE gate** explícito (commit `docs(sprint-15c-ii): F.12.1 — wireframes FREEZE 2026-XX-XX (Yasmin)`).
3. **Sub-fase F.12.2 — Implementación post-FREEZE**: commits feat 2..N código (orden canónico: componentes base nuevos `<PageSectionGroup>` etc. → router de secciones declarativo si Q3 lo elige → refactor `/services/[id]` cliente + admin → refactor `/admin/settings/plugins` lista → refactor `/admin/settings/plugins/[slug]` detalle → ajuste tests existentes). **Cero cambio funcional** — E2E suite Playwright si existe debe pasar sin cambios; tests unit ajustados si imports cambian de location.
4. **`pnpm ci:check:full`** verde + boot smoke (frontend-heavy, riesgo bajo de DI clash pero verificar tras refactor que `/services/[id]` renderiza sin errores) + smoke real Yasmin contra `MockEnhanceServer` 4-5 escenarios (cliente activo / cliente suspended / admin con drift / admin terminal cancelled / admin con apps).
5. **PR único** F.12 (incluye ambas sub-fases) o **2 PRs** (F.12.1 freeze + F.12.2 refactor) — decisión al congelar (Q5). Patrón heredado bypass §6 si CI Actions sigue billing-bloqueada — **15ª aplicación** previsible.
6. **Post-merge sync PR** doc-only (patrón heredado #61/#64/#66/#68/#71/#73/#76/#78/#80/#83/#86/#91) — flip §A.11.1 fila F.12 a ✅ con commit SHA del squash + `current.md` + `backlog.md` (si aplica nuevo `DC.NEW-*` apuntado en smoke) + `MEMORY.md` + `project-state.md`.

**Tras F.12 mergeada → arranca Fase G cierre Sprint 15C.II** (§A.11.10.10): G.1 tests críticos faltantes 8 áreas audit Fase A + G.2 E2E spec extension Fases E + F.1-F.12 + G.3 smoke real Yasmin cierre + G.4 retrospectiva (L19+L20+L21 lecciones operativas heredables: L19 frozen tras F.6 candidata transiciones lifecycle + ClientNote misma tx; L20 candidata F.11 doctrina L16 NO universal + DI runtime detection boot smoke + async handlers canonical pattern; L21 candidata F.10 OAS rigor pre-código + pivot doctrinal vs Amendment durante implementación) + mover dossier completo a `completed/sprint-15c-ii-hardening-enhance.md` con header retrospectiva preservando dossier original como anexo trazabilidad (patrón canónico Sprint 15C — ver `completed/sprint-15c-plugin-enhance-cp.md`) + G.5 doc-sync de cierre (`current.md` Sprint 15C.II ✅ CERRADO + `backlog.md` cierre/avance DC.NEW-55..58 + `MEMORY.md`/`project-state.md` con **Sprint 15D RC DESBLOQUEADO** — cola P2.4 activa). DoD del sprint: todos los DoD de fase (A→F.12) ✓ + `ci:check:full` + `ci:e2e` verdes + smoke real OK + retrospectiva escrita + dossier en `completed/` + Sprint 15D RC desbloqueado.

**Comandos exactos para arrancar la conversación nueva**:

```bash
cd /c/Users/yasmi/Desktop/proyectos_tecnologiasdigital/aelium/dashboard
git checkout master && git pull --ff-only
git checkout -b sprint15c-ii-fase-f12-canonical-layout
# Leer dossier §A.11.10.9 (plan F.12) + §A.11.10.9.1 (este handoff).
# Resolver Q1..Q5 con Yasmin pre-código (L18 frozen).
# Materializar §A.11.10.9.2 con R1..R5 frozen (commit 1 doc-only).
# Sub-fase F.12.1: producir wireframes ASCII en UI_SPEC.md → iterar → FREEZE.
# Sub-fase F.12.2 post-FREEZE: refactor de composición pura.
```

**Frase canónica de continuación** (Yasmin pega esto en chat nuevo):

> *"Lee `docs/60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md` §A.11.10.9 (plan F.12 — layout canónico, ÚLTIMA fase de features, freeze gate) + §A.11.10.9.1 (handoff F.12). Fase F.11 cerrada en master (PR [#90](https://github.com/yasmindanailov/dashboard/pull/90) squash [`b4b2941`](https://github.com/yasmindanailov/dashboard/commit/b4b2941) + post-merge sync [#91](https://github.com/yasmindanailov/dashboard/pull/91) `7c745a4`). Próxima fase F.12 — layout canónico con freeze gate (diseño doc-first iterativo en UI_SPEC.md con wireframes ASCII → iteración con Yasmin → FREEZE → implementación pura composición; refactoriza la composición de F.4-F.11). Resuelve Q1..Q5 de la valoración pre-código con Yasmin ANTES de codear (frozen R1..R5 en §A.11.10.9.2). Patrón heredado: rama `sprint15c-ii-fase-f12-canonical-layout` + commit 1 doc-only (refinamiento R1..R5) + commits doc-only iterativos wireframes → commit FREEZE explícito → commits feat refactor post-FREEZE + tests + `pnpm ci:check:full` + boot smoke + PR (bypass §6 si CI Actions billing-bloqueada — **15ª aplicación**) + post-merge sync. **NO se toca código de refactor hasta que el layout esté CONGELADO**. ADR amendments esperados: ninguno (UI_SPEC.md es el deliverable, no ADR). Sé riguroso y profesional."*

**Notas críticas para la conversación nueva** (heredadas + nuevas):

- **`UI_SPEC.md` actual** (1946 líneas) ya tiene §1..§4 estructura general + §5 especificación por página. F.12 añade 3 nuevas secciones al §5 (probablemente §5.13/§5.14/§5.15 o renumera si conflicta). Cotejar antes de codear los números exactos. Las secciones nuevas siguen el patrón canónico de §2.3..§2.7 (Anatomía: Overview/List/Detail/Form/Workspace) — jerarquía de componentes + wireframe ASCII + estados.
- **Freeze gate doctrina**: el cierre F.10 introdujo el patrón "doc-first pivot pre-código" (§A.11.10.7.2 R1 OAS rigor); F.12 lo formaliza como **freeze gate explícito** — no se toca código de refactor hasta que el layout esté congelado con Yasmin. Heredable a futuras fases de redesign UI/UX (Sprint 12 Settings+KB, Sprint 13 Hardening UI, etc.).
- **2FA admin**: TODOS los admins en seed tienen 2FA habilitado (superadmin + agent_full + agent_billing + agent_support). Smoke real F.12 con login admin requiere flow `login → leer código Mailpit → verify-2fa → navegar UI` (heredado F.4..F.11). Si auto-classifier deniega leer Mailpit 2FA codes en agente, smoke con auth admin queda diferido a Yasmin manual (mismo patrón heredado).
- **Bypass §6 15ª aplicación previsible**: protocolo en `docs/90-meta/local-ci-playbook.md` §6. Las 3 condiciones canónicas + sección formal en el PR body. **14 aplicaciones a 2026-05-19** (#57/#60/#63/#65/#67/#70/#72/#74/#75/#77/#79/#82/#85/#90) — F.12 sería la 15ª previsible si CI Actions sigue billing-bloqueada.
- **Setup local F.11 sigue válido**: Docker containers UP (postgres :5432 + redis :6379 + mailpit :1025/:8025 + minio :9000-9001 healthy); frontend :3002 listening; backend dev `:3001` (importante: si hay un proceso `node dist/src/main` corriendo desde antes del `nest build`, reiniciar manualmente antes del smoke — heredado F.7/F.9/F.10/F.11). Mock Enhance :3099 listening (lanzado con `pnpm --dir backend exec ts-node --transpile-only --project ../tests/e2e/fixtures/tsconfig.mock-runner.json ../tests/e2e/fixtures/mock-enhance-runner.ts` — alias `pnpm run mock:enhance` NO existe, apuntar al backlog post-15C.II como housekeeping si Yasmin lo confirma).
- **`enhance_customers` stale tras mock reset**: si el mock se reinicia durante el smoke F.12, los IDs en Aelium quedan stale → SSO + reset password fallan (apuntado `DC.NEW-58`). Path manual: `DELETE FROM enhance_customers WHERE user_id='<UUID>'` + Reaprovisionar el servicio. F.12 NO arregla esto (es housekeeping post-15C.II).
- **L18 frozen**: cualquier mejora descubierta durante implementación que diverja del apuntado original del dossier se documenta como **Amendment** dentro de la fase (no desvío silencioso). F.10 produjo pivot doctrinal pre-código + Amendment I durante implementación (rename `kind`→`appKind`+`urlKind`); F.11 produjo Amendment I durante implementación (whitelist 3 plantillas vs 5) + Amendment II post-PR self-review (P1 rate limiting) + hot-fix DI clash (módulo leaf canónico). F.12 probablemente produzca 0-1 Amendments dada la naturaleza doc-first con freeze gate — el freeze se produce al final de la iteración de diseño, así que las divergencias se resuelven en el documento ANTES de codear.
- **F.12.2 cero cambio funcional**: refactor de composición debe preservar comportamiento exacto. E2E spec Playwright (si existe) DEBE pasar sin cambios. Tests unit ajustados solo si imports cambian de location. Heredable: cualquier futuro refactor de layout puro sigue el patrón "tests as ground truth — si cambian, hay regresión funcional encubierta".

#### A.11.10.9.2. Refinamiento pre-código F.12.1 — R1..R6 frozen (2026-05-19)

**Propósito**: congelar las 6 decisiones doctrinales pre-código de F.12 antes de tocar `UI_SPEC.md` o cualquier archivo de `frontend/`. Patrón heredado §A.11.10.7.2 (F.10 R1..R3 OAS rigor) + §A.11.10.8.2 (F.11 Q1..Q5 → R1..R5). Cada R cita la fuente de verdad doctrinal (UI_SPEC §X, ADR-NNN, regla R*/D*, patrón heredado F.N) que la fundamenta. Resolución de [§A.11.10.9.1 Q1..Q5 + Q6 derivada]. Cualquier divergencia durante F.12.1 (iteración de wireframes) o F.12.2 (implementación) requiere **Amendment** explícito en esta sub-sección (L18 frozen).

##### R1 — Ubicación de los componentes nuevos (resuelve Q1)

**Decisión**: caso a caso según alcance funcional, en 4 tiers:

| Tier | Ubicación | Criterio | Documentación |
|---|---|---|---|
| **Tier 1 — DS canónico** | `frontend/app/components/ui/` | Componente de **propósito general** reutilizable a cualquier detail page del proyecto (no solo F.12). Mínimo 2 consumidores reales actuales o claramente previstos en `current.md`. | §N en `UI_SPEC.md` + entrada en `DESIGN_SYSTEM.md`. |
| **Tier 2 — Compartido cliente+admin del módulo Servicios** | `frontend/app/_shared/services/` | Card o SC visible en **ambos** roles (con o sin prop `isAdmin` para diferencias display-only). Patrón heredado: `SslStatusCard`, `AppShortcutsCard`, `BillingCrossLinkCard`, `ActionsBar`, `MetricsBar`. | Doc inline (JSDoc del componente). |
| **Tier 3 — Subcomponente interno de `_shared/services/`** | `frontend/app/_shared/services/_components/` | Sub-bloque de un componente Tier 2 (no importado desde `page.tsx`, sino desde otro Tier 2). Patrón heredado: `_components/ServiceAuditTimeline.tsx`. | Doc inline. |
| **Tier 4 — Admin-only puro** | `frontend/app/admin/services/[id]/_components/` (o equivalente admin route) | Componente **exclusivamente admin**, sin variante cliente conceptualmente posible. Patrón heredado F.11: `<ProviderHealthBadge>` (doctrina **L16 NO universal** §A.11.10.8.2 (a)). | Doc inline. |

**Componentes nuevos previstos para F.12** (lista provisional — se congela en F.12.1 al final de la iteración de wireframes):

| Componente | Tier propuesto | Justificación |
|---|---|---|
| `<ServiceDetailLayout>` SC | Tier 2 (`_shared/services/`) | Orquestador del registry (R2+R3). Compartido cliente+admin. |
| `<PageSectionGroup>` | Tier 1 (DS) **solo si** ROI 2+ consumidores | Cromo consistente entre secciones (`<h2>` + spacing + Card opcional). Si no se justifica reutilización fuera de F.12, baja a Tier 3 como `_shared/services/_components/SectionGroup.tsx`. **Decisión final en F.12.1 al congelar wireframes.** |
| `<DriftBannerStack>` | Tier 2 | Apilamiento ordenado de banners (terminal, drift, suspended). Compartido cliente+admin con shape distinto por rol (§4.13). |
| Catálogo `service-detail-sections.tsx` (R3) | Tier 2 | Registry declarativo (no es componente sino módulo). |

**Anti-decisión explícita** (NO se crean): `<AdminOnlyGuard>` SC abstracto — la doctrina §1.2 P6 + ADR-070 + CASL ya filtran en backend; el frontend usa `scope: 'admin'` del descriptor (R3) que es más explícito y testeable que un guard wrapper opaco.

**Fuentes**: UI_SPEC §1.2 P6 contenido adaptativo por rol · ADR-070 dashboard puerta unificada · doctrina L16 NO universal heredada F.11 §A.11.10.8.2 (a) · patrón Next.js `_components/` underscore folder (no route).

##### R2 — Layout único discriminado por rol (resuelve Q2)

**Decisión**: `frontend/app/_shared/services/ServiceDetailLayout.tsx` SC **único**, con prop `isAdmin: boolean` derivada server-side de `getServerSession()` + `isStaffRole(session?.user.role.slug)`. Las dos páginas `frontend/app/dashboard/services/[id]/page.tsx` y `frontend/app/admin/services/[id]/page.tsx` se convierten en wrappers finos (~20-30 LOC) que:

1. Resuelven `id` del `params`.
2. Cargan `data: ServiceDetailResponse` via `serverFetch` (cliente fail-soft `null` → `<EmptyState>`; admin fail-soft idéntico).
3. Cargan side-data (`billingCrossLink`, etc.) via `Promise.all` para evitar waterfall.
4. Componen el `ServiceDetailContext` (ver R3) — incluye `isAdmin`, `isTerminal`, `isDrift`, `isSuspended`, `suspensionReasonCode`.
5. Delegan render a `<ServiceDetailLayout ctx={ctx} />`.

**Contrato del SC** (frozen):

```typescript
interface ServiceDetailLayoutProps {
  ctx: ServiceDetailContext;
}

export default function ServiceDetailLayout({ ctx }: ServiceDetailLayoutProps): JSX.Element;
```

**Convención `isAdmin` cliente-page**: las pages `/dashboard/services/[id]` pueden devolver `isAdmin: true` si quien la abre es staff (patrón actual: `const isAdmin = isStaffRole(session?.user.role.slug)`). Las pages `/admin/services/[id]` SIEMPRE pasan `isAdmin: true` + un flag adicional `forceAdminRoute: true` en el contexto, que activa secciones admin-route-only (drift banner técnico, audit completo, controles destructivos). El registry decide via `scope` + `shouldRender(ctx)` con acceso al flag.

**Justificación**: hoy hay ~70% de código compartido vía `_shared/services/`. Consolidar a 1 SC elimina drift accidental entre `/dashboard/services/[id]` y `/admin/services/[id]`. Trade-off conocido: el padre tendrá N condiciones de scope, pero R3 (router declarativo) las encapsula en descriptores aislados — el padre NO crece.

**Fuentes**: UI_SPEC §1.2 P6 (contenido adaptativo por rol — Stripe/Hostinger pattern) · UI_SPEC §4.13 (drift por rol) · ADR-070 (separación admin/cliente como capability del layout, no como duplicación) · ADR-078 A1 (Modelo A — SC + Server Actions cookies httpOnly) · ADR-077 (capability flags `info.capabilities.*` ya determinan QUÉ se renderiza sin condicionar por `provisioner_slug`).

##### R3 — Router de secciones declarativo (resuelve Q3 — propuesta cementada y aceptada)

**Decisión**: catálogo declarativo `frontend/app/_shared/services/service-detail-sections.tsx` que exporta una constante `SERVICE_DETAIL_SECTIONS: readonly SectionDescriptor[]`. El `<ServiceDetailLayout>` (R2) **solo itera** ordenando por `priority` descendente (mayor número = más arriba) y filtrando por `scope` + `shouldRender(ctx)`. Cero condiciones inline en el padre.

**Tipos exactos del contrato** (frozen — viven en `_shared/services/service-detail-sections.tsx`):

```typescript
import type { ComponentType } from 'react';
import type {
  Service,
  ServiceInfo,
  ServiceBillingCrossLink,
} from '../../lib/api';

export type SectionScope = 'admin' | 'client' | 'both';

export interface ServiceDetailContext {
  /** Datos crudos del backend (`GET /services/:id`). */
  service: Service;
  info: ServiceInfo;
  /** Side-data fetched en paralelo en el wrapper page. */
  billingCrossLink: ServiceBillingCrossLink | null;
  /** Rol efectivo del usuario que abre la página. */
  isAdmin: boolean;
  /** True si la ruta es `/admin/services/[id]` (no `/dashboard/services/[id]` con isAdmin=true). */
  forceAdminRoute: boolean;
  /** Estados derivados canónicos (heredados del page actual). */
  isTerminal: boolean;
  isDrift: boolean;
  isSuspended: boolean;
  suspensionReasonCode: SuspensionReasonCode | null;
}

export interface SectionDescriptor {
  /** Identificador estable y único — usado en tests + analytics + claves React. */
  id: string;
  /** Etiqueta humana en español (para devtools + futuro analytics). NO se renderiza. */
  label: string;
  /** Quién puede ver esta sección. `both` = visible cliente y admin (con o sin variación interna). */
  scope: SectionScope;
  /**
   * Prioridad de render. Descendente: 1000 = arriba, 1 = abajo.
   * Convención de rangos:
   *   - 1000..1999: banners de estado crítico (terminal, drift admin, suspended)
   *   - 500..999:   identidad del servicio (header, detalles canónicos)
   *   - 100..499:   métricas y estado del recurso (MetricsBar, SSL, apps, billing cross-link)
   *   - 50..99:     operativas (SSO panel, ActionsBar, DNS link, App admin shortcuts)
   *   - 1..49:      histórico y meta (audit timeline, dev custom placeholder, fetchedAt footer)
   */
  priority: number;
  /** Predicado de visibilidad. Acceso completo al contexto. Server-evaluable (puro). */
  shouldRender: (ctx: ServiceDetailContext) => boolean;
  /** El componente que renderiza la sección. Recibe `ctx` completo. */
  component: ComponentType<{ ctx: ServiceDetailContext }>;
}

export const SERVICE_DETAIL_SECTIONS: readonly SectionDescriptor[] = [
  // poblado en F.12.2 — mapping completo de cards actuales a descriptores
];
```

**Reglas inmutables del registry** (frozen):

1. **Descriptores son objetos puros**: `shouldRender` no hace side-effects, no fetcha, no usa hooks. Solo lee `ctx`.
2. **Render order determinista**: el padre hace `SERVICE_DETAIL_SECTIONS.filter(s => matchesScope(s.scope, ctx) && s.shouldRender(ctx)).sort((a,b) => b.priority - a.priority)`. NUNCA se introduce randomización ni reordenamiento dinámico.
3. **Empate de `priority`**: en colisión, gana el orden de declaración en el array (estable). Sirve para grupos lógicos consecutivos (ej. dos secciones admin con `priority: 100`).
4. **`scope` strict**: helper `matchesScope(scope: SectionScope, ctx: ServiceDetailContext): boolean` = `scope === 'both' || (scope === 'admin' && ctx.isAdmin) || (scope === 'client' && !ctx.isAdmin)`. Documentado + testeado.
5. **`forceAdminRoute`** se chequea **dentro** de `shouldRender` cuando aplica (ej. banner drift técnico crudo solo en `/admin/services/[id]`, no en `/dashboard/services/[id]` con staff abriendo). NO se duplica como `scope` nuevo.
6. **Heredable**: plugins futuros (Sprint 15D RC, 15E Docker, 15G Plesk) **registran descriptores adicionales** en el mismo array (o en arrays plugin-specific concatenados). Cero modificación del padre. Documentar en cada Amendment de ADR-077 si un plugin añade descriptor.

**Justificación doctrinal** (multifuente):

- **UI_SPEC §1.2 P6** materializado explícitamente: `scope` + `shouldRender` son la explicitación frontend del filtrado por rol que CASL hace en backend.
- **UI_SPEC §4.13 drift por rol** materializado como descriptor único con `scope: 'both'` + `shouldRender` que ramifica el `component` interno según `ctx.isAdmin` (renderiza banner técnico admin vs mensaje empático cliente — patrón heredado §4.13 frozen).
- **ADR-070 puerta unificada**: el dashboard agrega secciones según contribución del plugin (apps, SSL, quota, DNS) — la extensibilidad natural es vía registry de descriptores.
- **ADR-077 capability-driven**: `shouldRender(ctx) = !ctx.isTerminal && Boolean(ctx.info.ssl)` es el mismo predicado declarativo que hoy vive como `{!isTerminal && info.ssl && <SslStatusCard ssl={info.ssl} />}` — la diferencia es que ahora vive registrado en un sitio único en lugar de cableado en el padre.
- **Estándar industria**: Stripe Dashboard, Vercel Project Settings, Linear Issue View — section/tab registries son patrón canónico para detail pages extensibles.
- **ROI medible**: el padre actual `/dashboard/services/[id]/page.tsx` tiene **~580 LOC** con **~6 condiciones inline cableadas** + JSX repetitivo de cards. El padre post-R3 son ~30 LOC (wrapper + ctx + delegación). Cada sección encapsulada testeable de forma aislada.

##### R4 — Wireframes ASCII inline en UI_SPEC §N (resuelve Q4 — default razonado)

**Decisión por defecto**: wireframes ASCII **inline** dentro de cada sección §5.14/§5.18/§5.19 del propio `UI_SPEC.md`. Mismo patrón canónico que §2.3..§2.7 (Anatomía: Overview/List/Detail/Form/Workspace) que tienen ASCII inline. UI_SPEC actual ~1946 líneas; estimación post-F.12 ~2300 líneas (margen aceptable — el documento es el manifiesto canónico, debe ser denso).

**Trigger de revisión a sub-archivo**: si tras la v1 del primer wireframe queda claro que **algún** wireframe individual supera ~70 líneas ASCII (3 vistas: cliente normal + admin normal + admin con drift), se mueve a `docs/40-design/wireframes-f12-services.md` linkado desde UI_SPEC §5.14. Decisión por wireframe individual (no por todos).

**Fuentes**: UI_SPEC §2.3..§2.7 patrón canónico inline · §5.13 Auth wireframe inline 16 líneas (referencia de densidad aceptable) · principio de **doc maestra cohesionada** sobre fragmentación.

##### R5 — PR único monolítico F.12 (resuelve Q5 — default razonado)

**Decisión por defecto**: **1 PR único** F.12 incluyendo ambas sub-fases (F.12.1 doc-only iterativo + commits FREEZE + F.12.2 refactor). Patrón heredado §A.11.10.7 (F.10 PR único #85) + §A.11.10.8 (F.11 PR único #90). Coherencia del refactor entre las 3 familias de páginas requiere review unificado de los componentes nuevos (`<ServiceDetailLayout>`, `<PageSectionGroup>` si aplica, registry).

**Trigger de partición a sub-PRs**: si tras congelar wireframes la estimación LOC del refactor F.12.2 supera **2000 LOC netos**, partir en 3 sub-PRs por familia con commits ordenados:

- `F.12.2.a` componentes base (`<ServiceDetailLayout>` + registry + `<PageSectionGroup>` si aplica) + refactor `/services/[id]` cliente + admin
- `F.12.2.b` refactor `/admin/settings/plugins` lista
- `F.12.2.c` refactor `/admin/settings/plugins/[slug]` detalle

Cada sub-PR auto-suficiente (review independiente posible), tests verdes, sin breaking entre ellos.

**Fuentes**: patrón heredado fases F.4..F.11 (todas PR único + post-merge sync separado) · trade-off review ergonomics vs coherencia atómica.

##### R6 — Numeración §5.X en UI_SPEC para las 3 secciones nuevas (Q6 derivada, no incluida en §A.11.10.9.1 original)

**Decisión derivada** (no estaba en Q1..Q5 — descubierta al cotejar UI_SPEC líneas 1646..1709 antes de empezar a redactar wireframes):

| Sección F.12 | Numeración | Justificación |
|---|---|---|
| **§5.14 — Servicio Detail (`/dashboard/services/[id]` + `/admin/services/[id]`)** | Aprovecha el **gap §5.14 ausente** (entre §5.13 Auth y §5.15 Tareas — sección histórica eliminada en un commit previo, gap nunca rellenado). Detail page nuclear del sprint — orden de lectura natural junto al resto de Detail pages del doc. | Cero renumeración. Posición semántica razonable (después de Auth, antes de Tasks; en un futuro reorder semántico la sección puede moverse junto a Productos §5.4-§5.6 + Billing §5.7-§5.9 con una nueva R, pero F.12 NO renumera para no romper anchors externos). |
| **§5.18 — Plugins List (`/admin/settings/plugins`)** | Tras §5.17 actual ("Resumen de componentes nuevos requeridos"). Admin tooling especializado — orden cronológico de adición (Sprint 15A). | Mantiene §5.17 como cierre histórico pre-F.12. Anchor `#section-5-18-plugins-list` estable a futuro. |
| **§5.19 — Plugin Detail (`/admin/settings/plugins/[slug]`)** | Tras §5.18. Admin tooling especializado. | Consecutivo a §5.18, agrupa visualmente el módulo Plugins. |
| **§5.20 — Resumen de componentes nuevos F.12** (opcional) | Tras §5.19. Anexo a §5.17 pre-F.12. | Solo si se crean componentes Tier 1 DS (R1) que necesiten entry en el resumen. Si todos los componentes nuevos son Tier 2/3/4 (`_shared/`), el resumen se omite y se documenta inline en los componentes. **Decisión final al congelar F.12.1.** |

**Anti-decisión explícita** (NO se hace): renumeración de §5.13..§5.17. Romper anchors externos (PRs anteriores, dossiers de sprints cerrados, ADRs) sin necesidad funcional viola la regla canónica de **estabilidad de identificadores doctrinales**.

**Convención adoptada** (heredable): cuando aparezca un gap §5.X disponible y la nueva sección encaje semánticamente o sea minoritaria, **aprovechar el gap** antes que añadir al final. Cuando la nueva sección sea estructuralmente posterior (módulo nuevo, admin tooling), añadir al final.

**Fuentes**: cotejo UI_SPEC.md líneas 1646..1709 (vacío post-§5.13) · principio de **estabilidad de identificadores doctrinales** (ADRs, §, regla R*/D* no se renumeran salvo necesidad funcional) · regla heredable nueva (a documentar en `docs/90-meta/development-playbook.md` si se confirma utilidad).

##### Aplicación de R1..R6 al pipeline F.12.1 → F.12.2

| Etapa | Acción concreta | Artefactos producidos |
|---|---|---|
| **F.12.1 commit 2** | v1 wireframes ASCII §5.14 + §5.18 + §5.19 según R4 inline. Cada wireframe: jerarquía componentes (árbol) + bloques (siguiendo §2.5 Detail Page) + estados (empty/error/loading) + variaciones por rol (§1.2 P6) + drift (§4.13) + responsive. | 3 secciones nuevas en `UI_SPEC.md` + posible §5.20 anexo R1. |
| **F.12.1 commits 3..N** | Iteración con Yasmin sobre wireframes. Cada commit = `docs(sprint-15c-ii): F.12.1 wireframe iteración N — <cambio concreto>`. | Wireframes refinados. |
| **F.12.1 commit FREEZE** | Yasmin confirma. Commit dedicado `docs(sprint-15c-ii): F.12.1 — wireframes FREEZE 2026-XX-XX (Yasmin)`. Marca el punto de no-retorno al diseño. | Wireframes congelados. |
| **F.12.2 commits 1..N** | Orden canónico: (a) `_shared/services/service-detail-sections.tsx` registry vacío + tipos R3 + helpers `matchesScope`. (b) Descriptores migrando JSX inline actual del page cliente uno a uno (preserva comportamiento — cada migración verificable visualmente). (c) `<ServiceDetailLayout>` SC orquestador. (d) `<PageSectionGroup>` / `<DriftBannerStack>` si R1 los justifica. (e) Refactor `frontend/app/dashboard/services/[id]/page.tsx` a wrapper ~30 LOC. (f) Refactor `frontend/app/admin/services/[id]/page.tsx` idem (puede compartir helper de carga de `ctx`). (g) Refactor `/admin/settings/plugins` lista + `[slug]` detalle. (h) Ajuste tests unit por imports cambiados. | `ServiceDetailLayout` + registry + 3 familias de páginas refactorizadas. |
| **F.12.2 validación** | `pnpm ci:check:full` + boot smoke + smoke real Yasmin contra `MockEnhanceServer` 5 escenarios: (1) cliente activo · (2) cliente suspended · (3) admin con drift · (4) admin terminal cancelled · (5) admin con apps + SSL + quota threshold. | Suite verde + smoke verde. |
| **F.12.2 PR** | PR único F.12 (R5 default). Body incluye bypass §6 15ª aplicación si CI Actions sigue billing-bloqueada. Tras merge → post-merge sync PR doc-only (patrón heredado). | PR mergeado a master + sync. |

##### FREEZE gate — wireframes congelados (2026-05-20, Yasmin)

**FREEZE confirmado por Yasmin el 2026-05-20.** Las 3 secciones `UI_SPEC.md` §5.14 (Servicio Detail, 24 descriptores) + §5.18 (Plugins List) + §5.19 (Plugin Detail) quedan **congeladas** tras la iteración v2 (3 ambigüedades resueltas). A partir de este punto arranca F.12.2 (implementación pura composición). Cualquier divergencia del diseño congelado durante la implementación requiere **Amendment** explícito en esta sub-sección (L18 frozen). Commits de diseño F.12.1: `1837da3` (R1..R6) · `b3a0830` (§5.14 v1) · `3edd954` (§5.18 v1) · `bd992cc` (§5.19 v1) · `fa66b71` (§5.14 v2 ambigüedades).

##### Amendments durante F.12.2 (implementación — L18 frozen)

Divergencias del diseño congelado descubiertas al implementar contra el código real de los dos pages, todas en servicio de **cero cambio funcional** (preservar el comportamiento exacto de `/dashboard/services/[id]` y `/admin/services/[id]`). Documentadas aquí (no desvío silencioso).

**Amendment I — refinamientos del registry R3** (commit `feat F.12.2`):

1. **`matchesScope` se basa en `ctx.forceAdminRoute` (la RUTA), NO en `ctx.isAdmin` (el rol).** El freeze §A.11.10.9.2 R3 regla 4 indicaba `isAdmin`. Pero un staff puede abrir `/dashboard/services/[id]` (cliente) y debe ver la experiencia CLIENTE — el page cliente actual NO ramifica su composición por rol, solo pasa `isAdmin` a ciertos componentes. `matchesScope` con `isAdmin` rompía ese caso (un staff vería las secciones admin en la página cliente). Corregido: `scope === 'both' || (scope === 'admin' && forceAdminRoute) || (scope === 'client' && !forceAdminRoute)`. `isAdmin` se conserva en el contexto para uso DENTRO de componentes (tooltips, acciones admin-no-blacklisted) y `shouldRender`.
2. **Registry dividido base + extensión admin.** En lugar de un único array global `SERVICE_DETAIL_SECTIONS`, se divide en base (`_shared/services/service-detail-sections.tsx`, 15 descriptores both+client) + extensión (`app/admin/services/[id]/_sections.tsx`, 9 descriptores admin) inyectada vía la prop `extraSections` del `<ServiceDetailLayout>`. Razón: los componentes admin-only (Tier 4 R1) viven en `app/admin/services/[id]/_components/`; un array único en `_shared/` los importaría → acoplaría `_shared/` a `app/admin/`. La división materializa la **regla 6 de R3** (concatenación de arrays — heredable a plugins futuros 15D/15E/15G que registran su extensión).
3. **`sso-panel-card` / `actions-bar` / `dns-link-card`: `shouldRender` ramifica por `forceAdminRoute`.** El freeze listaba el gating CLIENTE (`!isSuspended`/`!isDrift`). El page admin gatea solo `!isTerminal` para estos 3. Para preservar ambas conductas: `!isTerminal && … && (forceAdminRoute || (!isSuspended && !isDrift))` (sso/dns) y `!isTerminal && (forceAdminRoute || !isSuspended)` (actions).
4. **`isAdmin` vs `forceAdminRoute` por componente.** Los pages previos pasaban `isAdmin` de forma heterogénea: `false` hardcoded a ServiceHeader/MetricsBar/SslStatusCard/BillingCrossLink (chrome display-only) incluso para staff en la página cliente; pero el `isAdmin` derivado de staff a AppShortcuts/SsoButton/ActionsBar (acciones + tooltips relevantes a staff). Replicado: los 4 de chrome usan `ctx.forceAdminRoute`; los 3 con acciones usan `ctx.isAdmin`.
5. **`ProviderHealthBadge` fusionado en la fila de cabecera admin** (`header-admin-row`) en lugar de descriptor separado `admin-provider-health-badge` (freeze) — preserva el layout `flex justify-between` (badge top-right en la misma fila que el back-link). El conteo total sigue siendo 24 descriptores (15 base + 9 admin; el back-link cliente y la fila admin son 2 descriptores route-exclusivos).
6. **`ServiceDetailContext` extendido** con `pluginHealth: PluginHealthSummary | null` + `supportsReconcileOne: boolean` (admin fetcha; cliente deja `null`/`false`) — el freeze ya refería `ctx.pluginHealth`. Y `SectionDescriptor.component` admite **async Server Components** (`ReactNode | Promise<ReactNode>`) porque `ServiceNotesCard` es async.

**Amendment II — plugins detail layout con slots inyectados:** `<AdminPluginDetailLayout>` (`_shared/plugins/`) recibe los CC route-local (`PluginConfigForm`, sección reconcile-all) como slots `ReactNode` en lugar de importarlos. Mismo principio que `extraSections` — evita acoplar `_shared/` a `app/admin/settings/plugins/[slug]/_components/`. El `<AdminPluginsListLayout>` no necesita slots (solo usa `PluginCard`, ya en `_shared/plugins/`).

**Validación F.12.2:** `pnpm typecheck` + `pnpm lint:check` (`--max-warnings=0`) + `pnpm build` (32 páginas) verdes. El frontend NO tiene runner de tests propio (heredado handoff) → la validación es tsc+eslint+build. Orden de secciones verificado idéntico al de ambos pages previos por inspección de `priority` (cliente 15 secciones · admin 19). Commit implementación: `feat(sprint-15c-ii): F.12.2 — layout canónico servicio + plugins`.

##### Sub-fase F.12.3 — Rediseño visual a estándar profesional (Amendment III, 2026-05-20)

**Origen:** tras F.12.2 (registry, *cero cambio funcional*), Yasmin observó que F.12 había **documentado + reorganizado el código** pero NO mejorado el visual — la página seguía siendo un scroll plano de ~15-19 tarjetas, que no cumple del todo UI_SPEC §2.5 (Detail con tabs cuando hay >2 secciones). Decisión Yasmin (2026-05-20): **rediseño visual real**, "inteligente, robusto, profesional, válido para diferentes tipos de servicio / provisioners, con componentes/CSS/copys según UI_SPEC.md". Esto es una **ampliación de scope** de F.12 — ya **NO es cero cambio funcional** (cambia presentación; preserva datos/comportamiento/gating). Se documenta como Amendment III (L18 frozen).

**Q (re-valoración pre-código)** — Yasmin eligió: (a) organización **tabs para cliente y admin** (canónico §2.5) sobre scroll-agrupado / adaptativo-por-rol; (b) alcance **tratamiento completo UI_SPEC** (frame + i18n + CSS module + DS + copys genéricos) sobre versiones parciales.

**Implementación (commit `cbcc718`):**

1. **Tabs adaptativas provisioner-agnósticas.** Nuevo `SectionGroup = 'header'|'summary'|'management'|'activity'|'footer'` + campo `group` en los 24 descriptores. `<ServiceDetailLayout>` organiza en **zonas**: `header`/`footer` siempre visibles (identidad + banners críticos + meta); `summary`/`management`/`activity` en tabs (DS `<Tabs>`). **Tab vacía se oculta**; **si solo sobrevive 1 grupo → SIN tabs** (§2.5). Robustez: un servicio mínimo (`support_inside` sin métricas/SSL/DNS/apps) colapsa a Resumen+Actividad o sin tabs; uno rico (`enhance_cp`) muestra las 3. El frame es uno solo; lo que aparece y cuántas tabs lo decide la **capability**, nunca el `provisioner_slug` (ADR-070/077).
2. **`<ServiceDetailTabs>` (CC).** Reusa el DS `<Tabs>` + `useState` (patrón heredado `ClientDetailView`). Paneles SC pre-renderizados (incl. async SC `ServiceNotesCard`) conmutados sin re-fetch — el wrapper SC ya cargó todo en `ServiceDetailContext`. `initialTab` de `?tab=` (deep-link). Layout monta el CC solo si ≥2 tabs; con 1, render directo.
3. **i18n completo (§1.2 P5 + regla D11).** +36 keys `service.detail.*` (tabs, back-links, detalles, SSO, DNS, dev-custom, footer, fechas, suspended admin). Migra TODOS los copys hardcodeados de los bloques a `translations-es.ts` (antes vivían a pelo en el JSX).
4. **CSS module + DS + tokens (§2.8).** Nuevo `_shared/services/service-detail.module.css` (tokens only) — el módulo de servicios era el **único del proyecto sin CSS module** (usaba estilos inline). Bloques reescritos con clases del módulo + DS `Card`/`AlertBanner`. Helper `SectionLinkCard` DRY-fica el chrome "Card título+descripción+acción" (SSO/DNS/Audit).
5. **Bug latente arreglado.** El módulo de servicios usaba `var(--brand-600)` en 16 sitios — token **NO definido** en `globals.css` (los enlaces/CTAs renderizaban sin color de marca, heredando el color del texto). Migrado a `--brand` / `--text-on-brand` (tokens reales). Mejora visual real (los enlaces ahora muestran color de marca).

**Boundary de F.12.3:** cubre el **frame** + los **bloques creados en F.12.2** (`service-detail-blocks.tsx`) + `AdminSuspendedBanner`. Los componentes admin-only **pre-existentes** (`AdminDriftBanner`, `AdminServiceDataCard`, `AdminServiceOperationsCard`, `ResendNotificationCard`, `ServiceNotesCard`, `ProviderHealthBadge`) **conservan sus estilos/copys internos** — son componentes separados ya validados; su migración i18n/CSS sería housekeeping aparte (candidato backlog `DC.NEW-*`).

**Validación F.12.3:** `pnpm typecheck` + `pnpm lint:check` (`--max-warnings=0`) + `pnpm build` (32 páginas) verdes (commit `cbcc718`). Pendiente: smoke real Yasmin (5 escenarios + verificar adaptación de tabs + colapso de servicio mínimo).

##### Sub-fase F.12.4 — Arquitectura de información profesional (Amendment IV, 2026-05-20)

**Origen:** tras F.12.3 (tabs), Yasmin observó que "poner tabs no es suficiente" — dentro de cada tab las cards se apilaban una bajo otra sin jerarquía, los botones estaban dispersos (SSO en una card, ActionsBar suelto, DNS/operaciones/audit cada uno en su card), copys y CTAs sin convención, y nada de eso respeta UI_SPEC. Encargó un **audit exhaustivo** (UI_SPEC + estándar del sector + DESIGN_SYSTEM) y reorganizar TODA la información y botones del service detail. Amendment IV (L18 frozen).

**Audit — violaciones halladas** (vs UI_SPEC §2.5/§3.1/§3.5/§4.2/§4.3 + DESIGN_SYSTEM Reglas D2/D5 + detail pages canónicos clientes/productos/factura):
1. Botones dispersos (~14 superficies sin jerarquía) — viola **D2** (1 primaria + máx 2 secundarias + resto ⋯) + anti-patrón #4 (3+ botones al mismo nivel).
2. Destructivas como botones permanentes — viola **D5** (destructivas en ⋯ → modal).
3. Metadata en card "Detalles" separada — viola **§3.1** (en detail, metadata inline en header).
4. Cards apiladas columna única — vs canónico grid 2-col de Cards con título de sección.
5. Botones como `<Link>` con estilo inline — vs DS `<Button variant>`.
6. NO usa `<DetailPage>` (el resto de detail pages sí).
7. Copys de CTAs sin convención de voz de marca.

**Decisiones frozen (Yasmin 2026-05-20):**
- **D1 — Adoptar el DS `<DetailPage>`** (breadcrumb + headerCard + tabBar canónicos). El tab state vive en un wrapper cliente `<ServiceDetailView>` (patrón `ClientDetailView`); el SC pre-renderiza header + banners + paneles (incl. async SC) y los pasa como `ReactNode`.
- **D2 — Metadata inline en el header** (Plan · Dominio · Contratado · Renovación), se elimina la card "Detalles del servicio" (§3.1).
- **D3 — Clúster de acciones en el header** (Regla D2): **primaria** = Abrir panel (SSO, si `hasSsoPanel`); **secundaria** = Gestionar DNS (si `has_dns_management`); **menú ⋯** = SOLO acciones rápidas/reversibles del plugin (`info.availableActions` filtradas, igual que ActionsBar). Banners (terminal/suspendido/drift/desync) full-width bajo el header, siempre visibles.
- **D4 — Operaciones admin consecuentes en card "Operaciones" (tab Gestión)**, NO en el menú: Cambiar plan / Recalcular / Suspender / Reanudar / Cancelar — cada una abre modal (se reusa `AdminServiceOperationsCard` existente). `Reenviar notificación` = card propia (tiene selector). Patrón "zona de operaciones" visible+organizada (no escondida en menú), reconciliable con D5 porque cada destructiva sigue abriendo modal.
- **D5 — Tabs con grid 2-columnas de Cards** (no apilado): Resumen (Recursos = métricas+SSL · Facturación · Aplicaciones · admin Datos técnicos) · Gestión (Operaciones · Reenviar notif) · Actividad (Notas · Auditoría).
- **D6 — Todo a DS `<Button variant>` + `<Dropdown>`** + copys i18n; modales con copy §4.2 ("Sí, cancelar el servicio" / "No, volver").

**Clúster por rol×estado (frozen):** cliente activo → primaria SSO + secundaria DNS + ⋯ (acciones plugin cliente) · cliente suspendido/drift/terminal → sin clúster (banners) · admin activo → SSO + DNS + ⋯ (restablecer contraseña…) · admin suspendido → primaria Reanudar + secundaria SSO · admin drift → SSO + DNS + ⋯ (banner drift con remediación) · admin terminal → sin clúster. Operaciones consecuentes siempre en card "Operaciones" (Gestión), no en el clúster.

**Acciones que NO entran al clúster** (contextuales a su card): refrescar métricas (MetricsBar) · abrir app (Aplicaciones) · ver factura (Facturación) · reenviar notif (card propia) · remediación drift/desync (banners) · CTA suspensión cliente (banner).

**Reutilización (no reescritura de internals):** `SsoButton` (primaria), `AdminServiceOperationsCard` (card Operaciones), `ResendNotificationCard` (card), banners existentes, métricas/SSL/apps/billing/notes/audit (re-agrupados en grids). Código NUEVO: `ServiceActionCluster` (CC: SSO + DNS + ⋯ Dropdown reusando `executeServiceActionAction`), `ServiceHeaderCard` (identidad + metadata inline + cluster), `ServiceDetailView` (CC: `<DetailPage>` + tab state) + restructura del registry + CSS grids.

**Estado F.12.4:** mergeable en PR [#94](https://github.com/yasmindanailov/dashboard/pull/94) (commit `66bb2aa`); tsc+lint+build verdes + boot smoke. Pendiente smoke real Yasmin.

##### Sub-fase F.12.5 — Densidad profesional según estándar del sector (Amendment V, frozen 2026-05-20 · NO implementada)

**Origen:** tras F.12.4, Yasmin pidió un audit del inventario real de service/[id] por plugin + una comparativa con cómo organizan los grandes del sector, y valorar qué componentes faltan en el DS para la complejidad operativa de la página. F.12.5 es el **diseño congelado de la siguiente iteración** — se documenta aquí pero **se implementa en una conversación nueva** (decisión Yasmin 2026-05-20).

**Audit del inventario (por plugin, vía `enhance.plugin.ts` + `internal/manual.plugin.ts` + ADR-077):**
- **`enhance_cp`** (rico): capabilities `has_sso_panel`/`has_metrics`/`has_dns_management`/`supports_suspend`/`supports_reconciliation` = true; **11 acciones** (`reset_account_password` cliente · DNS CRUD · `change_package`+`list_available_plans`+`recalculate_provider_metrics`+`suspend_service`+`unsuspend_service` admin · `open_app_admin` per-app); `ServiceInfo` puebla `display` + `metrics` (disco/BW/email/BD) + `ssl` + `apps` (WP/Joomla) + `statusReason`/`recoveryHint`.
- **`internal`** / **`manual`** (mínimos): todas las capabilities false (manual: `completes_via_task=true`); 0 acciones; `ServiceInfo` solo `display` + status (manual: + statusReason "pendiente agente"). → la página es identidad + estado + facturación + auditoría.
- **Carga**: enhance admin activo ≈ 16 superficies de acción + ~10 bloques de datos; internal/manual ≈ 3 acciones + ~4 datos. El marco debe escalar de mínimo a denso.

**Comparativa del sector (patrones canónicos extraídos):** Hostinger hPanel (KPIs de recursos arriba + launchpad de tools), OVH Manager (info-general en **main+aside**, facturación/renovación en rail derecho), cPanel/Plesk (launchpad por dominio funcional), Stripe/Vercel/DigitalOcean (header limpio + aside de metadata + **métricas prominentes** + tabs por área), GitHub/DO (**Danger Zone** roja aislada). Síntesis: (1) liderar con estado+recursos; (2) overview **main+aside**; (3) agrupar por dominio funcional; (4) destructivas en zona de peligro aislada; (5) progressive disclosure; (6) densidad progresiva.

**Gap de componentes DS (decisión: construir los 4 + el layout):**
- **`<Meter>`** — medidor usado/total + % + color por umbral (disco/BW/email/BD). Hoy `MetricsBar` improvisa barras; `StatsCard` es número+tendencia. Primitiva reutilizable (billing, cuotas…).
- **`<SectionCard>`** — título + subtítulo + **slot de acciones** + body, **read-only** (≠ `EditorSectionCard`, que es para forms con "Guardar"). Cromo de sección canónico.
- **`<DescriptionList>`** — pares etiqueta-valor responsive (metadata header + Datos técnicos, con `CopyableId` para IDs).
- **`<DangerZone>`** — sección borde rojo para destructivas (patrón GitHub/DO).
- **Layout `main + aside`** (2fr/1fr) — helper/CSS para el overview; si MAIN vacío, ASIDE fluye full-width.

**Decisiones de IA frozen (re-valoración):**
1. **Header**: identidad + Badge + metadata inline (`DescriptionList` horizontal: Plan·Dominio·Contratado·Renueva) + clúster (primaria SSO · secundaria DNS · ⋯) + (admin) badge salud. (igual que F.12.4.)
2. **Tab Resumen → `main+aside`**: MAIN = `[SC]`Recursos (medidores `[M]`) · `[SC]`SSL · `[SC]`Aplicaciones (tiles). ASIDE = `[SC]`Facturación · (admin) `[SC]`Datos técnicos (`[DL]`+`CopyableId`) · (cliente) `[SC]`Ayuda + placeholder Sprint 22.
3. **Tab Gestión (admin)**: `[SC]`Operaciones (seguras: Cambiar plan · Recalcular) · `[SC]`Reenviar notificación · **`[DZ]` Zona de peligro full-width al fondo** (Suspender · Cancelar → modal). Separa destructivas de operaciones seguras (Regla D5 + patrón danger-zone).
4. **Tab Actividad**: `[SC]`Notas (admin) · `[SC]`Auditoría.
5. **Recursos → medidores** prominentes (no barra plana) — lidera el overview (patrón #1 sector).
6. **Robustez**: cada `[SC]` aparece por capability; MAIN vacío → ASIDE full-width; DangerZone al fondo; aside baja bajo main en <900px. Provisioner-agnóstico.

**Wireframes frozen por rol×estado:** documentados en `UI_SPEC.md §5.14` (cliente activo · admin activo · suspendido cliente/admin · admin drift · terminal · servicio mínimo). Son el deliverable doctrinal de F.12.5.

**Boundary:** F.12.5 recablea el overview + introduce las 4 primitivas DS. Reutiliza la lógica de acciones/operaciones/banners de F.12.4 (no reescribe Server Actions ni modales). Los componentes admin-only pre-existentes conservan sus internals (housekeeping aparte).

**Estado:** **frozen, NO implementada.** Se implementa en conversación nueva (handoff §A.11.10.9.3). Las 4 primitivas, al construirse, se añaden a `components/ui/` + `DESIGN_SYSTEM.md` (convención DS).

##### Riesgos identificados y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Algún descriptor migra mal y rompe render condicional sutil (ej. orden de bullets en card de detalles) | Media | Cada descriptor migrado en commit aislado en F.12.2; verificación visual incremental. Smoke real Yasmin 5 escenarios obligatorio antes del PR. |
| `<PageSectionGroup>` no se justifica como Tier 1 (DS) — solo 1 consumidor real | Alta | R1 baja a Tier 3 (`_shared/services/_components/`) al congelar F.12.1. No es regresión doctrinal. |
| Wireframe individual supera 70 líneas ASCII (drift visual complejo) | Media | R4 trigger explícito — mover ese wireframe a `docs/40-design/`. Decisión por wireframe, no global. |
| LOC neto F.12.2 supera 2000 → partir | Baja | R5 trigger explícito — sub-PRs F.12.2.a/b/c. Patrón canónico. |
| Algún descriptor necesita acceso a estado React (no puro) | Baja | Si aparece, el descriptor encapsula un client component `'use client'` que hace el hooking; el descriptor sigue siendo puro porque solo declara `component: <ClientWrapper>`. Documentar como Amendment si se necesita. |
| `forceAdminRoute: true` en `/admin/services/[id]` se filtra mal a algún descriptor | Media | Test unit del helper `matchesScope` + tests de los descriptores que dependen del flag (drift técnico admin, audit completo). |
| Tests existentes que importan `<ActionsBar>` / `<SsoButton>` etc. desde el page rompen | Baja | Mantener exports actuales en `_shared/services/index.ts` (barrel). Cambian las páginas, no el contrato exportado. |

##### Lo que F.12 NO aborda (alcance frozen)

- `DC.46` `autoCancelServices` → `deprovisionAsAdmin` (destructivo, candidato fase aparte).
- `DC.47` naming `notes` ↔ `internal_note` `DeprovisionDto` (housekeeping).
- `DC.48` bandwidth como F.8.x (semántica reset mensual sin resolver).
- `DC.49` `MockEnhanceServer` seed dinámico `usedResources` per-subscriptionId (housekeeping pre-G.2).
- `DC.NEW-51..54` App Management futuros (stats UI / install-uninstall / ops mutación / modelo BD).
- `DC.NEW-55..58` F.11 housekeeping (whitelist V2 quota / supertest E2E resend / Idempotency-Key / reconcile enhance_customers).
- Mejoras funcionales en cualquier card existente (SSL detail expandido, métricas drill-down, etc.) — **cero cambio funcional** es invariante de F.12.2.
- Adopción de `<PageSectionGroup>` en otras detail pages del proyecto (Clients / Products / Billing / Tickets / Tasks) — solo si se promociona a Tier 1; trabajo futuro fuera de F.12.

#### A.11.10.9.3. Handoff F.12.5 — implementación en conversación nueva (frozen 2026-05-20)

**Propósito**: arrancar la implementación de F.12.5 (densidad profesional — Amendment V) en una conversación nueva con rigor, leyendo SOLO este bloque + el Amendment V (§A.11.10.9.2) + `UI_SPEC.md §5.14`. Patrón heredado de los handoffs §A.11.10.9.1 (F.12) / §A.11.10.8.1 (F.11).

**Estado del repo al arranque:**
- Rama `sprint15c-ii-fase-f12-canonical-layout` con F.12.1→F.12.4 en PR [#94](https://github.com/yasmindanailov/dashboard/pull/94) (último commit de código `66bb2aa` + docs F.12.5). tsc+lint+build verdes; boot smoke OK. **Pendiente: smoke real Yasmin de F.12.4 + decidir si F.12.5 va sobre la misma rama/PR o tras mergear #94.**
- F.12.4 implementado: `<DetailPage>` + `<ServiceHeaderCard>` (identidad+metadata+clúster) + `<ServiceActionCluster>` + `<ServiceDetailView>` + registry reagrupado (banner/summary/management/activity/footer) + grids 2-col auto-fit + `quick-actions.ts`. Eliminados `ServiceDetailTabs`/`ActionsBar`.

**Qué construye F.12.5** (diseño congelado, Amendment V + UI_SPEC §5.14):
1. **4 primitivas DS nuevas** en `frontend/app/components/ui/` (+ barrel `index.ts` + `DESIGN_SYSTEM.md`):
   - **`<Meter>`** — `{ label, used, total?, unit, percent?, thresholdPct? }` → barra/ring usado/total + % + color por umbral (ámbar ≥threshold, rojo ≥95%, heredando la doctrina F.8). Tokens only.
   - **`<SectionCard>`** — `{ title, subtitle?, actions?: ReactNode, children }` read-only (≠ `EditorSectionCard`). Reemplaza el `Card`+`<h2>` ad-hoc.
   - **`<DescriptionList>`** — `{ items: { term, value }[] , layout?: 'inline'|'stacked' }` para metadata + datos técnicos (con `CopyableId` en los IDs).
   - **`<DangerZone>`** — `{ title, children }` sección borde rojo para destructivas.
   - **Layout `main+aside`** — helper CSS (`grid 2fr/1fr`, colapsa <900px; si MAIN vacío, ASIDE full-width). Puede ser una clase del `service-detail.module.css` o un `<SplitLayout>` DS si se reutiliza.
2. **Recablear el overview** (Resumen) a `main+aside`: MAIN = Recursos (medidores `<Meter>`) · SSL · Aplicaciones; ASIDE = Facturación · (admin) Datos técnicos · (cliente) Ayuda + placeholder.
3. **`MetricsBar` → medidores `<Meter>`** (sustituye las barras improvisadas).
4. **Gestión**: separar `AdminServiceOperationsCard` en Operaciones seguras (Cambiar plan/Recalcular) + **`<DangerZone>`** (Suspender/Cancelar). Reenviar notif como card.
5. **Unificar cromo** de todas las secciones en `<SectionCard>` + `<DescriptionList>`.

**Orden de implementación sugerido:** (a) primitivas DS (`Meter`/`SectionCard`/`DescriptionList`/`DangerZone`) + tests si el DS los tuviera (no hay runner frontend → tsc+lint+build) → (b) layout main+aside → (c) `<Meter>` en Recursos → (d) recablear Resumen a main+aside → (e) split Operaciones/DangerZone en Gestión → (f) unificar `<SectionCard>` → (g) UI_SPEC §5.14 ya está; ajustar si diverge → (h) `ci:frontend:full` + boot smoke + smoke real Yasmin.

**Decisiones congeladas** (NO re-abrir sin Amendment): los 4 componentes + main+aside (Yasmin 2026-05-20); recursos como medidores; overview main+aside; DangerZone aislada; agrupación por dominio funcional; provisioner-agnóstico. Wireframes por rol×estado en UI_SPEC §5.14.

**ADR amendments esperados:** ninguno (UI_SPEC + DESIGN_SYSTEM son el deliverable; las primitivas DS no tocan contratos backend).

**Frase canónica de continuación** (Yasmin pega en chat nuevo):
> *"Implementa F.12.5 (densidad profesional) leyendo el dossier §A.11.10.9.2 Amendment V + §A.11.10.9.3 (handoff) + `UI_SPEC.md §5.14`. Construye las 4 primitivas DS (`<Meter>`, `<SectionCard>`, `<DescriptionList>`, `<DangerZone>`) + layout main+aside, recablea el overview de service/[id] (recursos=medidores, main+aside facturación/datos/soporte, Gestión con zona de peligro aislada). Frozen 2026-05-20: no re-abrir las decisiones de IA; cualquier divergencia = Amendment. Reutiliza la lógica de acciones/operaciones/banners de F.12.4 (no reescribir Server Actions). Valida tsc+lint:check+build + boot smoke. Sé riguroso y profesional."*

#### A.11.10.9.4. F.12.5 — implementación (Amendment VI, 2026-05-20)

**Estado:** **implementada** sobre la rama `sprint15c-ii-fase-f12-canonical-layout`. Cero re-apertura de las decisiones de IA frozen (Amendment V): las 4 primitivas + main+aside + recursos=medidores + DangerZone aislada + provisioner-agnóstico se materializan tal cual. Las divergencias abajo son mecanismos de implementación o conductas heredadas de F.12.4 — documentadas aquí (L18 frozen), no desvíos de diseño.

**Artefactos producidos:**
- **4 primitivas DS** (`frontend/app/components/ui/`, tokens only, SC-compatible, + barrel + `DESIGN_SYSTEM.md`): `<Meter>` (medidor usado/total + % + coloreo por umbral; cálculo robusto total→percent→sin barra), `<SectionCard>` (cromo read-only título+subtítulo+slot acciones+cuerpo; ≠ `EditorSectionCard`), `<DescriptionList>` (`stacked` rejilla término|valor con `display:contents` + `inline` con `·`), `<DangerZone>` (borde+tinte `--danger`).
- **Layout main+aside**: clases `.summaryGrid` (2fr/1fr) / `.summaryMain` / `.summaryAside` / `.summarySingle` en `service-detail.module.css`; colapsa a 1 col <900px; si una columna queda vacía → la otra full-width (`.summarySingle`). Solo aplica al grupo `summary`; `management`/`activity` siguen en grid con soporte `fullWidth`.
- **`MetricsBar` → "Recursos"** con `<Meter>` por fila (i18n + tokens; migra los copys hardcodeados; preserva refresh-por-rol F.C y coloreo de cuota F.8 — solo disco recibe `thresholdPct`+advisory).
- **Cromo unificado** en `<SectionCard>`: `SslStatusCard`, `BillingCrossLinkCard`, `AppShortcutsCard` (badge/acciones → slot `actions`); `AdminServiceDataCard` → "Datos técnicos" con `<DescriptionList>`+`<CopyableId>`; audit/placeholder/ayuda cliente → `<SectionCard>`.
- **Gestión split**: `AdminServiceOperationsCard` se reduce a operaciones seguras (Cambiar plan / Recalcular) en `<SectionCard>`; nuevo **`ServiceDangerZoneCard`** (`<DangerZone>` full-width al fondo) con Suspender/Reanudar/Cancelar — reutiliza los modales de F.12.4 (no reescribe Server Actions ni modales).
- **Nueva card cliente "¿Necesitas ayuda?"** (aside, CTA a `/dashboard/support`); header metadata → `<DescriptionList layout="inline">`.

**Amendment VI — divergencias del freeze (todas en servicio del diseño congelado):**
1. **Campos `column?: 'main'|'aside'` + `fullWidth?: boolean` en `SectionDescriptor`** (`service-detail-context.ts`). El freeze (R3) no los listaba; son el **mecanismo** que materializa el main+aside (Amendment V decisión 2) y la DangerZone al fondo (decisión 3). `column` solo se lee en el grupo `summary`; `fullWidth` fuera de él. Heredable a plugins futuros que registren secciones en el overview.
2. **`AdminServiceDataCard` + `AdminServiceOperationsCard` se reescriben** pese al boundary "admin-only conserva internals". Razón: el handoff §A.11.10.9.3 los lista explícitamente (puntos 2/4/5: Datos técnicos con `<DescriptionList>`, split Operaciones/DangerZone, unificar cromo). El handoff (más específico) prevalece sobre el boundary general. **Copy de etiquetas admin se mantiene literal ES** (no se migra a i18n) — esa migración sí es housekeeping aparte (boundary respetado en la capa copy). De paso se corrige el bug `--brand-600` (token inexistente) en sus enlaces → `--brand`.
3. **"Reanudar servicio" vive en la `<DangerZone>`** (decisión Amendment V "Admin suspendido → Reanudar en DangerZone + Cancelar") pero con `<Button>` variante por defecto (no `danger`) — es recuperación, no destrucción; la zona roja agrupa transiciones consecuentes, no implica que todas sean rojas.
4. **`resend-notification-card` permanece visible en estado terminal** (`shouldRender: () => true`, heredado F.12.4 — reenviar la notificación de cancelación es legítimo). Por eso "Gestión" puede seguir apareciendo con solo Resend cuando el servicio está cancelado, en vez de ocultarse por completo como sugería la anatomía frozen. Preserva la lógica de F.12.4 ("reutiliza la lógica de operaciones de F.12.4").
5. **Cards cliente always-on (`client-help-card` gated `!isTerminal`; `client-dev-custom-placeholder` siempre)** aparecen también en servicios mínimos (`internal`/`manual`), de modo que el ASIDE mínimo cliente es Facturación + Ayuda + Desarrollo, no "solo Facturación" como ilustraba la anatomía. La robustez clave (MAIN vacío → 1 columna elegante) se respeta; las cards añadidas son útiles en cualquier servicio y heredan la conducta F.12.4 del placeholder.

**Cero ADR amendments** (UI_SPEC + DESIGN_SYSTEM son el deliverable; las primitivas no tocan contratos backend — confirmado).

**Validación F.12.5:** `pnpm --dir frontend typecheck` + `lint:check` (`--max-warnings=0`) + `next build` (32 páginas) verdes. Pendiente: boot smoke del stack + smoke real Yasmin (cliente activo · suspendido · admin drift · terminal · servicio mínimo + verificar colapso main→aside y la DangerZone). Commit: `feat(sprint-15c-ii): F.12.5 — densidad profesional (4 primitivas DS + main+aside + DangerZone)`.

#### A.11.10.9.5. F.12.5 — re-evaluación profesional (Amendment VII, 2026-05-20)

**Origen:** tras el primer corte de F.12.5, Yasmin revisó la página y pidió mejorar 7 puntos de IA/UX. Re-valoración con preguntas previas (4 decisiones resueltas con previews); Yasmin eligió en todas la opción recomendada. No reabre la doctrina DS (las 4 primitivas siguen); reorganiza superficie de acciones + tabs + densidad. Amendment VII (L18 frozen).

**Decisiones frozen (Yasmin 2026-05-20) + implementación:**

1. **Salud del plugin reubicada** (punto 1). El `<ProviderHealthBadge>` deja la zona de banners y pasa a una **fila de la card "Datos técnicos"** ("Salud del plugin: [badge] · Ver detalle →"). Es metadata operativa, no una alerta. `ProviderHealthBadge` se reescribe a contenido inline (sin el prefijo "Salud del proveedor:", que ahora lo da el término de la fila) + corrige `--brand-600`→`--brand`. Se elimina el descriptor `admin-provider-health-badge`.
2. **Recalcular junto a Refrescar** (punto 2). Nuevo `<MetricsRecalculateButton>` (`_shared/`) en el slot de acciones de la card **Recursos**, al lado del `↻ Refrescar`, **cada uno con su `<HelpTip>` ⓘ**. Aclaración doctrinal (Yasmin lo tenía casi): **Refrescar** = re-lee del proveedor los últimos valores ya calculados (rápido); **Recalcular** = pide al proveedor que **recompute** disco/BW desde cero en su lado (lento). i18n para ambos textos + ⓘ. `canRecalculate` por presencia de la action `recalculate_provider_metrics` (capability-driven).
3. **Menú "Más acciones" profesional + tab "Gestión" eliminada** (punto 3). Aclaración: NO se crea un "Select" (ese DS es para forms); se **mejora el `<Dropdown>`** con `description` por ítem (línea gris de contexto — patrón Stripe/Linear; decisión Yasmin sobre "ⓘ por ítem") + trigger con chevron. Todas las operaciones admin (cambiar plan · reenviar notif · suspender/reanudar · cancelar) + las quick-actions del plugin viven ahora en **un solo menú** (Regla D5 "destructivas en menú contextual"). Arquitectura: `<ServiceActionsMenu>` (`_shared/`, genérico: quick-actions + slots `extraItems`/`extraModals`) + `<AdminServiceActionsMenu>` (admin: provee las operaciones + posee el estado de los modales; reutiliza los modales de F.12.4 + `<ResendNotificationModal>` extraído de la card). Se inyecta en el header vía `headerActionsMenu` (page → layout → `ServiceHeaderCard` → cluster). **Confirmado a Yasmin: la tab "Gestión" desaparece** (card Operaciones + DangerZone + card Reenviar eliminadas).
4. **Tab "Actividad" → tab "Notas"** (punto 4). El grupo `activity` se divide; `service-notes-card` pasa a `group: 'notes'` (admin-only → el cliente no ve este tab).
5. **Tab "Auditoría" dedicado** (punto 5). Nuevo `<ServiceAuditTabSection>` (async SC, `group: 'audit'`): **preview** de las últimas ~15 entradas (reusa `<ServiceAuditTimeline>`) + enlace "Ver historial completo →" a la página dedicada (`/services/[id]/audit`, que se conserva con filtros/paginación). Patrón Stripe "Events". Coste: 1 fetch eager por carga (fail-soft con try/catch).
6. **Menos badges** (punto 6). Se elimina la fila "Estado" duplicada de "Datos técnicos" (el estado ya vive en el badge del header — Regla D4). Resultado: 1 badge de estado primario en el header; SSL/factura en su card (de su recurso); salud del plugin reubicada (punto 1).
7. **Servicios mínimos enriquecidos** (punto 7). Nueva `<ServiceOverviewCardSection>` "Información del servicio" en el MAIN, que **aparece SOLO cuando no hay métricas/SSL/apps** (servicios `internal`/`manual`/`support_inside`): estado (badge + narrativa por estado×rol) + datos clave (plan · alta · renovación). Da contenido al MAIN → el overview tiene 2 columnas también en servicios simples. Capability-agnóstico (cero `provisioner_slug`).

**Estructura de tabs resultante:** Cliente → **Resumen · Auditoría**. Admin → **Resumen · Notas · Auditoría**.

**Notas de implementación:**
- `SectionGroup`: `management`/`activity` → `notes`/`audit`. `TAB_ORDER` actualizado. El campo `fullWidth` queda sin uso actual (la DangerZone se fue) pero se conserva para futuros tabs.
- **Componentes eliminados** (consolidados): `AdminServiceOperationsCard`, `ServiceDangerZoneCard`, `ResendNotificationCard` (+ su CSS). La primitiva DS **`<DangerZone>` se conserva** en `components/ui/` (documentada como disponible) aunque su único consumidor (la zona de Gestión) desapareció — patrón canónico reutilizable para futuras settings pages.
- **Reutilización**: los modales `ChangePackageModal`/`SuspendServiceModal`/`CancelServiceModal` se mantienen intactos (solo cambia su parent). `ResendNotificationModal` extrae el modal de la antigua card sin cambios funcionales (whitelist V1 + rate-limit F.11.2 conservados).

**Cero ADR amendments** (UI_SPEC + DESIGN_SYSTEM son el deliverable). **Validación:** `pnpm run ci:frontend:full` (typecheck + `lint:check --max-warnings=0` + build) verde. Pendiente: smoke real Yasmin (cliente activo · mínimo support_inside · admin drift · suspendido · terminal + verificar el menú consolidado, los tabs Notas/Auditoría y la card Información). Commit: `feat(sprint-15c-ii): F.12.5 Amendment VII — menú de acciones unificado + tabs Notas/Auditoría + densidad`.

#### A.11.10.9.6. F.12.5 — fixes post-smoke (Amendment VIII, 2026-05-20)

**Origen:** smoke de Yasmin tras Amendment VII detectó (a) un error de hidratación `<button>` anidado y (b) el layout incoherente de servicios cancelados/suspendidos. Fixes:

1. **Bug `<button>` dentro de `<button>` (hidratación).** El `<Dropdown>` envolvía SIEMPRE el `trigger` custom en su propio `<button>`; al pasarle un DS `<Button>` (menú "Más acciones") salían botones anidados (HTML inválido). Fix: nueva prop **`triggerAsChild`** en `<Dropdown>` — cuando es `true` y el trigger es un elemento válido, se le **inyecta `onClick` + aria vía `cloneElement`** en lugar de envolverlo (patrón Radix asChild). `ServiceActionsMenu` la usa. El modo por defecto (envolver) se conserva → `Topbar` (trigger = `<div>` avatar) intacto. Heredable a cualquier menú con trigger interactivo.
2. **Servicio cancelado/suspendido: layout de 1 columna → 2 columnas.** En terminal, las cards rich (métricas/SSL/apps) están gateadas `!isTerminal` → MAIN vacío → el overview caía a 1 columna. Fix: el `shouldRender` de la card **"Información del servicio"** pasa a `isTerminal || !hasRichMain` → llena el MAIN en cancelado/terminado (y en suspendido mínimo) garantizando 2 columnas. En terminal la card omite la narrativa (la da el banner) y muestra hechos: plan · alta · **fecha de cancelación**.
3. **Coherencia "Renueva/Próxima renovación" en cancelado.** Un servicio cancelado NO renueva; mostrar fecha de renovación era incoherente. Fix en 3 sitios, gateados por `isTerminal`: (a) metadata del **header** oculta "Renueva"; (b) card **"Información"** oculta la fila Renovación (y muestra "Cancelado" en su lugar); (c) **`BillingCrossLinkCard`** oculta "Próxima renovación" (conserva la última factura como histórico; nueva prop `isTerminal`). Suspendido conserva la renovación (puede reactivarse — no es incoherente).
4. **Limpieza menor:** el placeholder "Desarrollo a medida (Sprint 22)" se gatea `!isTerminal` (sin teaser en un servicio cancelado).

**Segunda tanda post-smoke (mismos commit/Amendment):**
5. **Scrollbar vertical espurio en la barra de tabs.** `.tabBar` (DS `<DetailPage>`) tenía `overflow-x: auto`, que por spec CSS promueve `overflow-y` a `auto`; junto al `margin-bottom: -1px` de las pestañas generaba un scrollbar vertical a la derecha. Fix: `overflow-y: hidden` (+ `scrollbar-width: thin` para el scroll horizontal real con muchos tabs). DS-wide (beneficia a todas las detail pages).
6. **Banner sin margen en cancelado/suspendido.** `.bannersZone` no tenía `margin-bottom` → el banner quedaba pegado a las cards de la tab. Fix: `margin-bottom: var(--space-6)` (solo aplica cuando hay banners; sin banners el div no se renderiza).
7. **CTA del tab "Notas" homogéneo con "Auditoría".** `ServiceNotesCard` migrado a `<SectionCard>`; el CTA "Ver historial completo del cliente →" pasa al **slot de acciones** (top-right) con el **mismo css** (`.link` = réplica de `ctaText`) que el CTA "Ver historial completo" del tab Auditoría. Corrige de paso los tokens inexistentes `--brand-600`/`--border-default`/`--surface-elevated` del componente (enlaces/bordes que no pintaban).
8. **Tab "Auditoría" cliente vacío pese a haber historial (endpoint ≠ ruta).** `ServiceAuditTabSection` fetchaba `${base}/audit` con `base = /dashboard/services/:id` (cliente) — eso es la **ruta de Next**, no el **endpoint del API**. El backend cliente es `/services/:id/audit` (sin `/dashboard`); el fetch 404 → fail-soft → "Sin eventos". El admin no lo sufría porque su ruta y su endpoint coinciden (`/admin/services/:id/audit`). Fix: separar `apiPath` (admin `/admin/services/:id/audit` · cliente `/services/:id/audit`) del `fullHref` del enlace (admin `/admin/...` · cliente `/dashboard/...`). El enlace "Ver historial completo" funcionaba porque navega a la ruta de Next correcta — de ahí la incoherencia "preview vacío / página llena".

**Validación:** `pnpm run ci:frontend:full` verde (las tres tandas). Pendiente smoke de confirmación (cancelado/suspendido cliente+admin · menú ⋯ sin error de hidratación · barra de tabs sin scrollbar · banner con margen · CTA de notas alineado con auditoría). Commit: `fix(sprint-15c-ii): F.12.5 Amendment VIII — Dropdown asChild + layout cancelado/suspendido + coherencia renovación + scrollbar tabs + margen banner + CTA notas`.

##### Estado F.12 — cerrada y mergeada (2026-05-20)

F.12 completa (toda la fase: F.12.1 registry declarativo → F.12.5 densidad profesional, **Amendments I–VIII**) **mergeada a `master`** vía PR [#94](https://github.com/yasmindanailov/dashboard/pull/94) squash-merge `c381e68`. **Bypass §6 — 15ª aplicación**: (1) motivo externo (GitHub Actions billing-bloqueada; jobs fallan a ~4s sin arrancar — pendiente de pago, decisión de negocio), (2) `pnpm run ci:check:full` verde local [backend **55 suites · 798 passed + 6 skipped** sin cambios — F.12 es frontend-only — + frontend `tsc --noEmit` + `lint:check --max-warnings=0` + `next build` 32 páginas] + smoke visual Yasmin "todo ok", (3) doc formal en el cuerpo del PR. Rama `sprint15c-ii-fase-f12-canonical-layout` eliminada (local + remota); post-merge doc-sync vía rama `sprint15c-ii-fase-f12-postmerge-docsync` (este cambio + `current.md`). **Cero ADR amendments** (ADR-077/079/080/082/083 intactos — UI_SPEC §5.14 + `DESIGN_SYSTEM.md` son el deliverable). **Con esto la Fase F (F.1→F.12) queda COMPLETA**; resta únicamente **Fase G** (abajo) para cerrar el Sprint 15C.II y **desbloquear Sprint 15D RC**.

> Deuda de proceso (heredada): 15 aplicaciones del bypass §6 por el billing de GitHub Actions. Conviene que el desbloqueo tenga **dueño + fecha** y no se vuelva permanente.

### A.11.10.10. Fase G — Cierre Sprint 15C.II

**Tema:** DoD del sprint completo — tests críticos, E2E, smoke real, retrospectiva, desbloqueo de Sprint 15D RC.

- **G.1 — Tests críticos faltantes.** Las 8 áreas del audit técnico Fase A (§A.2 coverage gaps) que sigan sin cubrir tras F.1-F.12 — típicamente: advisory lock concurrente real Postgres (`EnhanceCustomersService` 3-step), CircuitBreaker E2E con Enhance, SSO impersonation E2E (audit GDPR), AdminOnly enforcement E2E con bypass curl real, encryption key rotation, DNS edge cases (TTL bounds, conflicto CNAME), `change_package` metadata rollback en fallo, threshold race condition en reconciliación concurrente. Más: tests de F.4 (reconciliación de status, ambas direcciones), F.5 (billing-unify), F.6 (`ClientNote` los 4 caminos + migración), F.7 (SSL card states), F.8 (alertas de cuota sin spam), F.9 (`reconcileOne`), **F.10 (`AppPresence` enumeración + `open_app_admin` dispatch WP-con-default / WP-sin-default / Joomla / kind-desconocido fallback + audit per-app `metadata.app_id`)**, F.11.
- **G.2 — E2E spec extension.** Ampliar el spec E2E (`sprint-15c-enhance-flow.spec.ts` o el que corresponda) cubriendo los flujos de Fases E + F.1-F.12: suspender→reanudar (incl. el desync), banner de suspensión cliente, nota en el modal → `/admin/clients/[id]` → "Notas", SSL card, aviso de cuota, reconcile per-servicio, deep-links curados. Label `ready-for-e2e` en el PR.
- **G.3 — Smoke real Yasmin** (contra mock + Enhance live si aplica) — patrón Fases C/D/E. Los bugs que salgan se arreglan en G (o en una G.x).
- **G.4 — Retrospectiva** + lecciones heredables nuevas (L19+...) + **mover el dossier** completo a `docs/60-roadmap/completed/sprint-15c-ii-hardening-enhance.md` con header retrospectiva (resumen ejecutivo + métricas + lecciones + commit refs), preservando este dossier original como anexo de trazabilidad (patrón canónico Sprint 15C — ver `completed/sprint-15c-plugin-enhance-cp.md`).
- **G.5 — Doc-sync de cierre del sprint.** `current.md` (Sprint 15C.II ✅ CERRADO) + `backlog.md` (`DC.44`/`DC.45` → cerrados; cualquier nuevo apuntado de los smoke de G) + `MEMORY.md`/`project-state.md` (15C.II cerrado; **Sprint 15D RC DESBLOQUEADO** — cola P2.4 activa).
- **DoD del sprint 15C.II:** todos los DoD de fase (A→F.12) ✓ + `pnpm ci:check:full` verde + `pnpm ci:e2e` verde + smoke real OK + retrospectiva escrita + dossier en `completed/` + Sprint 15D RC desbloqueado.

#### A.11.10.10.1. Matriz de tests G.1 — FROZEN 2026-05-21

> **Freeze doc-only (G.1.0).** Congela el alcance de G.1 antes de codear (patrón canónico cierre sprint). Decisiones Yasmin 2026-05-21: (1) **harness híbrido infra-real** para los tests que dependen de concurrencia/estado real (la lección §A.2 es que los mocks dieron verde mientras el `$queryRaw` real falló — repetirlo con mocks no aporta); (2) **arranque freeze doc-only + PRs pequeños**.

**Baseline verificado 2026-05-21** (pre-G): `pnpm --dir backend test` → **55 suites · 798 passed + 6 skipped** (exit 0), coincide con doc post-F.12. Frontend `tsc`+`eslint`+`next build` verdes (sin cambios desde F.12). Cualquier spec nuevo de G.1 se suma a este baseline sin regresión.

**Auditoría de cobertura reconciliada** (2 agentes Explore + verificación directa contra código). Resultado: de las 8 áreas §A.2 + las fases F.4–F.11, los gaps reales son menos de lo que sugería el audit superficial.

- **Falsos gaps — YA cubiertos (verificado, NO requieren trabajo):**
  - F.9 `reconcileServiceAsAdmin` → cubierto en `provisioning.service.spec.ts` (19 ocurrencias: NotFound + shortcircuit terminal + cooldown 429 vs coalesced + happy path + R3 condicional).
  - F.10 `executeAction('open_app_admin')` → cubierto en `enhance.plugin.spec.ts` (20 ocurrencias: WP-con-default / WP-sin-default / Joomla / appId inexistente / payload sin appId).
  - F.4 (status suspensión + desync ambas direcciones), F.5 (billing-suspend-unify DC.44), F.7 (SSL card states), F.8 (anti-spam edge-trigger en unit), F.11 (`derivePluginHealth` + resend rate-limiting 3-tupla + cross-link billing) → **COMPLETAS**.

- **Gaps reales** (8 entradas):

| # | Área §A.2 / Fase | Implementación clave | Cobertura hoy | Gap concreto + assert objetivo | Harness | PR | Prioridad |
|---|---|---|---|---|---|---|---|
| 1 | §A.2-1 Advisory lock concurrente | `enhance-customers.service.ts:115` (`tx.$executeRaw\`SELECT pg_advisory_xact_lock(...)\``) | UNIT-MOCK — `enhance-customers.service.spec.ts:305` solo espía `$executeRaw` y asserta que el SQL contiene `pg_advisory_xact_lock` | 2 `ensureCustomer()` concurrentes para el MISMO `user_id` contra Postgres real → **una sola fila `enhance_customers`**, sin duplicado, sin deadlock (la 2ª espera el lock y lee el mapping ya insertado) | **Integración** `.e2e-spec.ts` (Postgres real) | G.1.a | 🔴 alta (es exactamente el bug `$queryRaw` que pasó mocks y falló en real) |
| 8 | §A.2-8 Threshold race | `quota-threshold-detector.service.ts:128` (`isolationLevel: Serializable`) | UNIT-MOCK — `quota-threshold-detector.service.spec.ts:256` solo asserta que `$transaction` se invocó con `Serializable` | 2 detectores concurrentes (`Promise.all`) sobre el mismo service que cruza el umbral → **exactamente 1 fila `crossed_up` + 1 evento emitido** (dedupe Serializable real) | **Integración** `.e2e-spec.ts` (Postgres real) | G.1.a | 🔴 alta (código F.8 nuevo, sin prueba real de la garantía Serializable) |
| 5 | §A.2-5 change_package metadata rollback | `enhance.plugin.ts` `actionChangePackage` | UNIT-MOCK — solo happy path (PATCH OK + metadata actualizado) | PATCH a Enhance OK pero `service.update()` falla → la acción retorna error y `metadata.enhance_plan_id` NO queda en estado inconsistente que dispare `plan_divergence` false-positive eterno en el cron L3 | **Integración** `.e2e-spec.ts` (mock HTTP Enhance OK + Prisma `update` forzado a fallar, Postgres real) | G.1.b | 🟠 media-alta (coherencia billing↔provisioning) |
| 2 | §A.2-2 Encryption key rotation | `secret-vault.service.ts` (AES-256-GCM + `key_version`) | UNIT-MOCK — round-trip + detección `key_version` mismatch (contrato), sin escenario operativo | Cifrar secreto con clave A → persistir → instanciar `SecretVaultService` con clave B (rotada) → descifrado falla **limpiamente** (error semántico, sin crash del boot, sin exponer el ciphertext) | **Integración** `.e2e-spec.ts` (Postgres real para el secret persistido) | G.1.b | 🟠 media-alta |
| 3 | §A.2-3 DNS edge cases | `dns-authority-resolver.ts` + `DnsRecordForm`/DTO TTL | UNIT parcial — happy path strings/objects; faltan bordes | TTL `0` / `-1` / `99999999` (bounds), `kind` inválido fuera del enum, `metadata.nameservers` con shape roto (null/number/nested sin `host`) → resolver/validator no crashea, error/normalización defensiva | **Unit** (extender `dns-authority-resolver.spec.ts` + DTO validation spec) | G.1.c | 🟡 media |
| 7u | §A.2-7 AdminOnlyGuard (unit) | `core/common/guards/admin-only.guard.ts` | NINGUNO directo (solo el wrapper `action_admin_only_violation` lo cubre indirecto) | `canActivate`: role `client` → `ForbiddenException`; role staff/superadmin → `true`; `req.user` undefined → `ForbiddenException` | **Unit** (nuevo `admin-only.guard.spec.ts`) | G.1.c | 🟡 media |
| F.6 | F.6 ClientNote unit | `modules/clients/client-notes.service.ts` `createFromServiceLifecycleAction` | Solo vía integración de los callers (suspend/unsuspend/deprovision/reactivate en `provisioning.service.spec.ts`) — sin spec aislado del servicio | Unit del servicio: `NoteCategory` correcta por acción, composición del `body` (humanización), `triggered_by_action` esperado, `tx?` opcional respetado, metadata enrich | **Unit** (nuevo `client-notes.service.spec.ts`) | G.1.c | 🟡 media |
| 4 | §A.2-4 CircuitBreaker recovery | `core/provisioning/circuit-breaker.ts` | UNIT completo (máquina de estados closed→open→half-open→closed) | Lo que falta es **timing real + wiring** (breaker abre durante `executeAction` Enhance → fast-fail 503 + recovery half-open tras `resetTimeoutMs` + evento/listener) — escapa al unit, es flujo | **E2E Playwright** → **se pliega a G.2** | G.2 | 🟢 (no G.1) |
| 6 | §A.2-6 SSO impersonation flow | `audit-admin-sso-impersonation.listener.ts` | UNIT-MOCK (listener spy) | Flujo completo admin SSO → evento → fila `audit_access_log` **persistida** → cliente la ve en portal GDPR `/dashboard/transparency` | **E2E Playwright** → **se pliega a G.2** | G.2 | 🟢 (no G.1) |
| 7e | §A.2-7 AdminOnly bypass (E2E) | `admin-only.guard.ts` + wrapper | Parcial (test 5 de `sprint-15c-enhance-flow.spec.ts` cubre change_package) | Cliente hace `POST /admin/...` real → 403 + emit `service.action_admin_only_violation` + audit en wire | **E2E Playwright** → **se pliega a G.2** | G.2 | 🟢 (no G.1) |

**Decisión de slicing (PRs pequeños, 1 rama/fase):**
- **G.1.0** (esta rama `sprint15c-ii-fase-g1-freeze`) — freeze doc-only de esta matriz. Sin cambios de código.
- **G.1.a** — establece el harness de integración backend (`backend/test/**/*.e2e-spec.ts` que arranca `AppModule` contra `docker/docker-compose.dev.yml` Postgres+Redis reales) + **Área 1** (advisory lock concurrente) + **Área 8** (threshold race Serializable). Mismo harness y misma técnica (`Promise.all` de operaciones concurrentes con conexiones separadas) → un PR coherente.
- **G.1.b** — **Área 5** (change_package rollback) + **Área 2** (key rotation). Integración sin concurrencia (mock del borde HTTP/clave + fallo forzado de Prisma + Postgres real).
- **G.1.c** — **Área 3** (DNS edges, extender spec) + **Área 7u** (AdminOnlyGuard unit) + **F.6** (client-notes.service unit). Wins rápidos sobre el runner Jest unit existente.
- **Áreas 4 / 6 / 7e** → **G.2** (extensión del spec Playwright `sprint-15c-enhance-flow.spec.ts`), que ya levanta backend+frontend+MockEnhance vía `webServer` → evita duplicar el harness E2E en G.1.

**Harness de integración G.1 (canónico, heredable a 15D RC):** los `.e2e-spec.ts` arrancan el módulo Nest real (`Test.createTestingModule({ imports: [AppModule] })` → `app.init()`) que se conecta a Postgres+Redis de `docker-compose.dev.yml` (mismo `DATABASE_URL` 127.0.0.1 — Regla R-IPv6). Cleanup por test con `TRUNCATE … RESTART IDENTITY CASCADE` sobre las tablas tocadas (patrón `tests/e2e/fixtures/db.ts`). La concurrencia real se orquesta dentro del test con `Promise.all([...])` sobre llamadas que abren transacciones independientes. Ejecutables con `pnpm --dir backend test:e2e` (config `backend/test/jest-e2e.json`). Requisito operativo: `docker compose -f docker/docker-compose.dev.yml up -d postgres redis` antes de correr.

**DoD G.1:** specs nuevos de G.1.a/b/c verdes + `pnpm --dir backend test:e2e` verde (integración) + `pnpm ci:check:full` verde + **cero regresión** sobre el baseline 798+6 + esta matriz cerrada (áreas 4/6/7e trazadas a G.2). Las 8 áreas §A.2 quedan cubiertas entre G.1 (1,2,3,5,7u,8) y G.2 (4,6,7e).

### A.11.11. Sesiones origen del re-plan F.4→G

- 2026-05-12 (sesión 2 — post-merge de F.3 #67/#68; el testing de F.1 destapó el agujero de robustez del status de suspensión; decisión Yasmin: traer los apuntados de backlog [`DC.44`, `DC.45`, deep-links, notas, mini-badge, reenviar notif, cross-link billing] al sprint; auditoría "qué falta a estándar alto en el plugin Enhance + módulo de servicios cliente/admin"; refinamiento posterior — (a) integrar las acciones críticas de servicio con el sistema transversal `ClientNote` [no un `service_notes` table propio], (b) fase de layout canónico al final, (c) "más fases, más pequeñas" → este §A.11.10 reescrito con **10 fases ordenadas por prioridad: F.4 robustez del status de suspensión · F.5 `DC.44` billing-suspend-unify · F.6 notas `ClientNote` · F.7 SSL status · F.8 alertas de cuota · F.9 reconcile per-servicio `DC.45` · F.10 deep-links curados · F.11 conveniencias operativas · F.12 layout canónico · G cierre**).
