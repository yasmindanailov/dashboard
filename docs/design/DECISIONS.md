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
- Fecha: 2026-05-03 (revisada en fase 1, ver DD-013)
- Decisión: Brand color `#3B82F6`. **Curado a 5 puntos** (`--brand`,
  `-hover`, `-active`, `-light`, `-subtle`) en lugar de escala 50–950
  completa. Ver DD-013 para la revisión.
- Justificación: Ya es el brand declarado en `docs/SESSION_RULES.md` y en
  `frontend/app/globals.css`. Coherente con la landing. La auditoría de
  fase 1 confirmó que los componentes actuales no consumen una escala de
  11 puntos.
- Materializada en: `BRIEF.md` § Identidad visual actual; `tokens.css`
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

## DD-013 — Brand a 5 puntos curados, no escala 50–950

- Fase: 1
- Fecha: 2026-05-03
- Decisión: Mantener `--brand`, `--brand-hover`, `--brand-active`,
  `--brand-light`, `--brand-subtle` como los 5 puntos del brand. No derivar
  escala completa 50–950.
- Justificación: Los componentes actuales no consumen una escala de 11
  puntos. Derivar tokens sin uso introduce ruido visual en `tokens.css` y
  obliga a justificar valores intermedios sin caso real. Si un componente
  futuro necesita un paso intermedio, se añade puntualmente.
- Materializada en: `tokens.css`, `tokens.md` § 1
- Implicaciones: DD-001 queda revisada para reflejar esta lectura. Si en
  fase 2 algún componente pide pasos faltantes, decisión incremental ahí.

## DD-014 — Override de accent por portal diferido a fase 4

- Fase: 1
- Fecha: 2026-05-03
- Decisión: La fase 1 entrega solo el mecanismo (variable indirecta
  `--accent` que apunta a `--brand`). El override por portal
  (`[data-portal]`) **no se define en fase 1**, se cierra en fase 4
  cuando los shells reales estén diseñados.
- Justificación: Decidir acentos por portal sin ver layouts reales es
  prematuro. La propuesta inicial (cliente=brand, agente=brand-hover,
  admin=brand-active) era defensiva y sin diferenciación visible — una
  firma que no se nota no es firma. La decisión robusta requiere ver el
  contexto. Probable: variar intensidad del mesh y densidad por portal,
  no el color del accent (defensa de marca).
- Materializada en: `tokens.css` (sin selector `[data-portal]`),
  `phase-1-tokens.html` § Firma visual, `tokens.md` § 12
- Implicaciones: Hasta fase 4, `--accent` ≡ `--brand` en toda la app.
  Componentes que se diseñen en fase 2 deben consumir `--accent` (no
  `--brand` directo) cuando vayan a verse afectados por la decisión por
  portal — típicamente shell, navegación, sidebar item activo.

## DD-015 — Eliminado `--accent-warm`

- Fase: 1
- Fecha: 2026-05-03
- Decisión: Eliminar el token `--accent-warm: #F59E0B` propuesto en
  iteración previa de Claude Design.
- Justificación: `#F59E0B` es **idéntico a `--warning`**. Usar el color
  semántico de "advertencia" para indicar dinero ganado (comisiones
  partner) es un antipatrón — el cerebro lee warning como problema. Si en
  fase 8 las comisiones requieren un acento cálido, se introduce con un
  color distinto a warning.
- Materializada en: `tokens.css` (eliminado), `phase-1-tokens.html`
- Implicaciones: Partner queda sin acento cálido propio. Decisión
  reabierta en fase 8 si los mockups lo justifican.

## DD-016 — Densidad: variables resueltas + `[data-density]`

- Fase: 1
- Fecha: 2026-05-03
- Decisión: La fase 1 entrega:
  - Tokens raw (`--row-height-compact`, `--row-height-comfortable`, etc.).
  - Variables resueltas (`--row-height`, `--cell-padding`, `--card-padding`,
    `--body-size`) que componentes consumen.
  - Selector `[data-density="comfortable"]` que reescribe las resueltas.
    Default `compact` vive en `:root`.
  - **Asignación por portal diferida a fase 4** (DD-010 ya lo dejaba ahí).
- Justificación: Sin variables resueltas, cada componente decidiría qué
  raw consumir y romperíamos la portabilidad. El selector permite que el
  shell del portal active el dialecto sin tocar componentes.
- Materializada en: `tokens.css` (selector + vars resueltas),
  `tokens.md` § 12 (densidad)
- Implicaciones: Fase 2 actualiza specs de Table, Card, body shell para
  consumir las resueltas. Fase 4 decide qué portal usa qué dialecto.

## DD-017 — Regla `--transition-*` vs `--motion-*`

