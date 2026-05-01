import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { getErrorMessage } from '../common/utils/error.util';

/**
 * ProvisioningCacheService — Sprint 11 Fase 11.B (ADR-077 §5).
 *
 * Cache Redis dedicado a `service_info:<id>` (resultado de `getServiceInfo()`
 * por servicio). TTL configurable por setting `provisioning.service_info_ttl_seconds`
 * (default 60s).
 *
 * Convenciones:
 *  - Redis DB 2 (DB 0 settings, DB 1 BullMQ — ver `JobsModule`).
 *  - Prefijo `aelium-provisioning:` para todas las claves.
 *  - Errores Redis NO rompen el caller (fail-open para cache miss simulado).
 *  - El plugin NUNCA llama a este servicio directamente — usa los wrappers
 *    de `plugin-utils.ts` que centralizan cache + audit + invalidación.
 */
@Injectable()
export class ProvisioningCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(ProvisioningCacheService.name);
  private readonly redis: Redis;
  private readonly keyPrefix = 'service_info';

  constructor(@Inject(ConfigService) config: ConfigService) {
    const url = config.getOrThrow<string>('REDIS_URL');
    this.redis = new Redis(url, {
      db: 2,
      keyPrefix: 'aelium-provisioning:',
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });

    this.redis.on('error', (err) => {
      this.logger.error(
        `Redis provisioning cache error: ${getErrorMessage(err)}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (err) {
      this.logger.warn(`Failed to quit redis cleanly: ${getErrorMessage(err)}`);
    }
  }

  /**
   * Lee del cache. Devuelve `null` si miss, error o JSON corrupto
   * (degradación silenciosa, fail-open).
   */
  async get<T>(serviceId: string): Promise<T | null> {
    const key = this.buildKey(serviceId);
    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      this.logger.warn(
        `Cache get failed for ${key}: ${getErrorMessage(err)} (fail-open)`,
      );
      return null;
    }
  }

  /**
   * Escribe en cache con TTL en segundos. Si Redis falla, log + continúa
   * (no bloquea la respuesta del caller — la lectura siempre va al plugin).
   */
  async set<T>(serviceId: string, value: T, ttlSeconds: number): Promise<void> {
    const key = this.buildKey(serviceId);
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`Cache set failed for ${key}: ${getErrorMessage(err)}`);
    }
  }

  /**
   * Invalida cache de un servicio específico. Llamada por
   * `executeActionWithCacheInvalidation()` tras cualquier acción que
   * modifique el estado del proveedor.
   */
  async invalidate(serviceId: string): Promise<void> {
    const key = this.buildKey(serviceId);
    try {
      await this.redis.del(key);
    } catch (err) {
      this.logger.warn(
        `Cache invalidate failed for ${key}: ${getErrorMessage(err)}`,
      );
    }
  }

  /**
   * Invalida cache de TODOS los servicios. Reservado para emergencias
   * (admin force-flush, cambio masivo de capability flags, etc.).
   */
  async invalidateAll(): Promise<void> {
    try {
      const stream = this.redis.scanStream({
        match: `aelium-provisioning:${this.keyPrefix}:*`,
        count: 100,
      });

      const keysToDelete: string[] = [];
      for await (const chunk of stream as AsyncIterable<string[]>) {
        for (const fullKey of chunk) {
          // ioredis no aplica keyPrefix al scan — quitamos el prefix manual.
          const stripped = fullKey.replace(/^aelium-provisioning:/, '');
          keysToDelete.push(stripped);
        }
      }

      if (keysToDelete.length > 0) {
        await this.redis.del(...keysToDelete);
        this.logger.log(
          `Invalidated ${keysToDelete.length} service_info cache entries`,
        );
      }
    } catch (err) {
      this.logger.warn(`Cache invalidateAll failed: ${getErrorMessage(err)}`);
    }
  }

  private buildKey(serviceId: string): string {
    return `${this.keyPrefix}:${serviceId}`;
  }
}
