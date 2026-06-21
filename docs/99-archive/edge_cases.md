# Edge Cases — Sprint 7 Exhaustive Analysis

> Fecha: 2026-04-23
> Alcance: Todo Sprint 7 (7.0–7.5), 39 archivos `.tsx` / `.ts` del dashboard
> Método: Revisión línea a línea de cada archivo
> Estado: Documentado — correcciones planificadas para Sprint 8+
>
> **Referenciado desde:** `features/clients/admin.md`, `features/products/admin.md`,
> `features/billing/admin.md`, `features/support/admin.md`
>
> **Contexto:** Este análisis complementa la auditoría D32 (ROADMAP.md Sprint 7.5).
> D32 verificó compliance con §4 (Regla de calidad); este documento profundiza
> en edge cases de runtime, seguridad, type safety y UX que requieren
> atención en sprints futuros.

---

## Severidad

| Emoji | Nivel | Significado |
|-------|-------|-------------|
| P0 | **Crítico** | Puede causar crash, pérdida de datos, o vulnerabilidad de seguridad |
| P1 | **Alto** | Bug visible para el usuario o fallo funcional en flujo principal |
| P2 | **Medio** | Comportamiento incorrecto en caso límite, degradación UX |
| P3 | **Bajo** | Code smell, deuda técnica, mejora menor |

---

## 1. Race Conditions y Stale State

### 1.1 — `loadOverviewData` puede ejecutarse con token stale (P2)
**Archivo:** `dashboard/page.tsx:308,313-327`
```ts
const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';
const loadOverviewData = useCallback(async () => { ... }, [token]);
```
**Problema:** `token` se captura al montar el componente. Si el token se refresca (ej: silent refresh), el callback sigue usando el token antiguo porque `token` es una string capturada, no una referencia.
**Impacto:** Peticiones con token expirado → 401 silencioso → overview vacío sin feedback.
**Patrón afectado:** Idéntico en `billing/page.tsx:70`, `products/page.tsx:61`, `billing/[id]/page.tsx:52`, `products/[id]/page.tsx:23`, `products/[id]/edit/page.tsx:35`, `products/new/page.tsx:22`, `useChatPanel.ts:58`, `useTicketInbox.ts:45`, `useConversationDetail.ts:44`, `useCheckout.ts:43`.
**Recomendación:** Centralizar en un hook `useToken()` que lea de `useAuth()` o de un ref actualizable, no de `localStorage` inline.

### 1.2 — `loadChats()` referenciado en closure de WebSocket (P2)
**Archivo:** `support/chats/useChatPanel.ts:72-97`
```ts
s.on('message:new', (data) => { ... loadChats(); });
```
**Problema:** `loadChats` es una función estabilizada con `useCallback`, pero el listener WebSocket se registra una vez (deps: `[token]`) y no se actualiza si `chatSearch` cambia. Cuando se recibe un `message:new`, se ejecuta el `loadChats` del closure inicial (sin filtro de búsqueda).
**Impacto:** Si el agente está filtrando chats por búsqueda, un mensaje nuevo puede resetear el filtro visualmente.
**Recomendación:** Usar `useRef` para `loadChats` o `chatSearch` y leer `.current` en el listener.

### 1.3 — `setBulkAction(null)` antes de `loadInvoices()` (P3)
**Archivo:** `billing/page.tsx:128-131`
```ts
setBulkAction(null);
setBulkLoading(false);
loadInvoices(meta.page);   // meta.page puede ser stale
loadStats();
```
**Problema:** `meta.page` se lee del state, pero no está en los deps de `executeBulk`. Si el usuario cambió de página durante la operación bulk (improbable pero posible con doble-clic), `meta.page` sería el valor del render anterior.
**Recomendación:** Capturar `meta.page` al inicio de `executeBulk`.

---

## 2. Token y Seguridad

