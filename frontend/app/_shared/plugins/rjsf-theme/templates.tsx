'use client';

import type { FieldTemplateProps } from '@rjsf/utils';

/**
 * AeliumDsFieldTemplate — Sprint 15C.II Fase B fix-up (2026-05-10).
 *
 * Customización del FieldTemplate canónico de `@rjsf/core` que es la
 * **única fuente de label + description visibles** del campo. Los widgets
 * DS (DSTextWidget, etc.) NO renderizan label propio — solo el Input
 * core sin chrome — para garantizar consistencia visual entre todos los
 * campos sin importar cómo rjsf manipule `props.label` por field/format.
 *
 * **Bug raíz arreglado** (smoke real Yasmin 2026-05-10):
 *   El FieldTemplate por defecto de rjsf renderiza `<TitleField>` propio,
 *   y simultáneamente puede vaciar/manipular `props.label` para algunos
 *   formats (ej. format=uri). Resultado: duplicación o ausencia
 *   inconsistente del label según format/posición del field.
 *
 * Doctrina round 5:
 *   - **Label SIEMPRE proviene del FieldTemplate** (este componente).
 *     Lee `props.schema.title` (i18n key resuelta upstream por
 *     translateSchema) o fallback a `props.label`. Asterisco si required.
 *     `<label htmlFor={id}>` apunta al input vía id consistente — a11y
 *     preservada.
 *   - **Description proviene del FieldTemplate** también, leyendo
 *     `props.description` (rjsf ya lo expone como nodo React listo para
 *     renderizar — incluye el helperText canónico).
 *   - Los widgets DS pasan `label={undefined}` al Input para evitar
 *     duplicación con el FieldTemplate.
 *
 * Heredable: cualquier futuro plugin (15D RC, 15E Docker) reusa este
 * template + sus widgets sin modificación.
 */
export function AeliumDsFieldTemplate(props: FieldTemplateProps) {
  const {
    id,
    children,
    classNames,
    style,
    errors,
    hidden,
    label,
    required,
    schema,
    description,
    displayLabel,
  } = props;

  if (hidden) {
    return <div className={classNames} style={{ display: 'none' }}>{children}</div>;
  }

  // Resolver label: priorizar schema.title (siempre traducido por
  // translateSchema upstream), fallback a props.label de rjsf. Si ninguno
  // disponible (ObjectFieldTemplate raíz, ArrayFieldTemplate, etc.),
  // omitir el label.
  const labelText =
    (typeof schema.title === 'string' && schema.title) || label || '';

  // displayLabel: rjsf lo setea false para algunos casos (ej. boolean
  // checkboxes que renderizan inline). Respetamos ese hint excepto cuando
  // es claramente un sub-objeto/array (ya manejado por sus templates).
  const showLabel =
    displayLabel !== false && labelText && labelText.length > 0;

  return (
    <div className={classNames} style={{ ...style, marginBottom: 16 }}>
      {showLabel && (
        <label
          htmlFor={id}
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text-primary)',
            marginBottom: 6,
          }}
        >
          {labelText}
          {required ? ' *' : ''}
        </label>
      )}
      {description}
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
