# ADR-075 — Support Inside: aislamiento del CRUD de productos + UX de lista clicable (refina ADR-061)

> **Status:** Active (refina [ADR-061](./adr-061-support-inside-tier-cuenta-ux.md), no toca [ADR-034](./adr-034-support-inside-modelo.md))
> **Date:** 2026-05-01
> **Domain:** support, products, ui
> **Sprint:** Sprint 8 Fase D

---

## Contexto

[ADR-061](./adr-061-support-inside-tier-cuenta-ux.md) (2026-04-26) decidió que Support Inside, aunque sigue siendo fila en `products` con `type='support_inside'` ([ADR-034](./adr-034-support-inside-modelo.md)), debe gestionarse desde una página dedicada (`/admin/support-inside-plans`) y no desde el CRUD genérico de productos. Sin embargo, ADR-061 dejó **dos huecos** que la auditoría 2026-05-01 (conversación Yasmin ↔ Claude tras el cierre de Sprint 8 Fase C) detectó:

1. **Cómo se materializa el "no gestionar desde `/admin/products`"** cuando `type='support_inside'` sigue siendo un valor válido del enum `ProductType`. Si el dropdown "tipo de producto al crear" muestra `support_inside`, el admin lo elige y entra al formulario genérico — exactamente la situación que ADR-061 quería evitar. ADR-061 §UX admin sólo indica "**NO aparece en `/admin/products`** (CRUD genérico de productos técnicos) — o aparece marcado claramente como 'Tier de cuenta' con link a la página dedicada", lo que deja la implementación ambigua.
2. **El formato visual** de `/admin/support-inside-plans`. ADR-061 §UX admin propone "Listado de los 3 planes (Básico / Medium / Pro)" pero la decisión de producto de Yasmin (2026-05-01) descarta el formato "3 cuadros lado a lado" tipo comparador comercial — quiere **una lista clicable** donde cada fila abre un editor con todos los campos del plan (nombre, precios, configuraciones actuales y futuras).

> **¿Qué pasaría si NO tomáramos esta decisión?** El admin entraría a `/admin/products`, vería el dropdown con `support_inside` como opción, lo elegiría, completaría el formulario genérico y crearía un Support Inside paralelo a los 3 planes que ya existen en `/admin/support-inside-plans` — drift garantizado entre las dos UIs sobre la misma tabla. Y el formato comparador en `/admin/support-inside-plans` mostraría 3 columnas pequeñas que no admiten extensión visual cuando Sprint 9/12/15 añadan más campos al plan, forzando rediseños sucesivos.

---

## Opciones consideradas

### Decisión A — Aislamiento del CRUD de productos

#### A.1. (descartada) Dejar `support_inside` en el dropdown con warning

- **Pros**: cero código de UI extra.
- **Contras**: depende del admin para no equivocarse. Cualquier nuevo agente con `Manage.Product` (`agent_full`) crea un Support Inside duplicado en su primer mes.

#### A.2. (elegida) Filtrar `support_inside` del dropdown + render readonly de filas existentes

- En `/admin/products > Crear`, el dropdown de `type` **no incluye** `support_inside`. La constante canónica de tipos creables vive en frontend (`PRODUCT_TYPES_CREATABLE`) y excluye `support_inside`.
- En el listado `/admin/products`, las filas con `type='support_inside'` se renderizan en una banda gris semi-deshabilitada con badge "Tier de cuenta" y un link "Gestionar en Support Inside →" que redirige a `/admin/support-inside-plans/<slug>`.
- Si el admin navega directo a `/admin/products/<id>` de un producto Support Inside (URL escrita a mano), la página detecta `type='support_inside'` y redirige automáticamente a `/admin/support-inside-plans/<slug>` con un toast informativo.
- **Backend**: el `AdminProductsController` (`POST /admin/products`) **rechaza con 400** cualquier intento de crear `type='support_inside'` desde fuera de la página dedicada. La página dedicada usa un endpoint propio (`POST /admin/support-inside/plans`) que internamente llama al mismo `ProductsService.create()` con un flag interno (`fromSupportInsideAdmin: true`) que el guard del controller genérico no acepta. Defense in depth: aunque la UI esté bien, la API protege.
- **Pros**: imposible crear un Support Inside fuera de `/admin/support-inside-plans`. Doctrina ADR-061 cumplida en código, no en convención humana.
- **Contras**: el guard backend introduce una micro-excepción al patrón "el controller acepta cualquier `type` válido del enum" — documentado aquí.

