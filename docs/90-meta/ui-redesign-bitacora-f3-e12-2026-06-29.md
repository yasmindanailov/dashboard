# Bitácora del rediseño UI — F3·E12 (macros / respuestas guardadas) · sesión 2026-06-29

> Registro riguroso de la **vertical F3·E12**: biblioteca de **respuestas
> guardadas** (macros de soporte) consumida desde el **picker del composer** del
> workspace de chats (1:1 con `admin/ChatsWorkspace.dc.html`) + **gestión CRUD**
> con el DS. Greenfield simple (talla M). **Rama:** `redesign/f3-macros` (desde
> `origin/master`, independiente de E8/E9/E10 apiladas). Verde + boot smoke 4/4.

## 0. Resumen ejecutivo

El composer del workspace de chats gana el botón **"Respuestas guardadas"** del
mockup: abre un popover con la biblioteca del equipo y, al elegir una, inserta su
cuerpo en el borrador. La gestión (crear/editar/borrar) —que el mockup no dibuja—
se añade con el DS (Nivel 3 del plan) en un **modal** accesible desde el picker.

**Decisión de producto (Yasmin):** alcance de propiedad = **biblioteca de
equipo**. Un único set compartido por el staff de soporte
(`superadmin`/`agent_full`/`agent_support`); cualquiera lo usa y lo gestiona
(CRUD colaborativo). El `user_id` del spec del backlog se materializa como
`created_by` (trazabilidad, **no** aislamiento). Coincide con el mockup (lista
global) y con cómo funciona un helpdesk real. Resuelve el conflicto spec
(`user_id`, personal) ↔ mockup (lista global) — no había ADR frozen.

## 1. Backend — módulo `response-templates` (nuevo)

Recurso **CRUD hoja**, staff-puro, sin eventos cross-módulo (R1/R8 no aplican).

### 1.1 Datos
- Modelo Prisma **`ResponseTemplate`** (`response_templates`): `id`, `title`
  (VarChar 120), `body` (VarChar 10000), `category?` (VarChar 60), `created_by?`
  (FK `users` **`onDelete: SetNull`** — preserva la macro compartida si el autor
  se da de baja), `created_at`, `updated_at` + índice por `category`.
- Migración **`20260629090000_add_response_templates_e12`**.
  - **⚠️ Drift de BD dev:** la BD compartida tenía aplicadas las migraciones de
    E8/E10 (de la rama apilada), ausentes en mi folder → `migrate dev` exigía
    reset (pérdida de datos de Yasmin). **No se reseteó.** La migración se escribió
    a mano (SQL = estilo Prisma del repo), se aplicó **aditivamente** vía
    `prisma db execute` (solo el `CREATE TABLE` nuevo, sin tocar lo demás) y se
    baseline-ó con `migrate resolve --applied`. Verificado con `\d
    response_templates` (columnas + índice + FK SetNull). Timestamp `20260629…`
    posterior a E8/E10 → orden lexicográfico consistente al converger ramas.

### 1.2 Autorización (defense in depth, DC.7 / ADR-066-067)
- CASL: nuevo **`Subject.ResponseTemplate`** + grant `Manage` a `agent_full` y
  `agent_support` (superadmin ya cubre vía `Manage All`).
  **`agent_billing`/cliente/partner sin grant** → 403.
- Endpoint **`/api/v1/admin/response-templates`** con triple guard
  `JwtAuthGuard + AdminOnlyGuard + PoliciesGuard`. `agent_billing` pasa
  `AdminOnlyGuard` pero CASL lo rechaza (no tiene el subject).
- **Mirror frontend (`lib/permissions.ts`) NO tocado a propósito:** solo gobierna
  sidebar + rutas; las macros no son ni item de menú ni ruta propia (viven dentro
  del workspace `/admin/support/chats`, ya gateado por `Conversation`). Añadirlo
  sería config muerta. La seguridad real la impone el CASL backend.

### 1.3 Endpoints (`ResponseTemplatesController`)
| Método | Ruta | Acción CASL |
|---|---|---|
| `GET` | `/admin/response-templates?category&search` | `Read.ResponseTemplate` |
| `POST` | `/admin/response-templates` | `Create.ResponseTemplate` |
| `PATCH` | `/admin/response-templates/:id` | `Update.ResponseTemplate` |
| `DELETE` | `/admin/response-templates/:id` | `Delete.ResponseTemplate` |

