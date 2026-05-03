# DECISIONS.md — Log de decisiones del programa de diseño

> Una entrada por decisión cerrada, con justificación corta y referencia al
> artefacto que la materializa. Solo decisiones cerradas; las pendientes
> viven en el `NOTES.md` de la fase activa.

Formato:

```
## DD-NNN — [Título corto]
- Fase: N
- Fecha: YYYY-MM-DD
- Decisión: [una frase]
- Justificación: [1–3 frases]
- Materializada en: [archivo/sección]
- Implicaciones: [opcional, qué cambia para fases siguientes]
```

---

## DD-001 — Brand color base

- Fase: 0
- Fecha: 2026-05-03
- Decisión: Brand color `#3B82F6` con escala 50–950 a derivar en fase 1.
- Justificación: Ya es el brand declarado en `docs/SESSION_RULES.md` y en
  `frontend/app/globals.css`. Coherente con la landing.
- Materializada en: `BRIEF.md` § Identidad visual actual
- Implicaciones: Toda decisión de color en fases posteriores parte de esta
  base. Variantes de portal usan acentos sobre esta base, no la sustituyen.

## DD-002 — Tipografía y pesos

- Fase: 0
- Fecha: 2026-05-03
- Decisión: DM Sans como única familia. Pesos 400/500/600. El 600 queda
  reservado a números grandes (StatsCard), display headings y énfasis fuerte.
- Justificación: DM Sans ya está cargada. La doc de marca menciona 400/500;
  el código ya usa 600 declarado como variable. Permitir 600 con uso
  acotado evita inconsistencias y permite jerarquía clara.
- Materializada en: `BRIEF.md` § Restricciones técnicas
- Implicaciones: Specs de componentes deben justificar el uso de 600 cuando
  aplique. Por defecto usar 400 (body) y 500 (botones, énfasis sutil).

## DD-003 — Spacing scale 4px

- Fase: 0
- Fecha: 2026-05-03
- Decisión: Mantener escala 4px existente en `globals.css`.
- Justificación: Ya implementada y consumida por componentes existentes.
  Cambiarla rompería 35 componentes sin beneficio.
- Materializada en: `frontend/app/globals.css` (estado actual)
- Implicaciones: Ningún componente nuevo introduce valores fuera de la
  escala. Documentar en fase 1 qué token va con qué uso.

## DD-004 — Espectro de colores semánticos

- Fase: 0
- Fecha: 2026-05-03
- Decisión:
  - Mantener success / warning / danger / info.
  - Añadir `pending` (púrpura) como semántico — ya existe en `StatusDot`.
  - Cada semántico con `-light` (fondo), `-border` y `-strong` (texto sobre
    `-light`) para garantizar contraste WCAG AA.
  - Gray queda como neutral, no se duplica como semántico.
- Justificación: `StatusDot` ya distingue 6 estados incluyendo púrpura
  (pending). Formalizarlo como semántico evita inconsistencias. `-strong`
  es necesario para texto legible sobre fondos `-light`. Gray como neutral
  es el patrón estándar; duplicarlo crearía ambigüedad de uso.
- Materializada en: alcance de fase 1 (`tokens.css`)
- Implicaciones: Componentes de feedback (Badge, AlertBanner, Toast,
  StatusDot) consumen el set completo. Documentar regla "gray neutral vs
  semántico" en fase 1.

## DD-005 — Escala tipográfica con display

- Fase: 0
- Fecha: 2026-05-03
- Decisión: Mantener xs–2xl actuales y añadir escala display (3xl, 4xl)
  para empty states, hero del cliente y números prominentes.
- Justificación: La escala actual cubre lectura de UI pero no momentos de
  jerarquía dominante. Display permite minimalismo con impacto sin añadir
  decoración.
- Materializada en: alcance de fase 1
- Implicaciones: Definir line-height y letter-spacing apropiados para
  tamaños grandes. Documentar uso (no usar display en interior de tablas
  ni en formularios densos).

## DD-006 — Arquitectura preparada para dark mode desde fase 1

- Fase: 0
- Fecha: 2026-05-03
- Decisión: Nombres de tokens semánticos desacoplados del literal "claro/
  oscuro" desde fase 1 (ej. `--surface-primary`, no `--white`). Valores
  light en fase 1; valores dark en fase 11.
- Justificación: Cuesta lo mismo nombrar bien desde el principio. Cambiarlo
  en fase 11 obligaría a refactorizar tokens y todos los componentes.
