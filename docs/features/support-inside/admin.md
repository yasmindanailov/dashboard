# Support Inside — Guía de administración

> Módulo: `support-inside` (sub-dominio de `support` + integración transversal con `billing` + `tasks` + `notifications`)
> Sprints: 8 Fase D + sub-fase D.12 (visibilidad transversal)
> Última actualización: 2026-05-01 (cierre Sprint 8)
> Audiencia: superadmin + `agent_full` (`Manage.SupportInside`).

---

## 1. Qué es Support Inside

Support Inside es un **tier de cuenta visible**, NO un producto técnico aislado ([ADR-061](../../10-decisions/adr-061-support-inside-tier-cuenta-ux.md)). Es la diferencia entre que el cliente se sienta "uno más" y se sienta "cliente Premium con SLA".

El cliente paga una suscripción mensual o anual (`Básico`, `Medium`, `Pro`) que le otorga:

- **Slots** de mantenimiento mensual asignables a sus servicios técnicos compatibles (hosting, Docker, etc.).
- **SLA** de respuesta diferenciado (24h Básico → 4h Pro).
- **Canales activos** de contacto con agente real (webchat + email; ver GL-23 §2).
- **Prioridad automática** en tickets de soporte abiertos por el cliente (mapeo `priority_tier → ConversationPriority`).
- **Visibilidad transversal**: badges en `/admin/clients/:id`, en `/admin/support` (ConversationHeader) y en su dashboard cliente.

> **Doctrina canónica:** Support Inside NO se vende como producto técnico. Se vende como **valor añadido visible** al hosting/Docker/Cloud Office. La auditoría 2026-05-01 (Fase D.12) cerró el drift "módulo aislado" y materializó visibilidad transversal en 3 puntos UI.

---

## 2. Los 3 planes canónicos

Seedeados en `prisma/seeds/support-inside-plans.ts` (NO es demo data — son operación canónica de la empresa, se siembran incluso en `NODE_ENV=production`):

| Plan | Slug | Slots | SLA | Canales | Mensual | Anual (−15%) | priority_tier |
|------|------|-------|-----|---------|---------|--------------|---------------|
| Básico | `support-inside-basico` | 0 | 24h | webchat + email | 19 € | 193,80 € | `standard` |
| Medium | `support-inside-medium` | 1 | 12h | webchat + email | 39 € | 397,80 € | `high` |
| Pro | `support-inside-pro` | 1 | 4h | webchat + email | 79 € | 805,80 € | `max` |

> **GL-23 (audit 2026-06-25):** tabla alineada al **seed real** (`prisma/seeds/support-inside-plans.ts`). `channels_active` = canales **entregables hoy** (webchat + email); `phone`/`whatsapp` retirados de la oferta hasta que exista dispatcher (DC.20). **Precios y slots por plan NO modificados** (decisión Yasmin 2026-06-26). El slot de Pro es de tipo *mantenimiento + gestión proactiva* (Medium = *mantenimiento*).

> **Por qué tres y no cinco**: la decisión deliberada es ofrecer un comparador limpio (3 cards lado a lado). Crear un cuarto plan exige migración + seed + ADR específico — cambiar la oferta comercial merece auditoría git, no clic en UI ([ADR-075](../../10-decisions/adr-075-support-inside-ux-lista-y-aislamiento-productos.md) §B.2).

---

## 3. Aislamiento del CRUD genérico de productos ([ADR-075](../../10-decisions/adr-075-support-inside-ux-lista-y-aislamiento-productos.md))

Los planes Support Inside son productos `type='support_inside'` en la tabla `products`, pero **NO se gestionan desde `/admin/products`**:

