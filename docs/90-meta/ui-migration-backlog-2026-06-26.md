# Backlog ejecutable — REDISEÑO COMPLETO del UI (Aelium Dashboard)

> **Qué es esto.** El plan de ejecución de un **rediseño completo de la interfaz**
> del dashboard (cliente + admin) para alinearla **1:1 con los mockups** de
> `mockup-uiux/`. **No es un retoque incremental ni un sprint suelto:** es una
> reescritura de la capa de presentación (tokens, primitivas, shells y ~34
> superficies), conservando toda la lógica y los features existentes y añadiendo
> los que el diseño introduce.
>
> **Documentos de referencia (leer antes de ejecutar):**
> - Gap verificado 37/37 → [`ui-migration-gap-2026-06-26.md`](./ui-migration-gap-2026-06-26.md)
> - Plan y decisiones (D-1…D-8, triage de diseños, scope F3) → [`ui-migration-plan-2026-06-26.md`](./ui-migration-plan-2026-06-26.md)
>
> **Naturaleza del esfuerzo:** multi-sprint (orden de magnitud: ~8-12 sprints
> según capacidad). Las fases F0–F1d son prerrequisito transversal; F4 es el grueso
> (reskin página a página) y se solapa con F3.

---

## 0. Reglas operativas (válidas para TODO el backlog)

- **DoD verde por entrega:** `pnpm --dir frontend typecheck && lint:check`; back si se
  toca: `typecheck && lint:check && test`; **boot smoke** si se tocan `@Module`/DI;
  `pnpm ci:check` antes de pushear. (DoD completo: `docs/90-meta/definition-of-done.md`.)
- **Una rama por (sub-)fase.** Convención: `redesign/<fase>-<slug>` (p. ej.
  `redesign/f0-tokens`, `redesign/f4-clientes`). Nunca trabajar en `master`.
- **Conventional Commits** citando reglas (`// D10`, `cumple R15`).
- **Reglas frozen → Amendment del ADR**, nunca desvío silencioso (L18). El único
  Amendment de este rediseño es **D10** (F1c). ADR-079 se respeta tal cual (D-2/D-3).
- **Frontend ≠ el Next.js de tu entrenamiento** (`frontend/AGENTS.md`): leer
  `node_modules/next/dist/docs/` antes de escribir código de framework.
- **Sin emojis (D1)**, una acción primaria por vista (D2), anchos §2.8 del UI_SPEC.
- **No se pierde funcionalidad:** todo lo "solo-código" del gap report sigue
  presente tras el reskin (DoD por página, §9).

---

## 1. Mapa de fases, dependencias y secuencia

| Fase | Épica | Tipo | Talla | Depende de | Paraleliza con |
|---|---|---|---|---|---|
| **F0** | Cimientos de tokens | Código FE | M | — | F1b, F1c |
| **F1a** | Primitivas del DS | Código FE | L | F0 | F1b, F1d |
| **F1b** | Encargos de diseño (Nivel 1, ~6-8) | Diseño (claude design) | — | — | todo |
| **F1c** | Gobernanza: Amendment D10 | Decisión/Doc | S | — | todo |
| **F1d** | Marca (logo + loader animado) | Código FE | M | F0 | F1a |
| **F2** | Shells cliente + admin | Código FE | L | F0, F1a, F1d | — |
| **F3** | Verticales con backend (depurado §8) | Código FE+BE | XL (suma) | por vertical | F2, F4 |
| **F4** | Reskin página a página (~34) | Código FE | XL (suma) | F0–F2 + diseño/ADR por página | F3 |

**Secuencia recomendada:** F0 abre todo. F1a/F1b/F1c/F1d en paralelo tras (o
durante) F0. F2 cuando F0+F1a+F1d estén. F4 arranca por las páginas `matched`/S en
cuanto F2 esté, y va tirando; F3 alimenta a F4 por feature (no por pantalla).

---

## 2. F0 — Cimientos de tokens + saneamiento de infra · rama `redesign/f0-tokens`