### 2.1 — Token almacenado en `localStorage` sin verificación de expiración (P1)
**Patrón global:** Todos los archivos.
```ts
const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';
```
**Problema:** No se verifica si el token ha expirado antes de usarlo. Si el JWT ha caducado, todas las peticiones devuelven 401 pero el dashboard no redirige al login.
**Impacto:** El usuario ve un dashboard vacío/roto sin entender qué pasa.
**Recomendación:** El `useAuth` ya maneja esto via `isLoading` / `user`, pero las peticiones directas con el token no pasan por ese check. Considerar un interceptor en la capa API que auto-redirige a `/` en 401.

### 2.2 — Token vacío no aborta operaciones CRUD (P2)
**Archivo:** `billing/page.tsx:95-96`
```ts
const handleAction = async (id: string, action: ...) => {
  if (!token) return;  // ← solo return, no toast
```
**Problema:** Si `token` es vacío, la función retorna silenciosamente sin feedback al usuario.
**Patrón afectado:** `productsApi.toggleStatus`, `handleAddNote` (clients), `handleSubmit` (new product), `handleSave` (edit product).
**Recomendación:** Añadir `toast('error', 'Sesión expirada. Inicia sesión de nuevo.')` + redirect.

---

## 3. Error Handling

### 3.1 — Catches silenciosos en carga de datos principales (P1)
**Archivos:**
| Archivo | Línea | Catch | Consecuencia |
|---------|-------|-------|-------------|
| `billing/page.tsx` | 84 | `catch { /* handled */ }` | Lista vacía sin feedback |
| `billing/page.tsx` | 90 | `catch { /* */ }` | Stats null, tabs muestran `undefined` counts |
| `billing/[id]/page.tsx` | 61 | `catch { /* */ }` | `invoice === null` → muestra "Factura no encontrada" (correcto) |
| `products/page.tsx` | 75 | `catch { /* handled */ }` | Lista vacía sin feedback |
| `clients/page.tsx` | 91 | `catch { /* API interceptor */ }` | Lista vacía sin feedback |
| `useTicketInbox.ts` | 61 | `console.error(e)` | Lista vacía, no toast |
| `useChatPanel.ts` | 114 | `console.error(e)` | Lista vacía, no toast |
| `useConversationDetail.ts` | 53 | `console.error(e)` | Conversation null, loading false → página vacía |
| `useCheckout.ts` | 77 | `console.error(e)` | Products vacío, checkout roto |
| `useCheckout.ts` | 91 | `console.error(e)` | Profiles vacío, sin perfil seleccionable |

**Problema:** 10 catches que fallan silenciosamente en peticiones de carga de datos principales. El usuario ve la página vacía sin ningún mensaje de error.
**Recomendación:** Añadir toast('error', ...) en cada catch de carga principal. Los catches de autocomplete/search son aceptables.

### 3.2 — `console.error` y `console.log` en producción (P3)
**Archivos:**
- `useConversationDetail.ts`: 4 × `console.error`
- `useTicketInbox.ts`: 2 × `console.error`
- `useChatPanel.ts`: 3 × `console.error` + 1 × `console.log`
- `useCheckout.ts`: 2 × `console.error`

**Total:** 11 × `console.error` + 1 × `console.log`
**Recomendación:** Reemplazar con `if (process.env.NODE_ENV !== 'production') console.error(e)` o eliminar.

---

## 4. Tailwind residual (ya documentado)

### 4.1 — `opacity-25` y `opacity-75` en layout spinner (P2)
**Archivo:** `layout.tsx:65-66`
```tsx
<circle className="opacity-25" ... />
<path className="opacity-75" ... />
```
**Problema:** Clases Tailwind en el spinner del layout. Si Tailwind no procesa este archivo, `opacity-25` y `opacity-75` no se aplican → spinner se muestra sólido.
**Recomendación:** Reemplazar con `opacity: 0.25` / `opacity: 0.75` inline o CSS module class.

### 4.2 — Misma vulnerabilidad en spinners de `products/[id]/page.tsx:73-74` y `clients/[id]/page.tsx:111-113` (P2)
**Archivos:** Mismo patrón `opacity-25` / `opacity-75`.

---

## 5. State Management

