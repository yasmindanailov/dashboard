import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PrismaService } from '../database/prisma.service';
import {
  EncryptedSecret,
  SecretVaultService,
} from '../security/secret-vault.service';
import {
  CircuitBreaker,
  DEFAULT_BREAKER_CONFIG,
  HouseCircuitBreaker,
} from '../provisioning/circuit-breaker';
import { getErrorMessage } from '../common/utils/error.util';
import { AiProviderRegistry } from './ai-provider-registry.service';
import {
  AiProviderRuntimeContext,
  AiSuggestionInput,
  AiSuggestionResult,
} from './types';

/**
 * Error semántico cuando no hay proveedor de IA disponible/configurado.
 * El controller lo mapea a un 503/409 con mensaje elegante (R7/R14).
 */
export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

/**
 * AiSuggestionService — orquesta la sugerencia de IA (ADR-080 Amendment D).
 *
 * AI-INV-1: resuelve el proveedor IA activo desde `AiProviderRegistry`,
 * descifra sus secrets con `SecretVaultService`, y envuelve la llamada en un
 * circuit breaker propio (R11) — NUNCA pasa por el orquestador de provisioning.
 * R4: llama a la interfaz `AiProviderPlugin`, nunca al plugin concreto.
 */
@Injectable()
export class AiSuggestionService {
  private readonly logger = new Logger(AiSuggestionService.name);
  private readonly breaker: CircuitBreaker;

  constructor(
    private readonly registry: AiProviderRegistry,
    private readonly prisma: PrismaService,
    private readonly vault: SecretVaultService,
    events: EventEmitter2,
  ) {
    this.breaker = new HouseCircuitBreaker(
      { name: 'ai:generateReplySuggestion', ...DEFAULT_BREAKER_CONFIG },
      events,
    );
  }

  /** ¿Hay un proveedor IA activo? Permite al front gatear la pestaña "Sugerencia". */
  isEnabled(): boolean {
    return this.registry.getActive() !== null;
  }

  async suggestReply(input: AiSuggestionInput): Promise<AiSuggestionResult> {
    const provider = this.registry.getActive();
    if (!provider) {
      throw new AiUnavailableError(
        'La sugerencia de IA no está activa. Un administrador debe habilitar un proveedor en Ajustes › Plugins.',
      );
    }

    const ctx = await this.buildContext(provider.slug);
    return this.breaker.execute(() =>
      provider.generateReplySuggestion(input, ctx),
    );
  }

  private async buildContext(slug: string): Promise<AiProviderRuntimeContext> {
    const install = await this.prisma.pluginInstall.findUnique({
      where: { slug },
      select: { config: true, secrets: true, enabled: true },
    });
    if (!install || !install.enabled) {
      throw new AiUnavailableError('El proveedor de IA no está habilitado.');
    }

    const config = (install.config ?? {}) as Record<string, unknown>;
    const rawSecrets = (install.secrets ?? {}) as unknown as Record<
      string,
      EncryptedSecret
    >;

    const secrets: Record<string, string> = {};
    for (const [key, blob] of Object.entries(rawSecrets)) {
      try {
        secrets[key] = this.vault.decrypt(blob);
      } catch (err) {
        // Secret malformado/rotado: se omite. El plugin decide si puede operar
        // (mock-first: sin api_key usa el stub). No filtramos detalles (R12).
        this.logger.warn(
          `AI provider "${slug}" secret "${key}" no se pudo descifrar: ${getErrorMessage(err)}`,
        );
      }
    }

    return { config, secrets };
  }
}