#### A.3. (descartada) Sacar `support_inside` del enum `ProductType` y crear tabla separada

- **Pros**: separación conceptual total.
- **Contras**: rompe ADR-034 (Support Inside vive en `products`) y ADR-061 §"🚪 No refactorizar el schema". Duplica toda la lógica de billing — descartado por ADR-061 Opción 3.

### Decisión B — Formato visual de `/admin/support-inside-plans`

#### B.1. (descartada por Yasmin 2026-05-01) "3 planes lado a lado" tipo comparador

- ADR-061 §UX admin lo proponía como visión inicial ("Listado de los 3 planes con … precio mensual/anual, canales activos, slots incluidos").
- **Pros**: vista panorámica de los 3 planes a la vez.
- **Contras**:
  - El formato comparador es para **el CLIENTE** (`/dashboard/support-inside`) que decide qué contratar — el admin no decide, sólo configura.
  - 3 columnas estrechas no admiten crecimiento de campos sin rediseño constante. Sprint 9/12/15 añadirán: campos de IA copilot (ADR-057), templates de email por plan, integraciones Slack/Discord, métricas históricas, A/B test de pricing, etc. Cada uno fuerza una decisión "¿lo meto en la columna o lo saco?" con la columna ya saturada.
  - La UI comparativa es trabajo de presentación visual (cards iguales, tipografía equilibrada, comparación de features con check marks) — coste alto, beneficio bajo para el admin.

#### B.2. (elegida) Lista vertical clicable + editor full por plan

- **`/admin/support-inside-plans` (índice)**: tabla vertical con una fila por plan (Básico, Medium, Pro). Columnas: nombre, precio mensual, precio anual, slots incluidos, badge activo/inactivo, fecha última edición. Click en cualquier celda → entra al editor.
- **`/admin/support-inside-plans/<slug>` (editor)**: página dedicada de edición con secciones (cards) verticales que crecen sin redesign. Sprint 8 Fase D cubre las secciones canónicas iniciales:
  1. **Identidad** — nombre, slug (auto), descripción visible al cliente, badge activo.
  2. **Precios** — pricing mensual y anual (Decimal con currency, reusan `product_pricing`).
  3. **Slots y capacidades** — slots incluidos, tipos de slot permitidos (`maintenance` / `maintenance+gestión`), precio de slot adicional.
  4. **Soporte y canales** — canales activos (webchat, email, teléfono, WhatsApp), prioridad relativa, SLA de respuesta.
  5. **Configuración avanzada** — comisión partner, visibilidad en CTA del catálogo.
- **Patrón canónico para campos futuros**: cada sprint que añada campos a Support Inside añade **una sección card nueva** al editor (no toca las existentes). Ejemplos previstos:
  - Sprint 9 / 9.5 — sección "Notificaciones por plan" (qué eventos reciben qué clientes según plan).
  - Sprint 12 — sección "Templates personalizadas" (plantillas de email/internal específicas por plan).
  - Sprint 15F (Plugin Claude AI) — sección "IA copilot" (modelo, budget tokens, prompts custom).
  - Sprint dedicado — sección "Métricas operativas del plan" (clientes activos, MRR, churn, NPS).
- **Pros**:
  - Crecimiento sin redesign: cada sprint añade su sección sin tocar el resto.
  - Foco operativo del admin: edita un plan a la vez sin distracción visual.
  - Coherente con el patrón de `/admin/clients/[id]` y `/admin/tasks/[id]` (página detalle con secciones — Design System D-Cards).
  - Permite breadcrumb claro: "Support Inside → Plan Pro → Identidad" (futuro Cmd+K nav).
- **Contras**:
  - El admin pierde la vista comparativa entre planes — necesita navegar entre ellos para comparar.
    - **Mitigación**: el índice de lista muestra las columnas más usadas (precio, slots, activo) — la comparación rápida sigue siendo de un vistazo.
  - 3 navegaciones extra para tocar los 3 planes en una sola sesión.
    - **Mitigación**: aceptable. La operativa real del admin es "cambiar el precio del plan Pro" (un plan a la vez), no "rediseñar los 3 planes esta tarde".

