/**
 * Sprint 15C Fase 15C.I — pre-procesador canónico de JSON Schemas
 * declarados por plugins, traduciendo `description` y `title` con el
 * translator local antes de pasar el schema a `@rjsf/core`.
 *
 * Razón:
 *   - `@rjsf/core` renderiza `schema.description` directamente en su
 *     FieldTemplate por defecto (sobre el widget). Aplicar `t()` solo
 *     en los widgets custom (`aeliumDsWidgets`) deja el FieldTemplate
 *     mostrando la i18n key cruda. Patchearlo desde el FieldTemplate
 *     custom es invasivo y no idiomático.
 *   - Pre-procesar el schema una sola vez antes del render es la forma
 *     más limpia + portable + reemplazable cuando llegue `next-intl`.
 *
 * Doctrina:
 *   - **Inmutable**: clona profundamente el schema (no muta el original
 *     que vive en el manifest del plugin, congelado por boot).
 *   - **Recursivo**: aplica a `properties.<field>.description/title`,
 *     `items` (arrays), `oneOf`/`anyOf`/`allOf` por completitud.
 *   - **Best-effort**: cualquier nivel sin `description`/`title` se deja
 *     intacto. Strings literales no-i18n (ej. "URL del cluster") pasan
 *     por `t()` y caen al fallback (= la string original).
 *   - **Type-safe sobre `RJSFSchema`** sin `any` — usa cast acotado al
 *     subset documentado del manifest (ADR-080 §1).
 */

import type { RJSFSchema } from '@rjsf/utils';

import { t } from './translator';

/**
 * JSONSchema7 admite `boolean` (true/false) como sub-schema en
 * `items`/`oneOf`/`anyOf`/`allOf`. Tipamos el shape acotado al subset
 * que el dossier ADR-080 declara, manteniendo `RJSFSchema | boolean`
 * en los slots polimórficos.
 */
type SubSchema = RJSFSchema | boolean;
type SchemaNode = RJSFSchema & {
  properties?: Record<string, RJSFSchema>;
  items?: SubSchema | SubSchema[];
  oneOf?: SubSchema[];
  anyOf?: SubSchema[];
  allOf?: SubSchema[];
};

export function translateSchema(schema: RJSFSchema): RJSFSchema {
  const node = schema as SchemaNode;
  const out: SchemaNode = { ...node };

  if (typeof node.title === 'string') out.title = t(node.title);
  if (typeof node.description === 'string') {
    out.description = t(node.description);
  }

  if (node.properties && typeof node.properties === 'object') {
    out.properties = Object.fromEntries(
      Object.entries(node.properties).map(([key, prop]) => [
        key,
        translateSchema(prop),
      ]),
    );
  }

  // JSONSchema7 permite `boolean` en items/oneOf/anyOf/allOf — solo
  // recursamos sobre objetos. Booleans se preservan tal cual.
  const isObjectSchema = (s: unknown): s is RJSFSchema =>
    typeof s === 'object' && s !== null;

  if (node.items && !Array.isArray(node.items)) {
    if (isObjectSchema(node.items)) out.items = translateSchema(node.items);
  } else if (Array.isArray(node.items)) {
    out.items = node.items.map((item) =>
      isObjectSchema(item) ? translateSchema(item) : item,
    );
  }

  if (Array.isArray(node.oneOf)) {
    out.oneOf = node.oneOf.map((s) =>
      isObjectSchema(s) ? translateSchema(s) : s,
    );
  }
  if (Array.isArray(node.anyOf)) {
    out.anyOf = node.anyOf.map((s) =>
      isObjectSchema(s) ? translateSchema(s) : s,
    );
  }
  if (Array.isArray(node.allOf)) {
    out.allOf = node.allOf.map((s) =>
      isObjectSchema(s) ? translateSchema(s) : s,
    );
  }

  return out;
}