| Capa | Comportamiento |
|------|----------------|
| **Backend `SupportInsideIsolationGuard`** | Aplicado a `AdminProductsController.create/update/delete`. Rechaza con 400 cualquier mutación sobre `type=support_inside` salvo que la request lleve header interno `X-Aelium-Source: support-inside-admin` (lo añade el editor dedicado). Defense in depth nivel 1. |
| **Frontend `PRODUCT_TYPES_CREATABLE`** | Constante canónica en `app/admin/products/new/constants.ts` que excluye `support_inside`. El selector "Crear producto nuevo" no lo lista. |
| **Listado `/admin/products`** | Las filas con `type='support_inside'` se renderizan con `opacity:0.7`, badge "Tier de cuenta" (variant neutral), botón único "Gestionar →" enlazando a `/admin/support-inside-plans/<slug>`. |
| **Detalle directo `/admin/products/:id`** | Si `type='support_inside'`, el frontend hace `router.replace('/admin/support-inside-plans/<slug>')` con toast info. No verás el form genérico de productos. |

---

## 4. UI canónica — 3 rutas

### 4.1 `/admin/support-inside-plans` (índice admin)

**Tabla vertical** de 3 filas (NO comparador). Columnas:

| Plan | Mensual | Anual + savings% | Slots | Estado | Última edición |
|------|---------|------------------|-------|--------|----------------|

Click en fila → editor `/admin/support-inside-plans/<slug>`. **No hay botón "Crear plan"** — un cuarto plan exige migración + ADR.

### 4.2 `/admin/support-inside-plans/<slug>` (editor)

Pila vertical de **5 secciones card extensibles** ([ADR-075](../../10-decisions/adr-075-support-inside-ux-lista-y-aislamiento-productos.md) §B.2). Cada card tiene su propio botón "Guardar cambios" — NO auto-save:

1. **Identidad** — nombre del producto, slug (read-only), descripción, badge_text destacado en el comparador, color del plan.
2. **Precios** — pricing mensual + anual con `cycle` y `discount_percentage`. Patrón canónico: editar el campo emite delta solo de los campos modificados.
3. **Slots y capacidades** — número de slots incluidos, tipos de slot permitidos (multi-select chips), `applicable_product_types` (multi-select chips de los 5 tipos válidos: hosting_web, docker_service, etc.).
4. **Soporte y canales** — `priority_tier` (standard / high / max), `response_sla_hours`, `channels_active` (multi-select de canales).
5. **Configuración avanzada** — `auto_renew_default`, `cancellation_grace_days`, custom metadata.

> **Patrón de extensibilidad canónico:** cuando un sprint futuro (Sprint 9.5/12/15F) añada un atributo nuevo a Support Inside, se añade UNA card más al final de la pila. NO se redistribuyen campos entre cards existentes (rompería la convención del usuario).

### 4.3 `/dashboard/support-inside` (cliente — para staff que necesite ver lo que ve el cliente)

Como admin, puedes inspeccionar la vista del cliente impersonando o con sesión real cliente. Comparador 3 cards lado a lado si no tiene plan; vista de gestión con slots + canales + SLA + acción cancelar si tiene plan activo.

---

## 5. Cómo se contrata Support Inside (flujo canónico)

[ADR-076](../../10-decisions/adr-076-checkout-unico-support-inside-via-evento.md) (2026-05-01) unifica el flujo: **un único motor de checkout cliente — `/dashboard/billing/checkout`. Support Inside es consumidor del evento `service.provisioned`, no caso especial UX.**

```
1. Cliente click "Suscribirme" en /dashboard/support-inside
   ↓
2. Frontend redirige a /dashboard/billing/checkout?product_pricing_id={pricingId}
   ↓
3. BillingCheckoutService.checkout() resuelve product.type='support_inside':
   - Crea Service + Invoice (pending)
   - Emite service.provisioned (en transacción)
   ↓
4. SupportInsideOnServiceProvisionedListener consume el evento:
   - Filtra: solo si product.type === 'support_inside'
   - Crea (o reactiva) SupportInsideSubscription apuntando al service.id
   - Emite support_inside.subscribed
   ↓
5. SupportInsideAuditListener consume support_inside.subscribed → AuditService.logChange
```

