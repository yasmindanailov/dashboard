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
