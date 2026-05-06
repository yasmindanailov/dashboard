'use client';

import type { ChangeEvent } from 'react';
import type { WidgetProps } from '@rjsf/utils';

import { Input, Select } from '../../../components/ui';

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
    label,
    value,
    required,
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
  const helperText =
    typeof options.help === 'string' ? options.help : undefined;
  const errorText = rawErrors && rawErrors.length > 0 ? rawErrors[0] : undefined;

  return (
    <Input
      id={id}
      name={id}
      type={inputType}
      label={label + (required ? ' *' : '')}
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
      helperText={helperText}
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
    label,
    value,
    required,
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

  const helperText =
    typeof options.help === 'string' ? options.help : undefined;
  const errorText = rawErrors && rawErrors.length > 0 ? rawErrors[0] : undefined;

  return (
    <Input
      id={id}
      name={id}
      type="number"
      label={label + (required ? ' *' : '')}
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
      helperText={helperText}
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
    label,
    value,
    required,
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

  return (
    <Select
      id={id}
      name={id}
      label={label + (required ? ' *' : '')}
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
