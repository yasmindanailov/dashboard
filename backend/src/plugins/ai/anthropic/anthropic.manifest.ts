import { JsonSchema7, PluginManifest } from '../../../core/provisioning/types';

/* Manifest del proveedor IA Anthropic (Claude) — ADR-080 Amendment D.
   Reusa el shape `PluginManifest` (settingsCategory:'ai') para aparecer en
   `/admin/settings/plugins` junto a los provisioners. */

export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-4-8';

/** Modelos Claude ofrecidos en la config (mandato: por defecto el más capaz). */
export const ANTHROPIC_MODELS = [
  'claude-opus-4-8',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
] as const;

export const ANTHROPIC_DEFAULT_MAX_TOKENS = 1024;

const CONFIG_SCHEMA: JsonSchema7 = {
  type: 'object',
  properties: {
    model: {
      type: 'string',
      enum: [...ANTHROPIC_MODELS],
      default: ANTHROPIC_DEFAULT_MODEL,
      title: 'plugin.anthropic.config.model.label',
      description: 'plugin.anthropic.config.model',
    },
    max_tokens: {
      type: 'integer',
      minimum: 256,
      maximum: 4096,
      default: ANTHROPIC_DEFAULT_MAX_TOKENS,
      title: 'plugin.anthropic.config.max_tokens.label',
      description: 'plugin.anthropic.config.max_tokens',
    },
  },
  required: [],
  additionalProperties: false,
};

const SECRETS_SCHEMA: JsonSchema7 = {
  type: 'object',
  properties: {
    api_key: {
      type: 'string',
      format: 'password',
      title: 'plugin.anthropic.secrets.api_key.label',
      description: 'plugin.anthropic.secrets.api_key',
    },
  },
  required: ['api_key'],
  additionalProperties: false,
};

export const ANTHROPIC_MANIFEST: PluginManifest = {
  slug: 'anthropic',
  version: '1.0.0',
  manifestVersion: 'v1',
  label: 'plugin.anthropic.label',
  description: 'plugin.anthropic.description',
  docsUrl: 'docs/features/support/admin.md#sugerencia-ia-para-agentes',
  settingsCategory: 'ai',
  configSchema: CONFIG_SCHEMA,
  secretsSchema: SECRETS_SCHEMA,
  testConnectionMethod: 'custom',
};