Objetivo: que el sistema de tokens **sea el del mockup** y no haya tokens rotos.
Es prerrequisito de todo: si no, cada página reimplementa color/espaciado con drift.

> **GL-27 absorbido aquí — qué SÍ y qué NO hacer por separado (decisión 2026-06-26).**
> El antiguo GL-27 del audit (enforcement DS: partir archivos R15 + quitar inline
> CSS + lint R15/R16/D1) **no es un sprint suelto**; se disuelve en este rediseño:
> - **SÍ en F0 (orthogonal al reskin):** partir `api.ts` (2197 LOC, 5.5× R15) y los
>   archivos **no-presentación** (Server Actions / i18n). El reskin F4 **no los toca**
>   y encima F3 les añade (tipos de Stripe…) → seguirían gigantes y creciendo. Es
>   mecánico, lo verifica `typecheck`.
> - **NO por separado:** quitar los ~705 inline styles. Viven casi todos en
>   componentes de presentación que **F4 reescribe al reskinear** → borrarlos antes
>   es **trabajo doble**. (Excepción: los inline styles que son *bug de token* se
>   arreglan en F0.3 tocando el token, no el estilo.)
> - **Lint R15/R16/D1:** ratchet **progresivo** (bloquear cada página ya migrada) o
>   final, nunca error global ahora (forzaría silenciar 705 sitios = ruido).

| # | Tarea | Detalle / evidencia | Talla |
|---|---|---|---|
| F0.1 | Paridad de paleta y tipografía en `globals.css` | Paleta slate del mockup (texto `#0F172A/#64748B/#94A3B8`, borde `#E2E8F0`), DM Sans + DM Mono (`tabular-nums`), H1 26-28px tracking `-0.02em`, radios card 16px, badge pill, pesos 600-700 | M |
| F0.2 | **Arreglar `#635BFF`** (prohibido) | Sustituir por `var(--brand)` en `_shared/shell/NotificationBell.module.css`, `admin/admin-sidebar.module.css`, `dashboard/transparency/page.tsx`, `admin/notifications/templates/_components/TemplatesEditor.tsx` (verificado por grep: exactamente 4) | S |
| F0.3 | **Definir/migrar tokens inexistentes** | `--brand-600`, `--border-subtle`, `--border-default`, bare `--surface`, `--surface-2`, `--primary`, `--text-link` → alias a canónicos o reescritura (verificado: 0 definiciones en `globals.css`; solo existen `--surface-primary/-secondary/-tertiary/-dark`). Sitios: `ServicesListView.tsx:103`, `StoreHeader.tsx:53`, `CartView.tsx:186,282`, `transparency/page.tsx:170`, `DeletionRequestsManager.tsx:75,89`, `LogoUploader.tsx:74-75`, `admin/services/[id]/dns/page.tsx`, `dashboard/domains/[id]/_components/DomainManagement.tsx:204`, `DomainsListView.tsx:105` (+ grep completo) | M |
| F0.4 | Sistema de iconos SVG centralizado | Sprite/símbolos del mockup (`<symbol>/<use>`, stroke 1.6); **retirar emojis** (D1) de tasks/plugins/ops/soporte | M |
| F0.5 | Página de verificación visual | Ampliar `dashboard/ds-preview` con la nueva escala (tokens + iconos) para QA | S |
| **F0.6** | **Partir `lib/api.ts` (2197 LOC → R15) por dominio** | Convertir `lib/api.ts` en directorio `lib/api/`: **`client.ts`** (base `api()` + `ApiOptions`, líneas 1-46) · **`<dominio>.ts` ×15** (cada `*Api` + sus interfaces: `auth`, `clients`, `products`, `billing`, `support`, `users`, `tasks`, `dashboard`, `errorLog`, `audit`, `notifications`, `notificationTemplates`, `supportInside`, `jobs`, `services`) · tipos cross-dominio → **`types.ts`** · **`index.ts`** barrel (`export *`) → **los 68 importadores de `@/app/lib/api` NO cambian** (cero churn). Verifica `typecheck` (caza imports rotos). Sin cambios de comportamiento. | M |

