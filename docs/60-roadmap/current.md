# Sprints en curso — Aelium Dashboard

> **Estado real verificado** contra código en la [auditoría 2026-06-21](../90-meta/audit-2026-06-21.md). Los sprints ✅ de abajo son punteros a [`completed/`](./completed/) (trazabilidad cronológica). Backlog priorizado en [`backlog.md`](./backlog.md).

> **Última actualización:** 2026-06-22 — **🚀 Sprint 15D (ResellerClub + comercio de dominios) EN CURSO.** Fases **15D.A→E ✅ mergeadas** (master `02a2555`; 15D.E = PR #111) · **15D.F partida en F.1–F.4** (demasiado grande para una rama): **15D.F.1 ✅** (rama `sprint15d-fase-f1-gestion-curada`) — handlers `executeAction` de gestión (NS/privacy/lock/auth-code + suspend/unsuspend) + eventos `domain.*_changed` vía Outbox + alerta de seguridad NS/lock + fidelidad read-after-write del mock. **Próxima: 15D.F.2** (buscador + `check-availability` REST + DOM-INV-5 rico pre-checkout + `modify_contacts`) → F.3 (zona DNS post-register capability-routed) → F.4 (frontend). Detalle por fase en §Sprint 15D abajo.
>
> **Histórico — Sprint 15C.II (Plugin Enhance CP) ✅ CERRADO (2026-05-21):** Fases A→G completas (F.1→F.12 + cierre G). Retrospectiva, métricas y lecciones en [`completed/sprint-15c-ii-hardening-enhance.md`](./completed/sprint-15c-ii-hardening-enhance.md); dossier de trazabilidad in-situ en [`sprint-15c-ii-hardening-enhance-dossier.md`](./sprint-15c-ii-hardening-enhance-dossier.md). Desbloqueó Sprint 15D.
>
> **Cambios estructurales recientes:**
> - 📜 **[ADR-069 (2026-04-29)](../10-decisions/adr-069-estrategia-deploy-diferido.md)** reclasifica **Sprint 14 Deploy real** como **gate condicionado P-DEPLOY** (no está en cola activa). Se activa sólo con trigger de negocio explícito (cliente real, demo, captación, validación externa). La cola activa post-cierre Sprint 8 son features (Sprint 11 Provisioning como cabeza, Sprint 10 Infrastructure independiente, sub-sprint billing prorrateo cross-plan ADR-077 propuesto, Sprint 12 Settings+KB, Sprint 13 Hardening) según valor funcional.
> - **Sprint 11 Fases 11.A + 11.B mergeadas en master 2026-05-02** — ADR-077 (contrato canónico `ProvisionerPlugin` v2 congelado) + orquestador + cola BullMQ `provisioning-dispatch` + cache Redis dedicado (DB 2) + plugin registry. **183/183 unit verde** (157 base Sprint 8 + 26 nuevos). Plugins concretos pendientes (Fase 11.C). Plan canónico abajo.
> - **Sprint 8 (Tasks + Support Inside) cerrado 2026-05-01** — 5 ADRs nacieron en el sprint (072..076), 157/157 unit + 117/117 E2E verde, 5 migraciones. Detalle en [`completed/sprint-8-tasks-support-inside.md`](./completed/sprint-8-tasks-support-inside.md).
> - **Sprint 11.5 (MinIO Storage)** añadido como sprint independiente — antes estaba dentro del Sprint 14 Deploy. Desbloquea adjuntos chat/tickets sin obligar a desplegar a producción.
> - **Sprint 14 (Deploy)** limpiado — solo lo que realmente requiere producción real. **Hoy gate condicionado bajo ADR-069.**
> - **Sprint 15 (Plugins)** partido en sub-sprints 15A-15H independientes — cada plugin se aborda según necesidad real, no en cadena.

---

## 🔄 Sprint 7 — Billing Hardening + Support

**Estado:** ~95% completo, **bloqueado por dependencias externas** para los pasos restantes.
**Inicio:** Sprint 6 (continuación). **Cierre formal estimado:** cuando se desbloqueen Sprints 14, 15, 8.

### ✅ Lo cerrado (verificado contra código)

- **Billing hardening (5 pasos):** admin checkout selector, validar `targetUserId`, perfil de facturación contra cliente destino, IVA recálculo en edición, descuento anual aplicado.
- **Support core (8 pasos):** SupportService completo, WebSocket gateway con auth dual JWT+guest, chat tiempo real, arquitectura dual chat+ticket, escalación, panel agente 3 columnas, bandeja tickets, detalle conversación, plantillas de email, admin.md.
- **Support hardening (25 pasos H1-H25):** dedup WS+REST, escalación única, cleanup typing, post-escalación redirige al ticket, página `[id]` diferenciada, sorting waiting_agent, indicador asignación, unread separado por type, stats filtrados, sync notas, nota obligatoria al reabrir, coherencia acciones panel, sidebar contexto cliente, etc.
- **Chat anónimo (8 pasos):** guest token, endpoint guest, rate limit 3/h, gateway auth fallback, widget guest mode, vinculación por email, vinculación manual, cleanup cron 30d.
- **Refactorización R15 (9 pasos R15.1-R15.9):** chats/page (907→77), ChatWidget (671→155), support/page (557→102), support/[id] (733→88), checkout (570→233), layout (394→79), clients/[id] (683→243), products (323→282), products/new (347→296). **Backend support refactor:** support.service (1054→90 fachada + 4 sub-servicios), gateway (526→232).

### ⏳ Lo pendiente (todo bloqueado)

| Paso | Bloqueado por | Cuándo se desbloquea |
|------|---------------|----------------------|
| 7.6.1-3 Horario soporte | Nada — se puede hacer ya | Decisión de priorizar |
| 7.7 Adjuntos archivos | **Sprint 14 — MinIO** | Tras Sprint 14 |
| 7.6.1-4 Ticket UX (rich text + email-style + adjuntos + subject editable) | **Sprint 7.5 Fase 2 + Sprint 14 MinIO** | Cuando ambos cierren |
| 7.8/7.9 IA filtro + copilot | **Sprint 15 Plugins (Claude AI)** | Tras Sprint 15 |
| 7.SI.1/2 Support Inside (badge, página cliente) | **Sprint 8 Fase D** | Tras cierre Sprint 8 |

**Acción recomendada:** **NO cerrar Sprint 7 formalmente** todavía. Cuando todos los bloqueos se resuelvan en sus respectivos sprints, se cierra de una vez.

---

## 🔄 Sprint 7.5 — Design System Foundation

**Estado:** Fase 1 ✅ cerrada. Fase 2 parcial.

### ✅ Fase 1 — Tokens y componentes base (D1–D10f, D11)

Verificada completa contra código en `frontend/components/ui/`:

- D1 Tokens CSS, D2 Button, D3 Input/Select/SearchInput/Textarea, D4 Badge/StatusDot, D5 Card, D6 Modal, D7 Table, D8 Toast, D9 EmptyState/Skeleton, D10 Avatar/Tooltip/Dropdown, D10b Pagination/StatsCard/AlertBanner, D10c UI_SPEC.md, D10d StatusTabs, D10e Breadcrumb, D10f Tabs.
- D11 Dashboard shell migrado (Sidebar, Topbar, Layout) — CSS modules, eliminados inline styles.

### ⏳ Fase 2 — Migración de páginas existentes (parcial)

Algunas páginas migradas en Sprint 7 R15 (chats, support, checkout, layout, clients, products). Otras pendientes — el playbook no enumera el % exacto. Acción: **cuando se aborde una página por trabajo de feature, migrarla al DS en el mismo PR** (oportunismo) en lugar de un sprint dedicado de migración masiva.

---

## 🚀 Sprint 15D — Plugin ResellerClub + Fundación de comercio de dominios (P2.4)

**Estado:** 🟡 en curso — **Fase 15D.A (doctrina) ✅** *(+ refinamiento pre-B 2026-05-22: DOM-INV-3/4 → 15D core, `ServiceInfo.domain` A11, moneda única — [ADR-084 A1](../10-decisions/adr-084-comercio-dominios-registrar.md) / [ADR-077 A11](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md))* · **15D.B0 (research) ✅** (empírico **ejecutado** 2026-05-22 con IP fija whitelisteada: pre-venta/pricing/customer/2 envoltorios de error **verificados** en OT&E; shapes register-dependientes diferidos al smoke Fase G por infra DNS de nameservers — `docs/_research/sprint-15d/` §4 + [ADR-081 A1](../10-decisions/adr-081-plugin-resellerclub-specifics.md#amendments)) · **15D.B (fundación + contrato) ✅** (contrato additivo + migraciones + checkout multi-ítem con DOM-INV-2/3; DOM-INV-1 + emisión `domain.*` movidos a 15D.D) · **15D.C (cliente HTTP RC + mock) ✅** (http-client + errors + cliente high-level + `MockResellerClubServer` alta fidelidad + 45 tests) · **15D.D (plugin core RC) ✅** (`provision(register)` + DOM-INV-1 + customer/contact lazy + `getServiceInfo`/`DomainInfo` + orquestador `operation`+`domain.registered` vía Outbox + smoke vertical integración Postgres real; ADR-077 A12 + ADR-081 A2/A3) · siguiente **15D.E** (renovación + lifecycle) · luego F→G + Sprint 15D.II.
**Inicio:** 2026-05-21. **Cierre estimado:** 15D core ~4-5 sesiones · 15D.II ~3-4 sesiones.
**Rama Fase A:** `sprint15d-fase-a-doctrina` (doc-only).

> Cabeza de la cola activa **P2.4**, desbloqueada tras cerrar Sprint 15C.II (2026-05-21). Empaquetado en **dos sprints por madurez** (decisión sesión 2026-05-21): **15D core** (registrar + renovar + gestionar dominios end-to-end, ~70-80 % del valor) y **15D.II** (transfer-in + avanzado). La **doctrina (Fase 15D.A) congela ambos**; la implementación se fasea. Origen: [dossier de pre-sprint](./sprint-15d-resellerclub-dossier.md) + cotejo de planificación 2026-05-21.

### 1. Objetivo en una frase

> Permitir a los clientes **buscar, registrar, renovar y gestionar dominios** (con hosting o solos) desde el dashboard, sobre un sistema de comercio de dominios robusto y **agnóstico al registrar**, siendo ResellerClub la primera implementación.

### 2. Depende de

| # | Dependencia | Estado | Bloquea |
|---|-------------|--------|---------|
| 1 | Sprint 15C.II (Enhance como autoridad DNS + `dns-authority-resolver` + default NS) | ✅ (cerrado 2026-05-21) | Zona post-register (F5), DNS de dominios |
| 2 | [ADR-077 A10](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) (contrato registrar) + [ADR-082 A2](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) + [ADR-084](../10-decisions/adr-084-comercio-dominios-registrar.md) + [ADR-081](../10-decisions/adr-081-plugin-resellerclub-specifics.md) | ✅ (Fase 15D.A) | Todo el código de 15D |
| 3 | Credenciales OT&E ✅ + **IP estable** (CGNAT móvil rota la IP — pendiente conexión fija/VPN dedicada, DC.NEW-62) | 🟡 (Yasmin) | Verificación empírica OT&E (B0/Fase G) — el research documental ya está hecho sin ella |

### 3. Produce (contratos nuevos)

**3.1 Tablas / campos Prisma** — `domain_tld_pricing` (TLD×operación×años, coste+markup→precio, [ADR-084 §1](../10-decisions/adr-084-comercio-dominios-registrar.md); **moneda única v1**: `cost_currency === price_currency === default_currency`, sync fail-safe si RC devuelve otra — [ADR-084 A1.2](../10-decisions/adr-084-comercio-dominios-registrar.md)) · `resellerclub_customers` (PK `user_id`) · `resellerclub_contact_handles` (`@@unique [user_id, contact_type]`) · `services.expires_at` ([ADR-082 A2.3](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md)) · enums `DomainPriceOperation`/`DomainPriceSource`/`ResellerclubContactType`.

**3.2 Eventos** (`domain.*` vía Outbox, [ADR-084 §5](../10-decisions/adr-084-comercio-dominios-registrar.md)) — `domain.registered`, `domain.renewed`, `domain.expiring_soon`, `domain.expired`, `domain.entered_redemption`, `domain.nameservers_changed`/`contacts_changed`/`privacy_changed`/`lock_changed` (+ `domain.transfer_*` en 15D.II). Registrar en `_events.md` antes de emitir.

**3.3 Endpoints REST** — `POST /api/v1/domains/check-availability` · buscador `/dashboard/domains/search` (+ backend) · checkout multi-ítem (extensión de `BillingCheckoutService`) · acciones curadas vía `executeAction` (NS/contactos/privacy/lock/auth-code) · admin suspend/unsuspend.

**3.4 Settings** — `plugin.resellerclub.{markup_percent (25), tlds_offered[] (.com/.net/.org/.es/.eu), environment (sandbox|production), default_currency (EUR)}`.

**3.5 Contrato** — capability `is_domain_registrar` + métodos `checkDomainAvailability?()`/`getTldPricing?()` + `ProvisionContext.operation` + 7 `ProvisionerErrorCode` de dominio + campo `ServiceInfo.domain?: DomainInfo` (estado de gestión, capability-driven — [ADR-077 A11](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md)) + test de contrato ampliado ([ADR-077 A10](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md)).

**3.6 Crons** — `sync-resellerclub-pricing` (diario → puebla `domain_tld_pricing`) · `sync-resellerclub-orders` (6h → reconcilia `expires_at`/estado) · cron de avisos de expiración (lee `expires_at`).

### 4. Modifica (contratos existentes)

- `ProvisionerPlugin` / `PluginCapabilities` / `ProvisionContext` / `ProvisionerErrorCode` — additivos ([ADR-077 A10](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md), no bumpea `contractVersion`).
- `BillingCheckoutService.checkout()` — de 1 ítem a N ítems ([ADR-084 §2](../10-decisions/adr-084-comercio-dominios-registrar.md)).
- Plugins existentes (`internal`, `manual`, `enhance_cp`) — añaden `is_domain_registrar: false`.
- **BREAKING:** ninguno (todo additivo / compatible).

### 5. Pasos atómicos

| # | Fase | Contenido | Estado |
|---|------|-----------|--------|
| 15D.A | Doctrina (doc-only) | 4 ADRs (077 A10 + 082 A2 + 084 + 081) + plan + backlog + índice/glossary | ✅ |
| **15D.B0** | **Research + verificación OT&E** (antes del código) | Script `backend/scripts/research-resellerclub-ote.ts` recorre los ~30 endpoints del scope v1 contra **OT&E real** + captura request/response/errores reales → `docs/_research/sprint-15d/`. **Resultado:** ✅ documental (wrappers `phillipsdata/logicboxes` + Cloudflare WAF) **+ empírico ejecutado 2026-05-22** con IP fija whitelisteada (`resellerclub-ote-findings.md` §4: pre-venta/pricing/customer/2 envoltorios de error verificados; register-dependiente diferido al smoke Fase G por infra DNS de NS — `ns1/ns2.aelium.net` sin registro A, [ADR-081 A1](../10-decisions/adr-081-plugin-resellerclub-specifics.md#amendments)). | ✅ |
| 15D.B | Fundación + contrato | **(1)** contrato additivo en `core/provisioning/types.ts` (`is_domain_registrar` + `ProvisionContext.operation` + 7 error codes + `DomainInfo`/`ServiceInfo.domain?` [A11] + plano A `checkDomainAvailability?`/`getTldPricing?`) + plugins existentes `false` + contract test + doc-sync `_events.md`/`contract.md` (commit `40bf4ac`) · **(2)** migraciones (`domain_tld_pricing` + tablas `resellerclub_*` + `services.expires_at`) (commit `6e6d827`) · **(3)** checkout multi-ítem (`checkoutItems` N→N, wrapper legacy intacto) + ítem `domain` (precio desde `domain_tld_pricing`) + **DOM-INV-3** (margin guard same-currency, [ADR-084 A1](../10-decisions/adr-084-comercio-dominios-registrar.md)) + **DOM-INV-2** checkout-side (advisory lock FQDN + dup guard) + 21 tests (commit `466e812`) | ✅ |
| 15D.C | Cliente HTTP RC + mock | `ResellerClubApiClient` (http-client low-level [auth userid+api-key, arrays duplicados, WAF Cloudflare, 2 envoltorios de error → 7 `ProvisionerErrorCode`] + cliente high-level por endpoint) + `MockResellerClubServer` (alta fidelidad, fresco por corrida, `POST /__test__/seed`) + types · **45 tests** (21 http-client + 11 client + 13 integración) | ✅ |
| 15D.D | Plugin core RC | `provision(register)` + **DOM-INV-1** (exactly-once: pre-flight `checkDomainAvailability` + adoptar registro existente tras crash) + customer/contact lazy (advisory lock + cross-search) + mapeo de errores RC→canónicos + DI + manifest · **orquestador**: fija `ProvisionContext.operation` desde `metadata.domain_operation` + **emite `domain.*` vía Outbox** (`domain.registered`…) *(movido de 15D.B — acoplado al plugin RC, testeable E2E aquí)* → **smoke vertical: registrar un dominio end-to-end contra el mock** (red de seguridad L20) | ✅ |
| 15D.E | Renovación + lifecycle | ✅ `provision(renew)` + **DOM-INV-4** (renovación verificada: relee `domains/details`, confirma que `expires_at` avanzó; idempotente por período anclada en `services.expires_at`) + orquestador enruta la factura de renovación + `domain.renewed` (Outbox) + **3 crons** (reconcile 6h → puebla `expires_at` + lifecycle edge-triggered `domain.expired`/`entered_redemption` vía Outbox · pricing-sync diario → **writer de `domain_tld_pricing`** + fail-safe moneda · avisos diario → `domain.expiring_soon` 30/14/7/1d) + 4 listeners + plantillas + spec de `BillingInvoiceService` (auditoría HIGH-3). **DOM-INV-5**: defensa plugin-side (`REGISTRANT_INELIGIBLE`); validación rica pre-checkout → 15D.F. ([ADR-081 A4](../10-decisions/adr-081-plugin-resellerclub-specifics.md#amendments)) | ✅ |
| 15D.F | Gestión + buscador (**partida en F.1–F.4** — demasiado grande para una rama, decisión 2026-06-22) | _ver sub-filas_ | 🟡 |
| **15D.F.1** | Gestión curada backend | Handlers `executeAction` (modify_nameservers verify-after-write + toggle_privacy + toggle_registrar_lock + get_auth_code [lee `domsecret`, R12 redacta] + suspend/unsuspend adminOnly) + payloadSchemas + **eventos `domain.{nameservers,privacy,lock}_changed` vía Outbox** (R8, seam `executeActionForUser`→`orchestrator.emitDomainManagementEvent`, gated capability+mapa estático) + **alerta de seguridad NS/lock** (listener + plantillas) + fidelidad read-after-write del mock. `modify_contacts`→F.2. ([ADR-081 A5](../10-decisions/adr-081-plugin-resellerclub-specifics.md#amendments)) | ✅ |
| 15D.F.2 | Buscador + checkout de registro | `POST /domains/check-availability` (REST greenfield, capability-routed, precio server-side R5) + buscador + **DOM-INV-5 rico pre-checkout** (`.es` NIF / `.eu` residencia, `contacts/set-details`) + `modify_contacts` enriquecido + checkout de registro | ⬜ |
| 15D.F.3 | Zona DNS post-register | **zona post-register vía orquestador** *(capability-routed por DNS-authority — [ADR-082 A3](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md#amendments)/DH-INV-7, cero acoplamiento a `enhance_cp`; DC.NEW-65 NO es prerequisito, nace conforme)* + setting `provisioning.dns_authority_plugin` + Amendment ADR-077 (sub-contrato escritura DNS). ⚠️ verificar primitiva de zona standalone de Enhance (F5 dominio-solo) antes de prometer | ⬜ |
| 15D.F.4 | Frontend dominios | Buscador `/dashboard/domains/search` + "Mis dominios" + gestión + registro + Sidebar/permisos `Domain` + extender `ServiceRecoveryHint` `renew`/`restore` (A3.2) + `deleteDomain` admin (A3.1) | ⬜ |
| 15D.G | Cierre core | E2E (sandbox/mock) + `admin-plugins` doc RC + smoke real Yasmin + retrospectiva | ⬜ |
| **15D.II** | **Avanzado (sprint aparte)** | Transfer-in FSM + EPP + buscador rico (suggest/bulk/IDN) + premium + child-NS + forwarding *(DOM-INV-3/4 movidas a 15D core — [ADR-084 A1](../10-decisions/adr-084-comercio-dominios-registrar.md))* | ⬜ |

### 6. Edge cases anticipados

| ID | Caso | Plan |
|----|------|------|
| EC-15D-01 | Dominio ya registrado (por otro) | `DOMAIN_UNAVAILABLE` en availability + bloquear checkout |
| EC-15D-02 | Crash entre `register` y persistir `provider_reference` | **DOM-INV-1**: pre-flight + adoptar registro existente (no re-registrar) |
| EC-15D-03 | Dos checkouts simultáneos del mismo FQDN | **DOM-INV-2**: advisory lock por FQDN |
| EC-15D-04 | `.es` sin NIF / `.eu` sin residencia UE | **DOM-INV-5**: elegibilidad pre-checkout (`REGISTRANT_INELIGIBLE`) |
| EC-15D-05 | Dominio premium (precio dinámico) | `DOMAIN_PREMIUM` → bloquear v1 (venta 15D.II) |
| EC-15D-06 | Dominio-solo sin hosting (F5) | Zona DNS post-register en Enhance ([ADR-082 A2.2](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md)) |
| EC-15D-07 | Coste registrar > precio de venta | **DOM-INV-3** margin guard same-currency: bloquear checkout + `system.error` (**v1 15D core**, [ADR-084 A1](../10-decisions/adr-084-comercio-dominios-registrar.md)) |
| EC-15D-08 | `renew` que no extiende la fecha | **DOM-INV-4** renovación verificada: `PROVIDER_INTERNAL_ERROR` retriable + DLQ (**v1 15D core**, [ADR-084 A1](../10-decisions/adr-084-comercio-dominios-registrar.md)) |
| EC-15D-09 | Customer/contact RC ya existe pero falta mapping local | cross-search defensivo por email antes de crear |
| EC-15D-10 | RC devuelve coste en moneda ≠ venta (EUR) | sync **fail-safe**: omitir fila + `system.error` (no tarifar mal) — [ADR-084 A1.2](../10-decisions/adr-084-comercio-dominios-registrar.md) |

### 7. Definition of Done (15D core)

**Código:** fases B→G ✅ · build + typecheck + lint · CI verde · E2E del flujo (register/renew/gestión) verdes · test de contrato (`is_domain_registrar` + `ServiceInfo.domain` A11) verde · **DOM-INV-1..5 cubiertas por tests** (margin guard same-currency + renovación verificada incluidas).
**Documentación:** `docs/features/provisioning/admin-plugins-resellerclub.md` · `_events.md` con `domain.*` · `provisioning/contract.md` actualizado · 4 ADRs (✅ Fase A).
**Proceso:** Conventional Commits · 1 rama por fase · edge cases pendientes (premium, transfers) movidos a 15D.II / backlog.
**Smoke (Yasmin):** registrar un dominio (con y sin hosting) + renovar + gestionar NS/contactos/privacy/lock + verificar zona DNS creada + sin errores en consola.

### 8. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Registro irreversible (cuesta dinero real) | Pérdida / doble cobro ante fallo | DOM-INV-1/2 (exactly-once + lock); register fail-soft con reconcile |
| OT&E (sandbox) diverge de producción | Verde en CI, fallo en prod | Mock de alta fidelidad (L20) + smoke real contra OT&E en Fase G |
| Catálogo RC ~95 % (endpoints recientes podrían faltar) | Descubrir gaps al implementar | Implementar contra OT&E real temprano (Fase C/D) |
| Checkout multi-ítem toca billing (módulo central) | Regresión en compras existentes | El caso `items.length===1` preserva el comportamiento actual + E2E de billing |

### 9. Decisiones registradas

- [ADR-077 Amendment A10](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) — contrato de registrar.
- [ADR-082 Amendment A2](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) — F5 + zona post-register + lifecycle de expiración.
- [ADR-084](../10-decisions/adr-084-comercio-dominios-registrar.md) — comercio de dominios (TLD pricing + checkout multi-ítem + DOM-INV + FSM transfer).
- [ADR-081](../10-decisions/adr-081-plugin-resellerclub-specifics.md) — ResellerClub specifics.

### 10. Cierre del sprint

> Se rellena al cerrar 15D core. (Fase 15D.A cerrada doc-only el 2026-05-21 en rama `sprint15d-fase-a-doctrina`.)

---

## ✅ Sprint 8 — Tasks + Support Inside (cerrado 2026-05-01)

> Sprint cerrado al 100%. Movido a [`completed/sprint-8-tasks-support-inside.md`](./completed/sprint-8-tasks-support-inside.md) con retrospectiva completa, métricas, ADRs nacidos (072..076) y lecciones aprendidas. Cobertura final: 157/157 unit + 117/117 E2E verde, 5 migraciones aplicadas.

> Las páginas operativas del módulo viven en:
> - [`docs/features/tasks/admin.md`](../features/tasks/admin.md) — operativa diaria del módulo Tasks
> - [`docs/features/tasks/agent.md`](../features/tasks/agent.md) — guía del agente
> - [`docs/features/support-inside/admin.md`](../features/support-inside/admin.md) — operativa Support Inside (staff)
> - [`docs/features/support-inside/client.md`](../features/support-inside/client.md) — guía cliente Support Inside

---

## ✅ Sprint 9 — Audit + Notifications Full + BullMQ + DLQ (P1.1) (cerrado 2026-04-27)

> Sprint cerrado al 100% del alcance MVP. Movido a [`completed/sprint-9-audit-notifications-bullmq.md`](./completed/sprint-9-audit-notifications-bullmq.md) el 2026-05-01 (saneamiento documental post-Sprint 8 cierre). DoD verificado: typecheck + lint + build + 21/21 unit + 30/30 E2E + boot real con 3 colas BullMQ + 8 crons in-process. P1.1 desbloquea Sprint 14 Deploy sin bloqueos críticos.

---

## ✅ Sprint 9.5 — UX admin de notifications + cabos sueltos (P1.1.5) (cerrado 2026-04-27)

> Sprint cerrado en 1 sesión densa. Movido a [`completed/sprint-9-5-ux-admin-notifications.md`](./completed/sprint-9-5-ux-admin-notifications.md) el 2026-05-01.

---

## ✅ Sprint 11.5 — MinIO Storage local (P1.2) (cerrado 2026-04-26)

> Sub-sprint independiente que aisló storage local del Sprint 14 Deploy para desbloquear adjuntos chat/tickets. Movido a [`completed/sprint-11-5-minio-storage.md`](./completed/sprint-11-5-minio-storage.md) el 2026-05-01.

---

## ✅ Sprint 9.6 — Split admin/cliente retroactivo + 3 portales raíz + permisos granulares (P1.1.6 / DC.7) (cerrado 2026-04-28)

> Sprint cerrado en 1 sesión densa, 12 commits encadenados. ADR-066 + ADR-067 + ADR-068 nacieron aquí. Tres portales raíz formalizados (`/admin/*`, `/dashboard/*`, `/partner/*`). Retrospectiva ejecutiva + plan canónico completo en [`completed/sprint-9-6-split-admin-cliente.md`](./completed/sprint-9-6-split-admin-cliente.md).

---

## ✅ Sprint 11 — Provisioning (P2.1) (cerrado 2026-05-02)

> Sprint cerrado al 100%. Movido a [`completed/sprint-11-provisioning.md`](./completed/sprint-11-provisioning.md) con retrospectiva completa, métricas, 2 ADRs nacidos (077 contrato canónico `ProvisionerPlugin` v2 + 078 auth server-side cookies httpOnly) y lecciones aprendidas. Cobertura final: **241/241 unit + 129/129 E2E verde**, 1 migración aplicada, 7 PRs encadenados (#13 ADR-077 → #14 chasis → #15 cierre doc 11.B → #16 11.C plugins triviales → #17 ADR-078 → #18 11.D REST + frontend → #19 sync), 8 endpoints REST nuevos, 1 cola BullMQ nueva (`provisioning-dispatch`), 5 eventos `service.*` nuevos, 4 DCs nuevas registradas en `backlog.md` (DC.27/29/30/31).

> **Documentación canónica del módulo:**
> - [`docs/features/services/admin.md`](../features/services/admin.md) — operativa diaria del módulo Services para staff.
> - [`docs/features/services/client.md`](../features/services/client.md) — guía cliente.
> - [`docs/features/provisioning/admin.md`](../features/provisioning/admin.md) — vista interna del orquestador.
> - [`docs/20-modules/provisioning/contract.md`](../20-modules/provisioning/contract.md) — contrato canónico (12 secciones, marcado ✅ implementado).

---


## ✅ Sprint 13.5 — Hardening + Saneamiento de Deuda Continua (cerrado 2026-05-03)

> Sub-sprint dedicado a cerrar deuda continua acumulada antes de Sprint 15A Plugin Framework. Movido a [`completed/sprint-13-5-hardening-deuda-continua.md`](./completed/sprint-13-5-hardening-deuda-continua.md) con retrospectiva completa, métricas, lecciones aprendidas y plan de Sprint 13.5.5 CI Infra (sub-sprint nacido del aprendizaje). 8 DCs cerradas (DC.32/33/34 + DC.14/37/38 + DC.8/11/15 parciales) + 2 diferidas (DC.13 + DC.27 → Sprint 13.5.5). Cobertura final: **183/183 unit + 118/118 E2E verde** sin regresión.

---

## ✅ Sprint 13.5.5 — CI Infra (cerrado 2026-05-03)

> Sub-sprint cerrado al 100%. Movido a [`completed/sprint-13-5-5-ci-infra.md`](./completed/sprint-13-5-5-ci-infra.md) con retrospectiva completa, métricas, decisión arquitectónica + lecciones aprendidas. **DC.27 ✅** (imagen oficial Playwright `mcr.microsoft.com/playwright:v1.59.1-noble` + service names + MinIO `bitnamilegacy/minio:2025.7.23-debian-12-r5` como service container) + **DC.13 ✅ parcial-canónica** (sharding CI con `--shard=N/M` × 3 shards paralelos, wall-clock CI 25 min → ~10 min). Paralelización local con `workers > 1` **diferida a sub-sprint condicionado** Sprint 13.5.6 (trigger: suite local > 2 min) — el cuello real estaba en CI, no en local. Decisión arquitectónica completa en la retrospectiva §4.

---

## ✅ Sprint 16 — Tasks refactor + Notes consolidation (P2.1.5) (cerrado 2026-05-02)

> Sprint cerrado al 100%. Movido a [`completed/sprint-16-tasks-notes-refactor.md`](./completed/sprint-16-tasks-notes-refactor.md) con retrospectiva completa, métricas, ADR nacido (ADR-079 + Amendments A1/A2/A3) y lecciones aprendidas. Cobertura final: **183/183 unit + 118/118 E2E verde**, 1 migración aplicada (`sprint16_tasks_notes_refactor`), 4 PRs encadenados (#21 ADR-079 → #22 backend → #23 sync → #24 frontend + amendments + cierre documental).

> **Documentación canónica del módulo:**
> - [`docs/20-modules/tasks/contract.md`](../20-modules/tasks/contract.md) — Contract canónico tasks (post-ADR-079).
> - [`docs/30-data/tasks.md`](../30-data/tasks.md) — Schema canónico tasks.
> - [`docs/30-data/clients.md`](../30-data/clients.md) — Schema canónico `client_notes` (consolidación con source tracking).
> - [`docs/features/tasks/admin.md`](../features/tasks/admin.md) — Operativa admin.
> - [`docs/features/tasks/agent.md`](../features/tasks/agent.md) — Guía agente.
> - [`docs/features/notes/admin.md`](../features/notes/admin.md) — Operativa notas consolidadas (nuevo).
> - [`docs/features/support/lifecycle.md`](../features/support/lifecycle.md) — Lifecycle ticket vs chat (Amendments A1+A3, nuevo).

---

## ✅ Sprint 13 §13.AUTH — Auth server-side con cookies httpOnly + Server Components nativos (cerrado 2026-05-03)

> Sprint cerrado al 100%. Movido a [`completed/sprint-13-auth-cookies-httponly.md`](./completed/sprint-13-auth-cookies-httponly.md) con retrospectiva completa, métricas, ADR-078 Amendment A1 (Modelo A), 11 commits encadenados en rama `sprint13-auth-cookies-httponly`, lecciones aprendidas (smoke HTTP real desbloqueando bugs IPv6 + jti, decisión arquitectónica Opción B ESLint per-línea, modelo cross-origin cookies httpOnly Next.js + handshake WS via endpoint dedicado). Cobertura final: **198/198 unit backend verde + 3 specs E2E nuevos** (`auth-cookies-flow` + `auth-replay-detection` + `auth-no-localStorage`) + frontend `pnpm typecheck` + `pnpm lint:check --max-warnings=0` + `pnpm build` verdes. Cierra **DC.6 + DC.28**.

> **Documentación canónica del módulo (post-Sprint 13 §13.AUTH):**
> - [ADR-078 + Amendment A1](../10-decisions/adr-078-auth-server-side-cookies-httponly.md) — Modelo A (cookies httpOnly viven en dominio Next.js).
> - [`docs/00-foundations/rules.md` §R17](../00-foundations/rules.md#r17--jwt-en-cookies-httponly-de-nextjs-no-en-localstorage) — JWT en cookies httpOnly de Next.js, NO en localStorage.
> - [`docs/20-modules/auth/contract.md`](../20-modules/auth/contract.md) — §5 (`/auth/ws-token`), §7 (`auth.refresh_replay_detected`), §11 (env vars frontend `BACKEND_URL` + `NEXT_RUNTIME_SECRET`), §14 (AUTH-INV-8/9).
> - [`docs/50-operations/api-errors.md`](../50-operations/api-errors.md) — `AUTH_REPLAY_DETECTED`.

---

## ✅ Sprint 15A — Plugin Framework (P2.2) (cerrado 2026-05-06)

> Sprint cerrado al 100% y mergeado a master `bee90d8` (squash-merge PR #31). Movido a [`completed/sprint-15a-plugin-framework.md`](./completed/sprint-15a-plugin-framework.md) con retrospectiva completa, métricas, ADR-080 nacido (Plugin Framework: manifest declarativo + vault de secretos AES-256-GCM + loader desde DB + circuit breaker tras interface + 5 eventos `plugin.*`), 8 commits encadenados en rama `sprint15a-plugin-framework` (6 originales + Amendment A1 con 2 fixes CI post-cierre: ENCRYPTION_KEY 64 hex + audit_change_log entity_id UUID v5 derivado del slug), 9 lecciones aprendidas. Cobertura final: **255/255 unit verde** (+57 vs base post Sprint 13: 18 vault + 11 registry + 16 breaker + 15 admin-plugins + 2 manifest contract) + **7 E2E nuevos** (`admin-plugins.spec.ts`) + frontend `pnpm typecheck` + `pnpm lint:check --max-warnings=0` + `pnpm build` verdes. Plugins reales 15B/C/D/E/G heredan TODO el framework — solo declaran 6 métodos del contrato + manifest. PR [#31](https://github.com/yasmindanailov/dashboard/pull/31).

> **Documentación canónica del módulo (post-Sprint 15A):**
> - [ADR-080](../10-decisions/adr-080-plugin-framework.md) — Plugin Framework canónico (manifest declarativo JSON-Schema 7 + tabla `plugin_installs` + `SecretVaultService` AES-256-GCM + loader runtime desde DB + circuit breaker tras interface).
> - [`docs/30-data/plugin-installs.md`](../30-data/plugin-installs.md) — Schema canónico `plugin_installs` con justificación PK natural slug.
> - [`docs/features/provisioning/admin-plugins.md`](../features/provisioning/admin-plugins.md) — Operativa diaria del superadmin (4 flujos canónicos + auditoría + errores comunes).
> - [`docs/20-modules/_events.md` §🔌 plugin.*](../20-modules/_events.md) — 5 eventos `plugin.*` + 3 listeners nuevos.
> - [`docs/20-modules/provisioning/contract.md` §7 Admin Plugin Framework](../20-modules/provisioning/contract.md) — REST endpoints `/admin/plugins/*` + sección Pendientes actualizada.
> - [`docs/00-foundations/glossary.md`](../00-foundations/glossary.md) — 3 términos canónicos nuevos: Plugin Manifest, Secret Vault, Circuit Breaker.

---

## ✅ Sprint 15C — Plugin Enhance CP (P2.3) — cerrado (15C.I + 15C.II hardening, 2026-05-21)

> Primer plugin SaaS real (hosting Enhance). 15C.I (fases A→I) + sub-sprint **15C.II Hardening** (A→G, F.1→F.12 + cierre G) ✅ cerrados. Operó la autoridad DNS (`ns1/ns2.aelium.net`) que **desbloqueó Sprint 15D**.
>
> **Documentación canónica (el detalle vive en `completed/`, no aquí):**
> - Retrospectiva 15C.II + métricas + lecciones L13–L23: [`completed/sprint-15c-ii-hardening-enhance.md`](./completed/sprint-15c-ii-hardening-enhance.md).
> - Detalle 15C original + 18 issues smoke + decisiones doctrinales: [`completed/sprint-15c-plugin-enhance-cp.md`](./completed/sprint-15c-plugin-enhance-cp.md).
> - Dossier de trazabilidad (plan + cierre commit-by-commit F.1→G, anexo in-situ): [`sprint-15c-ii-hardening-enhance-dossier.md`](./sprint-15c-ii-hardening-enhance-dossier.md).
> - Operativa diaria del plugin: [`../features/provisioning/admin-plugins-enhance.md`](../features/provisioning/admin-plugins-enhance.md).

---
## Convenciones de este documento

- **Estado real ≠ estado declarado.** Los símbolos aquí reflejan lo verificado en código a fecha 2026-04-26.
- **No mover sprints a `completed/` hasta que estén realmente cerrados** según [Definition of Done](../90-meta/definition-of-done.md).
- **Cuando un sprint cierra:** mover su sección a `completed/sprint-N-titulo.md` con resumen ejecutivo + commit de cierre + retrospectiva breve.
