# DESIGN_SYSTEM.md — Aelium Dashboard
> Normas de diseño, UX y componentes visuales.
> El agente IA respeta estas reglas en cada interfaz que genere.
> Si alguna instrucción contradice estas reglas, prevalecen estas reglas.
>
> **Este documento es de lectura obligatoria antes de crear cualquier interfaz nueva.**
> Ver también: ARCHITECTURE.md (Regla 16), ROADMAP.md (Sprint 7.5), UI_SPEC.md
>
> Documento de marca: `docs/aelium-documento-de-marca.md`
> Inspiración: Stripe Dashboard, Hostinger hPanel
> Versión 2.3 | Abril 2026 — Sprint 7.5 completado (30 componentes, 17 páginas auditadas)

---

## FILOSOFÍA

Dashboard administrativo interno. No es una app consumer.
La prioridad es **claridad, velocidad de lectura y acción eficiente**.
Cada pixel debe justificar su presencia. Si no aporta, se elimina.

Referentes de diseño:
- **Stripe Dashboard** — limpieza extrema, data-dense sin ruido, tipografía impecable, jerarquía visual cristalina.
- **Hostinger hPanel** — simplicidad radical, guías inline para el usuario, navegación predecible, "less is more".

Lo que compartimos con ambos: **minimalismo funcional**. Lo que NO copiamos: el dark mode de Stripe (nuestro dashboard es light-first, coherente con la landing).

---

## IDENTIDAD VISUAL — Coherencia con la marca

El dashboard es una extensión de la marca Aelium. Los tokens de diseño **deben coincidir** con los de la landing (`web2v1/src/app/globals.css`) y el documento de marca (`aelium-documento-de-marca.md`).

### Discrepancias corregidas

El dashboard usaba `#635BFF` (Stripe purple) como color brand. El documento de marca define `#3B82F6` (azul medio). La landing ya usa `#3B82F6`. **El dashboard debe migrar a `#3B82F6`.**

---

## REGLAS QUE NUNCA SE ROMPEN

> **🔄 Documento canónico unificado:** las reglas D1–D11 (junto con las R1–R16)
> ahora viven en **[`docs/00-foundations/rules.md`](./00-foundations/rules.md)**.
> Esta sección se mantiene por compatibilidad. Modificar en el canónico, no aquí.

### Regla D1 — Sin emojis en la interfaz
Los emojis no pertenecen a un dashboard profesional.
Crean ruido visual, rompen la consistencia tipográfica y reducen la seriedad percibida.

```
❌ INCORRECTO
  ✅ Conversación resuelta.
  📝 Nota: problema solucionado
  🔒 Conversación cerrada.
  🟢 En línea

✅ CORRECTO
  Conversación resuelta.                   (con icono SVG de check)
  Nota: problema solucionado
  Conversación cerrada.                    (con icono SVG de candado)
  En línea                                 (con StatusDot verde)
```

Alternativas: StatusDot (●) con CSS color, iconos SVG de Lucide React, badges semánticos.

### Regla D2 — Jerarquía visual: primario → secundario → terciario
Cada vista tiene exactamente **una acción primaria**, como máximo **dos secundarias**, y el resto en menú contextual (⋯).

```
Primario:    Botón sólido brand (#3B82F6). UNO por vista.
Secundario:  Botón outline o ghost. Máximo 2 visibles.
Terciario:   Dentro de menú contextual (⋯), link de texto, o icono con tooltip.

❌  [+ Nueva conversación] [Exportar] [Filtrar] [Configuración]
✅  [+ Nueva conversación]   [Exportar]   ⋯ (Filtrar, Configurar)
     primario (sólido)        secundario   terciario (menú)
```

### Regla D3 — Máximo 2 badges por item en una lista
Más de 2 badges es ruido que el ojo no procesa.

```
❌  "tu web va bien"  [Esperando cliente] [URGENTE] [web] [1d]
✅  "tu web va bien"  [Esperando cliente] [Urgente]
                                                    1d · web  ← texto gris
```

Prioridad: **Estado** (siempre) > **Prioridad** (solo si ≠ normal) > resto como metadata gris.

### Regla D4 — Sin información duplicada
Si el contexto ya comunica un dato, no repetirlo.

