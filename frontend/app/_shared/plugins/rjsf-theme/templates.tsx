'use client';

import type { FieldTemplateProps } from '@rjsf/utils';

/**
 * AeliumDsFieldTemplate — Sprint 15C.II Fase B fix-up (2026-05-10).
 *
 * Customización del FieldTemplate canónico de `@rjsf/core` para evitar
 * duplicación visual de label + description con los widgets DS.
 *
 * **Bug raíz que arregla**: el FieldTemplate por defecto de rjsf renderiza
 * `<TitleField>` (con el `schema.title`) Y `<DescriptionField>` (con el
 * `schema.description`) ENCIMA del widget. Pero los widgets DS canónicos
 * (`DSTextWidget`, `DSNumberWidget`, etc.) ya delegan al componente DS
 * `<Input>` que tiene su propio `<label>` y `helperText` integrados —
 * causando duplicación visible (smoke real Yasmin 2026-05-10 lo reportó).
 *
 * Doctrina:
 *   - El widget DS es la única fuente del visual del field (label + input
 *     + helperText + error). El FieldTemplate solo provee el wrapper +
 *     children + manejo de errores agregados.
 *   - Mantener `displayLabel` y `description` ocultos a nivel template;
 *     los widgets los reciben por separado vía `props.label` y
 *     `props.options.help` (rjsf mapea `schema.description` → options.help
 *     automáticamente). El widget decide cómo renderizar.
 *
 * Heredable: cualquier futuro tema DS que implemente sus propios widgets
 * con label embebido puede reusar este template tal cual.
 */
export function AeliumDsFieldTemplate(props: FieldTemplateProps) {
  const { children, classNames, style, errors, hidden, displayLabel } = props;

  if (hidden) {
    return <div className={classNames} style={{ display: 'none' }}>{children}</div>;
  }

  // NO renderizamos:
  //   - <TitleField>: el widget DS pasa `props.label` al `<Input>` y este
  //     renderiza su propio `<label htmlFor=...>` correctamente para a11y.
  //   - <DescriptionField>: el widget DS lee `props.options.help` (mapeado
  //     desde `schema.description` por rjsf) y lo pasa como `helperText`
  //     al `<Input>` que lo renderiza debajo del field.
  //
  // `displayLabel` puede usarse en el futuro para forzar render de title
  // en widgets que no embeban label propio (ej. CheckboxWidget). Por ahora,
  // todos los widgets DS lo gestionan internamente — preservamos children
  // a secas para máxima portabilidad.
  void displayLabel;

  return (
    <div className={classNames} style={style}>
      {children}
      {errors}
    </div>
  );
}

/**
 * Template object canónico para pasar a `<Form templates={...}>`. Solo
 * customizamos `FieldTemplate` — el resto (ObjectFieldTemplate,
 * ArrayFieldTemplate, etc.) sigue el default de rjsf.
 */
export const aeliumDsTemplates = {
  FieldTemplate: AeliumDsFieldTemplate,
};