---

## Decisión

### A. Aislamiento del CRUD de productos (Opción A.2)

#### Frontend

1. **`PRODUCT_TYPES_CREATABLE` constante canónica** en `frontend/app/lib/products.ts` (o equivalente):
   ```ts
   // Tipos creables desde /admin/products. NO incluye support_inside
   // (gestionado en /admin/support-inside-plans, ADR-075).
   export const PRODUCT_TYPES_CREATABLE = [
     'hosting_web',
     'docker_service',
     'domain',
     'cloud_office',
     'manual',
     // 'support_inside' — EXCLUIDO ADR-075. Crear/editar desde /admin/support-inside-plans.
   ] as const;
   ```
   El `<select>` de `type` en `/admin/products/new` y `/admin/products/:id` se popula con esta constante.

2. **Listado `/admin/products`**: las filas con `type='support_inside'` se renderizan con clase CSS `--readonly` (opacidad reducida + cursor `not-allowed` en celdas editables) y badge `"Tier de cuenta"` (componente `<PortalBadge tone="muted" />`). Reemplaza los botones "Editar" y "Eliminar" por un único botón "Gestionar →" con `href={'/admin/support-inside-plans/' + product.slug}`.

3. **Detalle directo `/admin/products/:id`**: si la respuesta del API trae `type='support_inside'`, la página ejecuta `router.replace('/admin/support-inside-plans/' + product.slug)` con un toast `"Support Inside se gestiona en su página dedicada"`. Sin parpadeo: la guard se hace en el `useEffect` o, mejor, en un Server Component que detecta el tipo antes del primer paint.

#### Backend

1. **`AdminProductsController.create()` (`POST /admin/products`)**: rechaza con `BadRequestException` si `dto.type === 'support_inside'` y el request **NO** lleva el header interno `X-Aelium-Source: support-inside-admin`. El header lo añade automáticamente el cliente HTTP de la página dedicada (`apiClient.supportInside.create()` en frontend) — los browsers/curl externos no lo conocen.

2. **`AdminProductsController.update()` (`PATCH /admin/products/:id`)**: si el producto target tiene `type='support_inside'`, rechaza con 400 + mensaje `"Este producto se gestiona en /admin/support-inside-plans (ADR-075)"`. Misma excepción si `DELETE`.

3. **Endpoint dedicado `/api/v1/admin/support-inside/plans`** (Sprint 8.D.4 nuevo):
   - `GET /admin/support-inside/plans` — listado de los 3 planes (joins `products` + `support_inside_config` + `product_pricing`).
   - `GET /admin/support-inside/plans/:slug` — detalle completo del plan (todos los campos del editor).
   - `PATCH /admin/support-inside/plans/:slug` — actualiza el plan completo en transacción (products + support_inside_config + product_pricing).
   - **NO** `POST` ni `DELETE` desde Sprint 8 Fase D — los 3 planes son seedeados (8.D.9). Un eventual cuarto plan (ej. "Enterprise") se añadirá vía migración + seed en sprint dedicado, no desde UI (decisión consciente: cambiar la oferta comercial es decisión de negocio que merece versionado en migración, no botón en UI).

4. **CASL**: el endpoint dedicado usa `Manage.SupportInside` (subject nuevo, ver §Permisos abajo) además de `AdminOnlyGuard`. `superadmin` y `agent_full` lo tienen; `agent_billing` y `agent_support` no.

### B. UX de `/admin/support-inside-plans` (Opción B.2)

#### Índice (ruta `/admin/support-inside-plans`)

- Tabla con 3 filas (los planes seedeados) — columnas:
  - Nombre del plan (link clicable a editor).
  - Precio mensual (formateado EUR).
  - Precio anual (formateado EUR + ahorro % vs mensual×12).
  - Slots incluidos (número).
  - Estado (activo/inactivo, badge).
  - Última edición (relativo: "hace 3 días").
- Sin botón "Crear plan" en Sprint 8 Fase D (los 3 son fijos por seed; cualquier 4º exige migración + ADR específico).
- Componentes Design System: `<DataTable>` (D8) + `<Badge>` (D7).

#### Editor (ruta `/admin/support-inside-plans/<slug>`)