### Regla D5 — Acciones destructivas en menú contextual
Los botones rojos permanentes crean ansiedad. Las acciones destructivas van en menú ⋯ → modal de confirmación.

### Regla D6 — Espaciado en escala de 4px
Todo spacing es múltiplo de 4px. Sin valores arbitrarios.

```
Escala: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64
❌  padding: 15px; margin: 22px;
✅  padding: 16px; margin: 24px;
```

### Regla D7 — Texto, no iconos solos
Toda acción tiene texto visible. En toolbars compactos, el tooltip es obligatorio.

### Regla D8 — Estados vacíos siempre diseñados
Nunca un espacio en blanco. Icono sutil + texto descriptivo + acción sugerida.

### Regla D9 — Feedback visual inmediato
Toda acción produce feedback en <200ms: loading en botón, toast de confirmación/error, transición suave.

### Regla D10 — Layout estandarizado por tipo de página

El dashboard tiene **6 tipos de página** definidos en `UI_SPEC.md §2`:
Overview, List, Detail, Form, Workspace, Settings.

Cada tipo tiene una anatomía fija. **Ver UI_SPEC.md §2.1-§2.7 para las especificaciones completas.**

Resumen rápido:

| Tipo | Anatomía |
|---|---|
| Overview | Greeting → Stats grid (StatsCards) → Content sections |
| List | PageHeader → StatusTabs (no StatsCards) → FilterBar → Table/Cards → Pagination |
| Detail | Breadcrumb → Detail header → Tabs → Content |
| Form | Breadcrumb → Header → Card sections → Actions (sticky) |
| Workspace | 3 columnas (lista, contenido, contexto) — solo chats |
| Settings | Nav vertical + sección activa — solo configuración |

**Regla: StatsCards solo en Overview.** En list pages, las métricas van como contadores en StatusTabs.

### Regla D11 — Voz de marca en mensajes de sistema
Los mensajes de sistema del dashboard siguen la voz de Aelium definida en el documento de marca:
- Frases cortas. Una idea por frase.
- Cercano pero competente.
- Sin jerga burocrática ("Estimado usuario", "Procedemos a gestionar").

```
❌  "La conversación ha sido resuelta exitosamente por el agente."
✅  "Conversación resuelta."

❌  "Se ha producido un error en la operación solicitada."
✅  "No se pudo guardar. Inténtalo de nuevo."
```

---

## EXCEPCIONES DOCUMENTADAS

### Excepción 1 — ChatWidget (`components/ChatWidget/`)

**Excepción a:** Regla 16 (toda interfaz usa `components/ui/`) y Capa 2/3 del sistema de theming.

**Razón:** El ChatWidget es un componente embeddable que funciona en dos contextos:
1. **Dashboard** (tokens.css cargado) → hereda tokens del dashboard automáticamente
2. **Landing page** (sin tokens) → necesita funcionar sin dependencias externas

Forzar los componentes del Design System (`Button`, `Input`, `Card`) en un widget flotante de 380×520px crearía:
- Dependencia dura con tokens.css en la landing page
- Componentes desproporcionados (los UI del DS están diseñados para layout de dashboard, no para chat compacto)

**Solución implementada:** `chatWidget.module.css` define tokens locales `--cw-*` que cascadean desde los tokens del dashboard cuando están disponibles, con fallbacks que coinciden exactamente con `aelium-documento-de-marca.md`:

```css
.root {
  --cw-brand: var(--brand, #3B82F6);        /* doc-marca: Color principal */
  --cw-text-primary: var(--text-primary, #0F172A);  /* doc-marca: Texto principal */
  --cw-border: var(--border, #E2E8F0);      /* doc-marca: Borde */
}
```

**Resultado:** 0 inline styles, 0 hex colors en TSX. En dashboard hereda el DS. En landing funciona standalone.

**El `SupportPanel/` (sidebar de dashboard) NO tiene esta excepción** — vive exclusivamente dentro del dashboard y debe usar componentes del DS.

---

## SISTEMA DE THEMING — Arquitectura de 3 capas

### Por qué CSS Custom Properties (y no un JS theme object)

