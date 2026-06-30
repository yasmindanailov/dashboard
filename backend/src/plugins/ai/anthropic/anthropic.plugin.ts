import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

import {
  AI_PROVIDER_CONTRACT_VERSION,
  AiProviderPlugin,
  AiProviderRuntimeContext,
  AiSuggestionInput,
  AiSuggestionResult,
} from '../../../core/ai/types';
import { PluginManifest } from '../../../core/provisioning/types';
import { getErrorMessage } from '../../../core/common/utils/error.util';
import {
  ANTHROPIC_DEFAULT_MAX_TOKENS,
  ANTHROPIC_DEFAULT_MODEL,
  ANTHROPIC_MANIFEST,
} from './anthropic.manifest';

/* Voz de marca Aelium (D11): cercano, competente, frases cortas. El borrador
   lo revisa SIEMPRE el agente antes de enviar — nunca se auto-envía. */
const SYSTEM_PROMPT = [
  'Eres un agente de soporte de Aelium, un SaaS de hosting y dominios.',
  'Redactas un BORRADOR de respuesta que un agente humano revisará antes de enviar.',
  'Voz Aelium: cercana pero competente, frases cortas, sin jerga ni relleno.',
  'No inventes datos (precios, plazos, estados) que no estén en la conversación;',
  'si falta información, pide el dato que necesitas. Responde en el idioma del cliente.',
  'Devuelve solo el texto del mensaje, sin preámbulo, sin comillas, sin firma de sistema.',
].join(' ');

/**
 * AnthropicAiPlugin — proveedor IA (Claude) del subsistema paralelo
 * (ADR-080 Amendment D). Implementa `AiProviderPlugin` (NO `ProvisionerPlugin`).
 *
 * Mock-first (D.4): sin `api_key` configurada usa un **stub determinista**
 * (la feature es demostrable sin clave ni coste); con `api_key` llama a Claude
 * vía `@anthropic-ai/sdk`. Modelo por defecto `claude-opus-4-8` (configurable).
 * R12: la `api_key` la descifra `AiSuggestionService` (SecretVault) y llega en
 * `ctx.secrets`; el plugin nunca la persiste ni la loguea.
 */
@Injectable()
export class AnthropicAiPlugin implements AiProviderPlugin {
  readonly slug = 'anthropic';
  readonly aiContractVersion = AI_PROVIDER_CONTRACT_VERSION;
  readonly manifest: PluginManifest = ANTHROPIC_MANIFEST;

  private readonly logger = new Logger(AnthropicAiPlugin.name);

  async generateReplySuggestion(
    input: AiSuggestionInput,
    ctx: AiProviderRuntimeContext,
  ): Promise<AiSuggestionResult> {
    const apiKey = this.readApiKey(ctx);
    if (!apiKey) return this.stubSuggestion(input);

    const model = this.resolveModel(ctx.config);
    const maxTokens = this.resolveMaxTokens(ctx.config);
    const client = new Anthropic({ apiKey });

    try {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: this.buildUserPrompt(input) }],
      });
      const suggestion = response.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('')
        .trim();
      return {
        suggestion,
        model,
        truncated: response.stop_reason === 'max_tokens',
      };
    } catch (err) {
      // No logueamos la api_key; sí el mensaje para diagnóstico (R7). Re-lanzamos
      // para que el circuit breaker (R11) cuente el fallo del proveedor.
      this.logger.error(
        `Anthropic generateReplySuggestion falló (model=${model}): ${getErrorMessage(err)}`,
      );
      throw err;
    }
  }

  async testConnection(
    ctx: AiProviderRuntimeContext,
  ): Promise<{ ok: boolean; detail?: string }> {
    const apiKey = this.readApiKey(ctx);
    if (!apiKey) {
      return { ok: false, detail: 'Falta la API key de Anthropic.' };
    }
    try {
      const client = new Anthropic({ apiKey });
      await client.messages.create({
        model: this.resolveModel(ctx.config),
        max_tokens: 8,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: getErrorMessage(err) };
    }
  }

  /* ─── Helpers ─── */

  private readApiKey(ctx: AiProviderRuntimeContext): string | null {
    const key = ctx.secrets.api_key;
    const trimmed = typeof key === 'string' ? key.trim() : '';
    return trimmed.length > 0 ? trimmed : null;
  }

  private stubSuggestion(input: AiSuggestionInput): AiSuggestionResult {
    const lastCustomer = [...input.messages]
      .reverse()
      .find((m) => m.role === 'customer');
    const ref = lastCustomer
      ? ` sobre "${this.truncate(lastCustomer.text, 80)}"`
      : '';
    return {
      suggestion:
        `Hola, gracias por tu mensaje${ref}. Lo estamos revisando y te ` +
        `respondemos enseguida. — Equipo Aelium`,
      model: 'stub',
      truncated: false,
    };
  }

  private buildUserPrompt(input: AiSuggestionInput): string {
    const locale = input.locale ?? 'es';
    const transcript = input.messages
      .map(
        (m) => `[${m.role === 'customer' ? 'Cliente' : 'Agente'}]: ${m.text}`,
      )
      .join('\n');
    const extra = input.instructions
      ? `\n\nInstrucción adicional del agente: ${input.instructions}`
      : '';
    return (
      `Conversación de soporte (idioma del cliente: ${locale}):\n${transcript}${extra}\n\n` +
      'Redacta el SIGUIENTE mensaje del agente como borrador.'
    );
  }

  private resolveModel(config: Record<string, unknown>): string {
    const model = config.model;
    return typeof model === 'string' && model.trim().length > 0
      ? model.trim()
      : ANTHROPIC_DEFAULT_MODEL;
  }

  private resolveMaxTokens(config: Record<string, unknown>): number {
    const value = config.max_tokens;
    return typeof value === 'number' && value >= 256 && value <= 4096
      ? Math.floor(value)
      : ANTHROPIC_DEFAULT_MAX_TOKENS;
  }

  private truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }
}