**El endpoint `POST /dashboard/support-inside/subscribe` sigue existiendo** como API alternativa interna (tests E2E + scripts seed) pero NO está expuesto en el frontend cliente.

---

## 6. Asignación de slots

Un slot Support Inside se asigna a un servicio técnico del cliente. La asignación dispara el cron `maintenance-monthly` para ese slot.

### 6.1 Restricción `applicable_product_types` (Fase D.12.fix)

Cada plan declara `support_inside_config.applicable_product_types` (`ProductType[]`). El default canónico de Básico/Medium/Pro es `['hosting_web', 'docker_service']`. Empty array = sin restricción (reservado para plan Enterprise futuro).

**Regla canónica:**
- `addSlot()` rechaza con 400 si `service.product.type` ∉ `applicable_product_types`.
- `support_inside` NUNCA puede ser slot de sí mismo (defense in depth: filtro server-side en `eligible-services` + check en `addSlot()`).

### 6.2 Cron `maintenance-monthly` doctrinal ([ADR-034](../../10-decisions/adr-034-support-inside-modelo.md) §recurrencia)

Schedule: `0 6 * * *` UTC (diario, NO mensual). Filtro: `WHERE anniversary_day = EXTRACT(DAY FROM NOW())`.

**Por qué diario:** distribuye la carga del equipo a lo largo del mes en lugar de concentrar todos los mantenimientos el día 1. Cada slot tiene su `anniversary_day` (1..28) seteado al asignarse (`LEAST(getUTCDate(), 28)`). Capado a 28 para evitar el bug clásico de meses cortos (febrero EC-T8-48).

**Idempotencia** garantizada por UNIQUE compuesto `(service_id, billing_month, type)` en `tasks`.

---

## 7. Listeners transversales

Tres listeners cierran la doctrina ADR-061 §"tier de cuenta visible":

| Listener | Consume | Efecto |
|----------|---------|--------|
| `SupportInsidePriorityListener` | `conversation.created` | Si el cliente tiene SI activa, sobrescribe `priority` de la conversación con `priority_tier` mapeado (`standard→normal`, `high→high`, `max→urgent`). **Compare-and-swap por status**: solo escala si `priority='normal'` (preserva elección manual del agente — EC-T8-47). |
| `SupportInsideAuditListener` | 4 eventos canónicos (`support_inside.subscribed`, `cancelled`, `slot_assigned`, `slot_released`) | `AuditService.logChange()` con `entity_type` distinguiendo subscription vs slot. Cumple R3 (audit inmutable) + alimenta portal transparencia cliente (Sprint 9 Fase E). |
| `SupportInsideOnServiceProvisionedListener` | `service.provisioned` | Si `product.type='support_inside'`: crea/reactiva `SupportInsideSubscription`. Si no: skip silencioso (defense in depth — permite coexistencia futura con listeners de hosting/docker en Sprint 11). |

---

## 8. Helpers single-query (sin N+1)

Tres servicios ya existentes se enriquecieron en Fase D.12 con info SI **sin queries adicionales** (single query con `include`):

| Helper | Qué incluye ahora |
|--------|-------------------|
| `clientsService.findOne` (admin) | `support_inside_subscription { product, support_inside_config, slots }` |
| `supportQueryService.findOne` (ticket detail admin) | `client_support_inside { product_slug, product_name, priority_tier, response_sla_hours, channels_active }` |
| `dashboardService.getClientOverview` (cliente) | `support_inside { product_name, slug, priority_tier, response_sla_hours, slots_included, slots_used }` |

> **Patrón canónico:** cuando un módulo nuevo necesite mostrar info Support Inside, NO consulta `support_inside_subscriptions` por separado — pide al servicio `clients` (o equivalente) que extienda su `include`. Mantiene latencia y N+1 controlados.

---

## 9. Visibilidad transversal — 3 badges + 1 stat + 1 modal

