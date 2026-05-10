/**
 * Sprint 15C Fase 15C.I — translator helper canónico para keys i18n
 * emitidas por plugins de provisioning.
 *
 * Doctrina:
 *   - Lookup directo en el Map ES (única locale soportada en v1).
 *   - Si la key no existe → devuelve `fallback` si se proveyó, o la
 *     `key` cruda como último recurso. Esto preserva el comportamiento
 *     previo a Fase I (mostrar la key) en lugar de romper el render.
 *   - Pure function — sin context React, sin hook, sin re-renders.
 *     Usable desde Server Components (no requiere `'use client'`).
 *
 * Uso típico (componente leaf que renderiza una key del manifest):
 *
 *     import { t } from '@/_shared/i18n';
 *     <h3>{t(manifest.label)}</h3>
 *     <p>{t(manifest.description)}</p>
 *     <Button>{t(action.label)}</Button>
 *
 * Cuando llegue el sub-sprint EN, este archivo se reemplaza por el
 * adapter canónico (`next-intl`'s `getTranslations()` para SC + `useTranslations()`
 * para CC); los call-sites NO cambian gracias a la firma estable.
 */

import { TRANSLATIONS_ES } from './translations-es';

export function t(key: string | undefined, fallback?: string): string {
  if (typeof key !== 'string' || key.length === 0) {
    return fallback ?? '';
  }
  const value = TRANSLATIONS_ES[key];
  if (typeof value === 'string') return value;
  return fallback ?? key;
}
