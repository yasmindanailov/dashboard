# Bitácora F4·W3 — Auto-renovación (toggle real, hosting + dominios)

> Feature dedicada surgida del hub "Mis servicios" (U04). Rama
> `feat/service-auto-renew` desde `master` (`0713feb`). **🟢 CÓDIGO-COMPLETO.**
> DoD verde: back typecheck+lint+**1559** test + **boot smoke 4/4** + migración
> aplicada · front typecheck+lint+**99** test + build.

## 1. Hallazgo empírico que definió el diseño

La auto-renovación en Aelium es **invoice-driven** y funciona **igual para hosting
y dominios**: `BillingLifecycleWorker.generatePendingInvoices` genera la factura de
renovación de todo servicio `active` con `billing_cycle != one_time` al acercarse
`next_due_date`. ResellerClub registra los dominios **sin** auto-renew (default
OFF, `resellerclub.plugin.ts:925`) — Aelium controla la renovación con la factura,
no el registrador.

**Consecuencia:** no hace falta la API de auto-renew de ResellerClub ni un
Amendment de ADR-077. Es **una columna + un gate en el worker + un endpoint de
toggle**, y cubre ambos tipos con el mismo mecanismo (decisión validada con Yasmin
tras el mapa del backend).

## 2. Decisiones Yasmin (durables)

- **Alcance:** toggle real, **hosting + dominios**. "Permitir eso es parte de Aelium."
- **Semántica del OFF (hosting):** al vencer el periodo pagado → **suspender + gracia**
  (aviso → suspende → auto-cancel a los 30d), recuperable. Reusa el dunning.
- **Dominios OFF:** sin factura → expiran solos en el registrador (redención → delete).

## 3. Hecho

**Backend**
- Migración `20260702153654_add_service_auto_renew` → `Service.auto_renew BOOLEAN
  DEFAULT true` (existentes siguen renovando = comportamiento actual).
- `BillingLifecycleWorker.generatePendingInvoices`: gate `auto_renew: true` en el
  `where` → un servicio OFF no recibe factura de renovación (hosting + dominios).
- `ServiceLifecycleWorker.suspendNonRenewedServices` (cron 03:15 UTC + método
  público `runNonRenewedSuspension`): suspende hosting `active` + `auto_renew=false`
  + `next_due_date <= now` (reason `not_renewed`, actor sistema, `suspendAsAdmin`).
  **Excluye dominios** (`product.type != 'domain'`) y respeta una factura abierta
  (deja el dunning por impago). El **auto-cancel existente** (30d) lo cierra.
  Excluida la reason `not_renewed` del aviso de cancelación por impago (copy
  distinto).
- Nuevo `SuspensionReason` **`not_renewed`** (DTO + tipo canónico + los 2 mapas
  exhaustivos de notificaciones + sets `CANONICAL_REASONS`).
- Endpoint `PATCH /services/:id/auto-renew {enabled}` + `ProvisioningService
  .setAutoRenewForUser` (ownership server-side, solo `active`, idempotente,
  audit R3 `service.auto_renew_changed`). **Unificado** hosting+dominios.
- Payloads: `ServiceListItem` / `DomainListItem` / detalle de servicio += `auto_renew`.
- Tests: +5 `setAutoRenewForUser` (ownership/estado/idempotencia/404) + 4
  `runNonRenewedSuspension` (suspende hosting, excluye dominios, respeta factura
  abierta, tolera fallos); ajustado el spec del `where` del aviso de cancelación.

**Frontend**
- Tipos + i18n (`service.suspension_reason.not_renewed`, `service.autorenew.card_title`).
- Server action `setAutoRenewAction` (`PATCH …/auto-renew`).
- Componente compartido **`AutoRenewToggle`** (optimista + toast + `router.refresh`;
  copy de consecuencia distinto por tipo: hosting se suspende / dominio caduca).
- Detalle de servicio: card **"Renovación"** (aside, scope cliente, no dominio, solo
  activo) vía descriptor `auto-renew-card` en el registry frozen (additivo, sin
  tocar `TAB_ORDER`).
- Detalle de dominio (`/dashboard/domains/[id]`): card con el toggle (activo).
- Hub "Mis servicios": la card muestra el **estado real** de auto-renovación
  (hosting y dominios) leyendo la columna.

## 4. DoD

- Backend: `typecheck` ✅ · `lint:check` ✅ · `test` **1559** ✅ · **boot smoke 4/4**
  ✅ (`[internal, manual, enhance_cp, resellerclub]`) · migración aplicada al dev DB.
- Frontend: `typecheck` ✅ · `lint:check` ✅ · `test` **99** ✅ · `build` ✅.

## 5. Pendiente (Yasmin)

- **Smoke funcional/visual:** togglear en el detalle de servicio + de dominio + ver
  el estado en el hub; ver el aviso pre-vencimiento (MailPit) y el CTA "Volver a
  contratar" en un servicio suspendido por `not_renewed`.

## 6. Follow-ups implementados (2026-07-02 noche, misma rama/PR)

Ambos pedidos por Yasmin tras la v1:

### 6.1 — Aviso pre-vencimiento para hosting OFF (`service.expiring_soon`)
- **Cron** `ServiceLifecycleWorker.warnExpiringNonRenewedServices` (09:00 UTC +
  `runExpiringNonRenewedWarnings` testeable): hosting `active` + `auto_renew=false`
  + `next_due_date` en ventana **30/14/7/1d** → emite `service.expiring_soon`
  (EventEmitter, sin Outbox — alerta). **Edge-trigger** por
  `metadata.auto_renew_expiry_warned_window` (un aviso por ventana; si reactiva la
  auto-renovación sale de la query). **Excluye dominios** (tienen
  `domain.expiring_soon`). Mismo patrón que `DomainExpiryWarningsCron`.
- **Listener** `NotificationsOnServiceExpiringListener` → `dispatchToUser` (email +
  campana). `panel_url` = detalle del servicio (donde vive el toggle → reactivar).
- **Plantillas** email+campana (`semantic: warning`, `{{e service_name}}` GL-25) +
  **taxonomía** `service.expiring_soon → servicios` + **`_events.md`** + test del
  seed (`INTERNAL_EVENTS`).
- **Tests:** +2 (`runExpiringNonRenewedWarnings`: emite+persiste ventana / no
  re-avisa en la misma ventana).

### 6.2 — Recontratar tras suspensión (ítem 2, decisión Yasmin "= recontratar")
Verificado empíricamente: no existe flujo de reactivación de hosting; la vía
natural es la tienda. → El banner de servicio suspendido por **`not_renewed`**
ofrece un CTA **"Volver a contratar"** → `/dashboard/store/{product_slug}` (slug ya
en el detalle), en vez del genérico "contactar soporte". Sin backend nuevo.
i18n `service.suspended.client.cta_recontract`.

**DoD (follow-ups):** back typecheck+lint+**1561** test + **boot smoke 4/4** (nuevo
listener) · front typecheck+lint+**99** test + build.