- Header con breadcrumb "Support Inside → Plan {nombre}".
- Cuerpo: pila vertical de **cards de sección** (componente `<EditorSectionCard>` reutilizable). Cada card:
  - Título de sección + descripción corta.
  - Campos editables (inputs DS).
  - Botón "Guardar cambios" propio (auto-save deshabilitado: el admin guarda explícitamente para evitar efectos colaterales en suscripciones activas).
  - Estado dirty visible (banner amarillo si hay cambios sin guardar; warning en navegación si intenta salir sin guardar).
- Secciones canónicas Sprint 8 Fase D (5):
  1. **Identidad** — `name`, `slug` (readonly tras creación), `description`, `is_active`.
  2. **Precios** — `pricing[monthly]` (`amount`, `currency`), `pricing[yearly]` (`amount`, `currency`, `discount_pct` calculado).
  3. **Slots y capacidades** — `slots_included`, `slot_types_allowed[]` (multi-select: `maintenance`, `maintenance_management`), `extra_slot_price`.
  4. **Soporte y canales** — `channels_active[]` (multi-select: `webchat`, `email`, `phone`, `whatsapp`), `priority_tier` (`standard|high|max`), `response_sla_hours`.
  5. **Configuración avanzada** — `partner_commission_pct`, `cta_visibility` (`hidden|catalog_banner|landing_cta`).
- **Doctrina permanente**: cada sprint que añada campos a Support Inside añade UNA sección card nueva en orden cronológico (al final). NO redistribuye campos entre cards existentes (eso rompe muscle memory del admin).

#### CASL nuevos

- **`Subject.SupportInside`** — nuevo subject para acciones admin sobre planes Support Inside.
  - `Manage.SupportInside`: `superadmin` + `agent_full`. Permite leer/editar planes desde la página dedicada.
  - **No se mapea a CASL del cliente**. La página `/dashboard/support-inside` para clientes usa el subject `Subject.Service` y CASL de `BillingService.checkout()` (sin cambios).

---

## Consecuencias

- ✅ **Ganamos:**
  - **Imposible crear Support Inside fuera de su página dedicada** — defense in depth (filtro en frontend + guard en backend).
  - **Modelo mental único para el admin**: "los 5 productos técnicos están en `/admin/products`, los planes Support Inside en `/admin/support-inside-plans`". Cero ambigüedad, cero drift posible.
  - **Editor extensible sin redesign** — añadir sección card nueva en sprints futuros (notificaciones, templates, IA copilot, métricas) es operación aditiva pura.
  - **Foco operativo** — el admin edita un plan a la vez con todos los campos visibles en una pantalla, sin distraerse comparando los otros 2.
  - **Coherencia con ADR-066** (3 portales raíz) y patrón Design System D-Cards.
- ⚠️ **Aceptamos:**
  - **Header interno `X-Aelium-Source`** introduce una micro-asimetría en el guard del `AdminProductsController`. Documentada aquí + en `tasks/contract.md` futuro de products. Patrón comparable al `__skipClientNotification` flag interno del bridge ticket↔task (ADR-074 §"Decisión").
  - **Sin botón "Crear plan" en UI Sprint 8 Fase D** — un eventual 4º plan exige migración + seed + ADR específico. **Trade-off explícito**: cambiar la oferta comercial de Aelium (qué planes existen) es decisión de producto que merece auditoría git, no clic en UI sin trazabilidad.
  - **El admin pierde la vista comparativa entre planes** — mitigado por las columnas del índice (precio + slots + activo).
  - **Más rutas frontend** que el formato comparador (índice + 3 detalles vs 1 sola página comparativa).
- 🚪 **Cierra:**
  - **No volver a permitir creación de `type='support_inside'` desde `/admin/products`** — incluso por error humano (el guard backend lo bloquea).
  - **No usar formato comparador "3 cards lado a lado" para el admin** — el comparador es para el cliente en `/dashboard/support-inside`, no para el admin.
  - **No mezclar campos de planes distintos en una sola sección** del editor — cada sección es atómica, escala por adición.
  - **No introducir auto-save** en el editor — el admin guarda explícitamente para evitar afectar suscripciones activas a mitad de edición.

---

## Cuándo revisar

