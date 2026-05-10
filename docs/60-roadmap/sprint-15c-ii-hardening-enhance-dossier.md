# Sprint 15C.II — Plugin Enhance Hardening · Dossier de pre-sprint

> **Tipo:** Pre-sprint research dossier (preservado como referencia histórica) + **Apéndice A** al final con decisiones doctrinales congeladas + gaps audit técnico + **§A.7 handoff completo Fase B → C** (próximo agente: leer §A.7 antes de codear).
> **Estado:** ▶ **ACTIVO 2026-05-10** — Fases A + B cerradas. Próxima sesión arranca **Fase C** (drift UX por rol). Pre-condición técnica resuelta: PR [#52](https://github.com/yasmindanailov/dashboard/pull/52) merged `ef7f488` + PR [#53](https://github.com/yasmindanailov/dashboard/pull/53) merged `714c94c` + PR [#54](https://github.com/yasmindanailov/dashboard/pull/54) Fase B pending merge.
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
| **C** drift UX + i18n + a11y | 1-1.5 sesión | A3 (drift UX discriminada por rol — `ServiceHeader` cliente generic + admin AlertBanner) + i18n completo (statusReason keys + reset_password/change_package descriptions) + **G6 PluginConfigForm useToast** + **G6b ChangePackageModal toast** + **G7 Modal a11y (focus trap + aria-labelledby)** |
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