### 5.1 — `useEffect` con `loadStructuredNotes` en deps pero no estabilizado (P2)
**Archivo:** `clients/[id]/page.tsx:85`
```ts
useEffect(() => { if (tab === 'notas') loadStructuredNotes(); }, [tab, id, noteFilter]);
```
**Problema:** `loadStructuredNotes` no está en el dependency array pero se llama dentro del effect. React no lo detecta como dependency porque no está usando `useCallback`. Si `loadStructuredNotes` captura un `token` stale, puede fallar silenciosamente.
**Recomendación:** Envolver `loadStructuredNotes` en `useCallback([token, id, noteFilter])` y añadirlo a deps.

### 5.2 — `toast` y `router` en useEffect deps causan re-renders (P3)
**Archivo:** `products/[id]/page.tsx:40`
```ts
useEffect(() => {
  productsApi.get(token, id).then(...)
    .catch(() => { toast('error', ...); router.push('/dashboard/products'); })
}, [token, id, router, toast]);
```
**Problema:** `toast` y `router` son funciones que se recrean en cada render (a menos que estén memoizadas). Si `useToast` no devuelve una referencia estable para `toast`, este effect se ejecuta infinitamente.
**Impacto:** Potencial bucle infinito de fetch → error → fetch → error.
**Mitigación existente:** `useToast` debería memoizar con `useCallback`, verificar implementación.

### 5.3 — `setError` state no limpiado en `clients/[id]/page.tsx` (P3)
**Archivo:** `clients/[id]/page.tsx:32`
El state `error` se declara pero tras la migración a toast, ya no se usa para renderizar nada visible (verificar si `ClientNotesTab` aún lo consume via props).
**Recomendación:** Eliminar `error` y `noteSuccess` state si ya no se usan.

### 5.4 — `handleToggleStatus` no usa try/finally (P3)
**Archivo:** `products/page.tsx:83-88`
```ts
const handleToggleStatus = async (id: string) => {
  setToggling(id);
  try { ... }
  catch { ... }
  setToggling(null);  // ← fuera del finally
};
```
**Problema:** Si `fetchProducts(meta.page)` dentro del try lanza un error, `setToggling(null)` aún se ejecuta (correcto). Pero el patrón no es idiomático — debería estar en `finally`.

---

## 6. UX Edge Cases

### 6.1 — Search sin debounce en billing y products (P2)
**Archivos:** `billing/page.tsx:63,233`, `products/page.tsx:56,183`
```ts
const [search, setSearch] = useState('');
// ...
<SearchInput value={search} onChange={(e) => setSearch(e.target.value)} />
```
**Problema:** `search` cambia en cada keystroke. En billing, `loadInvoices` depende de `search` via `useCallback` → cada letra dispara una petición API.
**Impacto:** N peticiones al backend por cada búsqueda. Con 100ms de latencia, resulta en múltiples renders con datos parciales.
**Contraste:** `clients/page.tsx:70-77` implementa debounce correctamente con `debouncedSearch` (300ms).
**Recomendación:** Aplicar el mismo patrón `debouncedSearch` en billing y products.

### 6.2 — Bulk toggle sin Modal de confirmación (P2)
**Archivo:** `products/page.tsx:93-103`
```ts
const handleBulkToggle = async () => {
  for (const id of selected) { ... }
```
**Problema:** `handleBulkToggle` no solicita confirmación antes de togglear N productos. El bulk toggle es una acción semi-destructiva (puede desactivar productos en producción).
**Contraste:** El bulk de billing usa `<Modal>` para confirmar.
**Recomendación:** Añadir Modal de confirmación antes de ejecutar el bulk toggle.

### 6.3 — `handleBulkPdf` ejecuta N descargas simultáneas (P2)
**Archivo:** `billing/page.tsx:134-140`
```ts
const handleBulkPdf = () => {
  for (const id of selected) {
    const inv = invoices.find((i) => i.id === String(id));
    if (inv) billingApi.downloadPdf(token, inv.id, inv.invoice_number);
  }
```
**Problema:** Si el usuario selecciona 50 facturas, se abren 50 ventanas/descargas simultáneamente. El navegador puede bloquear las descargas.
**Recomendación:** Limitar a 10 descargas simultáneas o generar un ZIP en backend.

