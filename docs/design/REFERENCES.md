# REFERENCES.md — Referentes visuales y de patrón

> Inspiración explícita del programa. Cada referente con qué se toma y qué
> NO se toma. Evita "vamos a parecernos a X" sin criterio.

---

## Referentes principales

### Stripe Dashboard
- **Tomar:** claridad informacional, jerarquía tipográfica impecable,
  manejo de tablas densas, voz de marca cercana en mensajes.
- **NO tomar:** densidad excesiva en algunas vistas; nuestra audiencia
  cliente es no técnica.

### Linear
- **Tomar:** sidebar densa pero respirable, command palette, motion
  silenciosa, focus rings con personalidad, feeling de "rapidez".
- **NO tomar:** estética demasiado oscura/minimal "developer-first";
  Aelium es B2B no técnico.

### Vercel Dashboard
- **Tomar:** uso del espacio en blanco, dataviz limpio, separación
  clara entre primario/secundario.
- **NO tomar:** monocromía extrema; necesitamos color semántico vivo.

### Attio
- **Tomar:** densidad alta sin sentirse abrumadora, micro-tipografía
  cuidada, transiciones entre vistas, customización visual sutil
  por entidad (acentos contextuales).
- **NO tomar:** complejidad de relaciones (no es un CRM).

### Raycast
- **Tomar:** command palette con preview, atajos como ciudadanía de
  primera clase, motion silenciosa pero presente.
- **NO tomar:** estética launcher-app; somos un dashboard web.

### Arc
- **Tomar:** color por workspace como elemento de identidad
  contextual (inspiración para acento por portal).
- **NO tomar:** experiencias gamificadas o decorativas.

### Height
- **Tomar:** velocidad percibida, tablas como ciudadano de primera,
  filtros expresivos.
- **NO tomar:** densidad agresiva que penaliza usuarios casuales.

### Pylon
- **Tomar:** vistas de soporte unificadas, manejo de conversaciones,
  mezcla cliente/staff bien resuelta.
- **NO tomar:** specs cerradas que no encajan con nuestro modelo
  (Support Inside vs ticket vs chat).

### Cron / Notion Calendar
- **Tomar:** atención al detalle, transiciones de estado suaves,
  empty states con personalidad.
- **NO tomar:** layout de calendario (no aplica).

---

## Patrones específicos a estudiar

| Patrón | Referente principal | Notas |
|--------|---------------------|-------|
| Sidebar densa con grupos colapsables | Linear, Attio | Para AdminShell |
| Sidebar respirable con identidad de portal | Stripe, Vercel | Para ClientShell |
| Command palette con preview | Raycast, Linear | Para `CommandPalette` actual |
| Tablas densas con filtros expresivos | Linear, Height, Attio | Para `ListPage` admin |
| Detail page con tabs y panel lateral | Linear, Pylon | Para `DetailPage` |
| Multi-step wizard | Stripe, Vercel | Para checkout |
| Empty states con voz | Linear, Notion | Para fase 10 |
| Focus rings con personalidad | Linear | Para tokens en fase 1 |
| Skeletons morfológicos | Linear, Vercel | Para fase 10 |
| Toast / inline feedback | Linear, Stripe | Para componentes feedback |
| Motion choreography sistemática | Linear, Cron | Para fase 1 + fase 4 |

---

## Anti-patrones (qué evitar)

- **Decoración gratuita**: gradientes, glows, bordes brillantes sin
  función. Respeta D1–D11.
- **Iconografía inconsistente**: stroke-width o tamaños mezclados.
- **Animación decorativa**: bouncing, spring exagerado, delays entre
  elementos sin propósito.
- **Densidad incoherente entre roles**: cliente debe poder ver su
  factura sin marearse; admin debe poder cerrar 30 tareas/hora.
- **Voz genérica de SaaS**: "Procederemos con su solicitud", "Ha
  ocurrido un error inesperado". La voz de Aelium es directa y humana.
- **Tokens duplicados o ambiguos**: dos colores que parecen el mismo;
  `--gray-500` vs `--text-secondary` sin distinción clara de uso.

---

## Cómo añadir una referencia

1. Identificar el patrón concreto que se quiere tomar.
2. Identificar qué del referente NO aplica a Aelium.
3. Añadir entrada aquí con ese desglose, no solo "me gusta esta web".
4. Si la referencia justifica una decisión, registrarla en `DECISIONS.md`.