**DoD F0:** `grep #635BFF frontend/app` = 0; grep de tokens inexistentes = 0; **`lib/api.ts` eliminado, `lib/api/*` cada archivo < 400 LOC (R15), 68 importadores intactos**; typecheck+lint verdes; `ds-preview` refleja la paleta del mockup. **Boot/Next:** `api.ts` es cliente puro (no toca framework); aun así, antes de tocar `globals.css`/iconos leer `node_modules/next/dist/docs/` (`frontend/AGENTS.md`).

> **Follow-up oportunista (no bloquea F0):** los otros archivos no-presentación > 400 LOC
> (`_shared/services/_actions.ts` 679, `lib/auth-actions.ts` 407, `i18n/translations-es.ts`
> 822) se parten al tocarlos o en una pasada menor; los grandes de **presentación**
> (`support-inside/page.tsx` 952, `PlanEditor` 732, los forms de producto…) **se
> reestructuran en su reskin F4**, no antes.
>
> **Residual de F0.4 → retirar en el reskin F4 de cada componente** (dingbats inline
> `✓`/`✗`/`✓✓`/`▪` que necesitan alineación inline-flex propia, ya con Lucide
> instalado): `PluginConfigForm` (✓/✗ test conexión), `ChatConversation` ·
> `ChatThreadView` · `ConversationMessages` (✓✓ read-receipt → `CheckCheck`),
> `ProductConfig` · `DomainSearch` · `DomainTransfer` ("en el carrito ✓" → `Check`),
> `ConversationSidebar` (▪ pin → `Pin`). `●` NO se toca (D1 lo permite como StatusDot).

---

## 3. F1a — Primitivas del DS · rama `redesign/f1a-primitivas`

Construir, **a partir del mockup**, las primitivas que el diseño asume en muchas
páginas (si no, cada página las reinventa). Cada una con su entrada en `ds-preview`.

`Toggle/Switch` · `IconWell` (cuadrado tintado por tono) · `Timeline/ActivityRow` ·
`SegmentedControl` · `OrderSummary` (sticky, desglose IVA) · `PaymentMethodCard` ·
`NotificationRow` (5 tonos) · `PricingCard` (check + "Recomendado") · `Stepper` ·
`OTPInput` (6 casillas) · `PasswordStrengthMeter` · `BrandMark` (→ F1d).

**DoD F1a:** cada primitiva en `ds-preview`, tipada, con estados; typecheck+lint.

---

## 4. F1b — Encargos de diseño (Nivel 1) · track claude design (sin código)

Los **únicos** encargos a claude design (resto: Nivel 2 programar / Nivel 3 DS —
ver plan §3.0). Usar la **plantilla de prompt** del plan §6.

| ID | Encargo | Origen real | Nota |
|---|---|---|---|
| DS-A1 | Página `/admin/account-deletion` (RGPD) | `DeletionRequestsManager.tsx` | Sin mockup |
| DS-A2 | Sección "Marca" / uploader de logo (Settings) | `LogoUploader.tsx` | Sin mockup |
| DS-C3 | Gestor DNS (CRUD) — cliente y admin | `DnsRecordsManager` | **D-6**: se conserva como página |
| DS-C4 | Auditoría/timeline de servicio — cliente y admin | `services/[id]/audit` | **D-6** |
| DS-C7 | Panel de transferencia de dominio entrante (FSM) | `DomainTransferPanel` | Sin mockup |
| DS-C15 | Detalle de factura (página) — cliente | `dashboard/billing/[id]` | **D-5**: el mockup lo hace inline |
| DS-A5 | Panel de notas con filtros (admin) | `_shared/notes` | `ClienteDetalle` más rico |
| DS-G7 | "Look" de formularios dinámicos (rjsf) — patrón | `rjsf-theme` | Un encargo, se reutiliza |

**Salida:** un `.dc.html` por encargo en `mockup-uiux/` (o `admin/`), mismo formato.

---

