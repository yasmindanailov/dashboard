# Domains (comercio de dominios) — Contract

> Búsqueda, registro, renovación, transferencia y gestión de dominios (con hosting o solos), **agnóstico al registrar** (ResellerClub = 1ª implementación). Doctrina: [ADR-084](../../10-decisions/adr-084-comercio-dominios-registrar.md) + [ADR-081](../../10-decisions/adr-081-plugin-resellerclub-specifics.md) + [ADR-082](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) + [ADR-077 A10](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments).

---

## 1. Propósito

Permitir al cliente **buscar, registrar, renovar, transferir y gestionar dominios** desde el dashboard sobre un sistema de comercio agnóstico al registrar; un dominio es un `Service` (`product.type='domain'`) provisto por un plugin con capability `is_domain_registrar`. El precio se resuelve **server-side** desde `domain_tld_pricing` (R5) y el ciclo de dinero usa el motor de billing existente.

---

## 2. Estado de implementación

🟡 **Parcial (v1 código-completo) — Sprint 15D (core) + 15D.II (avanzado).**
- ✅ Buscador (availability / bulk / suggest), registro, renovación verificada, gestión curada (NS/privacy/lock/auth-code), transfer-in (FSM + cobro al completar), restore RGP (admin), pricing admin.
- ✅ Todo validado contra `MockResellerClubServer` (alta fidelidad).
- ⬜ **Gate Yasmin (no codeable):** smoke OT&E **real** contra ResellerClub live (IP whitelisteada + NS resolubles) — shapes register-dependientes siguen "conservadores" hasta entonces (GL-6/GL-7, audit 2026-06-25).
- ⬜ v1.1: premium, child-NS, forwarding, IDN.

---

## 3. Modelos Prisma propios

| Tabla | Descripción | Invariantes destacadas |
|-------|-------------|------------------------|
| `domain_tld_pricing` | Matriz `(registrar_slug, tld, operation, years, price_currency)` → coste + precio + markup. | `@@unique(registrar_slug, tld, operation, years, price_currency)`. **Moneda única v1** (`cost_currency===price_currency===EUR`). `source ∈ {sync, manual}` (override admin gana sobre el cron). |
| `resellerclub_customers` | Mapeo `user_id` (PK) → `resellerclub_customer_id`. | Lazy-create (1 customer RC por usuario; cross-search por email antes de crear). |
| `resellerclub_contact_handles` | `(user_id, contact_type)` → handle RC. | `@@unique(user_id, contact_type)`; `contact_type ∈ {registrant, admin, tech, billing}`. Contacto **regulado** por TLD (`.es` EsContact / `.eu` EuContact — GL-6/H4). |

Campos dominio-específicos en `services` (tabla de billing): `domain` (FQDN), `expires_at` (caducidad reportada por el registrar — [ADR-082 A2.3](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md)), `transfer_state` (FSM transfer-in), `provider_reference` (order id del registrar).

---

## 4. Modelos foráneos accedidos

| Tabla | Módulo dueño | Acceso | Razón |
|-------|--------------|--------|-------|
| `services` | billing/provisioning | lectura/escritura | Un dominio ES un service; el orquestador persiste estado/`expires_at`/`transfer_state`. |
| `event_outbox` | core/outbox | escritura (en tx) | Eventos `domain.*` críticos vía `OutboxService.enqueue` (R8). |
| `audit_change_log` | audit | escritura vía `AuditService` | Auditar restore/delete admin (R3). |
| `plugin_installs` | admin-plugins | lectura | Resolver el plugin registrar activo (capability). |

---

## 5. API REST expuesta