- Fase: 1
- Fecha: 2026-05-03
- Decisión: Convención para resolver el solapamiento entre familias de
  motion tokens:
  - `--transition-fast/normal/slow` + `--ease-*` → **CSS transitions** de
    propiedad simple (color, background, opacity, transform sutil). Hover,
    focus, active.
  - `--motion-*` (route, stack-in/out, modal-in/out, stagger) → **Framer
    Motion** entry/exit choreography. Cualquier elemento que aparece,
    desaparece o cambia de layout.
  - Si Framer Motion necesita una duración, viene de un token `--motion-*`,
    no de un `--transition-*`.
- Justificación: Sin esta regla, cada componente acabaría mezclando ambas
  familias. La separación es por tecnología (CSS nativo vs librería de
  animación), no por uso, lo que la hace mecánicamente verificable.
- Materializada en: `phase-1-tokens.html` § Firma visual (regla qué token
  con qué tecnología), `tokens.md` § 8 y § 12
- Implicaciones: Specs de fase 2 deben asignar la familia correcta para
  cada interacción. Auditable con un grep de los tokens en componentes.

## DD-018 — Refinamiento de alpha en `-border` semánticos

- Fase: 1
- Fecha: 2026-05-03
- Decisión: Subir el alpha de `--success-border`, `--warning-border`,
  `--danger-border`, `--info-border` de `0.15` a `0.18`.
- Justificación: Permite que `AlertBanner` y `Badge` con borde se
  distingan mejor del fondo `-light` adyacente sin perder sutileza.
  Diferencia óptica imperceptible aislada; cumple coherencia visual
  comparada.
- Materializada en: `tokens.css` (valores actualizados), `audit.md` § 3.2
- Implicaciones: Único cambio de **valor** en tokens existentes en toda la
  fase 1. Sin riesgo de regresión funcional. Registrado para trazabilidad.

## DD-021 — Marca manda sobre `globals.css` (reapertura acotada de fase 1)

- Fase: 1 (reabierta sobre valores de color, no sobre estructura)
- Fecha: 2026-05-03
- Decisión: Cuando el `aelium-documento-de-marca.md` v1.6 y el
  `frontend/app/globals.css` actual difieren en un valor de color, **manda
  el documento de marca**. Se actualizan los tokens de fase 1 a los valores
  de marca. La estructura, nomenclatura y demás decisiones de fase 1
  (DD-001 a DD-018) NO se reabren — solo los valores.
- Justificación: El documento de marca v1.6 (Abril 2026) es la decisión
  más reciente y deliberada de identidad. El `globals.css` arrastra
  valores heredados de la landing previa al documento. Mantener el código
  como verdad sería traicionar el rasgo "Riguroso y consecuente" de la
  personalidad de marca: dice azul, usa azul. Además, fase 1 todavía no
  se ha promocionado a `globals.css` — todavía es draft, así que la
  corrección no rompe código en producción.
- Diferencias específicas que se corrigen:

  | Token | Antes (globals.css) | Después (marca v1.6) |
  |-------|---------------------|----------------------|
  | `--surface-secondary` | `#F7F7F8` (gris) | `#F8FAFF` (azul muy claro) |
  | `--text-primary` | `#0A0A0B` (negro) | `#0F172A` (azul muy oscuro) |
  | `--text-secondary` | `#6B7280` (gris cálido) | `#64748B` (gris azulado) |
  | `--text-tertiary` | `#9CA3AF` | `#94A3B8` (slate-400, alineado a la familia) |
  | `--border` | `rgba(0,0,0,0.06)` | `#E2E8F0` (slate-200) |
  | `--border-hover` | `rgba(0,0,0,0.10)` | `#CBD5E1` (slate-300) |
  | `--border-active` | `rgba(0,0,0,0.15)` | `#94A3B8` (slate-400) |
  | `--accent-secondary` | _no existía_ | `#1F8EFA` (azul vivo, marca) |

- Materializada en: `fase-1-tokens/tokens.css`, `mockup/tokens.css`,
  `fase-1-tokens/audit.md` § 3.3 (sección nueva), este registro.
- Implicaciones:
  1. Cuando se promocione fase 1 a `globals.css` (modo implementación),
     estos cambios entran. Componentes que dependen de `--surface-secondary`,
     `--text-primary`, `--text-secondary`, `--border*` se ven afectados
     visualmente — verificar contraste WCAG y comportamiento sobre fondos.
  2. La maqueta viva (`mockup/tokens.css`) se actualiza ya, así todo
     lo que diseñemos a partir de ahora se ve "Aelium real".
  3. `--accent-secondary` se introduce sin uso definido — registrado en
     `NOTES.md` para que algún componente o layout decida su caso.
  4. Si en el futuro la marca evoluciona a v1.7+, esto se reabre con
     misma lógica (marca manda).

