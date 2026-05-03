# PLAN.md — Programa de evolución UI/UX del dashboard

> Documento maestro. Cualquier sesión de diseño empieza leyendo este archivo.
> Actualizado al cerrar cada sesión (ver `SESSION_RULES.md` Regla 7).

---

## Estado actual

- **Fase activa:** 1 — Foundations / Design tokens
- **Modo activo:** diseño
- **Próxima acción:** auditar `phase-1-tokens.html` (entregado por sesión previa)
  contra `frontend/app/globals.css`, extraer `tokens.md` + `tokens.css`,
  identificar gaps frente al alcance acordado.
- **Última actualización:** sesión inicial — montaje del programa.

---

## Objetivo macro

Producir un sistema de diseño coherente y un set completo de mockups para el
Aelium Dashboard, alineado con el código existente, la marca (`#3B82F6` +
DM Sans), los 4 roles (cliente, agente, admin, partner) y las restricciones
técnicas del stack.

Resultado esperado: profesional, robusto, **moderno y diferenciador** sin
romper la filosofía de minimalismo funcional (D1–D11 de
`docs/DESIGN_SYSTEM.md`).

---

## Principios rectores

1. **Minimalismo funcional**: jerarquía clara, sin decoración gratuita.
2. **Densidad por rol**: cliente respira, admin/agente productivo, partner medio.
3. **Tokens primero**: cero hex hardcoded, todo amarrado a variables CSS.
4. **Estados completos**: cada componente con default/hover/focus/active/
   disabled/loading/error/empty.
5. **Motion silenciosa, sistemática**: choreography a nivel de design system,
   no decoración por componente.
6. **Firma visual recurrente**: extender el lenguaje de `GradientMesh` al
   producto de forma sutil (acento por portal, manteniendo brand `#3B82F6`).
7. **Coherencia con los canónicos**: respetar `DESIGN_SYSTEM.md` y `UI_SPEC.md`
   mientras no se promocionen cambios.
8. **Implementabilidad**: nada que no se pueda construir con Next.js 16 +
   CSS Modules + Tailwind 4 + Framer Motion, sin librerías UI externas.

---

## Fases

| # | Fase | Estado | Entregable principal |
|---|------|--------|----------------------|
| 0 | Brief y confirmación | Cerrada | `BRIEF.md` aprobado |
| 1 | Foundations / Design tokens | En curso | `tokens.css` + `tokens.md` + `preview.html` |
| 2 | Componentes base (35) | Pendiente | Specs por grupo (formularios, feedback, data, navegación, contenedores) |
| 3 | Patrones de página | Pendiente | DetailPage, ListPage, FormPage |
| 4 | Layout shells | Pendiente | AuthShell, ClientShell, AdminShell, PartnerShell |
| 5 | Mockups cliente | Pendiente | overview, services, billing, support, transparency, checkout |
| 6 | Mockups agente | Pendiente | clients, support, tasks, billing |
| 7 | Mockups admin | Pendiente | overview, products, support-inside-plans, jobs, error-log, templates |
| 8 | Mockups partner | Pendiente | referidos, comisiones, comunicación |
| 9 | Auth flow | Pendiente | login (2FA), register, verify-email, forgot, reset |
| 10 | Estados especiales | Pendiente | Empty states, 404/500, skeletons sistemáticos, modales críticos |
| 11 | Dark mode (opcional) | Pendiente | Tokens dark + ajustes |

Las fases se cierran en orden. No iniciar la siguiente sin cerrar la anterior
(salvo decisión explícita del usuario registrada en `DECISIONS.md`).

---

## Decisiones acumuladas (resumen)

> Ver `DECISIONS.md` para detalle y justificación.

- **Brand:** `#3B82F6` con escala 50–950 a derivar.
- **Tipografía:** DM Sans 400/500/600. El 600 reservado a números grandes
  (StatsCard), display headings y énfasis fuerte.
- **Spacing:** escala 4px (estado actual de `globals.css`).
- **Semánticos:** success/warning/danger/info **+ pending** (púrpura, ya
  usado por StatusDot). Cada uno con `-light`, `-border`, `-strong`.
- **Gray:** queda como neutral, no se duplica como semántico.
- **Dark mode:** arquitectura semántica preparada en fase 1 (nombres
  desacoplados del literal "blanco"). Valores light en fase 1; valores
  dark en fase 11.
- **Motion:** durations + easings definidos en fase 1, choreography
  sistemática añadida en fase 4 cuando aplican a layouts.
- **Iconografía:** tokens base (`--icon-size-*`, `--icon-stroke-width`) en
  fase 1; íconos concretos en fase 2.
- **Firma visual:** extender lenguaje de `GradientMesh` al producto con
  acento por portal (cliente/agente/admin/partner) sobre brand `#3B82F6`.
- **Densidad:** cliente baja, agente/admin alta, partner media-baja.
  Definida formalmente en fase 4 (shells).
- **Referentes ampliados:** Linear, Stripe, Vercel, Raycast, Attio, Arc,
  Height, Pylon, Cron/Notion Calendar.

---

## Cómo trabajar con este plan

1. Cualquier sesión nueva empieza leyendo este archivo + `DECISIONS.md` +
   la última fase cerrada (ver `SESSION_RULES.md` Regla 2).
2. **Modo diseño:** solo escribir en `docs/design/`. NO tocar `frontend/app/`,
   `backend/`, ni los canónicos `DESIGN_SYSTEM.md` / `UI_SPEC.md`.
3. **Modo implementación:** aplicar fase aprobada al código real. PR
   separado, rama distinta, entrada en `implementation-log/`.
4. Cierre de cada fase: `NOTES.md` con deudas + entrada en `DECISIONS.md` +
   actualización de este `PLAN.md`.

---

## Referencias internas

| Archivo | Uso |
|---------|-----|
| `BRIEF.md` | Producto, audiencia, restricciones técnicas (input fase 0) |
| `DECISIONS.md` | Log de decisiones cerradas |
| `REFERENCES.md` | Referentes visuales y de patrón |
| `SESSION_RULES.md` | Protocolo operativo de sesión |
| `../DESIGN_SYSTEM.md` | Sistema canónico actual (fuente de verdad) |
| `../UI_SPEC.md` | Anatomía canónica de páginas (fuente de verdad) |
| `../../frontend/app/globals.css` | Tokens en código (estado actual) |
| `../../frontend/app/components/` | 35 componentes ya codeados |
