# partner — Contract

## 1. Propósito

Módulo de **canal de venta indirecta**: agencias (partners) revenden productos de Aelium a sus clientes finales con comisión. El partner NO es cliente ni agente — es una capa intermedia con su propio dashboard, su sistema de comisiones, sus liquidaciones automáticas a fin de mes, y sus clientes vinculados.

**Flujo del dinero:**
```
Cliente del partner paga a Aelium → Aelium retiene (precio − comisión)
                                  → Aelium liquida la comisión al partner a fin de mes
```

---

## 2. Estado de implementación

⬜ **Stub. No implementado.** Este contract documenta el **plan según `docs/PARTNER_*.md`**.

Avances actuales en código:
- Roles `partner`, `partner_pending` definidos en `RoleSlug` (auth)
- Subjects CASL definidos: `Partner`, `PartnerClient`, `PartnerNote`, `PartnerTicket`, `PartnerCommission`, `PartnerPayout`, `PartnerLink`, `PartnerUnlink`, `PartnerNotification`
- Campo `partner_commission_pct` en `products`
- Campo `partner_id` previsto en `users` (revisar schema antes de Sprint dedicado)

Pendiente: módulo backend (carpeta no existe en `backend/src/modules/partner/`), schema completo de las 8 tablas nuevas, frontend partner, lógica de comisiones, payouts.

---

## 3. Modelos Prisma propios (planificados)

> Schema detallado en [`docs/PARTNER_SCHEMA.md`](../../PARTNER_SCHEMA.md).

| Tabla | Descripción | Invariantes esperadas |
|-------|-------------|------------------------|
| `partners` | Datos de la agencia: nombre, CIF, web, datos bancarios para payout, referral_code | `referral_code` único; `cif` validado; estado: `pending`, `active`, `suspended`, `rejected` |
| `partner_notes` | Notas del partner sobre sus clientes | **INMUTABLES** (misma lógica que audit log). No editables ni borrables. |
| `partner_tickets` | Tickets unidireccionales partner→cliente | Distinto de tickets de support. El partner abre, cliente puede responder. Visible a agentes Aelium como contexto. |
| `partner_commissions` | Comisiones generadas por cada pago de cliente del partner | Calculadas automáticamente al `invoice.paid`. Inmutables tras generar. |
| `partner_payouts` | Liquidaciones mensuales | Una por partner por mes. Estado: `pending`, `processing`, `paid`, `failed`. |
| `partner_links` | Enlaces personalizados de captación (referral) | URL con `referral_code`. Tracking de visitas y conversiones. |
| `partner_unlink_requests` | Solicitudes de desvinculación cliente↔partner | Workflow: cliente solicita → partner acepta/rechaza → si rechaza, ticket a agente Aelium. |
| `partner_notifications` | Mensajes unidireccionales partner→cliente | Sin reply. Para anuncios, novedades, info. |

Campos añadidos a tablas existentes:
- `users.partner_id` (FK a `partners`, nullable) — el cliente referido por un partner
- `services.partner_id` (denormalizado para queries de comisiones)
- `invoices.partner_id` (denormalizado)

---

## 4. Modelos foráneos accedidos (planificados)

| Tabla | Módulo dueño | Tipo | Razón |
|-------|--------------|------|-------|
| `users` | auth | lectura | Listar clientes referidos del partner; resolver datos del cliente final |
| `invoices` | billing | lectura | Mostrar histórico de facturas de los clientes del partner (read-only) |
| `services` | billing | lectura | Mostrar servicios activos de los clientes del partner |
| `conversations` | support | lectura | Ver historial de soporte de los clientes del partner |
| `products` | products | lectura | Para mostrar catálogo y comisiones por producto |
| `events / event_outbox` | core | escritura | Emitir eventos críticos via Outbox (R8) — payouts y comisiones SÍ deben usar Outbox |

---

## 5. API REST expuesta (planificada)

Prefix: `/api/v1/partner`. JWT auth con rol `partner` (o `partner_pending` con scope limitado).

### Auth y onboarding

| Método | Ruta | Descripción | CASL |
|--------|------|-------------|------|
| `POST` | `/auth/register-partner` | Registro de partner (rol `partner_pending`) | Sin auth |
| `GET` | `/partner/profile` | Datos de la agencia | rol partner |
| `PATCH` | `/partner/profile` | Actualizar datos (CIF, web, banco) | rol partner |

