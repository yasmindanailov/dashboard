# Sprint 15C.II — Hardening Plugin Enhance CP ✅ (CERRADO 2026-05-21)

> **Estado:** ✅ **CERRADO** — Fases A→F.12 + G completas (G.1 tests críticos · G.2 extensión E2E · G.3 smoke real **validado por Yasmin** · G.4 retrospectiva · G.5 doc-sync de cierre).
> **Compromiso doctrinal Yasmin cumplido** (2026-05-10 literal): *"no se da un paso más hasta que el plugin esté al 100% operativo con los features básicos y necesarios perfectos para producción"* → **cumplido**. **Sprint 15D ResellerClub DESBLOQUEADO.**
> **Anexo de trazabilidad completo** (plan + cierre commit-by-commit por fase, lecciones L1–L23, ADR amendments, smokes): [`sprint-15c-ii-hardening-enhance-dossier.md`](../sprint-15c-ii-hardening-enhance-dossier.md) **§A.11** — preservado in-situ por estar referenciado desde 11 documentos (ADRs, UI_SPEC, backlog, contract, admin-plugins-enhance, local-ci-playbook).
> **Origen:** cierre parcial 15C.I (smoke real Yasmin 2026-05-10 → 18 issues UX + audit técnico 4 agentes Explore → **8 coverage gaps §A.2**) + re-plan F.4→G (sesión 2026-05-12, dossier §A.11.11).
> **ADRs/amendments nacidos:** ADR-077 Amendments **A4–A10** · ADR-079 Amendment **A5** · ADR-083 Amendments **A4–A10** · ADR-080/ADR-082 sin breaking. **Cero bump de `contractVersion`** — todo additivo capability-driven por presencia (molde A5/A6/A7/A8/A9).
> **Doc operativa diaria:** [`docs/features/provisioning/admin-plugins-enhance.md`](../../features/provisioning/admin-plugins-enhance.md).

---

## Resumen ejecutivo

Sub-sprint de hardening que llevó el plugin `enhance_cp` de **"90% operativo"** (cierre 15C.I) a **100% operativo a estándar profesional pre-producción**, cerrando los cabos UX/robustez/cobertura que un smoke real + un audit técnico de 4 agentes destaparon. El alcance se re-planificó a **12 fases de features (F.1→F.12) ordenadas por prioridad + una fase de cierre (G)**, "más fases, más pequeñas", 1 rama por fase.

Lo entregado por bloques:

