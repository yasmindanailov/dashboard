# Fase 2.E — Contenedores

> Estado: **en curso**
> Modo: **diseño**
> Output: 4 specs (multi-variante natalmente · DD-029) + 4 mockups + sample cliente-overview + NOTES.

---

## Componentes y variantes (DD-029 aplicado desde el inicio)

| Componente | Variantes | Justificación |
|---|---|---|
| **Card** · 5 | static · action · selectable · featured · mesh | Cards aparecen en 30+ contextos del producto. Cada variante = caso real. |
| **Modal** · 5 | standard · drawer · confirm · full-screen · bottom-sheet (mobile) | Standard ≠ drawer ≠ confirmación. UX radicalmente distinta. |
| **Avatar** · 4 grupos | single · group · with-status · sizes (xs/sm/md/lg/xl) | Cliente list = solitario. Equipo = group. Online status = with-status. |
| **EmptyState** · 4 | inline · page · search · first-time | Voz Aelium cambia mucho según contexto. |

## Heredamos

- DD-021/022/023/024/026/027/028/029.
- StatusDot para Avatar with-status.
- Skeleton-rombo para EmptyState first-time loading.
- `.aelium-loader.lg` para empty page con loading.
- `.aelium-dot` y rombos para empty illustration.
- `.mesh-bg` para Card mesh.
- `.card-action` ya existe (DD-023) — Card action lo formaliza.

## Validación con marca v1.6

- **"Construido para durar"**: contenedores deben sentirse sólidos, predecibles. Card sin sombras innecesarias. Modal con jerarquía clara.
- **"Trato individualizado"**: Avatar deterministic color de paleta brand-coherent (no random). EmptyState con voz por contexto.
- **"Proactivo"**: Modal confirm honra al usuario explicando qué pasa. EmptyState first-time guía sin abandonar.
- **Voz**: cada variante con copy pattern documentado.

## Decisiones a tomar

- **D2E-1**: Avatar paleta de colores. Versión actual usa 8 colores random (pink, orange, cyan). Migrar a paleta brand-coherent (5 colores: brand · brand-active · success · info · pending).
- **D2E-2**: Card variants. ¿`featured` necesita variant separada o es `action` con prop `featured`? Decisión: separada, comportamiento distinto.
- **D2E-3**: Modal motion. Standard fade+slide ya tiene tokens. Drawer slide-in lateral. Bottom-sheet slide-up. Confirm scale-in.
- **D2E-4**: EmptyState illustration. Rombos como decoración mínima vs sin ilustración. Por contexto.
- **D2E-5**: Modal confirm-destructive con accent-stripe-left danger.

## Plan

1. ✅ Audit (`audit-existing.md`).
2. ✅ CSS para 4 componentes y todas sus variantes.
3. ✅ 4 specs natalmente multi-variante.
4. ✅ 4 mockup pages.
5. ✅ **Sample page** · `pages/cliente-overview.html` — Overview cliente con Card mesh hero + StatsCard + Avatar group del equipo + EmptyState first-time si aplica + Modal trigger.
6. ✅ NOTES + commit.

## Ejemplos producto

| Componente | Casos en el dashboard |
|---|---|
| Card static | Detail page · sección de información, factura preview, servicio summary |
| Card action | Listado de facturas/servicios navegables a detalle |
| Card selectable | Plan selector · "Elige un plan" cliente · selección bulk visual |
| Card featured | Plan selector · "Más popular" / "Recomendado" |
| Card mesh | Cliente Overview · hero con estado del negocio digital |
| Modal standard | "Crear cliente", "Editar producto", forms de tamaño medio |
| Modal drawer | Detalle inline desde listado · filtros avanzados |
| Modal confirm | "¿Eliminar cliente?", "¿Cancelar suscripción?" |
| Modal full-screen | Checkout multi-paso · onboarding wizard |
| Modal bottom-sheet | Mobile · acciones contextuales |
| Avatar single | Header de cliente, autor de nota, asignado de tarea |
| Avatar group | Equipo de agentes asignados, miembros del partner |
| Avatar with-status | NotificationBell items · agente "online ahora" · cliente activo |
| EmptyState inline | Tabla sin resultados, dropdown vacío, lista filtrada |
| EmptyState page | "No tienes facturas aún" · cliente nuevo |
| EmptyState search | "No encontramos nada para 'foo'" |
| EmptyState first-time | Onboarding · "Crea tu primer cliente o dinos cómo te ayudamos" |