| Componente UI | Cuándo aparece | Información |
|---------------|----------------|-------------|
| Badge `<Badge variant="brand">Support Inside {tier}</Badge>` en `ClientDetailHeader` admin | `client.support_inside_subscription.status === 'active'` | Tooltip "SLA {N}h · canales: {lista}". Click → `/admin/support-inside-plans/<slug>`. |
| Badge `{plan} · SLA {N}h` en `ConversationHeader` (admin) | El cliente del ticket tiene SI activa | Tooltip canales activos. Permite al agente entender el SLA esperado de un vistazo. |
| Card "Mi plan Support Inside" en `ClientStats` (overview cliente) | Cliente con SI activa o sin plan (CTA "Activa Support Inside") | Plan + slots usados/incluidos + link a `/dashboard/support-inside`. |
| Modal "Asignar slot" en gestión cliente | Cliente con plan activo + ≥1 slot disponible | Select de servicios `eligible-services` filtrados por `applicable_product_types`. |

---

## 10. CASL y permisos

| Subject | superadmin | agent_full | agent_billing | agent_support | client | partner |
|---------|------------|------------|---------------|---------------|--------|---------|
| `SupportInside` | manage (wildcard `Manage.All`) | manage explícito | — | — | `[Read, List, Update]` (su propia subscription, ownership) | — |

**Nota:** los clientes pueden gestionar su propia subscription (`subscribe`, `cancel`, `addSlot`, `releaseSlot`, `getStatus`) porque son su propietario. Defense in depth verifica `userId === subscription.client_id` en cada endpoint.

---

## 11. Endpoints REST

### Cliente (`/api/v1/dashboard/support-inside/*` — JWT + ownership)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/plans` | Comparador público — los 3 planes activos con `support_inside_config` + pricing |
| `GET` | `/status` | Subscription activa del cliente + slots + canales |
| `POST` | `/subscribe` | API interna alternativa (NO usada por frontend — usa `/billing/checkout`) |
| `GET` | `/upgrade/preview` | Preview del prorrateo de un cambio de plan (R5, antes de confirmar) — GL-23 |
| `POST` | `/upgrade` | Cambia de plan (upgrade/downgrade) con prorrateo (GL-23 / ADR-029 A1) |
| `POST` | `/cancel` | Cancela + libera slots cascada (operación destructiva con modal) |
| `POST` | `/slots` | Asigna slot a servicio (filtro `applicable_product_types`) |
| `DELETE` | `/slots/:id` | Libera slot |
| `GET` | `/eligible-services` | Servicios del cliente sin slot, filtrados por `applicable_product_types` |

### Admin (`/api/v1/admin/support-inside/*` — superadmin + agent_full)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/plans` | Listado 3 filas (admin index) |
| `GET` | `/plans/:slug` | Detalle full editor (5 secciones) |
| `PATCH` | `/plans/:slug` | Update transaccional (products + support_inside_config + product_pricing) |
| `POST` | `/cron/maintenance-monthly` | Trigger manual cron (smoke + E2E + recovery) — `Manage.Job` |
| `PATCH` | `/subscriptions/:id/technician` | Asignar/reasignar el técnico de la suscripción (`null` desasigna). Reasigna las tareas de mantenimiento **pending** del periodo · evento `support_inside.technician_assigned` (F3·E8) |
| `GET` | `/subscriptions/by-service/:serviceId` | Bloque gestionado (técnico + presencia + progreso de mantenimiento + SLA) de la suscripción dueña del servicio. 404 si el servicio no es SI (F3·E8) |
| `GET` | `/technicians/eligible` | Técnicos elegibles (staff de soporte activo) con presencia + carga de mantenimiento, para el picker "Reasignar técnico" (F3·E8) |

> **NO hay POST ni DELETE de planes** — cambiar la oferta comercial exige migración + seed + ADR.

### 11.1 Gestión per-cliente — en el detalle de servicio (F3·E8 Fase D)