### Dashboard partner

| Método | Ruta | Descripción | CASL |
|--------|------|-------------|------|
| `GET` | `/partner/clients` | Listar clientes del partner | `Read.PartnerClient` |
| `GET` | `/partner/clients/:id` | Ficha cliente con servicios + facturas + soporte (read-only) | `Read.PartnerClient` + ownership |
| `POST` | `/partner/clients/:id/notes` | Añadir nota inmutable | `Create.PartnerNote` |
| `GET` | `/partner/clients/:id/notes` | Listar notas | `Read.PartnerNote` |
| `POST` | `/partner/clients/:id/tickets` | Abrir ticket al cliente | `Create.PartnerTicket` |
| `GET` | `/partner/clients/:id/tickets` | Listar tickets partner→cliente | `Read.PartnerTicket` |
| `POST` | `/partner/clients/:id/notifications` | Enviar notificación unidireccional | `Create.PartnerNotification` |

### Comisiones y payouts

| Método | Ruta | Descripción | CASL |
|--------|------|-------------|------|
| `GET` | `/partner/commissions` | Comisiones generadas (filtros mes, cliente, producto) | `Read.PartnerCommission` |
| `GET` | `/partner/payouts` | Histórico de liquidaciones | `Read.PartnerPayout` |
| `GET` | `/partner/payouts/:id` | Detalle de una liquidación con desglose | `Read.PartnerPayout` |

### Desvinculación

| Método | Ruta | Descripción | CASL |
|--------|------|-------------|------|
| `POST` | `/partner/unlink/:clientId` | Partner desvincula a un cliente | `Create.PartnerUnlink` |
| `GET` | `/partner/unlink-requests` | Solicitudes de desvinculación pendientes | `Read.PartnerUnlink` |
| `PATCH` | `/partner/unlink-requests/:id` | Aceptar / rechazar (si rechaza, abre ticket a Aelium) | `Update.PartnerUnlink` |

### Vinculación cuenta cliente (cuando el partner también compra a Aelium)

| Método | Ruta | Descripción | CASL |
|--------|------|-------------|------|
| `POST` | `/partner/link-account` | Solicitar vinculación con cuenta cliente personal | `Create.PartnerLink` |
| `GET` | `/partner/link-status` | Estado de la vinculación | `Read.PartnerLink` |

---

## 6. WebSocket gateway

N/A planificado. El partner no necesita realtime — sus interacciones (notas, tickets, notificaciones) son async. Si en el futuro se necesita realtime para anuncios urgentes, evaluar.

---

## 7. Eventos emitidos (planificados)

| Evento | Cuándo se emitirá | Outbox | Consumidor planificado |
|--------|-------------------|--------|-----------------------|
| `partner.registered` | Tras `register-partner()` exitoso | sí (R8) | audit, notification al admin |
| `partner.approved` | Admin cambia estado `pending → active` | sí | email al partner + activar dashboard |
| `partner.rejected` | Admin rechaza solicitud | no | email al partner con motivo |
| `partner.client_linked` | Cliente se registra via referral_code | sí (R8) | actualizar `users.partner_id`, audit |
| `partner.client_unlinked` | Tras flujo de desvinculación | sí | notificar a ambas partes |
| `partner.commission_generated` | Tras `invoice.paid` de cliente del partner | **sí — crítico (dinero)** | acumular en partner_commissions |
| `partner.payout_initiated` | Cron mensual ejecuta liquidación | **sí — crítico (dinero)** | banking provider, email al partner |
| `partner.payout_completed` | Banking provider confirma transferencia | **sí — crítico** | email al partner con resumen |
| `partner.payout_failed` | Banking provider rechaza transferencia | **sí — crítico** | notificar superadmin + retry policy |

> **R8 Outbox crítico** para todos los eventos relacionados con dinero (commissions, payouts). Si el evento se pierde, hay descuadre financiero. Esto es **no-negociable** para este módulo.

---

## 8. Eventos consumidos (planificados)

| Evento | Origen | Reacción |
|--------|--------|----------|
| `auth.registered` | auth | Si el user vino de un `referral_code`, vincular con su partner (`users.partner_id = partner.id`) y emitir `partner.client_linked` |
| `invoice.paid` | billing | Calcular comisión según `partner_commission_pct` del producto, persistir en `partner_commissions`, emitir `partner.commission_generated` |
| `service.cancelled` | billing | Notificar al partner que un cliente suyo canceló (audit + dashboard) |