| Alternativa | Problema |
|-------------|----------|
| JS Theme Provider (MUI/Chakra) | Requiere context wrapper, no funciona en SSR sin hidratación, overhead de JS |
| Tailwind config solo | Tailwind v4 ya usa CSS variables bajo @theme — las custom properties SON el config |
| CSS-in-JS (styled-components) | Runtime overhead, difícil de cachear, no SSR-friendly |
| **CSS Custom Properties** | **Zero JS, SSR nativo, cambiable en runtime, herencia CSS, standard del navegador** |

Es lo que usan Stripe, Linear, Vercel, GitHub, y Radix UI. Es el estándar de la industria.

### Las 3 capas

```
┌─────────────────────────────────────────────────────────┐
│  CAPA 1: tokens.css                                     │
│  Variables CSS puras. UN SOLO ARCHIVO.                  │
│  Para cambiar todo el look → editar SOLO este archivo.  │
│                                                         │
│  :root {                                                │
│    --brand: #3B82F6;                                    │
│    --text-primary: #0A0A0B;                             │
│    --radius-md: 12px;                                   │
│    ...                                                  │
│  }                                                      │
├─────────────────────────────────────────────────────────┤
│  CAPA 2: components/ui/                                 │
│  Componentes React que SOLO consumen variables.         │
│  Nunca valores literales. Nunca style={{}}.             │
│                                                         │
│  .btn-primary {                                         │
│    background: var(--brand);                            │
│    border-radius: var(--radius-full);                   │
│  }                                                      │
├─────────────────────────────────────────────────────────┤
│  CAPA 3: pages/                                         │
│  Páginas que SOLO componen componentes de la capa 2.    │
│  Nunca estilos propios. Nunca valores de color.         │
│                                                         │
│  <Card>                                                 │
│    <Table data={clients} />                             │
│    <EmptyState />                                       │
│  </Card>                                                │
└─────────────────────────────────────────────────────────┘
```

**Resultado:** Para cambiar el aspecto completo del dashboard — colores, radios, sombras, spacing — solo se edita `tokens.css`. Los componentes y las páginas NO se tocan.

### Archivo: `globals.css` (tokens ya existentes)

El dashboard ya tiene tokens en `frontend/app/globals.css`. Este es el archivo de referencia y el único lugar donde se definen valores de diseño:

```css
:root {
  /* ── Brand ── */
  --brand:           #3B82F6;
  --brand-hover:     #2563EB;
  --brand-active:    #1D4ED8;
  --brand-light:     #DBEAFE;
  --brand-subtle:    rgba(59, 130, 246, 0.06);

  /* ── Semánticos ── */
  --success:         #10B981;
  --success-light:   rgba(16, 185, 129, 0.08);
  --success-border:  rgba(16, 185, 129, 0.15);
  --warning:         #F59E0B;
  --warning-light:   rgba(245, 158, 11, 0.08);
  --warning-border:  rgba(245, 158, 11, 0.15);
  --danger:          #EF4444;
  --danger-light:    rgba(239, 68, 68, 0.08);
  --danger-border:   rgba(239, 68, 68, 0.15);
  --info:            #3B82F6;
  --info-light:      rgba(59, 130, 246, 0.08);
  --info-border:     rgba(59, 130, 246, 0.15);

  /* ── Superficies ── */
  --surface-primary:   #FFFFFF;
  --surface-secondary: #F7F7F8;
  --surface-tertiary:  #F1F5F9;

  /* ── Texto ── */
  --text-primary:    #0A0A0B;
  --text-secondary:  #6B7280;
  --text-tertiary:   #9CA3AF;
  --text-on-brand:   #FFFFFF;

  /* ── Bordes ── */
  --border:          rgba(0, 0, 0, 0.06);
  --border-hover:    rgba(0, 0, 0, 0.10);

  /* ── Radios ── */
  --radius-sm:   8px;
  --radius-md:   12px;
  --radius-lg:   16px;
  --radius-xl:   24px;
  --radius-full: 9999px;

  /* ── Sombras ── */
  --shadow-sm:    0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-md:    0 4px 12px rgba(0, 0, 0, 0.06);
  --shadow-lg:    0 8px 24px rgba(0, 0, 0, 0.08);
  --shadow-brand: 0 4px 24px rgba(59, 130, 246, 0.12);

  /* ── Spacing (escala de 4px) ── */
  --space-1:   4px;
  --space-2:   8px;
  --space-3:   12px;
  --space-4:   16px;
  --space-5:   20px;
  --space-6:   24px;
  --space-8:   32px;
  --space-10:  40px;

  /* ── Tipografía ── */
  --font-family: var(--font-dm-sans), system-ui, sans-serif;
  --font-size-xs:   11px;
  --font-size-sm:   13px;
  --font-size-base: 14px;
  --font-size-md:   16px;
  --font-size-lg:   20px;
  --font-size-xl:   24px;

  /* ── Transitions ── */
  --transition-fast: 0.15s ease;
  --transition-base: 0.2s ease;
  --transition-slow: 0.3s ease;

  /* ── Sidebar ── */
  --sidebar-width:      260px;
  --sidebar-collapsed:  72px;
  --topbar-height:      56px;
}
```