La gestión admin de una suscripción SI **NO es una página nueva**: vive en el
**detalle de servicio unificado** `/admin/services/[id]` (plantilla única
cliente+admin, Sprint 15C.II F.12). Cuando el servicio es SI
(`product_type === 'support_inside'`):

- **Sección "Plan de soporte"** (registry `ADMIN_SERVICE_DETAIL_SECTIONS`,
  capability-driven por `ctx.supportInside`): progreso de mantenimiento del
  periodo, SLA y técnico asignado con presencia. Oculta si el servicio está en
  estado terminal (1:1 con el mockup `SupportInsideDetalleAdmin`).
- **"Reasignar técnico…"** en el menú "Más acciones" (kebab) → modal picker
  ([DS-A18]): agentes de soporte elegibles con avatar + presencia + carga,
  buscador, y opción de desasignar. Usa `PATCH /subscriptions/:id/technician`.
- La **presencia** del staff la mantiene `PresenceHeartbeat` (montado en
  `AdminShell`) → `POST /presence/heartbeat`.

Decisión Yasmin (2026-06-29): **extender** el detalle (no duplicar página/lista
de suscripciones) — los mockups confirman que `admin/SupportInside.dc.html` es la
**lista de planes** (= `/admin/support-inside-plans`, ya existente) y el detalle
admin es esta extensión. "Programar mantenimiento" queda **omitido** (D-3).

### 11.2 Qué implica asignar un técnico + extras (F3·E8, 2026-06-29)

- **Responsabilidad del técnico (qué hereda al ser asignado):**
  1. **Mantenimiento mensual** — el cron `maintenance-monthly` asigna al técnico la
     tarea de mantenimiento de los servicios del cliente (si sigue elegible; si no,
     auto-asignación por carga).
  2. **Tickets y chats del cliente** (F3·E8, 2026-06-29) — `SupportInsideTechnicianRoutingListener`
     escucha `conversation.created`: si el cliente SI tiene técnico elegible, le
     **asigna** el ticket/chat (compare-and-swap, no pisa asignación manual) y emite
     `conversation.assigned` (→ campana al técnico + task bridge si es ticket). Sin
     técnico elegible → cola actual (fallback). *(El tier SI además sube la
     prioridad vía `SupportInsidePriorityListener`.)*
  El técnico es el **cuidador estable** y la cara "tu técnico" del cliente.
- **Auto-asignación al contratar** (F3·E8, 2026-06-29): al alta de la suscripción
  (`support_inside.subscribed`), `SupportInsideAutoAssignTechnicianListener` asigna
  el técnico de **menor carga** (pool sin superadmin) si la suscripción no tiene
  → todo cliente SI tiene técnico desde el día 1. El admin puede reasignar.
- **Pendiente / fuera de esta iteración** (decisión Yasmin: el superadmin observa y
  se pule después): horario laboral del técnico + mensaje informativo off-hours en
  el chat del cliente (con canal 24h para SI PRO, externo al dashboard) · flag de
  disponibilidad (vacaciones) · tope de carga · reasignación automática por SLA
  vencido. El admin/superadmin **ve** todas las conversaciones en el panel (no es
  notificado de cada una salvo asignación).
- **Superadmin asignable a mano:** el `superadmin` aparece en el picker y puede
  asignarse como técnico (`eligibleAssigneeRoles` lo incluye), pero **NO entra en
  la auto-rotación** del cron (`autoAssignTask` usa el pool sin superadmin) — no
  se le auto-carga trabajo. Decisión Yasmin 2026-06-29.
- **Notificación (info) al técnico:** al asignar, se emite
  `support_inside.technician_assigned` → `NotificationsOnTechnicianAssignedListener`
  despacha una **campana informativa** ("ahora eres el técnico de [cliente]") al
  nuevo técnico. Es info (sin acción) — distinta de la tarea de mantenimiento.