## 5. F1c — Gobernanza: Amendment D10 · rama `redesign/f1c-adr-d10`

**Amendment a `docs/00-foundations/rules.md` (regla D10).** Texto propuesto:

> **D10 (Amendment, Sprint rediseño UI):** Las *StatsCards* dejan de estar
> restringidas al Overview. Se permiten en páginas de **detalle y gestión** cuando
> representan **KPIs accionables** del recurso mostrado (p. ej. cliente, factura,
> plugin, Support Inside), respetando: una sola jerarquía visual por vista, máximo
> una fila de StatsCards, y sin duplicar la métrica ya visible en su badge/estado.
> Motivo: alineación 1:1 con los mockups (decisión D-1). El resto de D10 (no
> decorativas, número + etiqueta + tendencia opcional) se mantiene.

**Tareas:** redactar el Amendment, actualizar `DESIGN_SYSTEM.md` (sección D10),
añadir entrada en el índice de ADRs/decisiones, citar en commits que lo usen.
**Sin código.** **No** se amenda ADR-079 (D-2/D-3 respetados).

---

## 6. F1d — Marca · ✅ HECHO (ramas `redesign/f1cd-marca` + `redesign/f1d-favicon-loader`)

> **✅ F1d CÓDIGO-COMPLETO.** `BrandMark` + variantes + Amendment D10 se cerraron en
> `redesign/f1cd-marca` (merge #136). El cabo suelto (favicon + logo animado) se
> cierra en `redesign/f1d-favicon-loader` (2026-06-27). Detalle:
> [`ui-redesign-bitacora-f1d-2026-06-27.md`](./ui-redesign-bitacora-f1d-2026-06-27.md).
> **Redefinición Yasmin (2026-06-27):** el «loader animado» **no** es un spinner —
> es la **animación de entrada del logo** (modelo «01 · Ensamblaje») al cargar la
> página, en logo de dashboard + login. El loading se queda con el **skeleton**
> existente.

| # | Tarea | Detalle | Estado |
|---|---|---|---|
| F1d.1 | Favicon de marca | `app/icon.svg` (isotipo, trazado de `BrandMark`, viewBox 32 centrado) + `app/apple-icon.tsx` (ImageResponse PNG 180 iOS) + `git rm` del `favicon.ico` default de Next. Verificado Playwright (16-96px claro/oscuro; `<head>` correcto) | ✅ |
| F1d.2 | `BrandMark` en shells | Placeholder "A" → `BrandMark` en `Sidebar.tsx` / `AdminSidebar.tsx` | ✅ (#136) |
| F1d.3 | **Animación de entrada del logo** «01 · Ensamblaje» | Prop opt-in `intro` en `BrandMark` (one-shot al montar, CSS puro, `prefers-reduced-motion`, slide ∝ size). Cableado: login (`AuthLayout` desktop+móvil) + shells (`Sidebar`/`AdminSidebar`) + demo en `ds-preview`. **Reconciliación F2:** re-aplicar `intro` a los 2 logos de shell al mergear F2 (conflicto trivial) | ✅ |

> **Cabo suelto menor (no bloquea F1d):** `frontend/public/brand/*.svg` (3 ficheros
> `#4b77bb` del logo viejo) están **huérfanos** (cero referencias; `BrandMark` los
> sustituyó). Borrarlos o exportar los SVG de marca nuevos (lockup/reverso) es una
> limpieza aparte — fuera del scope favicon+animación.

---

## 7. F2 — Shells cliente + admin · ✅ HECHO (rama `redesign/f2-shells`)

> **✅ F2 CÓDIGO-COMPLETO (2026-06-27)** — ambos shells reconstruidos 1:1, 12
> commits, verde (typecheck + lint + 48 tests + build + screenshots Playwright de
> los dos shells). **Una sola rama** `redesign/f2-shells` (más coherente que
> partir cli/adm: comparten Topbar + tarjetas de footer). Decisiones Yasmin: admin
> = 7 Operaciones (plataforma + Equipo → cards en Settings F4); cliente = 6 items;
> ⌘K solo admin. Diferido a F3: técnico+presencia (E8), cola "Chat en vivo" rica,
> inline-complete con nota (ADR-079), taxonomía de iconos notif (E10). Detalle:
> [`ui-redesign-bitacora-f2-2026-06-27.md`](./ui-redesign-bitacora-f2-2026-06-27.md).
> **Falta (Yasmin):** merge + smoke en `:3002` tras reiniciar `dev` (Turbopack no
> aplica por HMR el token nuevo de `globals.css`; el build de prod sí).

Reconstruir `DashboardShell` y `AdminShell` **idénticos** a `Shell.dc.html` /
`admin/Shell.dc.html`: breadcrumbs/título en topbar, reubicar el toggle de
colapso (fuera del footer), tarjeta de soporte en footer del sidebar, popover de
Tareas (admin), bg sidebar, item activo "tarjeta con ring", logo (F1d). Conservar:
⌘K, drawer móvil, nav role-aware (PBAC), notificaciones reales.
**Boot smoke** obligatorio (tocan layout/DI).

---

## 8. F3 — Verticales con backend · una rama por vertical

Scope **depurado** (ver plan §4.1). Contratos de endpoint propuestos:

### E6 · Stripe / pagos — `redesign/f3-stripe` · talla L-XL
Reutiliza: `PaymentProviderInterface` (ADR-031), dunning (`billing-lifecycle.worker`).
- Modelo Prisma `PaymentMethod(user_id, stripe_payment_method_id, type, brand, last4, exp_month, exp_year, is_default)`.
- Plugin Stripe (impl de `PaymentProviderInterface`): `createPayment` (PaymentIntent), `SetupIntent`, `refund`, `handleWebhook`.
- `POST /billing/payment-methods` (SetupIntent) · `GET /billing/payment-methods` · `DELETE /billing/payment-methods/:id` · `POST /billing/invoices/:id/pay-now` · `POST /webhooks/stripe`.
- UI: gestor de métodos + modal "Pagar ahora" + guardar tarjeta en checkout.

### E7 · Dashboard ejecutivo admin — ✅ **MERGED (#139, 2026-06-28)** · `redesign/f3-admin-overview` · talla L
> **Hecho:** módulo nuevo `admin-overview` (solo Prisma) con `GET /admin/overview`
> (4 KPIs + MoM%), `/decisions` (vencidas, 5xx última hora, DLQ, SI sin mant. >60d),
> `/team-load` (conversaciones por agente + saturación + presencia vía
> `Session.last_used_at`) + reskin de `/admin` (`ExecutiveDashboard`). **Diferido
> (decisión Yasmin):** la señal de **drift** del feed — no hay estado de drift
> persistente; follow-up = `Service.has_drift` escrito por el cron de reconcile.
> Bitácora: `ui-redesign-bitacora-f3-e7-2026-06-28.md`.

Reutiliza: 7 KPIs `AdminOverview` + `AdminStats`. Montar en `/admin` (hoy toolbox).
- Extender `AdminOverview` con **deltas MoM** por KPI.
- `GET /admin/overview/decisions` → feed "Requiere tu decisión" (5xx, DLQ, drift, SI sin mantenimiento).
- `GET /admin/overview/team-load` → tickets por agente + saturación + presencia.
- SLA agregado de soporte (reusar `sla-helper`).

### E8 · Support Inside gestionado — `redesign/f3-support-inside` · talla L
Reutiliza: slots, `MaintenanceLog`, cron mensual + auto-asignación, `MaintenanceLogModal`.
- `SupportInsideSlot`: `assigned_technician_id` (FK User), `last_maintenance_at`, `next_maintenance_at` (derivable de `anniversary_day`), `maintenance_status`.
- `GET /support-inside/slots/:id/maintenance-history` (client-facing).
- Presencia del técnico: tabla/campo `user_presence` (o **diferir** a "online genérico").

### E9 · SLA (visualización) — ✅ **CÓDIGO-COMPLETO** (`redesign/f3-sla-ui`, 2026-06-28) · talla M (mayormente UI)
> **Hecho:** SLA de **1ª respuesta** por conversación, calculado **server-side**
> (autoridad de tiempo única; el front solo presenta el snapshot). Helper puro
> `support-sla.helper.ts` (`computeConversationSla`, 12 tests) — reutiliza
> `first_response_at` + `response_sla_hours` del tier SI del cliente (sin plan →
> 24 h, alineado con `core/tasks/sla-helper.ts`). Payload `sla` en lista
> (`include` anidado del owner, **sin N+1**) y detalle. Net-new front:
> componente **`SlaIndicator`** (variante `inline` = pill de bandeja /
> `detail` = tira del header; audiencia `admin` literal vs `client`
> tranquilizador que **nunca** muestra "vencido"), 12 tests. Cableado:
> **pill por fila en la bandeja del staff** (`TicketList`, solo running/breached)
> + **tira por estado en el detalle** (`ConversationHeader`, admin todos los
> estados / cliente solo tickets con plan SI). 1:1 con `BandejaTickets` /
> `TicketConversacion` / `Soporte` (tira de estado, sin gauge —los mockups no lo
> dibujan). Verde: typecheck+lint+test back (109 suites/1431) y front (11/80).
> Bitácora: [`ui-redesign-bitacora-f3-e9-2026-06-28.md`](./ui-redesign-bitacora-f3-e9-2026-06-28.md).
> **Falta (Yasmin):** smoke visual. **Diferido a F4:** SLA en el ChatsWorkspace
> (panel en vivo, otra superficie) + placement fino de la tira al reskinear Soporte.

Reutiliza: `calculateTaskDueDate`, `first_response_at`, `response_sla_hours`.
- Exponer en el payload de conversación: `sla_due_at`, `sla_remaining_pct`, `first_response_pending`.
- UI: barra/gauge en detalle + indicador por fila en bandeja.

### E10 · Páginas de notificaciones — ✅ **CÓDIGO-COMPLETO** (`redesign/f3-notificaciones`, 2026-06-28 · PR #142) · talla M-L
> **Hecho:** bandejas full-page `/dashboard/notifications` (cliente) y `/admin/notifications` (admin, convive con `/templates`), 1:1 con los mockups. **Decisión Yasmin (filtro por categoría = backend real, no client-side):** enum `NotificationCategory` + columna `category` **persistida** (migración `20260628133123` + backfill por `metadata.event`) + filtro server-side correcto con paginación. Taxonomía `event→categoría` = **fuente única en backend** (`notification-taxonomy.ts`); el front solo presenta (categoría→icono/tono). Net-new DS: primitiva **`ChipGroup`** + tono **`security`** en `IconWell` (+ tokens `--security`). Marcar leída **implícito al click** (decisión Yasmin). Cierra los 2 TODOs de `NotificationBell`. Verde: typecheck+lint+test back (108 suites/1419) y front (10 suites/68). Bitácora: [`ui-redesign-bitacora-f3-e10-2026-06-28.md`](./ui-redesign-bitacora-f3-e10-2026-06-28.md). **Falta (Yasmin):** smoke visual 1:1 en navegador (reiniciar backend dev para cargar el cliente Prisma nuevo).

Reutiliza: **endpoint paginado `GET /notifications` ya existe**.
- `/dashboard/notifications` y `/admin/notifications` (mockup Nivel 2: diseño existe).
- ~~Taxonomía derivada en el front, sin migración~~ → **decisión Yasmin: categoría persistida en backend** (columna `category` + migración; filtro server-side; el front solo mapea categoría→icono/tono).

### E11 · Registro fiscal — ✅ **MERGED (#140, 2026-06-28)** · `redesign/f3-registro` · talla M (modelo ya existe)
> **Hecho:** `RegisterDto` con validación condicional (`@ValidateIf`) + `register()`
> crea `ClientProfile` fiscal + `BillingProfile` (autónomo/empresa) en `$transaction`
> + migración `User.terms_accepted_at` · reskin de `/register` (tarjetas de tipo +
> campos condicionales + hint de IVA por país + términos). Backward-compatible.
> Smoke backend en vivo ✅ (register 201/400). **Diferido:** **IVA real por país**
> (se captura país + hint; cálculo sigue 21% default → tabla `country_tax_rates`
> aparte). Bitácora: `ui-redesign-bitacora-f3-e11-2026-06-28.md`.

Reutiliza: **`ClientProfile` + `BillingProfile`** (enum `personal|autonomo|empresa` == mockup).
- Extender `RegisterDto` + formulario (tipo de cuenta, NIF/CIF, razón social, dirección, país, teléfono, términos).
- Crear `BillingProfile` en el registro; `User.terms_accepted_at`.
- IVA por país: tabla `country_tax_rates` (o **diferir**; hoy 21% default).

### E12 · Macros / respuestas guardadas — `redesign/f3-macros` · talla M (greenfield simple)
- `ResponseTemplate(id, user_id, title, body, category)` + CRUD + panel en workspace de chats.

### E13 · IA (sugerencia composer + buscador dominios) — `redesign/f3-ia` · talla L-XL · **genuinamente nuevo**
- `POST /support/:id/ai-suggestion` y `POST /domains/suggest-ai` con **Claude (Anthropic)** detrás de servicio propio (capability/credenciales como plugin).
- UI: pestaña "Sugerencia" en composer; modo "Con IA" en buscador.

### E14 · Multicanal real (WhatsApp/llamada) — **DIFERIDO del MVP** · talla XL
Integración externa (WhatsApp API/SIP) + routing. Fuera del rediseño inicial.

### (barato, sin épica propia) Precio de renovación de dominios
La tabla `domain_tld_pricing` con enum `renew` **ya existe**; basta cargar
`operation='renew'` y añadir `renewal_price` al payload + warning "sube al renovar".
Se hace dentro del reskin del buscador (F4).

---

## 9. F4 — Reskin página a página · ramas `redesign/f4-<área>`

Migra cada superficie al diseño del mockup integrando primitivas (F1a), diseños
nuevos (F1b) y features (F3). **Orden por oleadas** (de menor a mayor riesgo):

| Oleada | Páginas | Por qué primero |
|---|---|---|
| **W1** (rodaje) | `U21` Clientes, `U25` Productos, `U26` Producto-detalle | Ya `matched`, talla S — validan el método |
| **W2** (M) | `U24` Servicio-detalle admin, `U27` Producto-form, `U22` Cliente-detalle | Cercanas, sin backend pesado |
| **W3** (shells-dependientes, L) | Auth, listas y detalles de servicio/dominio/billing cliente y admin | Tras F2 |
| **W4** (XL, con F3) | Overview cliente/admin, Billing+Stripe, Soporte, Support-Inside, Buscador, Notificaciones, Ops, Tareas, Perfiles | Necesitan F3 |

**DoD por página (F4):**
1. Paridad visual con el mockup (layout/tipografía/color/spacing/iconos).
2. **Cero features perdidas**: todo lo "solo-código" del gap §5 sigue presente.
3. Features del mockup implementados o trazados a su vertical F3.
4. Tokens/primitivas del sistema (F0/F1a), nada hardcodeado, sin emojis.
5. Excepciones por decisión respetadas (D-2/D-3: sin nota interna en composer ni
   detalle/creación de tareas; D-4: iterar "Cuidado por Aelium").
6. Verde local + boot smoke si toca módulos; `ci:check` antes de pushear.

---

## 9.1 Componentes de las páginas NUEVAS (gap analizado 2026-06-27)

Las 6 páginas nuevas de la sync de mockups + el cambio del widget del shell,
contrastadas contra la librería actual (DS base + 11 primitivas F1a). La mayoría
**reutiliza**; lo genuinamente nuevo es poco.

| Superficie nueva | Reutiliza | Pieza NUEVA a crear |
|---|---|---|
| **Carrito** | Stepper · OrderSummary · Card · IconWell · AlertBanner · Button | **`CartLineItem`** (fila: icon-well + nombre/badge/sub/nota + Editar/Quitar + precio tachado) |
| **GestionDNS** | Modal · Input · Badge · StatusDot · Button | tabla DNS = reskin de `DnsRecordsManager` (ya en código) + chip-select de tipo (reusa idea de SegmentedControl) |
| **TransferenciaDominio** | Input · Button · AlertBanner · Badge · StatusDot | **`Stepper` variante `orientation="vertical"`** (conector vertical + pulse en el activo) — panel = reskin de `DomainTransferPanel` |
| **FacturaDetalle** | BrandMark · Button · Badge · OrderSummary (totales) · DM Mono tabular-nums | **`InvoiceDocument`** (layout de factura: emisor/cliente + líneas + totales) — página = reskin de `billing/[id]` |
| **ChatBubble** | IconWell · Avatar · StatusDot | **`FloatingChat`** (lanzador fixed + panel chat: typing dots, mensajes) — reskin/montaje del `ChatWidget` huérfano |
| **admin/SolicitudesBorrado** | Table · StatusTabs · Badge · Modal · DangerZone · Button | (ninguna nueva — reskin de `DeletionRequestsManager`) |
| **Widget shell "Tus conversaciones"** (cliente+admin, F2) | IconWell · StatusDot · Badge | **`SidebarConversationList`** (filas conversación: icon + título + preview + contador de abiertas, scroll) |

**Net-new reusable a construir (≈4):** `CartLineItem` · `Stepper` vertical ·
`SidebarConversationList` · `FloatingChat` (reskin del ChatWidget existente). El
resto son **reskins F4 de componentes que ya existen en código** (DnsRecordsManager,
DomainTransferPanel, billing/[id], DeletionRequestsManager), no primitivas nuevas.
`SidebarConversationList` entra en **F2** (shells); el resto en **F4** con su página.

---

## 10. Tabla maestra de épicas

| Épica | Fase | Talla | Tipo | Depende de | Rama |
|---|---|---|---|---|---|
| Tokens | F0 | M | FE | — | `redesign/f0-tokens` |
| Primitivas | F1a | L | FE | F0 | `redesign/f1a-primitivas` |
| Encargos diseño (~8) | F1b | — | Diseño | — | (claude design) |
| Amendment D10 | F1c | S | Doc | — | `redesign/f1c-adr-d10` |
| Marca + loader | F1d | M | FE | F0 | `redesign/f1d-marca` |
| Shell cliente | F2 | L | FE | F0/F1a/F1d | `redesign/f2-shell-cli` |
| Shell admin | F2 | L | FE | F0/F1a/F1d | `redesign/f2-shell-adm` |
| Stripe | F3 | L-XL | FE+BE | — | `redesign/f3-stripe` |
| Dashboard ejecutivo | F3 | L | FE+BE | — | `redesign/f3-admin-overview` |
| Support Inside gestionado | F3 | L | FE+BE | — | `redesign/f3-support-inside` |
| SLA viz | F3 | M | FE+BE | — | `redesign/f3-sla-ui` |
| Notificaciones | F3 | M-L | FE | — | `redesign/f3-notificaciones` |
| Registro fiscal | F3 | M | FE+BE | — | `redesign/f3-registro` |
| Macros | F3 | M | FE+BE | — | `redesign/f3-macros` |
| IA | F3 | L-XL | FE+BE | — | `redesign/f3-ia` |
| Multicanal | F3 | XL | FE+BE | — | **diferido** |
| Reskin W1–W4 | F4 | XL | FE | F0–F2 (+F1b/F3 por pág.) | `redesign/f4-<área>` |

---

> **Arranque sugerido:** abrir `redesign/f0-tokens` (desbloquea todo) y, en
> paralelo, lanzar los encargos de F1b a claude design y redactar el Amendment
> D10 (F1c). Cuando quieras, te detallo el **F0 a nivel de tarea-por-archivo** o
> empiezo a ejecutarlo.