### Cómo los componentes consumen tokens

Los componentes NUNCA usan valores literales. Siempre `var(--token)`:

```css
/* ✅ CORRECTO — componente Button */
.btn-primary {
  background: var(--brand);
  color: var(--text-on-brand);
  border-radius: var(--radius-full);
  padding: var(--space-3) var(--space-6);
  font-size: var(--font-size-sm);
  transition: background var(--transition-fast);
}
.btn-primary:hover {
  background: var(--brand-hover);
}

/* ❌ INCORRECTO */
.btn-primary {
  background: #3B82F6;
  color: white;
  border-radius: 9999px;
  padding: 12px 24px;
}
```

### Escenarios de cambio futuro

| Escenario | Qué se cambia | Qué NO se toca |
|-----------|---------------|-----------------|
| Rebrand (nuevo color) | `--brand` y familia en `globals.css` | Ningún componente, ninguna página |
| Dark mode | Añadir `[data-theme="dark"]` con override de tokens | Ningún componente, ninguna página |
| White-label (para partners) | CSS variables inyectadas por config de partner | Ningún componente, ninguna página |
| Más redondeado/cuadrado | `--radius-*` en `globals.css` | Ningún componente, ninguna página |
| Tipografía diferente | `--font-family` + `--font-size-*` | Ningún componente, ninguna página |

### Dark mode (preparación futura)

No se implementa ahora, pero la arquitectura lo permite sin refactorizar:

```css
/* Futuro: añadir al final de globals.css */
[data-theme="dark"] {
  --surface-primary:   #0A0A0B;
  --surface-secondary: #18181B;
  --text-primary:      rgba(255, 255, 255, 0.92);
  --text-secondary:    rgba(255, 255, 255, 0.55);
  --border:            rgba(255, 255, 255, 0.08);
  /* ... los componentes se adaptan solos */
}
```

Se activa con un `<html data-theme="dark">`. Cero cambios en componentes.

---

## COMPONENTES REQUERIDOS

Cada componente vive en `frontend/app/components/ui/` como archivo `.tsx` + `.module.css`.
Consume SOLO tokens de `globals.css`. Nunca `style={{}}` ni colores literales.

**Patrón de cada componente:**
```
components/ui/
  Button/
    Button.tsx          ← componente React
    Button.module.css   ← estilos con var(--token)
    index.ts            ← re-export
```