- **Filtro "Mis clientes" / por técnico** en `/admin/clients`:
  `GET /admin/clients?assigned_technician=<uuid|me>` filtra a los clientes cuya
  suscripción SI **activa** tiene a ese técnico (`'me'` = el actor del JWT). La
  lista muestra el técnico por fila. El selector "por técnico" se puebla desde
  `GET /admin/support-inside/technicians/eligible` (requiere `Manage.SupportInside`;
  roles sin permiso ven solo "Todos" + "Mis clientes").

### 11.3 Pendiente (F4 · reskin de Servicios) — superficies Support Inside

> **Documentado 2026-06-29 (Yasmin) para implementar al reskinear `/admin/services`
> (lista) y `/admin/services/[id]` (detalle) en F4.** NO implementado aún. Especificado
> aquí con el modelo de slots verificado empíricamente para no re-investigar al codear.

**Modelo de slots (empírico — base de A/B/C):**
- Enum `SupportInsideSlotType`: **`maintenance`** → "Mantenimiento" · **`maintenance_management`**
  → "Mantenimiento + gestión" (**incluye AMBOS**, no es "solo gestión").
- ⚠️ **No existe un tipo "solo gestión".** Si el negocio quisiera vender gestión sin
  mantenimiento, sería un **tipo nuevo** (cambio de modelo + migración + seed). Hoy el
  badge solo puede ser "Mantenimiento" o "Mantenimiento + gestión".
- Cada **servicio técnico** (hosting/docker…) tiene **como mucho 1 slot SI activo**
  (`released_at IS NULL`) — garantizado por el `support_inside_slots: { none: { released_at: null } }`
  de `listEligibleServices`. El slot (`support_inside_slots`, FK `service_id`) pertenece a
  la suscripción SI del cliente; su `slot_type` lo acota el `slot_types_allowed` del plan
  (seed: Básico/Medium `[maintenance]`, Pro `[maintenance, maintenance_management]`; el admin lo edita).
- El servicio del **propio addon** tiene `product.type='support_inside'`; los slots se
  asignan a los OTROS servicios del cliente, NO al servicio SI.

**(A) Toggle "Support Inside" en la lista `/admin/services`** — filtra los servicios cuyo
`product.type='support_inside'` (el servicio del addon/plan). Backend: extender
`ProvisioningService.listForAdmin` + `AdminServiceListQueryDto` con `product_type` (o
booleano `support_inside`). Frontend: toggle/chip en el `FilterBar` de `AdminServicesView`.

**(B) Filtro "cubiertos por SI: mantenimiento / gestión / ambos"** en `/admin/services` —
filtra los servicios técnicos **cubiertos por un slot SI activo**, por tipo. Backend:
`where.support_inside_slots = { some: { released_at: null, slot_type?: <maintenance|maintenance_management> } }`
(sin `slot_type` = cualquiera). Opciones: Cualquiera / Mantenimiento / Mantenimiento+gestión.
Frontend: Select en el `FilterBar`. **Distinto de (A):** A = el servicio del addon; B = los
servicios técnicos que el addon cubre.

**(C) Badge inteligente en `/admin/services/[id]`** — para un servicio técnico cubierto por
SI, badge derivado del `slot_type` de su slot activo:
- `maintenance` → **"Mantenimiento"**
- `maintenance_management` → **"Mantenimiento + gestión"**
- sin slot SI activo → sin badge.
Es "inteligente" porque sale del slot real (cuyo tipo lo acota el `slot_types_allowed` del
plan SI del cliente). Backend: incluir el slot activo + su `slot_type` en `GET /admin/services/:id`
(o fetch fail-soft capability-driven como el bloque "Plan de soporte"). Frontend: badge en el
header del detalle (vía el registro de secciones); reutiliza el tono del `MaintenanceSlotCard`.

**Doctrina:** SI-INV-8 (single-query, sin N+1) — extender el `include` del servicio dueño,
no consultar slots por fila. Capability-driven por presencia del slot, nunca por slug (R4).

---

## 12. Schema (resumen)

3 tablas + 5 enums (Sprint 8 Fase D.1 + D.12.1):

