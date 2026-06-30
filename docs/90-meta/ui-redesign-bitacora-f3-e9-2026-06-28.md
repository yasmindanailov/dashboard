# Bitácora — Rediseño UI · F3·E9: SLA (visualización)

> **Rama:** `redesign/f3-sla-ui` · **Fecha:** 2026-06-28 · **Estado:** código-completo, verde ([PR #143](https://github.com/yasmindanailov/dashboard/pull/143)).
> **Mapa:** [`ui-migration-backlog-2026-06-26.md` §8 E9](./ui-migration-backlog-2026-06-26.md) · mockups [`admin/BandejaTickets.dc.html`](../../../mockup-uiux/admin/BandejaTickets.dc.html) · [`admin/TicketConversacion.dc.html`](../../../mockup-uiux/admin/TicketConversacion.dc.html) · [`Soporte.dc.html`](../../../mockup-uiux/Soporte.dc.html).

## Objetivo

Hacer **visible el SLA de 1ª respuesta** de cada conversación en las superficies de
soporte: una **pill por fila** en la bandeja del staff y una **tira de estado** bajo
el header del detalle. Sobre datos que **ya existen** (`first_response_at` +
`response_sla_hours` del tier Support Inside del cliente). Scope E9: "mayormente UI".

## Decisión de vertical (Yasmin, 2026-06-28)

E9 (SLA, talla M, menor riesgo, complementa E7 que ya cita "SLA agregado") frente a
E8/E12/E13. **Stripe E6 sigue aplazado** "tras el diseño".

## Arquitectura clave

- **El cálculo del SLA vive en backend** (autoridad de tiempo única; snapshot
  consistente entre lista y detalle; testeable). El front **solo presenta**. Es lo
  que pide el scope ("exponer en el payload de conversación").
- Helper puro **`backend/src/modules/support/support-sla.helper.ts`**
  (`computeConversationSla`): a partir de `created_at`, `first_response_at`, `status`
  y `response_sla_hours` deriva el estado SLA. Sin plan SI → **24 h** (alineado con
  `core/tasks/sla-helper.ts` `mapSITierToTicketSlaHours`, "sin SI = básico, no
  penalizar"). NO toca `Task.due_date` (otro dominio).
- **Estados** (derivados del status + 1ª respuesta): `running` (sin 1ª respuesta,
  dentro de plazo) · `breached` (sin 1ª respuesta, vencido) · `paused`
  (`waiting_client`) · `met` (1ª respuesta dada) · `none` (terminal sin responder /
  no aplica).

## Contrato del payload (objeto `sla`)

Mapea los tres campos del scope (`sla_due_at`→`due_at`,
`sla_remaining_pct`→`remaining_pct`, `first_response_pending`) + soporte para la UI:

```ts
sla: {
  state, due_at, response_sla_hours, first_response_pending,
  remaining_ms, remaining_pct,        // running/breached (remaining_ms<0 = vencido)
  responded_in_ms, responded_within_sla, // met
}
```

## Cambios

**Backend**
- `support-sla.helper.ts` (net-new) + `support-sla.helper.spec.ts` (**12 tests**:
  running/breached/paused/met/none, default 24 h, dentro/fuera de plazo).
- `support-query.service.ts`:
  - `findOne` (detalle): adjunta `sla` reutilizando el `response_sla_hours` del
    `client_support_inside` ya resuelto.
  - `findAll` (bandeja): **`include` anidado** del owner
    (`user.support_inside_subscription.product.support_inside_config.response_sla_hours`)
    en la **misma** query → SLA por fila **sin N+1**. El re-sort de chats opera sobre
    el array ya enriquecido.

**Frontend**
- Tipos: `ConversationSla` + `ConversationSlaState` en `_shared/support/types.ts`
  (re-exportados en `conversation/types.ts`); `sla?` en `Ticket` y `ConversationDetail`.
- Componente net-new **`SlaIndicator`** (`_shared/support/SlaIndicator.tsx` + CSS
  Module, tokens-only) + **12 tests**:
  - Variante `inline` (pill de fila): icono + texto coloreado, **solo** running/breached
    (oculta el resto — igual que el mockup `has:false` para paused/done).
  - Variante `detail` (tira del header): icono + texto + fondo tintado por tono.
  - Audiencia `admin` (literal: "SLA en 3 h" / "SLA vencido" / "...en pausa" /
    "Primera respuesta a tiempo") vs `client` (tranquilizador: "Dentro de plazo" /
    "Quedan … para responderte"; **nunca** "vencido" → breach se enmarca como
    "Estamos priorizando tu respuesta").
- Cableado:
  - `TicketList` (bandeja): pill en la columna meta, **gated `isAdmin`** (el mockup
    cliente no lleva SLA por fila).
  - `ConversationHeader` (detalle): tira bajo el header. Admin → cualquier estado
    vivo; cliente → solo tickets con `client_support_inside`. **Terminal**
    (resuelta/cerrada) → oculta (la resolución ya se comunica en banner/sidebar).

## Fidelidad a los mockups (1:1)

Ambos mockups muestran el SLA como **tira/pill de estado** (icono + texto, fondo
tintado), **no** como barra de progreso. Por la regla "mockups = fuente de verdad
1:1" **no** se añadió gauge (el DS tiene `Meter`, pero ningún mockup lo dibuja aquí).
Iconos Lucide (`Clock`/`AlertTriangle`/`PauseCircle`/`CheckCircle2`/`ShieldCheck`),
colores por tono desde tokens (`--warning-hover`/`--danger`/`--success`/
`--text-secondary` + `*-light` para los fondos).

## DoD

- Backend: typecheck ✓ · lint:check ✓ · test **109 suites / 1431** ✓.
- Frontend: typecheck ✓ · lint:check ✓ · test **11 suites / 80** ✓.
- Boot smoke **no aplica**: no se tocó `@Module`/DI (el helper es función pura
  importada por un service existente).

## Diferido (consciente)

- **SLA en `ChatsWorkspace`** (panel de chats en vivo, otra superficie/componente) —
  los chats son síncronos; entra cuando se reskinee ese panel en F4.
- **Placement fino** de la tira en el detalle cliente (el mockup `Soporte` la pone en
  una card propia; aquí va bajo el header compartido) → se ajusta al reskinear Soporte
  en F4.
- **SLA por turno** (deadline de cada respuesta posterior, no solo la 1ª): requiere
  trackear el "último mensaje entrante sin responder"; fuera del scope E9
  (`first_response_at`).

## Falta (Yasmin)

- Smoke visual 1:1 en el navegador (bandeja de tickets admin + detalle de ticket con
  cliente con/ sin plan SI; cliente en `/dashboard/support/[id]`).