| Componente | Responsabilidad |
|------------|----------------|
| `Button` | Variantes: primary, secondary, ghost, danger. Tamaños: sm, md, lg. Loading state. |
| `Input` | Text, email, password. Label, error, helper text. leftIcon slot. |
| `Select` | Dropdown nativo estilizado. Label, error, placeholder, options array. Tamaños: sm, md, lg. |
| `SearchInput` | Input con icono de búsqueda, botón clear, loading spinner. Tamaños: sm, md. |
| `Textarea` | Multi-line input. Label, error, helper, character counter, resize control. |
| `Badge` | Semántico: success, warning, danger, info, neutral. Sin emoji. |
| `StatusDot` | Punto 8px con color semántico. Online/offline/urgente. |
| `Card` | Container con border, padding, radius. Variantes: default, interactive. |
| `Table` | Headers, rows, hover, sorting, empty state, skeleton. |
| `Modal` | Overlay + dialog. Close on ESC, click fuera, botón X. |
| `Toast` | Efímero: success, error, warning, info. Auto-dismiss 5s. |
| `EmptyState` | Icono Lucide + texto + acción sugerida. |
| `Avatar` | Iniciales con color determinístico. 24/32/40px. |
| `Tabs` | Underline style. Active con border-bottom brand. Para contenido en detail pages. |
| `StatusTabs` | Tabs con contadores de estado para list pages. Variantes semánticas (success/warning/danger). Reemplaza StatsCards en listados. |
| `Tooltip` | Hover. Dark bg, white text, radius sm. |
| `Dropdown` | Trigger (⋯) + menu items + separadores. Acepta `trigger` custom (sin forzar 32×32). |
| `Skeleton` | Shimmer animation. Forma del contenido real. |
| `Pagination` | Números de página, ellipsis, prev/next, info de resultados. |
| `StatsCard` | Tarjeta de métrica: label, valor, icono, trend, subtext, accent color. Solo en Overview pages. |
| `Breadcrumb` | Navegación con chevron separators. Items con href opcionales. |
| `AlertBanner` | Banner inline: info, success, warning, danger. Título opcional, close button. |
| **Layout** | **Responsabilidad** |
| `PageHeader` | Título h1 + subtitle + CTA action slot. Estructura fija §3.5. Responsive. |
| `FilterBar` | Search (flex-1) + selects (derecha). Sin Card. Estructura fija §3.4. |
| `ListPage` | Layout wrapper §2.4: PageHeader → StatusTabs → FilterBar → content → Pagination. |
| `DetailPage` | Layout wrapper §2.5: back link → header card → tab bar → tab content. ARIA tabs. |

### Inventario de componentes implementados

| Componente | Directorio | Estado |
|------------|-----------|--------|
| Button | `components/ui/Button/` | ✅ Implementado |
| Badge | `components/ui/Badge/` | ✅ Implementado |
| StatusDot | `components/ui/StatusDot/` | ✅ Implementado |
| Card | `components/ui/Card/` | ✅ Implementado |
| Input | `components/ui/Input/` | ✅ Implementado |
| Select | `components/ui/Select/` | ✅ Implementado |
| SearchInput | `components/ui/SearchInput/` | ✅ Implementado |
| Textarea | `components/ui/Textarea/` | ✅ Implementado |
| Modal | `components/ui/Modal/` | ✅ Implementado |
| Table | `components/ui/Table/` | ✅ Implementado |
| Toast | `components/ui/Toast/` | ✅ Implementado |
| Tabs | `components/ui/Tabs/` | ✅ Implementado |
| StatusTabs | `components/ui/StatusTabs/` | ✅ Implementado |
| EmptyState | `components/ui/EmptyState/` | ✅ Implementado |
| Skeleton | `components/ui/Skeleton/` | ✅ Implementado |
| Avatar | `components/ui/Avatar/` | ✅ Implementado |
| Tooltip | `components/ui/Tooltip/` | ✅ Implementado |
| Dropdown | `components/ui/Dropdown/` | ✅ Implementado |
| Pagination | `components/ui/Pagination/` | ✅ Implementado |
| StatsCard | `components/ui/StatsCard/` | ✅ Implementado |
| Breadcrumb | `components/ui/Breadcrumb/` | ✅ Implementado |
| AlertBanner | `components/ui/AlertBanner/` | ✅ Implementado |
| StatusTabs | `components/ui/StatusTabs/` | ✅ Implementado — tabs con contadores por estado (§3.2) |
| HelpTip | `components/ui/HelpTip/` | ✅ Implementado — ⓘ + tooltip contextual (§4.12) |
| **Layout** | **Directorio** | **Estado** |
| PageHeader | `components/ui/PageHeader/` | ✅ Implementado |
| FilterBar | `components/ui/FilterBar/` | ✅ Implementado |
| ListPage | `components/ui/ListPage/` | ✅ Implementado — layout para list pages (§2.4) |
| DetailPage | `components/ui/DetailPage/` | ✅ Implementado — layout para detail pages (§2.5) |
| FormPage | `components/ui/FormPage/` | ✅ Implementado — layout para forms (§2.6) |
| ContextBackLink | `components/ui/ContextBackLink.tsx` | ✅ Implementado — back navigation cross-module |
| NoPermission | `components/ui/NoPermission.tsx` | ✅ Implementado — PBAC denied page |
| **Interacción** | **Directorio** | **Estado** |
| CommandPalette | `components/ui/CommandPalette/` | ✅ Implementado — Cmd+K search + nav (§4.10) |
| BulkActionBar | `components/ui/BulkActionBar/` | ✅ Implementado — floating toolbar (§4.11) |
| **Auth** | **Directorio** | **Estado** |
| AuthLayout | `app/AuthLayout.tsx` | ✅ Implementado — split-screen (§5.13) |
| auth-components | `app/auth-components.tsx` | ✅ Implementado — EyeIcon, PasswordCheck (DRY) |
| auth.module.css | `app/auth.module.css` | ✅ Implementado — 24 clases, zero hex |