`ResponseTemplatesService`: CRUD + normalización (trim; `category` vacía→`null`) +
guardas `NotFound`/`BadRequest` (cuerpo/título vacío tras trim) + filtros de
listado (`category` exacta / `search` = OR `title`/`body` insensitive) + mapeo a
DTO con `creator_name` (vía relación `creator`, `first_name + last_name`).
`@Global` `CaslModule` provee `PoliciesGuard`; `AuthModule` aporta `JwtAuthGuard`;
`AdminOnlyGuard` no tiene deps.

**Verificación back:** typecheck + lint:check + **13 unit**
(`response-templates.service.spec`) + suite completa **1403** (12 skip) + **boot
smoke**: `ResponseTemplatesModule dependencies initialized`, las 4 rutas mapeadas,
`Nest application successfully started`, **4/4 plugins**. Sin
`UnknownDependenciesException`.

## 2. Frontend — picker + gestor (`_shared/response-templates/`)

Reusable bajo `_shared/` (no acoplado a chats; un futuro composer de tickets lo
reusa). Modelo A (ADR-078 A1): Server Actions + cookie httpOnly, cero localStorage.

- **`_actions.ts`** — `list/create/update/delete` vía `serverFetch` a
  `/admin/response-templates`, shape `{ ok, … }` (patrón `_shared/support`).
- **`SavedRepliesPicker.tsx`** — botón "Respuestas guardadas" (zap del mockup, SVG
  D1) + popover (carga **perezosa** al primer abrir; cierre por click-fuera/Esc).
  Al elegir → `onInsert(body)`. Self-contained: posee la lista y la recarga tras
  gestionar. Estados normal/cargando/**vacío** (D8).
- **`MacrosManagerModal.tsx`** — DS `Modal` con 2 vistas (lista ↔ formulario).
  Lista: filas con título + chip de categoría + preview + Editar/Borrar; borrado
  con **confirmación inline** (D5, sin modal anidado). Form: `Input` título/categoría
  + `Textarea` mensaje (`showCount`). Una sola acción primaria por vista (D2). Se
  **monta solo al abrir** (render condicional) → arranca en 'list' sin efecto de
  reset (evita `set-state-in-effect`).
- **Cableado** en `admin/support/chats/ChatConversation.tsx`: el picker se inserta
  sobre el input; `onInsert` hace **append no-destructivo** al borrador (separador
  si hay texto en curso; set directo si está vacío — no destruye lo ya escrito, a
  diferencia del `replace` del mockup).
- DS-compliant (R16): trigger/popover = chrome del composer bespoke (como el
  `sendButton` ya existente); el gestor usa `Modal`/`Button`/`Input`/`Textarea`/
  `EmptyState`. CSS Modules con tokens (sin hex, sin inline).

**Verificación front:** typecheck + lint:check (`--max-warnings=0`) + **3 unit RTL**
(`SavedRepliesPicker.test`: carga perezosa, pick→`onInsert`+cierre, vacío) + suite
completa **8 suites / 51** verde.

> **Nota build:** el `.next/` cacheado tenía referencias rancias a páginas de
> notificaciones (E10, otra rama) que rompían `tsc`. Se limpió `.next/` (caché
> regenerable) — no es código.

## 3. Decisiones flageadas / diferido consciente

- **Picker = append, no replace.** El mockup reemplaza el draft; preferimos append
  para no perder texto en curso. Set directo si el borrador está vacío (caso común).
- **Sin seed de macros de ejemplo** (la biblioteca arranca vacía con su empty
  state). Si Yasmin quiere contenido para el smoke, se añade un seed idempotente.
- **Solo en el composer de chats** (mockup). El composer de tickets reusará el
  picker cuando F4 reskinee la bandeja (`_shared` ya lo permite).
- **Sin paginación** en el listado (la biblioteca es pequeña, decenas); filtros
  `category`/`search` server-side ya soportados por si crece.

## 4. DoD

- Back: typecheck ✅ · lint:check ✅ · 13 unit nuevos + 1403 suite ✅ · boot 4/4 ✅
- Front: typecheck ✅ · lint:check ✅ · 3 unit nuevos + 51 suite ✅
- Docs: contract `support` (§Respuestas guardadas) · `features/support/admin.md` ·
  roadmap `current.md` + backlog E12 · esta bitácora.
- **Falta (Yasmin):** smoke visual en `/admin/support/chats` (picker + gestor) tras
  reiniciar `dev` con el cliente Prisma nuevo. Merge + PR.