---

## 9. Servicios consumidos cross-módulo

Ninguno cross-módulo (Regla R1). La integración con billing y auth se hará vía eventos.

Sub-services internos planificados (R15):
- `PartnerService` (fachada)
- `PartnerOnboardingService` — registro, aprobación, rechazo
- `PartnerCommissionService` — cálculo de comisiones
- `PartnerPayoutService` — generación y ejecución de payouts
- `PartnerUnlinkService` — workflow desvinculación
- `PartnerCommissionWorker` — cron mensual de payouts

---

## 10. CASL — Permisos (planificados)

### Subjects gestionados

`Subject.Partner`, `Subject.PartnerClient`, `Subject.PartnerNote`, `Subject.PartnerTicket`, `Subject.PartnerCommission`, `Subject.PartnerPayout`, `Subject.PartnerLink`, `Subject.PartnerUnlink`, `Subject.PartnerNotification`.

### Permisos por rol

Solo el rol `partner` (no `partner_pending`) tiene permisos sobre estos subjects, todos con condición `partner_id = $self.partner_id`:

| Subject | partner | superadmin | agent_full |
|---------|---------|------------|------------|
| `Partner` (sus datos) | read/update (own) | read/list | read/list |
| `PartnerClient` | read/list (own) | — | — |
| `PartnerNote` | create/read/list (own) | — | — |
| `PartnerTicket` | manage (own) | — | — |
| `PartnerCommission` | read/list (own) | read/list | read/list |
| `PartnerPayout` | read/list (own) | manage | read/list |
| `PartnerLink` | create/read (own) | manage | — |
| `PartnerUnlink` | create/read/list (own) | manage | — |
| `PartnerNotification` | create/read/list (own) | — | — |

> El `partner_pending` solo puede leer/editar su propio perfil hasta que el admin lo apruebe.

---

## 11. Settings consumidos (planificados)

| Categoría | Key | Default | Para qué |
|-----------|-----|---------|----------|
| `partner` | `default_commission_pct` | 10 | Comisión por defecto si producto no la define |
| `partner` | `payout_schedule_cron` | `0 0 1 * *` | Cron mensual de payouts (día 1 de cada mes) |
| `partner` | `payout_minimum_eur` | 50 | Mínimo de comisiones acumuladas para ejecutar payout (si no, acumular al mes siguiente) |
| `partner` | `unlink_grace_days` | 7 | Días de gracia tras desvinculación antes de cambiar etiqueta de facturas |
| `partner` | `linked_account_discount_pct` | 5 | Descuento aplicado a partners con cuenta cliente vinculada |

---

## 12. Emails enviados (planificados)

| Trigger | Plantilla | Subject | Destinatario |
|---------|-----------|---------|--------------|
| `partner.registered` | `partnerWelcomeTemplate` | `Solicitud recibida — Aelium Partners` | Partner |
| `partner.approved` | `partnerActivationTemplate` | `Tu cuenta partner está activa — Aelium` | Partner |
| `partner.rejected` | `partnerRejectionTemplate` | `Sobre tu solicitud de partner — Aelium` | Partner |
| `partner.client_linked` | `partnerNewClientTemplate` | `Nuevo cliente referido: {nombre}` | Partner |
| `partner.payout_completed` | `partnerPayoutTemplate` | `Liquidación de {mes}: {importe}€ — Aelium Partners` | Partner |
| `partner.payout_failed` | (a superadmin) | `URGENTE: payout fallido para {agencia}` | superadmin |

---

## 13. Jobs / cron (planificados)

| Cron | Método | Qué hace |
|------|--------|----------|
| `0 0 1 * *` (mensual, día 1) | `PartnerPayoutWorker.executeMonthlyPayouts()` | Calcular comisiones del mes anterior, generar `partner_payouts`, ejecutar transferencias via banking provider |
| `0 6 * * *` (diario 6 AM) | `PartnerPayoutWorker.retryFailedPayouts()` | Reintentar payouts fallidos hasta N reintentos |

---

## 14. Invariantes (planificadas)