### Cómo usar los componentes

```tsx
// Importar desde el barrel export
import { Button, Badge, Card, Table, Modal, useToast } from '@/components/ui';

// Toast requiere ToastProvider en el layout
import { ToastProvider } from '@/components/ui';

// En el componente
const { toast } = useToast();
toast('success', 'Guardado correctamente.');
```

**Preview:** la página `/dashboard/ds-preview` muestra todos los componentes con ejemplos interactivos. Esta página se eliminará en producción.

---

## ANTI-PATRONES

1. **`style={{}}` inline** — Siempre clases CSS o tokens. Nunca inline.
2. **Colores hardcodeados** — Siempre variables CSS. Nunca `#3B82F6` directo en JSX.
3. **Emojis como UI** — Nunca. Usar StatusDot, Badge, o iconos Lucide React.
4. **3+ botones al mismo nivel** — Nunca. Jerarquía primario/secundario/menú.
5. **3+ badges por item** — Nunca. Máximo 2, el resto como texto gris.
6. **Tablas sin empty state** — Nunca. Siempre diseñar el caso vacío.
7. **Modales sin escape** — Siempre: ESC, click fuera, botón X.
8. **Contraste insuficiente** — Mínimo ratio 4.5:1 (WCAG AA).
9. **`#635BFF` en el dashboard** — El color brand es `#3B82F6`. Migrar todas las instancias.
10. **Mensajes de sistema burocráticos** — Seguir la voz de marca: frases cortas, cercanas, sin jerga.

---

## ARQUITECTURA DE NAVEGACIÓN

### Principios

1. **Agrupación por dominio, no por tipo** — "Soporte" contiene tickets Y chats. No son items separados en el sidebar.
2. **Máximo 8 items visibles** — Más de 8 genera scroll innecesario. Agrupar con secciones o sub-navegación.
3. **El cliente ve menos, no más** — El sidebar del cliente tiene máximo 5 items. Simple, sin ruido.
4. **Sin iconos redundantes** — Cada sección tiene un icono semántico de Lucide React. Sin iconos SVG inline custom.
5. **Sub-navegación dentro de la página** — Los sub-módulos (chats vs tickets, facturas vs perfiles) se resuelven con Tabs dentro de la página, no como items del sidebar.

### Sidebar — Vista Admin/Agente

```
┌─────────────────────────┐
│  ◇ aelium               │  ← logo (siempre visible)
├─────────────────────────┤
│                         │
│  PRINCIPAL              │  ← label de sección (gris, uppercase, xs)
│  ○ Dashboard            │  ← /dashboard (resumen general)
│  ○ Clientes             │  ← /dashboard/clients
│  ○ Productos            │  ← /dashboard/products
│  ○ Facturación          │  ← /dashboard/billing
│                         │
│  SOPORTE                │  ← label de sección
│  ○ Tickets              │  ← /dashboard/support (tickets async)
│  ○ Chat en vivo         │  ← /dashboard/support/chats (real-time)
│  ○ Tareas               │  ← /dashboard/tasks
│                         │
│  SISTEMA                │  ← label de sección (solo superadmin)
│  ○ Settings             │  ← /dashboard/settings
│  ○ Audit log            │  ← /dashboard/audit
│  ○ Infraestructura      │  ← /dashboard/infrastructure
│  ○ Knowledge Base       │  ← /dashboard/knowledge-base
│                         │
├─────────────────────────┤
│  👤 Nombre Agente       │  ← user info + menú (perfil, logout)
└─────────────────────────┘
```