### 6.4 — Pricing delete sin confirmación en edit page (P2)
**Archivo:** `products/[id]/edit/page.tsx:127-135`
**Observación:** Hay un `deletePricingId` state pero no se verificó si el Modal se usa para confirmación. Al revisar el render (line 270), sí hay `<Modal>` para confirmar. **OK — No es edge case.**

### 6.5 — Product creation con `selectedType` null enviado al API (P1)
**Archivo:** `products/new/page.tsx:86`
```ts
type: selectedType,  // selectedType es string | null
```
**Problema:** Si `selectedType` es `null` (paso 1 no completado), el form no debería renderizarse (protegido por `{selectedType && ...}`), pero técnicamente el `handleSubmit` no valida `selectedType !== null`.
**Impacto:** Si se fuerza via devtools, envía `type: null` al backend → posible error 400 o creación con tipo null.
**Recomendación:** Añadir `if (!selectedType) return;` en `handleSubmit`.

### 6.6 — `handleTypeSelect` usa non-null assertion sin guard (P3)
**Archivo:** `products/new/page.tsx:59`
```ts
const meta = PRODUCT_TYPES.find(t => t.value === typeValue)!;
```
**Problema:** `!` asume que siempre se encuentra. Si alguien modifica `PRODUCT_TYPES` y el valor no existe, explota con `Cannot read properties of undefined`.
**Recomendación:** `const meta = PRODUCT_TYPES.find(...); if (!meta) return;`

---

## 7. Network y API

### 7.1 — Raw `fetch()` en hooks de soporte (P2)
**Archivos:**
- `useChatPanel.ts:143-147` — `fetch(\`${API_URL}/services?user_id=...\`)`
- `useConversationDetail.ts:67-69` — `fetch(\`${NEXT_PUBLIC_API_URL}/api/services?userId=...\`)`

**Problema 1:** Parámetros inconsistentes: uno usa `user_id`, otro `userId`.
**Problema 2:** No usan la capa `api.ts`. El `fetch` raw no tiene interceptor de 401 ni manejo de errores estandarizado.
**Problema 3:** Las URLs base son diferentes (`API_URL` vs `NEXT_PUBLIC_API_URL + '/api'`).
**Recomendación:** Crear `servicesApi.listByUser(token, userId)` en `lib/api.ts`.

### 7.2 — WebSocket no maneja reconexión de auth (P2)
**Archivo:** `useChatPanel.ts:62-97`
```ts
const s = io(`${WS_URL}/support`, {
  auth: { token },
  reconnection: true,
  reconnectionDelay: 1000,
});
```
**Problema:** Si el token expira durante una sesión activa, el WebSocket reconecta con el token expirado → falla silenciosamente. No hay listener para `connect_error` que muestre toast o fuerce re-login.
**Recomendación:** Añadir `s.on('connect_error', (err) => { if (err.message.includes('401')) { toast(...); router.push('/'); } })`.

### 7.3 — `message:send` vía WebSocket sin confirmación de entrega (P2)
**Archivo:** `useChatPanel.ts:176-191`
```ts
if (socket?.connected) {
  socket.emit('message:send', { ... });
  // No await, no ack
} else {
  await supportApi.addMessage(...);
}
```
**Problema:** El mensaje se emite por socket sin esperar acknowledgment. Si el servidor rechaza el mensaje (ej: conversación cerrada), el usuario no lo sabe. El mensaje se limpia del input (`setMessage('')`) antes de confirmar que fue recibido.
**Recomendación:** Usar socket emit con ack callback: `socket.emit('message:send', data, (ack) => { if (ack.error) toast('error', ...); })`.

---

## 8. Inline Styles residuales