## DD-023 — Firma visual aplicada a componentes (mecanismos distintivos Aelium)

- Fase: 2.A (transversal a fases siguientes)
- Fecha: 2026-05-03
- Decisión: Aplicar **6 mecanismos visuales distintivos** a los
  componentes y páginas del sistema, materializando la firma de marca
  más allá del color y la voz:

  1. **Símbolo dos rombos** como elemento visual recurrente:
     - Logo en nav (SVG cuando exista, fallback CSS).
     - `.aelium-dot` (8px) como marker en eyebrows y listas importantes.
  2. **Aelium loader** (dos rombos pulsando alternativamente) reemplaza
     el spinner circular genérico para loading states de página y
     sección. Botones siguen usando spinner inline.
  3. **GradientMesh sutil** (`.mesh-bg`, opacidad 0.04 / 0.08 según
     contexto) como fondo de Card destacada, hero y empty states grandes.
     NO en tablas ni filas densas.
  4. **Numerales tabulares** (`.num`, vía `--font-feature-numeric`)
     en columnas de cifras: importes, métricas, contadores.
  5. **Accent stripe** (`.accent-stripe-left`) como patrón compartido
     entre sidebar activo, tab activo, filtro aplicado, item
     seleccionado.
  6. **Card como acción** (`.card-action`) con hover brand-tinted
     (border `--brand`, bg `--brand-subtle`) — diferencia cards
     navegables de cards estáticas.

  Más:
  - **Eyebrow** con mini-rombo del color brand antes del título.
- Justificación: Los componentes base (Button, Input, etc.) son
  inherentemente similares entre dashboards — su forma viene de la
  función. La diferenciación real ocurre en la firma. Sin estos
  mecanismos, el dashboard se ve "Tailwind/SaaS genérico". Con ellos,
  cada componente carga marca incluso aislado. Disciplina, no
  decoración: no se aplica todo a todo.
- Materializada en: `mockup/styles.css` (clases utility),
  `mockup/firma-visual.html` (página de demostración).
- Implicaciones: Toda fase posterior consume estos elementos donde tiene
  sentido. Específicamente:
  - Fase 2.B (feedback): Skeleton podría usar `.aelium-loader` para
    estados grandes; Badge puede llevar `.aelium-dot` cuando aplique.
  - Fase 2.C (data): StatsCard usa `.num` por defecto en su valor
    principal; Table usa `.num` en columnas numéricas; FilterBar usa
    `.accent-stripe-left` cuando un filtro está aplicado.
  - Fase 2.D (navegación): Tabs usa accent stripe (vertical o
    underline). PortalBadge puede usar `.aelium-dot.accent`.
  - Fase 2.E (contenedores): Card decide `.card-action` vs estática;
    EmptyState puede usar `.aelium-loader.lg` para "cargando" y rombos
    para ilustración mínima.
  - Fase 4 (shells): el mesh por portal modula `--mesh-opacity-product`
    y posiblemente tinta del mesh.
- Ver `mockup/firma-visual.html` para demostración visual completa.

## DD-022 — Voz de marca aplicada a botones (y por extensión, a toda etiqueta interactiva)

- Fase: 2.A
- Fecha: 2026-05-03
- Decisión: Aplicar el documento de marca §"Voz de marca" como reglas
  específicas para etiquetas de botones, links de acción y triggers:
  - **Verbo concreto** describiendo lo que pasa, no si es positivo o
    negativo. ("Eliminar cliente", no "Aceptar".)
  - **Trato individualizado**: la etiqueta nombra el objeto sobre el que
    actúa cuando es posible. ("Pagar factura", no "Pagar".)
  - **Frases cortas**: 1–3 palabras ideal, máx. 4. Texto largo es síntoma
    de que el botón no comunica.
  - **Tono cercano, no formal**: "Empieza hoy", "Habla con nosotros",
    "Llamarme en 24h". NO: "Iniciar", "Contactar", "Solicitar llamada".
  - **Aelium NUNCA usa en botones**: "Aceptar", "OK", "Submit",
    "Procederemos", "Solicitar", "Estimado", verbos enlatados.
- Justificación: El documento de marca es explícito sobre voz pero hasta
  ahora el sistema de diseño no la había aplicado a microcopy de UI. Sin
  esta regla, los botones parecen genéricos y se pierde identidad.
- Materializada en: `Button.md` § Voz de marca, `button.html` § Voz de
  marca, ejemplos en `button.html` con copy real del producto.
- Implicaciones: aplicable también a Tabs, Dropdown items, link de
  acción, triggers de Modal. Se hereda en toda la fase 2 y siguientes.