**Nota sobre Soporte:** "Tickets" y "Chat en vivo" son dos items separados porque son dos workflows fundamentalmente diferentes (async vs real-time). Están agrupados bajo la sección "SOPORTE" para que se entienda que son parte del mismo dominio.

### Sidebar — Vista Cliente

```
┌─────────────────────────┐
│  ◇ aelium               │
├─────────────────────────┤
│                         │
│  ○ Inicio               │  ← /dashboard (resumen del cliente)
│  ○ Mis servicios        │  ← /dashboard/services
│  ○ Facturas             │  ← /dashboard/billing (solo sus facturas)
│  ○ Soporte              │  ← /dashboard/support (sus tickets)
│                         │
├─────────────────────────┤
│  👤 Nombre Cliente      │
└─────────────────────────┘
```

**El cliente no ve:** Chat en vivo (usa el ChatWidget flotante), Tareas, Products, Clients, Settings, Audit, Infrastructure.

### Sidebar — Vista Partner

```
┌─────────────────────────┐
│  ◇ aelium               │
├─────────────────────────┤
│                         │
│  ○ Dashboard            │  ← resumen de comisiones y actividad
│  ○ Mis clientes         │  ← /dashboard/my-clients
│  ○ Comisiones           │  ← /dashboard/commissions
│  ○ Mi enlace            │  ← /dashboard/my-link (referral link)
│                         │
├─────────────────────────┤
│  👤 Nombre Partner      │
└─────────────────────────┘
```

### Topbar

```
┌────────────────────────────────────────────────────────────────────┐
│  [☰] ──────────────── [🔍 Cmd+K]  [💬 Soporte]  [🔔]  [👤 ▾]    │
└────────────────────────────────────────────────────────────────────┘
  │                        │            │            │       │
  │                        │            │            │       └─ Dropdown: perfil, config, logout
  │                        │            │            └───────── Notificaciones: badge con count
  │                        │            └────────────────────── Solo clientes: canales según plan (UI_SPEC §P3)
  │                        └─────────────────────────────────── Command Palette (sprint futuro)
  └──────────────────────────────────────────────────────────── Toggle sidebar (móvil)
```

**Topbar rules:**
- **Título** = nombre de la sección actual (ej: "Facturación", "Chat en vivo")
- **No duplicar** acciones del sidebar en el topbar
- **Notificaciones** = badge rojo con número. Click abre panel lateral (no nueva página)
- **Menú usuario** = dropdown con avatar + nombre + rol + divider + opciones

### Mapa completo de módulos → ubicación

| Módulo | Sidebar (Admin) | Sidebar (Cliente) | Sub-navegación | Sprint |
|--------|-----------------|-------------------|----------------|--------|
| Dashboard home | ○ Dashboard | ○ Inicio | — | 1 |
| Clientes CRM | ○ Clientes | — | Tabs: lista, detalle/{id} | 4 |
| Productos catálogo | ○ Productos | — | Tabs: lista, nuevo, editar | 5 |
| Facturación | ○ Facturación | ○ Facturas | Tabs: facturas, perfiles, checkout | 6 |
| Tickets soporte | ○ Tickets | ○ Soporte | Tabs en detalle: mensajes, historial | 7 |
| Chat en vivo | ○ Chat en vivo | — (widget flotante) | Panel 3 columnas | 7 |
| Tareas | ○ Tareas | — | Tabs: mis tareas, equipo, calendario | 8 |
| Settings | ○ Settings | — | Tabs: general, auth, billing, support, email | 12 |
| Audit log | ○ Audit log | — | Tabs: cambios, errores, accesos | 9 |
| Infraestructura | ○ Infraestructura | — | — | 10 |
| Knowledge Base | ○ Knowledge Base | — | — | 12 |
| Notificaciones | 🔔 Topbar | 🔔 Topbar | Panel lateral overlay | 9 |
| Promotions | — | — | Dentro de Facturación (Tabs) | 17 |
| Projects (ex-WDIFY) | Dentro de Tickets | — | Tab "Proyectos" en soporte | 22 |
| Servicios cliente | — | ○ Mis servicios | Lista + detalle | 11 |
| Partner: clientes | — | — | ○ Mis clientes (sidebar partner) | 19 |
| Partner: comisiones | — | — | ○ Comisiones (sidebar partner) | 19 |
| Partner: enlace | — | — | ○ Mi enlace (sidebar partner) | 20 |
| Transparencia RGPD | — | Dentro de perfil usuario | Tab en menú usuario | 12.5 |