- **Si Sprint 9.5/12/15 introducen >2 secciones nuevas que no encajan en el patrón "una card por dominio"** → reconsiderar si el editor necesita un layout tabbed (tabs verticales) en lugar de scroll vertical largo.
- **Si surge demanda de "duplicar plan" o "Enterprise" como cuarto plan creable desde UI** → escribir ADR específico que reabra la decisión de no permitir creación. Hasta entonces, la creación pasa por migración + seed.
- **Si los 3 planes Básico/Medium/Pro se vuelven 5+ por demanda comercial** (ej. variantes regionales) → el formato lista escala bien, sólo crece la tabla del índice. Si supera 10, considerar filtros/búsqueda en el índice.
- **Si la asimetría del header `X-Aelium-Source` genera bugs en CI o al refactorizar** → considerar split del módulo: `support-inside` con su propio service `SupportInsidePlansService` que llama directo a Prisma sin pasar por `ProductsService`. Más limpio pero duplica validaciones — trade-off a evaluar entonces.

---

## Referencias

- **Refina:** [ADR-061](./adr-061-support-inside-tier-cuenta-ux.md) (UX dedicada — sigue vigente, este ADR sólo concreta la materialización técnica del aislamiento + el formato visual del admin).
- **No toca:** [ADR-034](./adr-034-support-inside-modelo.md) (modelo de datos — Support Inside sigue en `products` con `type='support_inside'` + `support_inside_config`).
- **Módulos afectados:**
  - `support` — owner del nuevo controller `/admin/support-inside/plans` y de la página `/admin/support-inside-plans`.
  - `products` — añade guard al `AdminProductsController` que rechaza creación/edición/borrado de `type='support_inside'` desde fuera del header interno.
- **Reglas relacionadas:**
  - [R1](../00-foundations/rules.md) — módulos por eventos (la página dedicada llama internamente a `ProductsService`, no por evento — excepción documentada aquí, igual que ADR-074 documenta la suya).
  - [R3](../00-foundations/rules.md) — audit log inmutable (cambios en planes Support Inside generan audit normal).
- **ADRs relacionados:**
  - [ADR-061](./adr-061-support-inside-tier-cuenta-ux.md) — refinado.
  - [ADR-034](./adr-034-support-inside-modelo.md) — modelo de datos sin cambios.
  - [ADR-066](./adr-066-tres-portales-raiz-portalbadge.md) — `/admin/*` portal raíz para staff.
  - [ADR-067](./adr-067-granularidad-casl-rol-staff.md) — granularidad CASL fina (nuevo `Subject.SupportInside` solo `superadmin` + `agent_full`).
  - [ADR-029](./adr-029-prorrateo-cambio-plan.md) — prorrateo cambio plan (sigue aplicando si el cliente cambia de plan).
  - [ADR-074](./adr-074-ticket-task-bridge.md) — patrón comparable de header/flag interno para excepciones cross-módulo controladas.
- **Glosario:** *Tier de cuenta*, *Plan Support Inside*, *Sección de editor* (patrón canónico de UI para crecimiento sin redesign).
- **Discusión externa:** conversación Yasmin ↔ Claude 2026-05-01 tras el cierre de Sprint 8 Fase C, durante la planificación de Fase D.
- **Sprint que lo implementa:** Sprint 8 Fase D (sub-pasos 8.D.4, 8.D.4b, 8.D.6, 8.D.6b — añadidos por este ADR).

---

## Notas de revisión

> **2026-05-01:** ADR creado tras dos preguntas de Yasmin durante la planificación de Sprint 8 Fase D:
> 1. "Si en `/admin/productos` puedo crear un addon Support Inside, ¿qué diferencia con `/admin/support-inside-plans`?" — descubrió la ambigüedad de ADR-061 §UX admin que dejaba abierto el camino al duplicado. Decisión A: aislar técnicamente con guard backend + filtro frontend.
> 2. "Sobre la página de support inside, no la quiero tipo: 3 cuadros uno al lado de otro, quiero una lista, y al darle clic poder editar cada detalle de cada plan, ya sea el nombre, precios, diferentes configuraciones que se añaden ahora, o se añadirán más adelante con otros sprints." — descartó el formato comparador previsto en ADR-061 §UX admin. Decisión B: lista clicable + editor con secciones card extensibles.
>
> Ambas decisiones quedan formalizadas aquí. ADR-061 sigue vigente como documento de "por qué Support Inside tiene UX dedicada"; ADR-075 documenta "cómo se materializa esa UX en código y por qué con este formato".
