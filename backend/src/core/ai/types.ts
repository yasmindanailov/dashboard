import { PluginManifest } from '../provisioning/types';

/* ═══════════════════════════════════════════════════════════════
   Subsistema IA — contrato del proveedor (ADR-080 Amendment D)
   ═══════════════════════════════════════════════════════════════

   Rediseño UI F3·E13. Tipo de plugin PARALELO al de provisioning: reusa la
   infraestructura ADR-080 (`plugin_installs` + `SecretVaultService` + el shape
   `PluginManifest` con `settingsCategory:'ai'` + la UI `/admin/settings/plugins`),
   pero NO el contrato funcional de `ProvisionerPlugin` (la IA no aprovisiona).

   AI-INV-1: el plugin IA NUNCA pasa por el orquestador de provisioning ni por
   `PluginRegistryService`. `core/ai` resuelve el proveedor activo vía
   `AiProviderRegistry`, descifra sus secrets con `SecretVaultService`, y
   envuelve la llamada en un circuit breaker (R11). R4 intacto: el core llama a
   la interfaz, nunca al plugin concreto. */

export const AI_PROVIDER_CONTRACT_VERSION = 'v1' as const;

/**
 * Token DI canónico para inyectar el array de proveedores IA registrados.
 * El módulo de composición (`modules/ai`) lo compone vía `useFactory`+`inject`
 * (mismo patrón que `PROVISIONER_PLUGINS`), importando los plugin modules
 * concretos — el core (`core/ai`) NUNCA importa un plugin concreto.
 */
export const AI_PROVIDER_PLUGINS = Symbol('AI_PROVIDER_PLUGINS');

/** Un mensaje del transcript de la conversación, normalizado server-side (R5). */
export interface AiMessage {
  role: 'customer' | 'agent';
  text: string;
}

/** Entrada para generar una sugerencia de respuesta. El backend la arma (R5). */
export interface AiSuggestionInput {
  /** Transcript en orden cronológico (sin notas internas — SUPP-INV-3). */
  messages: AiMessage[];
  /** Idioma del cliente para la respuesta (ej. 'es'). */
  locale?: string;
  /** Steering opcional adicional del agente. */
  instructions?: string;
}

export interface AiSuggestionResult {
  /** Borrador de respuesta sugerido (el agente lo revisa e inserta). */
  suggestion: string;
  /** Modelo/identificador que produjo la sugerencia (incl. `'stub'` en mock). */
  model: string;
  /** True si la respuesta se cortó por `max_tokens`. */
  truncated?: boolean;
}

/** Contexto de ejecución: config (plano) + secrets (descifrados) del install. */
export interface AiProviderRuntimeContext {
  config: Record<string, unknown>;
  secrets: Record<string, string>;
}

/**
 * Contrato del proveedor de IA. Contrato propio (NO `ProvisionerPlugin`).
 * Cada plugin IA expone su `manifest` (settingsCategory:'ai') para que la UI
 * admin y el portal RGPD entiendan su forma sin inspeccionar código.
 */
export interface AiProviderPlugin {
  /** Slug canónico (ej. `anthropic`). DEBE coincidir con `manifest.slug`. */
  readonly slug: string;
  readonly aiContractVersion: typeof AI_PROVIDER_CONTRACT_VERSION;
  readonly manifest: PluginManifest;

  /** Genera un borrador de respuesta a partir del transcript + config + secrets. */
  generateReplySuggestion(
    input: AiSuggestionInput,
    ctx: AiProviderRuntimeContext,
  ): Promise<AiSuggestionResult>;

  /** Health check para el botón "Probar conexión" del admin. */
  testConnection(
    ctx: AiProviderRuntimeContext,
  ): Promise<{ ok: boolean; detail?: string }>;
}