### 8.1 — Múltiples `style={{}}` con tokens DS (no colores literales) (P3)
**Archivos con alta densidad de inline styles:**
| Archivo | Líneas con `style={{}}` |
|---------|----------------------|
| `billing/page.tsx` | ~8 (columnas de tabla) |
| `billing/[id]/page.tsx` | ~12 (header, info blocks) |
| `products/page.tsx` | ~10 (columnas de tabla) |
| `clients/page.tsx` | ~6 (columnas de tabla) |
| `clients/[id]/page.tsx` | ~4 (loading, not-found) |
| `overview/page.tsx` | 0 (CSS module completo) |

**Nota:** Todos usan tokens (`var(--space-x)`, `var(--font-size-sm)`, etc.), no colores literales. El D32 los auditó como aceptables, pero para consistencia total deberían migrar a CSS module classes.
**Prioridad:** Baja (no blocking). Abordar en Sprint 8 como parte de la migración de Table column renders.

---

## 9. Accessibility

### 9.1 — SVG icons sin `aria-hidden` (P3)
**Archivos:** `overview/page.tsx:57-102` (7 icon components), `clients/page.tsx:54-61`, `billing/page.tsx:152`
**Problema:** Los SVG decorativos no tienen `aria-hidden="true"`. Screen readers los anuncian como imagen sin texto alternativo.
**Recomendación:** Añadir `aria-hidden="true"` a todos los SVG decorativos.

### 9.2 — Toggle button sin `aria-label` (P3)
**Archivo:** `products/page.tsx:151-155`
```tsx
<button onClick={...} style={{ ... }}>
  {p.status === 'active' ? <EyeIcon /> : <EyeOffIcon />}
</button>
```
**Problema:** Botón sin texto ni `aria-label`. Tooltip proporciona el texto visualmente, pero no es accesible para lectores de pantalla.
**Recomendación:** `aria-label={p.status === 'active' ? 'Desactivar' : 'Activar'}`.

### 9.3 — `<table>` nativa en billing detail sin `role` ni `aria-label` (P3)
**Archivo:** `billing/[id]/page.tsx:160-181`
**Problema:** Tabla semántica (correcto) pero sin `aria-label` describiendo el contenido.

---

## 10. Type Safety

### 10.1 — Uso extensivo de `any` en hooks de soporte (P3)
**Archivos:**
| Archivo | Ocurrencias `any` |
|---------|-------------------|
| `useTicketInbox.ts` | 5 (clientResults, selectedClient, res) |
| `useChatPanel.ts` | 6 (clientServices, clientNotes, svcRes, etc.) |
| `useConversationDetail.ts` | 4 (clientContext, clientNotes, etc.) |
| `useCheckout.ts` | 0 (bien tipado) |

**Impacto:** Sin type safety en las respuestas de API del cliente → crashes en runtime si el schema cambia.
**Recomendación:** Definir interfaces para `ClientProfile`, `Service`, `StructuredNote` y usarlas.

### 10.2 — `as` type assertions sin validación (P3)
**Archivos:**
```ts
// billing/page.tsx:82
const res = await billingApi.listInvoices(token, {...}) as PaginatedResponse;
// products/page.tsx:72
const res = await productsApi.list(token, {...}) as PaginatedResponse;
```
**Total:** 18 `as` assertions en todo Sprint 7.
**Impacto:** Si la API cambia su formato de respuesta, los `as` esconden el error en compilación pero explotan en runtime.
**Recomendación aceptada:** Este es un patrón estándar en TS sin Zod/io-ts. Aceptable por ahora, evaluar Zod en Sprint 10.

---

## 11. Performance

### 11.1 — `loadInvoices` y `loadStats` se ejecutan en paralelo pero como dos effects (P3)
**Archivo:** `billing/page.tsx:93`
```ts
useEffect(() => { loadInvoices(); loadStats(); }, [loadInvoices, loadStats]);
```
**Problema funcional:** Si `loadInvoices` cambia (por filter change) pero `loadStats` no, ambas se re-ejecutan. Stats no necesita re-fetch con cada cambio de filtro.
**Recomendación:** Separar en dos effects independientes, o solo re-fetch stats al montar y tras acciones.

