# Fase 5 — Mockups del Portal Cliente

> Estado: **en curso**
> Modo: **diseño**
> Output: páginas reales del cliente componiendo **ClientShell** (fase 4) +
> **patterns** de fase 3 + **componentes** de fase 2. Sin tocar
> `frontend/`. Voz Aelium aplicada en cada copy.

---

## Naturaleza de esta fase

Hasta ahora cada fase entregó **piezas**: tokens, componentes, patterns,
shells. Fase 5 las **compone** en páginas terminadas del cliente final.
Cada mockup es la materialización del manual: ClientShell `comfortable`
+ ListPage/DetailPage/FormPage según contexto + cards + tablas + voz.

El objetivo no es inventar más diseño — es **demostrar que el sistema
ya construido produce páginas coherentes**. Si una página pide algo
que el sistema no cubre, eso es señal de que falta una pieza, no
licencia para improvisar.

Heredamos:
- Tokens de fase 1.
- Componentes de fase 2 (todos los grupos A-F).
- Patterns de fase 3 (ListPage 4v · DetailPage 3v · FormPage 3v).
- ClientShell de fase 4 (`comfortable`, sin search palette,
  con SupportButton).
- DD-022 voz · DD-029 variantes · DD-030 rombo selectivo · DD-031
  patterns · DD-032 densidad por portal.

## Páginas cubiertas

| # | Página | Pattern | Pregunta producto |
|---|---|---|---|
| 1 | **Overview** (`/dashboard`) | layout custom (saludo + alerts + accesos) | "¿Todo va bien?" |
| 2 | **Tus servicios** (`/dashboard/services`) | ListPage `grid` | "¿Qué tengo contratado?" |
| 3 | **Detalle de servicio** (`/dashboard/services/[id]`) | DetailPage `with-aside` | "¿Cómo está este servicio?" |
| 4 | **Tus facturas** (`/dashboard/billing`) | ListPage `standard` + StatusTabs | "¿Cuánto pago y cuándo?" |
| 5 | **Detalle de factura** (`/dashboard/billing/[id]`) | DetailPage `standard` | "¿Qué pago en esta factura?" |
| 6 | **Transparencia** (`/dashboard/transparency`) | ListPage `timeline` | "¿Qué hace Aelium por mí?" |
| 7 | **Configuración** (`/dashboard/settings`) | FormPage `long-form` | "¿Cómo personalizo lo mío?" |

Páginas que **no entrega** fase 5:
- **Soporte** (chats + tickets) — pattern Workspace propio, fase
  separada cuando se aborde.
- **Checkout / añadir servicio** — FormPage wizard. Se verá en fase
  posterior con onboarding completo.

## Decisiones que esta fase debe tomar

1. **Voz "Tus" en lugar de "Mis"**: el actual código usa
   "Mis servicios" / "Mis facturas". El audit de fase 4 estableció
   "Tus servicios" / "Tus facturas" (voz de socio que cuenta al
   cliente, no del cliente hablando consigo mismo). Se reafirma aquí.
2. **Overview como Dashboard, NO Overview**: el ítem del sidebar dice
   **"Inicio"**. La página interna también — sin "Dashboard" /
   "Overview" como title. El h1 es contextual ("Hola, María" /
   "Buenos días, María").
3. **Sin StatsCards en overview** del cliente. Cifras sí, pero como
   tiles propios con voz humana (no "MRR · 49,90 €" · sí
   "Tu próxima factura · 49,90 € se carga el 12 nov").
4. **Transparency es el activo de marca diferenciador** — recibe
   tratamiento especial: timeline detallada, voz cuidada, eventos
   en lenguaje humano.
5. **Cada mockup compone shell + pattern visiblemente** — el
   ClientShell se ve en cada mockup para que el revisor confirme la
   coherencia.

## Plan

1. ✅ `audit-existing.md` — drift en copy ("Mis" → "Tus") y
   estructuras improvisadas en código actual.
2. ✅ 7 mockups en `mockup/cliente/`.
3. ✅ NOTES.md con deudas de migración del código actual.
4. ✅ DD-033 si emergen patrones nuevos (probable: "Hola, María"
   pattern para overviews).
5. ✅ PLAN.md actualizado.
6. ✅ Commit y push.

## Lo que esta fase NO entrega

- Implementación TS de los cambios de copy (registrado en NOTES).
- Página de soporte con chat — pattern Workspace, fase separada.
- Checkout / onboarding wizard — fase separada.
- Páginas de error (404, 500) — fase 10.
