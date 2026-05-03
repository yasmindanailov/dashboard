# Fase 2.B — Feedback

> Estado: **en curso**
> Modo: **diseño**
> Output: 7 specs + 7 páginas de maqueta + audit + NOTES.

---

## Componentes

Badge, StatusDot, Toast, AlertBanner, Tooltip, HelpTip, Skeleton.

## Entradas

- `../../fase-1-tokens/tokens.css`
- `../../DECISIONS.md` — DD-001 a DD-023 aplican.
- `audit-existing.md` — auditoría de las 7 fuentes reales.
- `frontend/app/components/ui/{Badge,StatusDot,Toast,AlertBanner,Tooltip,HelpTip,Skeleton}/`

## Heredamos de fase 2.A (DD-022, DD-023)

- **Voz de marca** en cualquier texto: Toast messages, AlertBanner titles,
  HelpTip explanations.
- **Firma visual**: aplicar `.aelium-dot`, `.aelium-loader`, `.mesh-bg`,
  `.num`, `.accent-stripe-left` donde tenga sentido.
- **Tokens DD-021**: superficies, texto y bordes alineados con marca.

## Decisiones a tomar

- **D2B-1**: Añadir variante `pending` (púrpura) a Badge y StatusDot —
  formalizar el set semántico completo (DD-004 ya lo tiene).
- **D2B-2**: Tamaños sm/md en Badge — coherencia con resto del sistema.
- **D2B-3**: Skeleton con variante morfológica (rombo, line, paragraph,
  card-skeleton) — aplicar firma visual.
- **D2B-4**: AlertBanner pending variant — para tareas en revisión, etc.
- **D2B-5**: Toast — mantener fondo oscuro o migrar a fondo light + accent
  stripe? Decisión visual importante.

## Plan de la sesión activa

1. ✅ Audit (audit-existing.md).
2. ✅ CSS compartido en styles.css.
3. ✅ Specs en bloque (sin pausa por modelo — ya aprobado en 2.A).
4. ✅ 7 páginas de maqueta + posiblemente una página de muestra que
   las componga.
5. ✅ NOTES.md con deudas.
6. ✅ Commit de cierre.