### Permisos por rol y visibilidad

| Rol | Secciones sidebar visibles |
|-----|---------------------------|
| `superadmin` | PRINCIPAL + SOPORTE + SISTEMA (todo) |
| `agent_full` | PRINCIPAL + SOPORTE |
| `agent_support` | SOPORTE + Clientes (lectura) |
| `agent_billing` | Facturación + Clientes (lectura) |
| `client` | Inicio, Mis servicios, Facturas, Soporte |
| `partner` | Dashboard, Mis clientes, Comisiones, Mi enlace, Soporte |

---

## OBLIGATORIEDAD

### Cuándo aplica este documento

Este documento aplica **siempre que se cree o modifique una interfaz** en el dashboard. Sin excepciones:

1. **Nuevo módulo** (ej: Sprint 8 Tareas) — toda la UI del módulo usa los componentes de `components/ui/`.
2. **Nuevo plugin** (ej: plugin de WhatsApp) — si el plugin tiene frontend, usa los componentes del DS.
3. **Modificación de página existente** — al tocar una página, migrar los elementos que toque al DS.
4. **Widget o embed** (ej: ChatWidget) — usa los tokens CSS de `globals.css` para mantener coherencia.
5. **Página de cliente** — mismos componentes, misma voz de marca, misma jerarquía visual.

### Checklist antes de crear una interfaz

```
☐ He leído DESIGN_SYSTEM.md y UI_SPEC.md
☐ Mi página está clasificada en un tipo de UI_SPEC §2 (Overview/List/Detail/Form/Workspace/Settings)
☐ Mi página está documentada en UI_SPEC §5 con su especificación
☐ Uso solo componentes de components/ui/ (Button, Card, Table, etc.)
☐ No uso style={{}} inline (excepto width/height dinámicos)
☐ No uso colores hex literales — solo var(--token)
☐ No uso emojis en la interfaz
☐ Mi página sigue la anatomía de su tipo (UI_SPEC §2)
☐ Tengo máximo 1 acción primaria por vista
☐ Los empty states están diseñados (UI_SPEC §4.8)
☐ Los mensajes siguen la voz de marca (cortos, cercanos, sin jerga)
☐ Mi archivo no supera los límites de la Regla 15 (ARCHITECTURE.md)
```

### Si necesito un componente que no existe

1. Crear el componente en `components/ui/NuevoComponente/`
2. Seguir el patrón: `.tsx` + `.module.css` + `index.ts`
3. Usar SOLO tokens de `globals.css`
4. Añadir al barrel export en `components/ui/index.ts`
5. Documentar en la tabla de componentes de este archivo
6. Añadir un ejemplo al `/dashboard/ds-preview`

### Referencias cruzadas

| Documento | Relación con este |
|-----------|------------------|
| `UI_SPEC.md` | Define la organización de páginas: anatomía, reglas de contenido, patrones de interacción, especificación por página. Este documento (DESIGN_SYSTEM) define los componentes; UI_SPEC define cómo se componen |
| `ARCHITECTURE.md` | Regla 16 obliga a usar el Design System + UI_SPEC. Regla 15 limita tamaño de archivos |
| `ROADMAP.md` | Sprint 7.5 es la implementación de este documento. D1–D32 completos |
| `DECISIONS.md` | Define la lógica de negocio que las interfaces visualizan. §48 documenta la decisión de auth layout |
| `aelium-documento-de-marca.md` | Fuente de verdad para colores, tipografía y voz |
| `edge_cases.md` | Análisis exhaustivo de edge cases del frontend (Sprint 7) |
| `globals.css` | Implementación técnica de los tokens definidos aquí |