- Materializada en: alcance de fase 1
- Implicaciones: Fase 11 solo cambia valores, no nombres. Specs de
  componentes pueden referenciar tokens semánticos sin pensar en modo.

## DD-007 — Motion: durations + easings desde fase 1

- Fase: 0
- Fecha: 2026-05-03
- Decisión: Definir durations (fast/normal/slow) **y** easings (ease-out
  para entradas, ease-in para salidas, ease-in-out por defecto) en fase 1.
  Choreography sistemática (cómo entran cards, expanden detalles, etc.) se
  añade en fase 4 cuando aplica a layouts.
- Justificación: Sin easings los tokens están a medias y cada componente
  acaba inventando. Choreography sin layouts definidos es prematuro.
- Materializada en: alcance de fase 1 (sección F)
- Implicaciones: Componentes de fase 2 consumen los tokens de motion.
  Choreography concreta se decide al cerrar shells.

## DD-008 — Tokens base de iconografía en fase 1

- Fase: 0
- Fecha: 2026-05-03
- Decisión: Incluir `--icon-size-sm/md/lg` y `--icon-stroke-width` en
  fase 1. Íconos concretos (SVG inline) en fase 2.
- Justificación: Sin tokens base de tamaño/stroke, cada componente
  decidiría por su cuenta. Coherencia visual depende de esto.
- Materializada en: alcance de fase 1
- Implicaciones: Stroke-width recomendado guía a quien dibuje SVGs.

## DD-009 — Firma visual recurrente

- Fase: 0
- Fecha: 2026-05-03
- Decisión: Extender el lenguaje de `GradientMesh` (hoy solo en auth) al
  producto de forma sutil, con acento por portal (cliente / agente /
  admin / partner) manteniendo `#3B82F6` como brand base.
- Justificación: La firma visual es lo que diferencia un dashboard "bien
  hecho" de uno "memorable". Una firma repetida con disciplina = identidad.
  Linear, Arc, Attio lo demuestran.
- Materializada en: `BRIEF.md` § Ambición visual; spec concreto en fase 4.
- Implicaciones: Definir cómo, dónde y con qué intensidad aparece. No
  invasivo, no decorativo. Decisión de acentos por portal en fase 4.

## DD-010 — Densidad por rol como dialecto del mismo sistema

- Fase: 0
- Fecha: 2026-05-03
- Decisión: Mismo design system con dos personalidades visibles:
  Cliente (densidad baja, respira) y Agente/Admin (densidad media-alta,
  productivo, tipo Linear/Attio). Partner queda en densidad media.
- Justificación: Cliente no técnico se abruma con densidad alta. Agente/
  admin pierde productividad con densidad baja. Mismo idioma, dialectos.
- Materializada en: `BRIEF.md` § Audiencia y tono; spec concreto en fase 4.
- Implicaciones: Fase 4 (shells) define qué tokens cambian entre densidades
  (paddings, gaps, font-size base). No es un theme separado, es una
  variante del shell.

## DD-011 — Aislamiento del programa de diseño en docs/design/

- Fase: 0
- Fecha: 2026-05-03
- Decisión: El programa de diseño vive en `docs/design/`, separado de los
  canónicos (`docs/DESIGN_SYSTEM.md`, `docs/UI_SPEC.md`). No reemplaza
  esos canónicos; produce drafts que se promocionan en modo implementación.
- Justificación: Aísla el trabajo iterativo del estado oficial. Evita que
  sesiones de desarrollo carguen contenido no relevante (ahorra contexto).
  Mantiene los canónicos como fuente de verdad estable.
- Materializada en: `docs/design/README.md` y `SESSION_RULES.md`
- Implicaciones: Toda sesión de diseño se inicia con "modo diseño, fase N".
  Sesiones de desarrollo no abren `docs/design/` salvo instrucción explícita.

## DD-012 — No tocar canónicos en modo diseño

- Fase: 0
- Fecha: 2026-05-03
- Decisión: `DESIGN_SYSTEM.md` y `UI_SPEC.md` solo se modifican en modo
  implementación, tras aprobar la fase y promocionar cambios.
- Justificación: Si los canónicos cambian antes de promocionar, queda
  ambigüedad sobre qué es estado actual y qué es propuesta.
- Materializada en: `SESSION_RULES.md` Regla 1 y Regla 4
- Implicaciones: Toda discrepancia entre el draft y los canónicos se marca
  como propuesta de cambio en `DECISIONS.md`. La promoción es un paso
  explícito en modo implementación.
