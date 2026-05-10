'use client';

import type { ChangeEvent } from 'react';
import type { WidgetProps } from '@rjsf/utils';

import { Input, Select } from '../../../components/ui';
// Sprint 15C.II Fase B round 5: `t()` ya no se usa aquí. Label +
// description ahora viven en AeliumDsFieldTemplate (templates.tsx).

/**
 * Widgets canónicos del tema DS para `@rjsf/core` — Sprint 15A Fase H.1
 * (ADR-080 §7).
 *
 * Mapping subset acotado del manifest (ADR-080 §1):
 *   - string default       → DSTextWidget (DS Input).
 *   - string format=uri    → DSTextWidget type="url".
 *   - string format=email  → DSTextWidget type="email".
 *   - string format=password → DSPasswordWidget (DS Input type="password").
 *   - boolean              → DSCheckboxWidget.
 *   - integer/number       → DSNumberWidget (DS Input type="number").
 *   - enum                 → DSSelectWidget (DS Select).
 *
 * Los widgets ignoran props rjsf no aplicables al subset (autofocus,
 * multiple, hideError) y delegan en los componentes DS para visual y a11y.
 *
 * `value` puede llegar como `undefined` en parcial-update; el spread
 * `value ?? ''` previene React warnings sobre componentes controlados ↔
 * uncontrolled.
 */

/** Resuelve el tipo HTML del input según `schema.format`. */
function resolveInputType(format?: string): string {
  switch (format) {
    case 'uri':
      return 'url';
    case 'email':
      return 'email';
    case 'password':
      return 'password';
    case 'uuid':
      return 'text';
    default:
      return 'text';
  }
}

export function DSTextWidget(props: WidgetProps) {
  const {
    id,
    value,
    disabled,
    readonly,
    placeholder,
    onChange,
    onBlur,
    onFocus,
    rawErrors,
    schema,
    options,
  } = props;

  const inputType = resolveInputType(schema.format);
  // Sprint 15C Fase 15C.I: rjsf pasa schema.description vía options.help.
  // Sprint 15C.II Fase B round 5: el FieldTemplate (AeliumDsFieldTemplate)
  // renderiza `description` como nodo encima del widget. NO renderizamos
  // helperText debajo del Input para evitar duplicación. Errores SÍ via
  // helperText fallback porque el FieldTemplate los renderiza fuera.
  void options;
  const errorText = rawErrors && rawErrors.length > 0 ? rawErrors[0] : undefined;

  // Sprint 15C.II Fase B round 5 (2026-05-10): label movido al
  // FieldTemplate (única fuente). Pasamos `undefined` al Input para evitar
  // que renderice su propio <label> (causaba duplicación / inconsistencia
  // con format=uri donde rjsf vacía props.label).
  return (
    <Input
      id={id}
      name={id}
      type={inputType}
      value={(value ?? '') as string}
      onChange={(e: ChangeEvent<HTMLInputElement>) =>
        onChange(e.target.value === '' ? undefined : e.target.value)
      }
      onBlur={() => onBlur(id, value)}
      onFocus={() => onFocus(id, value)}
      placeholder={placeholder}
      disabled={disabled || readonly}
      autoComplete={inputType === 'password' ? 'new-password' : 'off'}
      error={errorText}
    />
  );
}

export function DSPasswordWidget(props: WidgetProps) {
  // El widget de password reusa el text widget — la detección de
  // `format=password` ya enruta correctamente via `resolveInputType`.
  return <DSTextWidget {...props} />;
}

export function DSNumberWidget(props: WidgetProps) {
  const {
    id,
    value,
    disabled,
    readonly,
    placeholder,
    onChange,
    onBlur,
    onFocus,
    rawErrors,
    schema,
    options,
  } = props;

  // Sprint 15C.II Fase B round 5: label + description movidos al
  // FieldTemplate (única fuente). Sin label/helperText aquí.
  void options;
  const errorText = rawErrors && rawErrors.length > 0 ? rawErrors[0] : undefined;

  return (
    <Input
      id={id}
      name={id}
      type="number"
      value={value === undefined || value === null ? '' : (value as number)}
      min={schema.minimum}
      max={schema.maximum}
      step={schema.type === 'integer' ? 1 : 'any'}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        if (raw === '') return onChange(undefined);
        const parsed = schema.type === 'integer' ? parseInt(raw, 10) : parseFloat(raw);
        onChange(Number.isNaN(parsed) ? undefined : parsed);
      }}
      onBlur={() => onBlur(id, value)}
      onFocus={() => onFocus(id, value)}
      placeholder={placeholder}
      disabled={disabled || readonly}
      error={errorText}
    />
  );
}

export function DSCheckboxWidget(props: WidgetProps) {
  const {
    id,
    label,
    value,
    disabled,
    readonly,
    onChange,
    rawErrors,
  } = props;

  const errorText = rawErrors && rawErrors.length > 0 ? rawErrors[0] : undefined;
  const checked = value === true;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label
        htmlFor={id}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 14,
          color: 'var(--text-primary)',
          cursor: disabled || readonly ? 'not-allowed' : 'pointer',
        }}
      >
        <input
          id={id}
          name={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled || readonly}
          style={{ accentColor: 'var(--brand-primary)' }}
        />
        <span>{label}</span>
      </label>
      {errorText && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>
          {errorText}
        </p>
      )}
    </div>
  );
}

export function DSSelectWidget(props: WidgetProps) {
  const {
    id,
    value,
    disabled,
    readonly,
    placeholder,
    onChange,
    onBlur,
    onFocus,
    rawErrors,
    options,
  } = props;

  const errorText = rawErrors && rawErrors.length > 0 ? rawErrors[0] : undefined;
  const enumOptions = (options.enumOptions ?? []).map((opt) => ({
    value: String(opt.value),
    label: String(opt.label ?? opt.value),
  }));

  // Sprint 15C.II Fase B round 5: label movido al FieldTemplate.
  return (
    <Select
      id={id}
      name={id}
      value={value === undefined || value === null ? '' : String(value)}
      onChange={(e) =>
        onChange(e.target.value === '' ? undefined : e.target.value)
      }
      onBlur={() => onBlur(id, value)}
      onFocus={() => onFocus(id, value)}
      disabled={disabled || readonly}
      placeholder={placeholder}
      options={enumOptions}
      error={errorText}
    />
  );
}