- **F.4 — Robustez del status de suspensión**: override lógico provider↔local en `getInfoForUser` + flag `provider_state_desync` (banner drift en ambas direcciones).
- **F.5 — Billing-suspend-unify (`DC.44`)**: el cron de morosidad y el listener de reactivación-al-pagar pasan por el punto único `suspendAsAdmin`/`reactivateSuspendedServiceOnPayment`.
- **F.6 — Notas de lifecycle (`ClientNote`)**: integración de las transiciones de servicio con el sistema transversal de notas (`source_system='service'`), NO una tabla propia — 4 caminos (suspend/unsuspend/deprovision/reactivate) + reconcile (F.9).
- **F.7 — SSL status card** (`ServiceInfo.ssl?` capability-driven, ADR-077 A7) — cálculo server-side de estados (valid/expiring_soon/expired/none), umbral 14d.
- **F.8 — Alertas de cuota edge-triggered** (patrón Prometheus/AlertManager): un solo email al cruzar umbral, `service_quota_alerts` con tx `Serializable` anti-spam, MetricsBar ámbar/rojo con ARIA.
- **F.9 — Reconcile per-servicio (`DC.45`)**: `ProvisionerPlugin.reconcileOne?()` (ADR-077 A8) + endpoint `POST /admin/services/:id/reconcile` + CTA en `AdminDriftBanner`.
- **F.10 — App Management base** (ADR-077 A9 + ADR-083 A9): `ServiceInfo.apps?` + action canónica `open_app_admin` (WordPress SSO contractual + Joomla URL canónica) + audit per-app.
- **F.11 — Conveniencias operativas**: mini-badge salud del plugin (`derivePluginHealth`), reenviar notificación con whitelist + rate-limiting 3-tupla (Amendment II), cross-link Service↔billing.
- **F.12 — Layout canónico + densidad profesional** del detalle de servicio (registry declarativo de secciones + 4 primitivas DS nuevas + menú "Más acciones" único) — UI_SPEC §5.14 + DESIGN_SYSTEM.
- **G.1 — Tests críticos faltantes (§A.2)**: harness de integración nuevo `backend/test/integration/*.e2e-spec.ts` (Postgres real) → advisory lock concurrente (#1), threshold race Serializable (#8), key rotation (#2), change_package rollback (#5); + unit gaps DNS edges (#3), AdminOnlyGuard (#7u), client-notes (F.6). **Hardening de feature**: `change_package` fail-safe (ADR-083 A10).
- **G.2 — Extensión E2E**: spec REST+DB ampliado a 16 tests — SSO impersonation (#6) + AdminOnly bypass (#7e) + lifecycle (F.4/5/6) + reconcile (F.9) + SSL (F.7) + cuota (F.8); endpoint mock `POST /__test__/seed`.
- **G.3 — Smoke real validado** por Yasmin (2026-05-21) contra un fixture `enhance_cp` activo con refs reales — sin bugs.

Las **8 áreas §A.2** quedaron cubiertas entre G.1 (1,2,3,5,7u,8 + F.6) y G.2 (#6,#7e en E2E; #4 breaker unit-covered + smoke).

---

## Métricas finales

| Métrica | Valor |
|---|---|
| Fases | 12 features (F.1–F.12) + G cierre (G.1/G.2/G.3/G.4/G.5) |
| PRs master (squash) | ~F.1→F.12 (#57…#94, bypass §6) + **G.1 #97** + **G.2 #98** |
| Cobertura unit final | **58 suites · 852 passed + 6 skipped** (+54 vs cierre F.12 798+6; +359 vs base 15C.I 488+5) |
| Tests integración (nuevos) | **4 suites · 8** (`pnpm --dir backend test:e2e`, Postgres real) |
| Tests E2E (spec Enhance) | **16/16** (`sprint-15c-enhance-flow.spec.ts`, REST+DB) |
| ADR amendments | ADR-077 A4–A10 · ADR-079 A5 · ADR-083 A4–A10 (cero bump `contractVersion`) |
| Bypass policy §6 (CI billing-bloqueada) | **17 aplicaciones** (#57…#98) — deuda de proceso heredada (dueño/fecha pendiente) |
| Infra de test nueva (heredable 15D RC) | harness integración backend (`AppModule`/`PrismaService` vs docker-compose.dev) + endpoint mock `POST /__test__/seed` |
| Deudas resueltas | `DC.44` (billing-suspend-unify) + `DC.45` (reconcile per-servicio) |
| Deudas diferidas conscientes | `DC.46/47/48/49` + `DC.NEW-51..59` (incl. **DC.NEW-59** deep-links E2E, unit-covered) |

---

## Lecciones heredables (L13–L23)

Detalle completo en el dossier §A.10.3 / §A.11.5. Síntesis:

- **L13** — la UI ramifica por el **valor numérico** (p.ej. `pct`), NUNCA por matching de strings del proveedor (`statusReason`). Cálculo server-side.
- **L16** — `_shared/ + prop isAdmin` para componentes con variante cliente+admin; **NO universal**: componentes admin-only puros (ADR-070) viven en `_components/` admin. Decisión **por feature**, no por convención ciega.
- **L18** — toda mejora descubierta durante implementación que diverja del apuntado del dossier se materializa como **Amendment** del ADR frozen, no como desvío silencioso. (El ADR frozen gana sobre el apuntado del dossier — §A.11.5.)
- **L19** — las transiciones de lifecycle de un service + su `ClientNote` viven en la **misma `$transaction` Prisma**; plugin calls + eventos + cache invalidations quedan **fuera** (asimétricos: el provider call es idempotente por contrato; los listeners consumen estado ya commiteado).
- **L20 (G.1)** — **profundidad sobre superficie**: los unit-tests mockeados dan verde mientras el escenario real falla (el bug `$queryRaw` del advisory lock). Los gaps de **concurrencia/estado real** (advisory lock, Serializable race, rollback transaccional, key rotation) exigen un **harness de integración contra Postgres real** (`Promise.all` para concurrencia), no más mocks.
- **L21 (G.1)** — **mutación externa + sync local fail-safe**: cuando una action muta el proveedor (ground truth) y luego sincroniza un snapshot local, si la escritura local falla se lanza un **error semántico retriable** (idempotente) en vez de propagar el error crudo o compensar/revertir (la compensación añade otra llamada externa y no cubre crash del proceso). La divergencia transitoria la detecta el reconcile emit-only. (ADR-083 A10.)
- **L22 (G.2)** — el spec E2E asume un **mock con estado fresco** (contador de subscription, Maps de estado); un `MockEnhanceServer` arrancado manualmente y reusado por Playwright (`reuseExistingServer`) arrastra estado y rompe tests deterministas → arrancar el mock **fresco por corrida**.
- **L23 (G.2)** — seed de estado del mock en **runtime desde el proceso del spec** (que no comparte memoria con el mock) requiere un endpoint test-only dedicado (`POST /__test__/seed`); los tests integration in-process usan `state.*.set()` directo. Heredable a 15D RC.

---

## Commits / PRs de cierre (Fase G)

- **G.1** — PR [#97](https://github.com/yasmindanailov/dashboard/pull/97) squash `983adca` (5 commits: freeze `aa9c6bc` + advisory/threshold `25ede79` + key-rotation `6935c7c` + change_package fail-safe `053c581` + unit gaps `93a4185`).
- **G.2** — PR [#98](https://github.com/yasmindanailov/dashboard/pull/98) squash `d1f7e8b` (freeze/sync `d4234cb`/`1b6241a` + #6/#7e `5bcdc25` + lifecycle/reconcile `38d7839` + SSL/cuota + mock seed `0e7c1c1` + estado `a99e4b7`).
- **G.3** — smoke real validado (sin bugs); **G.4/G.5** — este PR de cierre.

---

## DoD del sprint 15C.II ✅

- [x] DoD de todas las fases A→F.12 ✓ + G.1/G.2 ✓
- [x] `pnpm ci:check:full` verde (852+6 unit + builds) — verificado en #97 y #98
- [x] `pnpm --dir backend test:e2e` verde (integración 4/8) + `playwright sprint-15c-enhance-flow` 16/16
- [x] Smoke real Yasmin OK (2026-05-21)
- [x] Retrospectiva escrita (este doc) + dossier preservado como anexo
- [x] **Sprint 15D RC DESBLOQUEADO** — cola P2 activa