| Tabla | Propósito |
|-------|-----------|
| `support_inside_config` | Configuración de cada plan (slots_included, priority_tier, response_sla_hours, channels_active, applicable_product_types, etc.) |
| `support_inside_subscriptions` | Suscripciones activas del cliente (UNIQUE por `client_id` — un cliente solo tiene 1 plan activo a la vez) |
| `support_inside_slots` | Slots asignados a servicios técnicos (`anniversary_day` int CHECK 1..28 + idx canónico `idx_slots_anniversary`) |

5 enums: `SupportInsidePriorityTier`, `SupportInsideChannel`, `SupportInsideSlotType`, `SupportInsideSubscriptionStatus`, `SupportInsideSlotStatus`.

Detalle canónico en [`docs/30-data/support.md`](../../30-data/support.md).

---

## 13. Settings consumidos

| Setting | Default | Quién lo usa |
|---------|---------|--------------|
| `support.maintenance_critical_threshold_days` | 60 | `MaintenanceCriticalService` (cron 08:00 UTC) — alerta superadmin si servicios cubiertos llevan >N días sin `maintenance_log` |

---

## 14. Eventos emitidos

| Evento | Outbox | Consumidores |
|--------|--------|--------------|
| `support_inside.subscribed` | ❌ | `SupportInsideAuditListener` |
| `support_inside.cancelled` | ❌ | `SupportInsideAuditListener` (cascada de slot_released emitidos por cada slot) |
| `support_inside.slot_assigned` | ❌ | `SupportInsideAuditListener` |
| `support_inside.slot_released` | ❌ | `SupportInsideAuditListener` |

> Outbox extension queda en P-DEPLOY ([ADR-069](../../10-decisions/adr-069-estrategia-deploy-diferido.md)).

---

## 15. Operaciones críticas — qué pasa si...

| Acción | Efecto cascada |
|--------|----------------|
| Cancelar subscription del cliente | Libera todos los slots (cascada: 1 evento `slot_released` por slot) → marca subscription `cancelled` → tareas `maintenance_management` futuras NO se generan. **Servicios técnicos del cliente quedan intactos** (sólo se desactiva el slot SI). |
| Cliente upgrade/downgrade Básico ↔ Pro mid-mes | **Cambio inmediato prorrateado** (GL-23 / ADR-029 A1): `POST /dashboard/support-inside/upgrade` reusa el motor de prorrateo (crédito sin devolución; factura nueva BILL-INV-3). Guard de slots: no se puede bajar a un plan con menos slots incluidos que los asignados (el cliente libera primero). Cierra DC.18. |
| Admin edita pricing de un plan con suscriptores activos | Cambio se aplica a NUEVAS suscripciones. Las activas siguen el snapshot original (coherente con [ADR-029](../../10-decisions/adr-029-prorrateo-cambio-plan.md)). EC-T8-07 documentado. |
| Cliente intenta `addSlot` cuando ya está al límite | 422 + "Tu plan permite N slots; sube de plan o libera uno". |
| Servicio técnico del cliente se cancela con slot asignado | Listener `tasks-on-service-cancelled` (Sprint 11) cancelará tareas pendientes. El slot queda `released` automáticamente. |

---

## 16. Deudas transversales abiertas (DC.16..26)

11 deudas registradas en [`docs/60-roadmap/backlog.md`](../../60-roadmap/backlog.md) durante la auditoría 2026-05-01. Las más relevantes:

