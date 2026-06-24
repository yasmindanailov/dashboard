# Sprint 15D.II — Comercio de dominios avanzado (transfer-in + restore + buscador rico)

> **Estado:** 🟢 **v1 CÓDIGO-COMPLETO + integración E2E verde** — **cierre formal CONDICIONADO al smoke OT&E real** (Fase G, gate de IP whitelisteada — Yasmin). NO movido a `completed/` hasta que el smoke real valide los shapes contra ResellerClub live (convención del roadmap: no se archiva un sprint hasta cierre real).
> **Decisión de alcance Yasmin (2026-06-24):** **v1 = transfer-in + restore (RGP) + buscador rico**; **premium + child-NS + domain forwarding → v1.1**. Materializado y verde.
> **Trazabilidad por fase:** [`current.md` §Sprint 15D — tabla 15D.II](./current.md) (filas A · B0-bis · T1 · T2a · T2b · T2c.1 · T2c.2 · T2c.3 · T3 · R · S) — métricas y commits por fila, no se duplican aquí.
> **Origen:** sub-sprint por madurez de 15D core (decisión 2026-05-21): la doctrina (Fase 15D.A) congeló transfer + avanzado; la implementación se faseó tras cerrar 15D core (15D.G MERGED `f9fc424`, PR #116).
> **ADRs/amendments materializados (todos en 15D.II.A, doc-only):** ADR-084 **A2** (mecánica FSM + **cobro al completar A2.3** + **DOM-INV-6 A2.4** + **reintento A2.5** + **alcance v1 A2.6**) · ADR-077 **A14** (`ProvisionContext.transferAuthCode`) + `restoreDomain?()` additivo (A10) · ADR-081 **A7** (endpoints RC transfer/restore/suggest-v5, shapes CONSERVADORES hasta smoke G) · ADR-082 **A5** (zona en `transfer_completed` = modelo parking A4). **Cero bump de `contractVersion`** — todo additivo capability-driven por presencia.
> **Doc operativa diaria:** [`docs/features/provisioning/admin-plugins-resellerclub.md`](../features/provisioning/admin-plugins-resellerclub.md).

---

## Resumen ejecutivo

Sub-sprint que llevó el comercio de dominios de **registrar + renovar + gestionar** (15D core) a **transfer-in con FSM asíncrona + restore RGP + buscador rico**, sobre la doctrina ya congelada en 15D.A. Patrón de trabajo: una rama (`sprint15d-ii-fase-t2-transfer-core`), fases pequeñas encadenadas, mock-first.

Lo entregado por bloques:

- **T1 — Transporte transfer (cliente RC + mock).** Métodos `validateTransfer`/`transferDomain`/`resendTransferRfa`/`cancelTransfer` + `MockResellerClubServer` con **FSM simulable** (`/__test__/advance-transfer`, determinista, sin timers). Additivo, sin contrato.
- **T2a — Núcleo del plugin (`provisionTransferIn`).** FSM-init (`awaiting_auth`/`submitted`/reject) + **DOM-INV-6** (exactly-once de iniciación + adopción tras crash, espejo de DOM-INV-1) + `ProvisionContext.transferAuthCode` (R12, en memoria). Asíncrono: `followUp:[]`, servicio `pending`.
- **T2b — Motor reconcile.** El reconcile es el **motor de la FSM** (DH-INV-6, el registrar manda): `getTransferStatus` (lee `actionstatus` de `domains/details`) + `advanceTransfer` (`submitted → completed/failed/cancelled`, fail-soft si RC caído).
- **T2c.1 — Iniciación síncrona.** `ProvisioningOrchestratorService.initiateTransferIn` — auth-code **en memoria** (R12: NUNCA cola/`metadata`) → `provision(transfer_in)` → persiste `provider_reference`+`transfer_state`.
- **T2c.2 — Cobro al completar.** El reconcile emite `domain.transfer_completed` (Outbox, en la tx de la activación) + `GenerateInvoiceOnDomainTransferCompletedListener` genera la factura con `services.amount` (idempotente, R4). **Diverge de register**: el transfer cobra AL COMPLETAR, no upfront.
- **T2c.3 — Entrada (carrito único).** El checkout flagea `transfer_in` como **`deferBilling`** (service `pending`+`transfer_state='pending'`, excluido de la factura; `invoice` nullable si el carrito es solo-transfers) + `POST /domains/:id/transfer/submit-auth` (auth-code post-checkout, R12) + `POST /domains/transfer-quote` (precio R5) + frontend (pestaña *Transferir* en la Tienda + panel EPP en el detalle).
- **T3 — Cierre de la FSM.** Eventos `domain.transfer_initiated`/`domain.transfer_failed` vía **Outbox** (R8) + notifs (listener + 6 plantillas) + **zona DNS al completar** (ADR-082 A5: `switchToAeliumIfParked` si hay hosting hermano, capability-routed) + **reintento** (A2.5: `submit-auth` desde `failed`/`cancelled` reabre a `pending`, no re-cobra).
- **R — Restore (RGP), admin/soporte.** Contrato `restoreDomain?()` + `domains/restore` + `AdminDomainsService.restoreDomain` (price-check `op=restore` R5 + DOM-INV-3 ANTES de restaurar → `domain.restored` Outbox → factura del fee + notif + audit R3) + menú admin gated `recoveryHint='restore'`.
- **S — Buscador rico.** Congela `suggestDomainNames?()` + **suggest-names** (`/domains/v5/suggest-names`, enriquecido server-side R5, fail-soft) + **bulk** (`checkAvailabilityBulk` + `POST /domains/check-availability-bulk`) + frontend `DomainSearch` (1 nombre → resultados+sugerencias; varios → bloque).
- **Tooling dev (`chore`).** `MockResellerClubServer` offline como backend del plugin (`rc:mock` + `rc:mock-on`/`off` vía `config.__base_url_override`, DC.NEW-67) + seed dev de `domain_tld_pricing` con transfer+restore → permite probar el comercio de dominios **sin OT&E** (Cloudflare WAF 403 / IP no whitelisteada, DC.NEW-62/63).
- **Fase G (este cierre, parcial — desbloqueable):** **integración E2E del flujo transfer-in** contra Postgres real + mock (`backend/test/integration/resellerclub-transfer.e2e-spec.ts`, **6 tests**) + esta retrospectiva. Cubre el round-trip HTTP real (`domains/transfer` + lectura del `actionstatus` por el motor de la FSM) y el lazy-create REAL del registrante en `resellerclub_customers` que las specs unit mockean (hereda L20 de 15C.II).

**Smoke local Yasmin (2026-06-24):** availability + suggest + bulk + transfer-quote verificados en el dashboard contra el mock. ✅

---

## Métricas finales

| Métrica | Valor |
|---|---|
| Fases | A (doctrina) + B0-bis (research, híbrido→G) + T1 + T2a + T2b + T2c.1 + T2c.2 + T2c.3 + T3 + R + S + G (parcial) |
| PRs | **#117** (transfer-in backend A→T2c.2, squash `3499a59`) + rama `sprint15d-ii-fase-t2-transfer-core` (T2c.3+T3+R+S+tooling+G) → **PR #118** (pendiente de merge) |
| Cobertura unit final | **1196 passed + 12 skipped · 83 suites** (+71 vs baseline 15D.G `1125`) |
| Tests integración (nuevos, este cierre) | **1 suite · 6** — `backend/test/integration/resellerclub-transfer.e2e-spec.ts` (Postgres real + `MockResellerClubServer`, `pnpm --dir backend test:e2e`) |
| Boot smoke | **4/4 plugins** (`Nest application successfully started`) |
| ADR amendments | ADR-084 A2 (A2.3/A2.4/A2.5/A2.6) · ADR-077 A14 + `restoreDomain?` · ADR-081 A7 · ADR-082 A5 — **cero bump `contractVersion`** |
| Deudas tocadas | DC.NEW-67 (`__base_url_override` test-only, cierra el camino del mock para IT/crons) |
| Deudas diferidas conscientes | **v1.1**: premium (`DOMAIN_PREMIUM`) + child-NS + domain forwarding + IDN suggest-names · **DC.NEW-62/63** (IP estable / WAF — gate del smoke OT&E real) · **DC.NEW-71** (hosting cancelado + dominio retenido → SERVFAIL, simétrico a F.3) |

---

## Lecciones heredables (L24–L27)

Continúa la numeración de 15C.II (terminó en L23).

- **L24 — cobro al completar ≠ cobro al iniciar.** El transfer-in cobra **cuando culmina** (`domain.transfer_completed`), no en el checkout: el carrito flagea el ítem como `deferBilling` (factura nullable si es solo-transfers), y la factura se genera downstream reusando el seam de la renovación. `failed`/`cancelled` **nunca cobran**; el reintento (A2.5) es gratis (no re-factura). Diverge conscientemente de register (irreversible → cobro inmediato). (ADR-084 A2.3.)
- **L25 — exactly-once de iniciación sin `provider_reference` (DOM-INV-6).** Un transfer arranca un service SIN `provider_reference` (igual que register) → no idempotentizable por él. Dos capas, espejo de DOM-INV-1: (1) reintento puro si `provider_reference` ya existe → no re-enviar; (2) recovery tras crash → si el dominio ya figura bajo nuestra cuenta con un transfer en curso, **adoptar** el order-id, no re-iniciar. (ADR-084 A2.4.)
- **L26 — el motor de la FSM es el reconcile; el registrar manda (DH-INV-6).** El orquestador solo **INICIA** (síncrono); la transición `submitted → completed/failed` la conduce el reconcile cron releyendo `actionstatus` por HTTP, fail-soft (`unknown` si RC caído → reintenta en 6h, nunca transiciona sin certeza). El EPP auth-code vive solo en `ProvisionContext` (R12), jamás se persiste.
- **L27 — integración real > superficie mockeada, también en transfer (hereda L20).** Las specs unit del plugin mockean `getApiClient`, así que el round-trip HTTP real de `domains/transfer` + la lectura del `actionstatus` (motor de la FSM) + el lazy-create REAL del registrante en `resellerclub_customers` NO se ejercitan ahí. El smoke vertical de integración (`resellerclub-transfer.e2e-spec.ts`, Postgres real + mock HTTP) valida exactamente ese tramo. **Shapes CONSERVADORES hasta el smoke OT&E** (ADR-081 A7.4): el parser tolera campos ausentes; el catálogo real de `actionstatus`/errores se refina contra RC live en Fase G.

---

## Commits / PRs

- **A→T2c.2 (transfer-in backend)** — PR [#117](https://github.com/yasmindanailov/dashboard/pull/117) squash `3499a59` (doctrina + T1 `26c8209` + T2a `d2c07f9` + T2b `1aa35de` + T2c.1 `0839060` + T2c.2 `8241f1c`).
- **T2c.3** — `0511319` (entrada carrito único + submit-auth + transfer-quote + frontend). 1167 unit.
- **T3** — `2dc42d7` (cierre FSM: eventos Outbox + notifs + zona DNS + reintento). 1178 unit.
- **R** — `5fa17fa` (restore RGP admin/soporte + cobro del fee). 1189 unit.
- **S** — `eb74d95` (buscador rico suggest-v5 + bulk). 1196 unit.
- **Tooling dev** — `8fe9888` (seed dev pricing transfer+restore) + `45778c5` (MockResellerClubServer offline).
- **G (parcial, este PR)** — integración `resellerclub-transfer.e2e-spec.ts` (6 tests) + retrospectiva + doc-sync `current.md`.

> Rama `sprint15d-ii-fase-t2-transfer-core` → **PR #118** (pendiente de merge por Yasmin).

---

## DoD del sprint 15D.II

- [x] Código v1 completo (transfer-in FSM + restore RGP + buscador rico) — alcance Yasmin 2026-06-24.
- [x] `pnpm --dir backend typecheck` + `lint:check` verdes.
- [x] `pnpm --dir backend test` verde — **1196 unit + 12 skipped · 83 suites**.
- [x] `pnpm --dir backend test:e2e` — integración transfer-in **6/6** (Postgres real + mock).
- [x] Boot smoke **4/4 plugins**.
- [x] Frontend `typecheck` + `lint:check` verdes (sin cambios este cierre).
- [x] Smoke **mock** Yasmin (availability + suggest + bulk + transfer-quote) ✅.
- [x] Retrospectiva escrita (este doc).
- [ ] **Smoke OT&E REAL** (transfer-in/suggest contra ResellerClub live) — **⏳ GATE: IP whitelisteada** (DC.NEW-62/63, conexión fija/VPN). Pendiente de Yasmin.
- [ ] **E2E browser del flujo transfer end-to-end** (Playwright) — opcional, diferido con el smoke real.

---

## Gate de cierre pendiente (qué falta para `completed/`)

1. **Smoke OT&E real** de transfer-in + suggest-v5 contra ResellerClub live cuando la IP esté whitelisteada (DC.NEW-62/63) → refina los shapes CONSERVADORES (`actionstatus`, catálogo de errores transfer/restore, marcadores `[REFINAR smoke G]` en `errors.ts` — ADR-081 A7.4).
2. Tras validar sin bugs: marcar **✅ Sprint 15D.II CERRADO** + mover este doc a `completed/sprint-15d-ii-comercio-dominios-avanzado.md` + actualizar `current.md`.

> Hasta entonces, este documento vive in-situ en `docs/60-roadmap/` (no en `completed/`) por disciplina: **no se archiva un sprint hasta su cierre real**.