- **PART-INV-1:** Un cliente solo puede estar vinculado a UN partner a la vez. Cambiar requiere desvinculación previa.
- **PART-INV-2:** `partner_commissions` es **inmutable** tras generación. Ajustes se hacen mediante registros nuevos (compensación), no edición.
- **PART-INV-3:** `partner_notes` es **inmutable** (misma lógica que audit log — R3). Errores se documentan con notas adicionales.
- **PART-INV-4:** Los payouts SOLO se ejecutan vía cron mensual + Outbox. Nunca manualmente desde una API. Garantía de trazabilidad.
- **PART-INV-5:** Si un cliente del partner cancela todos sus servicios pero mantiene cuenta activa → la vinculación con el partner SE MANTIENE (no se rompe automáticamente).
- **PART-INV-6:** Las comisiones se calculan al `invoice.paid`, no al `invoice.created`. Si la factura se reembolsa después → se compensa con commission negativa.
- **PART-INV-7:** El partner NO puede modificar precios al cliente final. Los precios los fija Aelium. (Apertura futura posible bajo decisión de producto.)

---

## 15. Decisiones relacionadas

> Migrar a ADRs en F2.

- [`PARTNER_DECISIONS.md`](../../PARTNER_DECISIONS.md) — Documento maestro completo (15 secciones)
- [`PARTNER_ARCHITECTURE.md`](../../PARTNER_ARCHITECTURE.md) — Arquitectura técnica del módulo
- [`PARTNER_SCHEMA.md`](../../PARTNER_SCHEMA.md) — Schema completo de tablas
- `DECISIONS.md` §5 — Roles del sistema (incluye `partner` y `partner_pending`)

---

## 16. Excepciones documentadas (anticipadas)

- **R1 (módulos no se llaman):** ✅ planificado cumplir 100%. Toda integración con billing/auth/support será via eventos.
- **R3 (audit inmutable):** ✅ aplicada también a `partner_notes` y `partner_commissions`.
- **R8 (Outbox):** **CRÍTICO** — todos los eventos de dinero (`partner.commission_*`, `partner.payout_*`) DEBEN usar Outbox desde el primer commit. Sin excepciones.
- **R4 (plugins):** banking provider para payouts será un plugin (interface `BankingProvider`). Implementaciones: `sepa`, `stripe_connect`. Core no importa Stripe directamente.

---

## 17. Pendiente / deuda técnica

Todo el módulo está pendiente. Plan maestro en `PARTNER_DECISIONS.md`. Resumen de hitos:

- [ ] Schema Prisma: 8 tablas nuevas + campos en `users`, `services`, `invoices`, `products`
- [ ] Backend: módulo completo (`backend/src/modules/partner/`)
- [ ] Plugin `BankingProvider` interface + implementación SEPA mínima
- [ ] Frontend partner: dashboard, ficha de cliente, comisiones, payouts
- [ ] Frontend cliente del partner: indicador "Aelium · Partner with [agencia]"
- [ ] Onboarding flow: registro → email verify → pending → admin aprueba → activación
- [ ] Lógica de comisiones (cálculo, persistencia, refunds compensados)
- [ ] Cron mensual de payouts con Outbox
- [ ] Workflow de desvinculación (cliente solicita / partner solicita / forzada por admin)
- [ ] Vinculación de cuenta cliente personal con cuenta partner (descuento aplicado)
- [ ] Tests E2E completos del flow partner
- [ ] Migración de la doc PARTNER_*.md a ADRs individuales (F2)

---

## 18. Cómo testear este módulo (cuando se implemente)

### Tests E2E críticos
1. Registro de partner → admin aprueba → partner accede a dashboard
2. Registro de cliente via referral_code → vinculación automática → factura con label "Aelium · Partner with X"
3. Cliente del partner paga factura → `partner.commission_generated` → suma en `partner_commissions`
4. Cron mensual ejecuta payout → SEPA transferencia → email al partner
5. Cliente solicita desvinculación → partner rechaza → ticket a agente Aelium
6. Partner desvincula cliente → cliente queda como cliente directo de Aelium

### Smoke tests
1. Verificar que `partner_pending` NO puede acceder a `/partner/clients`
2. Verificar que un partner NO ve clientes de otro partner
3. Verificar que las notas del partner son inmutables (intento de PATCH rechazado)
4. Verificar que el cron de payouts no duplica liquidaciones si se ejecuta dos veces
