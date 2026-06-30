# Bitácora F4 (reskin página a página) — W1 + W2·U22 · 2026-06-30

> Documentación **empírica** (commits + verde medido) del trabajo de la sesión
> 2026-06-30 sobre el **TRACK ACTIVO: Rediseño UI F0→F4**. Cubre el cierre de la
> oleada **W1** (rodaje, mergeada) y el arranque de **W2** con **U22 Cliente-
> detalle** (rama `redesign/f4-cliente-detalle` → PR). Mockups de `mockup-uiux/`
> = fuente de verdad 1:1. Mapa: `ui-migration-{plan,backlog,gap}-2026-06-26.md`.

---

## 1. F4·W1 — oleada de rodaje ✅ MERGED (PR #148, master `2fd3d60`)

Las 3 superficies `matched` (talla S), 1:1 con sus mockups, conservando toda la
lógica (URL-state, selección, paginación, RBAC, guards):

| Página | Commit | Qué |
|---|---|---|
| **U21 Clientes** (`/admin/clients`) | `42dd7f3` | card-chrome, avatar pastel, "Registro" a la derecha, Exportar (header+bulk, stub), **filtro Tipo** (`client_type` DTO+where) |
| **U25 Productos** (`/admin/products`) | `e605637` | card-chrome, "Servicios" a la derecha, subtítulo dinámico, slug mono, bulk primary+ojo, limpieza `STATUS_STYLES` muerto |
| **U26 Producto-detalle** (`/admin/products/[id]`) | `f26e56c` | icon-well por tipo, **kebab** (Editar+Desactivar/Duplicar/Eliminar), "Editar →" en Planes, margen TLD verde, filas planas, reorden lateral + **Duplicar REAL** (backend) |

