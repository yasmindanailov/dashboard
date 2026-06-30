import { Module } from '@nestjs/common';
import { AnthropicAiPlugin } from './anthropic.plugin';

/**
 * AnthropicAiModule — provee+exporta el plugin IA Anthropic (Claude).
 *
 * Mismo layout que los plugin modules de provisioning (`EnhanceCpModule`…):
 * la clase del plugin se provee y exporta; el módulo de composición
 * (`modules/ai`) la inyecta para componer el token `AI_PROVIDER_PLUGINS`.
 * R4: `core/ai` nunca importa este módulo (solo lo hace el composition root).
 */
@Module({
  providers: [AnthropicAiPlugin],
  exports: [AnthropicAiPlugin],
})
export class AnthropicAiModule {}