- **DC.16** — `services.credit_balance_eur` (buffer técnico de prorrateo, **NO sistema de créditos** — clarificación post-pregunta Yasmin). Bloquea upgrade real. **P1 transversal**.
- **DC.17** — `tasks.slot_id` FK pendiente (declarado en doc, no en schema). Sprint 11 + 8.D.12.8 cuando exista directorio `/dashboard/services`.
- **DC.18 / ADR-029 A1** — ✅ **CERRADO** (GL-23, 2026-06-26): upgrade/downgrade entre planes SI con prorrateo inmediato (`SupportInsideService.upgrade` reusa `SubscriptionPlanChangeService` con `allowCrossProduct`). UI: "Cambiar de plan" en `/dashboard/support-inside`.
- **DC.19** — Slots adicionales facturables como `support_addon` (ADR-034 §sistema de slots). **P1 dependiente DC.16+DC.18**.
- **DC.20** — Canales WhatsApp/SMS en `NotificationsService`. Hoy `channels_active` se guarda y se muestra pero solo `EmailChannel` + `InAppChannel` despachan. **P2 — Sprint 12 o sprint dedicado**.
- **DC.21** — Historial de valor cliente SI (consultas resueltas, tiempo medio respuesta, mantenimientos realizados). **P2 — sprint propio dedicado a métricas**.
- **DC.22** — Settings globales `/admin/settings/support-inside` (1/3 implementado: `support.maintenance_critical_threshold_days`). **P2 — Sprint 12**.

---

## 17. Smoke testing manual (al cierre Fase E)

Ver [`docs/features/support-inside/client.md` §"Smoke testing"](./client.md) para la vista cliente. Como admin:

1. **Login admin** → `/admin/support-inside-plans` → ver 3 filas (Básico / Medium / Pro) con savings% en columna anual.
2. **Click fila Pro** → editor con 5 secciones card. Editar §3 "Slots y capacidades" cambiando `applicable_product_types` (quitar `docker_service`) → guardar → toast OK.
3. **Login cliente con Carla** (seedeada con plan Medium) → `/dashboard/support-inside` → vista gestión con 1 slot activo + 2 disponibles.
4. **Click "Asignar slot"** → modal con select de servicios elegibles (sólo hosting_web; docker_service ya excluido por el cambio del paso 2 si fuese un cliente Pro).
5. **Asignar slot** → confirmar → tarea `maintenance_management` se generará el día configurado por `anniversary_day` (verificar disparando cron manual `POST /admin/support-inside/cron/maintenance-monthly`).
6. **Login admin** → `/admin/clients/<carla_id>` → `ClientDetailHeader` debe mostrar badge "Support Inside Medium" con tooltip SLA + canales.
7. **Cliente Carla abre ticket** desde `/dashboard/support` → `priority` debe quedar `high` automáticamente (mapeo `priority_tier=high → ConversationPriority=high`).
8. **Login admin** → `/admin/support` ese ticket → `ConversationHeader` debe mostrar badge "Medium · SLA 12h".
9. **Cliente cancela plan** → modal de confirmación → status `cancelled` → slot liberado en cascada → audit log con 1 evento subscribe + N eventos slot_released.
10. **Cliente reabre comparador** → click "Suscribirme Pro" → redirige a `/dashboard/billing/checkout?product_pricing_id=...` → confirma → factura `pending` + subscription reactivada por listener `service.provisioned`.

---

## 18. Referencias

- [ADR-034](../../10-decisions/adr-034-support-inside-modelo.md) — Modelo Support Inside (slots + recurrencia)
- [ADR-061](../../10-decisions/adr-061-support-inside-tier-cuenta-ux.md) — Support Inside como tier de cuenta visible
- [ADR-075](../../10-decisions/adr-075-support-inside-ux-lista-y-aislamiento-productos.md) — Aislamiento del CRUD genérico + UX lista
- [ADR-076](../../10-decisions/adr-076-checkout-unico-support-inside-via-evento.md) — Checkout único vía evento `service.provisioned`
- [ADR-077 (propuesto)](../../60-roadmap/backlog.md) — Upgrade entre planes distintos (DC.18)
- [`docs/20-modules/support/contract.md`](../../20-modules/support/contract.md) — Contract canónico support
- [`docs/30-data/support.md`](../../30-data/support.md) — Schema canónico
- [`docs/features/support-inside/client.md`](./client.md) — Vista del cliente
- [`docs/features/tasks/admin.md`](../tasks/admin.md) — Cron `maintenance-monthly` operativa
