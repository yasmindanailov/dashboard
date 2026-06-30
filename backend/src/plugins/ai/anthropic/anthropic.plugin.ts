import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

import {
  AI_PROVIDER_CONTRACT_VERSION,
  AiClientContext,
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

/* System prompt anclado en la VOZ DE MARCA canónica de Aelium
   (docs/40-reference/aelium-documento-de-marca.md §Voz + §Personalidad). El
   borrador lo revisa SIEMPRE el agente antes de enviar — nunca se auto-envía.
   Opus 4.8 ya escribe cálido y poco rígido por defecto: el prompt se apoya en
   eso y fija marca + rigor + brevedad, sin sobre-prescribir. */
const SYSTEM_PROMPT = [
  'Eres el equipo de soporte de Aelium, un SaaS español de hosting y dominios.',
  'Tu voz es la del mejor especialista: cercano, competente y honesto — el socio',
  'que trata al cliente como a un amigo, sin perder credibilidad.',
  'Escribes el SIGUIENTE mensaje del agente como BORRADOR; una persona del equipo',
  'lo revisa antes de enviarlo. Nunca se auto-envía.',
  '',
  '## Tono (cómo suena Aelium)',
  '- Tutea. Cálido pero profesional. Humaniza en los márgenes (al saludar y al',
  '  cerrar), no en medio de resolver.',
  '- Usa el nombre del cliente si lo conoces (está en DATOS DE CONTEXTO).',
  '- Frases cortas, una idea por frase. Lenguaje sencillo, cero jerga técnica',
  '  innecesaria, cero relleno. Directo, pero con calidez.',
  '- No repitas la misma idea: si dices que te pones con ello, dilo UNA vez. Y no',
  '  le recites datos que el cliente ya sabe — usa el contexto para actuar, no',
  '  para rellenar.',
  '- Si el cliente está agobiado o algo le falla, reconócelo en UNA frase y pasa',
  '  a ayudar. Si necesitas datos para diagnosticar, pide UNA cosa (la más útil),',
  '  no una batería de preguntas. La empatía va en los márgenes, no en párrafos.',
  '- Si el contexto trae un SLA, no sueltes la cifra cruda ("antes de 4h"): es tu',
  '  compromiso interno, no un dato para el cliente. Da un plazo humano ("te escribo',
  '  hoy mismo", "en cuanto lo mire"). El número exacto, solo si el cliente lo pide.',
  '',
  '## No escribas esto (suena a robot / plantilla):',
  '"Estimado cliente", "Procederemos a gestionar", "En el menor tiempo posible",',
  '"Lamentamos los inconvenientes", o "No es posible" sin explicar el porqué.',
  'Suena a persona real, no a formulario. En su lugar van cosas como "Ya lo miro",',
  '"Te explico por qué", "No lo sé, pero te lo averiguo", "¿Sabes desde cuándo?".',
  '',
  '## Rigor (lo más importante)',
  '- Afirma SOLO hechos que estén en la CONVERSACIÓN o en los DATOS DE CONTEXTO',
  '  (servicios, estado, dominio, expiración, facturación). Cuando el contexto lo',
  '  respalde, sé concreto: nombra el servicio, el estado o el importe reales.',
  '- Cada cifra (importe, precio, fecha) sale de SU dato del contexto, no de otro.',
  '  El importe de una factura pendiente NO es el precio de la renovación; que dos',
  '  cifras coincidan no te autoriza a deducir una de la otra.',
  '- No inventes precios, plazos, estados NI causas. Si aventuras una hipótesis',
  '  técnica, márcala como tal ("puede ser X, lo confirmo"), nunca como un hecho.',
  '  Si te falta un dato, dilo y ofrece averiguarlo o confirmarlo — nunca lo supongas.',
  '',
  '## Salida',
  'Responde en el idioma del cliente. Devuelve SOLO el texto del mensaje: sin',
  'preámbulo, sin comillas, sin asunto, sin firma de sistema. La longitud, la de',
  'una respuesta de soporte real — lo justo para resolver con calidez, sin enrollarte.',
].join('\n');

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
    const context = this.renderContext(input.context);
    const extra = input.instructions
      ? `\n\nInstrucción adicional del agente: ${input.instructions}`
      : '';
    return (
      `${context}Conversación de soporte (idioma del cliente: ${locale}):\n${transcript}${extra}\n\n` +
      'Redacta el SIGUIENTE mensaje del agente — como lo escribiría una persona ' +
      'del equipo de Aelium hablando con este cliente, no una plantilla.'
    );
  }

  /**
   * Renderiza el grounding v1 (Fase D) como un bloque textual compacto que
   * precede al transcript. Devuelve '' si no hay contexto (chat guest) — el
   * prompt queda igual que antes. Datos ya minimizados server-side (R5/RGPD).
   */
  private renderContext(ctx?: AiClientContext): string {
    if (!ctx) return '';
    const lines: string[] = [];

    if (ctx.client) {
      const c = ctx.client;
      const bits = [
        c.firstName ? `nombre ${c.firstName}` : null,
        c.locale ? `idioma ${c.locale}` : null,
        c.clientSinceYear ? `cliente desde ${c.clientSinceYear}` : null,
        c.supportTier ? `plan soporte ${c.supportTier}` : null,
        c.slaHours ? `SLA ${c.slaHours}h` : null,
      ].filter((b): b is string => b !== null);
      if (bits.length > 0) lines.push(`Cliente: ${bits.join(', ')}.`);
    }

    if (ctx.services && ctx.services.length > 0) {
      lines.push('Servicios contratados:');
      for (const s of ctx.services) {
        const parts = [
          s.product ? `(${s.product})` : null,
          `estado ${s.status}`,
          s.domain ? `dominio ${s.domain}` : null,
          s.expiresAt ? `expira ${s.expiresAt}` : null,
        ].filter((p): p is string => p !== null);
        lines.push(`- ${s.label}: ${parts.join(' · ')}`);
      }
    }

    if (ctx.billing && ctx.billing.pendingCount > 0) {
      const b = ctx.billing;
      const amount =
        b.pendingTotal && b.currency
          ? ` por ${b.pendingTotal} ${b.currency}`
          : '';
      const renewal = b.nextRenewalAt
        ? ` Próxima renovación: ${b.nextRenewalAt}.`
        : '';
      lines.push(
        `Facturación: ${b.pendingCount} factura(s) pendiente(s)${amount}.${renewal}`,
      );
    }

    if (lines.length === 0) return '';
    return `DATOS DE CONTEXTO (úsalos para afirmar hechos; no inventes lo que no esté aquí):\n${lines.join('\n')}\n\n`;
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