**Primitivas sembradas (additivas, default sin cambios):** `Table` prop `card`
(card-chrome 16px + cabecera tintada), `Avatar` prop `tone="soft"` (pastel),
token `--success-dark` (#0E8C5F). **Backend nuevo:** `ProductsService.duplicate`
(clona producto+pricing+extras+checklist→copia inactiva slug `-copia`,
`$transaction`, rechaza SI/ADR-075) + `POST /admin/products/:id/duplicate` + 3
tests. **DoD W1:** `ci:check` verde (back 1524 unit · front 96 unit).

---

## 2. F4·W2 — U22 Cliente-detalle 🟢 CÓDIGO-COMPLETO (rama `redesign/f4-cliente-detalle` → PR)

Página de talla **L**: el código ya tenía 4 tabs sobre `DetailPage`; el mockup
añade **features reales con backend** (no solo reskin). **Decisión Yasmin:
scope "todo"** (incl. acciones del kebab). 4 commits:

### 2.1 Backend (`4927318`) — verde + boot smoke 4/4
- `ClientsService.setAccountSuspended(userId, suspended, adminId)`: toggle
  `User.status` **active↔blocked** (bloquea/permite login). **Idempotente**,
  solo clientes, **auditado R3** (`audit_change_log`, `entity_type='User'`,
  action `client.account_{suspended,reactivated}`). **NO cascada a servicios**
  (se suspenden por separado en `/admin/services`). Endpoints
  `POST /admin/clients/:id/{suspend,unsuspend}` (CASL `Update.Client`). Inyecta
  `AuditService` (@Global → sin tocar el module; boot smoke confirmó DI sano).
- `GET /billing/invoices/stats?user_id=` ahora soporta admin pidiendo stats de
  **un cliente concreto** (stat-card "Por cobrar"). Cliente/partner ven SIEMPRE
  los suyos.
- **5 unit tests** de `setAccountSuspended`.

### 2.2 Frontend base (`c980b55`)
- **Header** (`ClientDetailHeader`): avatar 56px pastel (`Avatar` tamaño **xl**
  + `soft`, primitiva additiva) + nombre + estado + pill SI + "Cliente desde".
  **Editar** (modal → PATCH) + **kebab** (Contratar / Suspender / Eliminar).
- **5 tabs**: **Servicios** (NUEVO: tabla + hero SI) · **Resumen** con **4
  stat-cards accionables** (D10 Amendment) + banner "Requiere atención" +
  Cuenta/Perfil · Facturación · Soporte · Notas.
- **Datos eager** (`page.tsx`): servicios (`/admin/services?user_id=`), stats
  (`/billing/invoices/stats?user_id=`), soporte (chats+tickets) en paralelo,
  fail-soft → alimentan las stat-cards.
- **Modales** `ClientEditModal` (perfil fiscal) + `ClientContratarModal`
  (productos → admin checkout `?targetUserId=`). Server Actions: suspend,
  updateProfile, listCheckoutProducts, checkoutForClient.

### 2.3 Iteración 1 — Servicios/Facturación/Soporte/Notas 1:1 (`fb68ec5`)
Sobre el smoke de Yasmin:
1. **Servicios**: hero SI **encima** de la lista; el servicio SI se **excluye
   de la tabla** (es el hero); CTA → **"Ver servicio →"** al servicio SI activo
   del cliente (`/admin/services/[id]`, resuelto de la lista real; fallback al
   plan).
2. **Facturación 1:1**: tarjetas de perfil exactas (borde brand en el
   predeterminado, badges Tipo/Predeterminado, "Factura simplificada (sin NIF)")
   + resumen de facturas.
3. **Soporte 1:1**: **dos listas** (Chats en vivo / Tickets) con filas estilo
   mockup (icon-well + asunto + meta + estado) y **paginación cliente** (6/pág).
4. **Notas internas 1:1**: "Historial del cliente" + resumen + **chips de
   categoría con contador** + filtro de origen + "Solo fijadas"/"Limpiar" +
   **grupo Fijadas** + **timeline por mes** + fila con punto de color por
   categoría. Filtrado movido a **client-side** (notas cargadas completas;
   refactor en `ClientDetailView`).

### 2.4 Iteración 2 — header 1:1 + Badge píldora + contadores tabs (`fb3827c`)
- **Badge → píldora** (`--radius-full`) + peso **600** + tonos exactos del
  mockup (success `--success-dark`, warning #B27A12, danger #D14343, neutral
  `--surface-tertiary`). **Cambio sistémico** (alinea TODA la app; el gap §4.3
  ya lo marcaba: eran rect 8px / peso 500).
- **`DetailPage`**: `DetailTab.count?` → píldora de contador en la pestaña;
  pestaña activa con texto **oscuro** (no azul). Additivo.
- **Header**: pill SI con icono **escudo**; kebab "Suspender" con icono
  **alert-circle** (1:1 mockup); **modal de confirmación** para Suspender/
  Reactivar (ya no directo).
- **Contadores en tabs** Servicios (no-SI) + Soporte.

### 2.5 Revisión DS de `/admin/clients/[id]` (empírica)
- ✅ **R15**: todos los ficheros < 400 LOC (mayor `ClientNotesTab` 356).
- ✅ **CSS tokens-only**: 0 hex hardcoded en `clientDetail.module.css`.
- ✅ **D1** (sin emojis) · **D2** (1 acción primaria/vista) · **D3** (máx 2
  badges en el header) · **D10** (stat-cards en detalle = Amendment W1).

**DoD U22:** `ci:check` verde (back typecheck+lint+**1524** unit + boot smoke
4/4 · front typecheck+lint+**96** unit).

---

## 3. Endpoints / contratos nuevos (U22)

| Método | Ruta | Qué |
|---|---|---|
| POST | `/admin/clients/:id/suspend` | Suspende la cuenta (status=blocked), audit R3 |
| POST | `/admin/clients/:id/unsuspend` | Reactiva (status=active) |
| GET | `/billing/invoices/stats?user_id=` | Stats de facturación de un cliente (admin) |

Reutiliza (sin cambios): `GET /admin/services?user_id=`, `PATCH /admin/clients/:id`,
`POST /billing/checkout?targetUserId=`, flujo RGPD `account-deletion`.

---

## 4. Decisiones durables (Yasmin)

- **W2·U22 scope = "todo"** (incl. acciones del kebab).
- **Suspender cuenta** = bloquea el login (status=blocked), **NO** cascada a los
  servicios (eso es `/admin/services`); **con modal de confirmación**.
- **Eliminar cliente** = enruta al **flujo RGPD** (`/admin/account-deletion`,
  revisión+ejecución superadmin), **no** borra al instante (respeta ADR-010, sin
  bypass del gate superadmin).
- **Contratar servicio** = modal real (productos activos → admin checkout
  `?targetUserId=`).
- **CTA hero SI** = "Ver servicio →" al **servicio Support Inside activo** del
  cliente (`/admin/services/[id]`), no a los slots (no hay superficie admin
  per-cliente de slots).
- **Badge píldora** = cambio sistémico aceptado (todos los mockups usan
  píldoras); afecta a las páginas W1 ya mergeadas (mejora, no regresión).

## 5. Flags / diferido (honestos)

- **Soporte** pagina **client-side** sobre lo cargado (cap **50** chats / 50
  tickets); >50 quedarían fuera. **Notas** filtra client-side sobre hasta **100**
  notas; >100 quedarían fuera. *(Aceptable para un detalle de cliente; subir el
  cap o paginar server-side si hiciera falta.)*
- "Ver servicio" depende de que el SI sea un `Service` en la lista; si no,
  enlaza al plan.
- Colores por categoría de Notas = paleta hex inline en el componente (patrón
  establecido, como la paleta pastel del Avatar; el CSS sigue tokens-only).
- Micro: icon-well de stat-card 32px (DS `sm`) vs 28px del mockup; pill SI
  enlaza al editor del plan (no cambia de tab in-page como el mockup).

---

## 6. Siguiente (otro chat)

**F4·W2 restante:** U24 Servicio-detalle admin · U27 Producto-form. Luego W3
(shells-dependientes) y W4 (XL, con F3). **Stripe E6** sigue aplazado «tras el
diseño». **Pendiente del Badge sistémico:** re-smoke ligero de los badges en las
páginas W1 ya mergeadas (Clientes/Productos) — ahora son píldoras.
