# Sprint 15C.II — Plugin Enhance Hardening · Dossier de pre-sprint

> **Tipo:** Pre-sprint research dossier (no es plan de sprint activo).
> **Estado:** ⏸ **En cola P2.3.b — bloqueante para Sprint 15D RC.** Se activa con la próxima conversación.
> **Origen:** Smoke real Yasmin contra mock 2026-05-10 durante cierre Fase 15C.I. Reveló gaps sistémicos, decisiones doctrinales aún no tomadas, y violaciones del UI_SPEC §4.3 que el cierre formal Fase I solo abordó parcialmente.
> **Pre-condición técnica:** rama `sprint15c-fase-i-cierre-sprint` con fixes valiosos sin commit (decisión Yasmin pendiente: commit como Fase I parcial + abrir branch nuevo para hardening, o reset + abordar todo en un branch).
> **Doctrina canónica del usuario (literal 2026-05-10):** "Sobre las deudas pendientes en relación al plugin Enhance, hay que documentarlas, no se da un paso más, hasta que el plugin esté al 100% operativo con los features básicos y necesarios perfectos para producción."
>
> **Frase canónica de arranque (futuro):** *"Lee `docs/60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md` + `docs/60-roadmap/completed/sprint-15c-plugin-enhance-cp.md` + `docs/features/provisioning/admin-plugins-enhance.md` + `docs/UI_SPEC.md` §4.3. Vamos con Sprint 15C.II — Plugin Enhance Hardening (cierre real pre-producción). Crea rama `sprint15c-ii-enhance-hardening` desde master + lee este dossier completo antes de codear."*

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
- [`docs/10-decisions/adr-083-plugin-enhance-cp-specifics.md`](../10-decisions/adr-083-plugin-enhance-cp-specifics.md) — 35 decisiones Enhance specifics frozen + Amendments A1/A2/A3.
- **Sesión origen smoke real**: Yasmin ↔ agent 2026-05-10 — 18 issues identificados + 4 decisiones doctrinales pendientes documentadas en este dossier.
