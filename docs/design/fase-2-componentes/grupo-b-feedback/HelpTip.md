# HelpTip — Spec

> Estado: **listo**
> Fuente: `frontend/app/components/ui/HelpTip/HelpTip.{tsx,module.css}`
> Maqueta: `docs/design/mockup/components/help-tip.html`

---

## 1. Anatomía

Icono ⓘ inline + Tooltip multilínea al hacer hover/focus.

```
Tu próxima renovación  ⓘ
                       └─ "Te cobramos automáticamente el día 12 de cada mes."
```

## 2. Composición

HelpTip envuelve `<Tooltip multiline>` con un icono ⓘ como trigger. Hereda todo de Tooltip.

## 3. Estados

Heredados de Tooltip (default / hover / focus / dismissed). El icono propiamente:

| Estado | Color |
|---|---|
| **default** | `--text-tertiary` |
| **hover** | `--brand` |
| **focus-visible** | `--brand` + `--focus-ring` |

## 4. Tokens consumidos

```
Iconografía  --icon-size-sm (14px)
Color        --text-tertiary (default) · --brand (hover)
Estado       --focus-ring
+ Todos los de Tooltip
```

## 5. Voz de marca aplicada

HelpTip es **el mejor sitio para que Aelium acompañe al usuario no técnico**. La marca dice "experto que empodera": el tooltip explica lo que el cliente podría no entender, en su idioma.

### Reglas estrictas

- **Una sola frase** que explique el concepto técnico en términos de negocio.
- **Sin jerga**. "Se cobra automáticamente" en lugar de "Renovación auto-debit".
- **Si hace falta explicar más, no es un HelpTip — es ayuda inline o link a docs.**

### Ejemplos producto

| Concepto | HelpTip text |
|---|---|
| "Próxima renovación" | "Te cobramos automáticamente el día de aniversario de tu servicio." |
| "Soporte Inside" | "Asesoría humana incluida. Si necesitas algo, llamamos nosotros." |
| "Aislamiento por contenedor" | "Tu web vive en su propio espacio, separada de las demás. Más seguro y rápido." |
| "Uptime 99.99%" | "Tu web ha estado caída unos 4 minutos en el último mes. Te avisamos siempre que pasa algo." |
| "Backups internos y externos" | "Tenemos copia diaria de tu web, dentro y fuera. Si algo falla, restauramos en minutos." |

### Anti-patrones

- ❌ "Lorem ipsum dolor sit amet…" — explicación genérica.
- ❌ Tooltip que solo repite el label visible.
- ❌ Múltiples HelpTips juntos en la misma sección — saturación.

## 6. Reglas de uso

- **Máximo 2-3 HelpTips por página.** Si tienes más conceptos a explicar, replantear: o no son tan complejos, o necesitas una página dedicada.
- **Solo en portales cliente y partner** (perfiles no técnicos). Admin y agente saben lo que es un container — no necesitan ⓘ.
- **Inline al lado del término**, no flotando en otro sitio.
- Cuando el contexto es muy denso (admin), **no usar HelpTip** — usar tooltip simple sobre términos.

## 7. Accesibilidad

- `role="img"` en el icono o `aria-label="Más información: ..."`.
- Tooltip hereda accesibilidad — focus por teclado obligatorio.
- En lectores de pantalla, el `aria-label` del icono debe leer el texto del tooltip o "Más información sobre [concepto]".

## 8. Drift vs implementación actual

| ID | Drift | Resolución |
|---|---|---|
| **D2B-10** | Icon 14×14 hardcoded | Migrar a `--icon-size-sm`. |
| Reglas en JSDoc | "Solo cliente, max 2-3 por página" | Llevar a spec — **ya hecho aquí**. |
| Voz | Sin patrón en código | Aplicar reglas de copy en cada uso. |
