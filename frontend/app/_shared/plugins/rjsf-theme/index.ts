import type { RegistryWidgetsType } from '@rjsf/utils';

import {
  DSCheckboxWidget,
  DSNumberWidget,
  DSPasswordWidget,
  DSSelectWidget,
  DSTextWidget,
} from './widgets';

/**
 * Tema canónico DS para `@rjsf/core` — Sprint 15A Fase H.1 (ADR-080 §7).
 *
 * Mapping completo de los widgets que el subset acotado del manifest
 * (ADR-080 §1) puede invocar. NO se exportan widgets de array/object
 * porque el subset prohíbe recursión.
 *
 * Uso canónico desde un client component:
 *
 *   import Form from '@rjsf/core';
 *   import validator from '@rjsf/validator-ajv8';
 *   import { aeliumDsWidgets } from '@/app/_shared/plugins/rjsf-theme';
 *
 *   <Form
 *     schema={schema}
 *     widgets={aeliumDsWidgets}
 *     validator={validator}
 *     ...
 *   />
 *
 * Cuando un plugin nuevo necesite un widget custom (ej. file upload de
 * certificado SSL), se añade aquí + nota inline + extensión del subset
 * `JsonSchema7` en `core/provisioning/types.ts §12`. Cualquier nuevo
 * format que no esté listado en `resolveInputType` cae a `text` por
 * defecto — no rompe el form, solo muestra como input genérico.
 */
export const aeliumDsWidgets: RegistryWidgetsType = {
  TextWidget: DSTextWidget,
  PasswordWidget: DSPasswordWidget,
  CheckboxWidget: DSCheckboxWidget,
  SelectWidget: DSSelectWidget,
  UpDownWidget: DSNumberWidget,
};
