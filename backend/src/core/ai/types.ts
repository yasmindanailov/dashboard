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

/**
 * Grounding v1 (F3·E13 Fase D): contexto fáctico que el backend ensambla
 * server-side (R5) desde el `user_id` de la conversación para que la IA AFIRME
 * hechos (servicios, estado, facturación) en vez de adivinar. **Minimizado**
 * (RGPD: todo sale a un tercero) — sin email/teléfono/NIF/dirección. Todos los
 * bloques son opcionales: un chat guest (sin `user_id`) llega sin `context`.
 * Diferido a v1.1: RAG sobre KB + macros (E12) con `citations`, structured
 * outputs, tool use, NS/métricas live del proveedor. Ver bitácora E13 §4.
 */
export interface AiClientContext {
  /** Datos básicos del cliente (minimizados). */
  client?: {
    firstName?: string;
    /** Idioma del cliente (ej. 'es'). */
    locale?: string;
    /** Año de alta (antigüedad, dato mínimo — no la fecha exacta). */
    clientSinceYear?: number;
    /** Tier Support Inside (E8): 'standard' | 'high' | 'max'. */
    supportTier?: string;
    /** SLA de respuesta en horas (E9), si tiene plan con SLA. */
    slaHours?: number;
  };
  /**
   * Servicios contratados (resumen PERSISTIDO de `services`, sin llamada live
   * al proveedor). Plan, estado, dominio y expiración — lo que el panel del
   * agente ya muestra.
   */
  services?: {
    label: string;
    product?: string;
    /** Estado del servicio (`active` | `suspended` | `pending` | …). */
    status: string;
    domain?: string;
    /** Expiración real reportada por el proveedor, `YYYY-MM-DD`. */
    expiresAt?: string;
  }[];
  /** Resumen de facturación pendiente (`pending` + `overdue`). */
  billing?: {
    pendingCount: number;
    /** Importe total pendiente, formateado (ej. `'12.00'`). */
    pendingTotal?: string;
    currency?: string;
    /** Próxima renovación (mín. `next_due_date` de los servicios), `YYYY-MM-DD`. */
    nextRenewalAt?: string;
  };
}

/** Entrada para generar una sugerencia de respuesta. El backend la arma (R5). */
export interface AiSuggestionInput {
  /** Transcript en orden cronológico (sin notas internas — SUPP-INV-3). */
  messages: AiMessage[];
  /** Idioma del cliente para la respuesta (ej. 'es'). */
  locale?: string;
  /** Steering opcional adicional del agente. */
  instructions?: string;
  /** Grounding v1 (Fase D): contexto fáctico minimizado del cliente. */
  context?: AiClientContext;
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
