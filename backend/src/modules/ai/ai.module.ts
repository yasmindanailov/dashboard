import { Module } from '@nestjs/common';

import { AiProviderRegistry } from '../../core/ai/ai-provider-registry.service';
import { AiSuggestionService } from '../../core/ai/ai-suggestion.service';
import { AI_PROVIDER_PLUGINS } from '../../core/ai/types';
import { AnthropicAiModule } from '../../plugins/ai/anthropic/anthropic.module';
import { AnthropicAiPlugin } from '../../plugins/ai/anthropic/anthropic.plugin';

/**
 * AiModule — composition root del subsistema IA (ADR-080 Amendment D).
 *
 * Espejo de `ProvisioningModule`: importa los plugin modules concretos y
 * compone el token `AI_PROVIDER_PLUGINS` vía `useFactory`+`inject`. El core
 * (`core/ai`) recibe el array por el token y NUNCA importa un plugin concreto
 * (R4). Provee `AiProviderRegistry` (validación + activación desde
 * `plugin_installs`) y `AiSuggestionService` (resolución + SecretVault +
 * breaker R11). `PrismaService`/`SecretVaultService`/`EventEmitter2` son
 * globales.
 *
 * Para añadir otro proveedor IA (ej. `openai`): nuevo plugin module + sumarlo
 * al factory. Cero cambios en `core/ai`.
 */
@Module({
  imports: [AnthropicAiModule],
  providers: [
    {
      provide: AI_PROVIDER_PLUGINS,
      useFactory: (anthropic: AnthropicAiPlugin) => [anthropic],
      inject: [AnthropicAiPlugin],
    },
    AiProviderRegistry,
    AiSuggestionService,
  ],
  exports: [AiProviderRegistry, AiSuggestionService],
})
export class AiModule {}