**Cliente** (`JwtAuthGuard`, self-scoped por `req.user.id`):

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/v1/domains/check-availability` | Disponibilidad de un SLD × TLDs (precio server-side, R5). |
| POST | `/api/v1/domains/check-availability-bulk` | Disponibilidad multi-SLD. |
| POST | `/api/v1/domains/suggest` | Buscador rico (keyword → sugerencias comprables). |
| GET | `/api/v1/domains` | "Mis dominios" (services `type=domain` propios). |
| POST | `/api/v1/domains/transfer-quote` | Precio de transfer de un FQDN. |
| POST | `/api/v1/domains/:id/transfer/submit-auth` | EPP auth-code para iniciar transfer-in (R12: en memoria, nunca en cola/metadata). |
| GET / PUT | `/api/v1/domains/registrant` | Datos de titular WHOIS (1 por cliente; PUT propaga al registrar). |

Gestión curada (NS / privacy / lock / auth-code) vía `POST /api/v1/services/:id/actions/:slug` (módulo provisioning, capability-routed).

**Admin** (`JwtAuthGuard + AdminOnlyGuard + PoliciesGuard`):

| Método | Ruta | Descripción | CASL |
|--------|------|-------------|------|
| GET | `/api/v1/admin/domains/pricing` | Matriz de pricing TLD. | `Update`+`Product` |
| POST | `/api/v1/admin/domains/pricing/sync` | Dispara el sync de pricing manual. | `Update`+`Product` |
| PATCH | `/api/v1/admin/domains/pricing/:id` | Override manual de un precio (`source=manual`). | `Update`+`Product` |
| DELETE | `/api/v1/admin/domains/pricing/:id` | Revierte a precio automático. | `Update`+`Product` |
| POST | `/api/v1/admin/domains/services/:id/delete` | Borra el dominio en gracia + cancela el service. | `Manage`+`Service` |
| POST | `/api/v1/admin/domains/services/:id/restore` | Restaura un dominio en RGP + factura el fee. | `Manage`+`Service` |

---

## 6. WebSocket gateway

N/A.

---

## 7. Eventos emitidos

> Detalle y consumidores en [`_events.md`](_events.md) §`domain.*`. Todos vía **Outbox** (R8) salvo `domain.expiring_soon` (alerta).

| Evento | Cuándo | Outbox |
|--------|--------|--------|
| `domain.registered` | Registro fresco OK (orquestador). | Sí |
| `domain.renewed` | Renovación **verificada** (DOM-INV-4). | Sí |
| `domain.expiring_soon` | Cron de avisos (30/14/7/1 días). | No (alerta) |
| `domain.expired` / `domain.entered_redemption` | Cron reconcile detecta transición de lifecycle. | Sí |
| `domain.nameservers_changed` / `privacy_changed` / `lock_changed` / `contacts_changed` | Acción de gestión RC exitosa (`emitDomainManagementEvent`). | Sí |
| `domain.restored` | Restore RGP admin OK → factura el fee. | Sí |
| `domain.transfer_initiated` / `transfer_completed` / `transfer_failed` | FSM de transfer-in (init / reconcile). | Sí |

---

## 8. Eventos consumidos

| Evento | Origen | Reacción |
|--------|--------|----------|
| `service.activated` | provisioning | Si el activado es **hosting** con un dominio hermano aparcado → conmuta sus NS a Aelium (`switch-domain-ns-on-hosting-activated`, [ADR-082 A4](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md#amendments)). |
| `domain.transfer_completed` | (self) | Billing factura el transfer + reconcile de zona DNS. |
| `domain.restored` | (self) | Billing factura el fee de restore. |

---

## 9. Servicios consumidos (cross-módulo)

| Servicio | De módulo | Razón legítima |
|----------|-----------|----------------|
| `ProvisioningOrchestratorService` | provisioning | Iniciar transfer-in (auth-code en memoria, R12). |
| `PluginRegistryService` | core/provisioning | Resolver el registrar por capability (R4 — nunca por slug). |
| `OutboxService` | core/outbox | Emitir `domain.*` en la tx (R8). |
| `AuditService` | audit | R3 (restore/delete admin). |

---

## 10. CASL — Permisos

**No existe `Subject.Domain`** — un dominio es un `Service` (el CASL del backend no driftea un subject nuevo):

| Operación | Subject usado | Roles |
|-----------|---------------|-------|
| Buscar / listar / gestionar dominios (cliente) | `Service` (self-scoped) | client (own) |
| Pricing admin (ver/sync/override) | `Product` | superadmin + agent_full |
| Delete / restore admin | `Service` | superadmin + agent_full |

---

## 11. Settings consumidos

| Categoría | Key | Default | Para qué |
|-----------|-----|---------|----------|
| `plugin.resellerclub` | `environment` | `sandbox` | OT&E vs producción. |
| `plugin.resellerclub` | `markup_percent` | `25` | Markup del cron de pricing-sync. |
| `plugin.resellerclub` | `tlds_offered` | `.com,.net,.org,.es,.eu` | TLDs ofrecidos al cliente. |
| `plugin.resellerclub` | `default_currency` | `EUR` | Moneda única v1. |
| `provisioning` | `default_nameservers` | `ns1/ns2.aelium.net` | NS Aelium para dominios con hosting. |
| `provisioning` | `registrar_parking_nameservers` | (provisional) | NS de parking para dominio-solo (F5). |

---

## 12. Emails enviados

Vía `NotificationsService` (D12) desde los listeners de `_events.md`: confirmación de registro, renovación, avisos de expiración (30/14/7/1d), entrada en redención, transfer (×6: iniciado/completado/fallido + reintento), restore (×2), alerta de seguridad NS/lock. Plantillas en `notification_templates` (requieren re-seed).

---

## 13. Jobs / cron

| Cron | Qué hace |
|------|----------|
| `sync-resellerclub-pricing` (diario) | `plugin.getTldPricing()` → markup → upsert `domain_tld_pricing` (respeta overrides `manual`; fail-safe si moneda ≠ EUR). |
| `ResellerclubReconciliationCron` (6h) | Relee `domains/details` per-servicio → puebla `expires_at`, edge-trigger `domain.expired`/`entered_redemption`, avanza la FSM de transfer (`submitted→completed/failed`). |
| `DomainExpiryWarningsCron` (diario 09:00 UTC) | Lee `expires_at` → `domain.expiring_soon` (ventanas 30/14/7/1d, edge-triggered). |

---

## 14. Invariantes

- **DOM-INV-1 (exactly-once por nombre):** pre-flight `checkDomainAvailability` + adopción del registro existente tras crash (no re-registrar). [ADR-084 §3](../../10-decisions/adr-084-comercio-dominios-registrar.md).
- **DOM-INV-2 (lock por FQDN):** advisory lock Postgres sobre el FQDN normalizado durante orden+provisión (dos checkouts del mismo FQDN no colisionan).
- **DOM-INV-3 (margin guard same-currency):** si `cost > price` (misma moneda) → bloquear checkout + `system.error` (nunca tarifar a pérdida).
- **DOM-INV-4 (renovación verificada):** tras `renew`, releer `domains/details` y confirmar que `expires_at` avanzó; idempotente por período anclada en `services.expires_at`.
- **DOM-INV-5 (elegibilidad pre-checkout):** `.es` (NIF/NIE) / `.eu` (residencia UE) validados ANTES de cobrar (`REGISTRANT_INELIGIBLE`); defensa plugin-side + contacto regulado al registrar (GL-6/H4).
- **DOM-INV-6 (exactly-once de iniciación de transfer):** `provisionTransferIn` idempotente + adopción ([ADR-084 A2](../../10-decisions/adr-084-comercio-dominios-registrar.md#amendments)).
- **Cobro del transfer = AL COMPLETAR** (failed/cancelled no cobra; el reintento reabre a `pending` sin re-cobrar).
- **R12:** el EPP auth-code viaja en memoria (nunca cola Redis ni `metadata`).
- **R4/DH-INV-7:** la autoridad DNS y el registrar se resuelven por **capability + setting**, nunca por slug.

---

## 15. Decisiones relacionadas

- [ADR-084](../../10-decisions/adr-084-comercio-dominios-registrar.md) — Comercio de dominios (pricing TLD, checkout multi-ítem, DOM-INV, FSM transfer, cobro al completar).
- [ADR-081](../../10-decisions/adr-081-plugin-resellerclub-specifics.md) — ResellerClub specifics (cliente HTTP, lazy customer/contact, endpoints, shapes conservadores).
- [ADR-082](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) — Domain↔Hosting + DNS (F5 dominio-solo, zona post-register, lifecycle, DH-INV-1..7).
- [ADR-077 A10/A13/A14](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments) — Sub-contrato registrar (`is_domain_registrar`, `checkDomainAvailability`/`getTldPricing`, `restoreDomain`/`deleteDomain`/`updateRegistrantContact`, `ProvisionContext.transferAuthCode`).

---

## 16. Excepciones documentadas

- **R1:** los accesos a `OutboxService`/`AuditService`/`PluginRegistryService` son a módulos **core globales** — legítimo.
- **R8:** `domain.expiring_soon` NO usa Outbox **por diseño** (alerta, no transacción de estado; durabilidad aguas abajo vía BullMQ).

---

## 17. Pendiente / deuda técnica

- [ ] **Smoke OT&E real** contra ResellerClub live (gate IP/WAF + NS resolubles) — refinar shapes register-dependientes "conservadores" (GL-6).
- [ ] v1.1: dominios premium (`DOMAIN_PREMIUM` hoy bloquea), child-NS, forwarding, IDN.
- [ ] `domain.contacts_changed` rico (`modify_contacts`) — handler diferido.
- [ ] DC.NEW-72 (auto-cancel no excluye pausas voluntarias) · DC.NEW-73 (reuso de contacto regulado + `protect-privacy` off en `.es/.eu`).

---

## 18. Cómo testear este módulo

- **Unit:** `backend/src/plugins/provisioners/resellerclub/**/*.spec.ts` (plugin, cliente HTTP, crons) + `backend/src/modules/domains/*.spec.ts`.
- **Integración (Postgres real + mock):** `backend/test/integration/resellerclub-transfer.e2e-spec.ts`.
- **E2E (Playwright + `MockResellerClubServer`):** `tests/e2e/sprint-15d-resellerclub-flow.spec.ts` (availability libre/taken/bulk — GL-26).
- **Smoke manual (Yasmin):** registrar (con y sin hosting) + renovar + gestionar NS/privacy/lock + verificar zona DNS — contra OT&E real cuando la IP se whitelistee.