### 11.2 — Chat poll manual sin throttle (P3)
**Archivo:** `useChatPanel.ts:80`
```ts
s.on('message:new', (data) => { ... loadChats(); });
```
**Problema:** Cada `message:new` event ejecuta `loadChats()` que hace un fetch completo de 50 chats. En una sesión con mucha actividad (10 mensajes en 5 segundos), esto genera 10 fetches innecesarios.
**Recomendación:** Debounce `loadChats()` tras WS events: máximo 1 fetch cada 2 segundos.

### 11.3 — `buildAlerts` recalcula en cada render (P3)
**Archivo:** `overview/page.tsx:320`
```ts
setAlerts(buildAlerts(overview));
```
**No es un problema real** — solo se ejecuta cuando `stats` cambia (dentro de `loadOverviewData`). Correcto.

---

## 12. Misceláneos

### 12.1 — `ADMIN_ROLES` duplicado en 4 archivos (P3)
**Archivos:**
- `billing/page.tsx:71`: `['superadmin', 'agent_full', 'agent_billing']`
- `billing/[id]/page.tsx:53`: `['superadmin', 'agent_full', 'agent_billing']`
- `support/types.ts`: exporta `ADMIN_ROLES`
- `billing/checkout/types.ts`: exporta `ADMIN_ROLES`
- `overview/page.tsx:25-26`: `ADMIN_ROLES` + `AGENT_ROLES`

**Problema:** Definidos inline en billing en lugar de importar de un sitio centralizado.
**Recomendación:** Centralizar en `lib/constants.ts` o `lib/permissions.ts`.

### 12.2 — `InvoiceDetail` y `InvoiceItem` interfaces duplicadas (P3)
**Archivos:** `billing/page.tsx:31-39` (InvoiceItem) vs `billing/[id]/page.tsx:27-38` (InvoiceDetail).
**Problema:** Dos interfaces que describen el mismo recurso con campos ligeramente diferentes.
**Recomendación:** Centralizar en `billing/types.ts`.

### 12.3 — `TYPE_LABELS` duplicado en edit y list (P3)
**Archivos:** `products/[id]/edit/page.tsx:17-20` vs `products/types.ts`.
**Problema:** El edit page define sus propios `TYPE_LABELS` en vez de importar.

### 12.4 — Checkout error se muestra en `AlertBanner` pero no en Toast (P3)
**Archivo:** `useCheckout.ts:142`
```ts
setError(e?.message || 'Error al procesar el checkout');
```
**Problema:** `error` se pasa a `StepConfirm` que lo renderiza como `<AlertBanner variant="danger">`. No hay toast.
**Consistencia:** Otros forms (products) usan toast para errores de red.
**Recomendación:** Mover a toast para consistencia, o mantener AlertBanner si se quiere que persista.

---

## Resumen por severidad

| Nivel | Cantidad | Detalles |
|-------|----------|---------|
| **P0 Crítico** | 0 | — |
| **P1 Alto** | 3 | Token sin verificación de expiración (2.1), catches silenciosos en carga principal (3.1), `selectedType` null enviado al API (6.5) |
| **P2 Medio** | 12 | Race conditions (1.1, 1.2), token sin feedback (2.2), opacity Tailwind (4.1-4.2), loadStructuredNotes deps (5.1), search sin debounce (6.1), bulk sin modal (6.2), bulk PDF (6.3), raw fetch (7.1), WS auth (7.2), WS sin ack (7.3) |
| **P3 Bajo** | 13 | Console logs (3.2), stale meta.page (1.3), handleToggleStatus finally (5.4), state zombie error/noteSuccess (5.3), toast deps loop (5.2), inline styles (8.1), aria-hidden (9.1-9.3), any types (10.1), as assertions (10.2), ADMIN_ROLES DRY (12.1-12.3), checkout error pattern (12.4) |

**Total: 28 edge cases documentados** — 0 P0, 3 P1, 12 P2, 13 P3.
