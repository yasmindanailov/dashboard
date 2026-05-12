import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { getErrorMessage } from '../common/utils/error.util';

/**
 * ProvisioningCacheService — Sprint 11 Fase 11.B (ADR-077 §5).
 *
 * Cache Redis dedicado a `service_info:<id>` (resultado de `getServiceInfo()`
 * por servicio). TTL configurable por setting `provisioning.service_info_ttl_seconds`
 * (default 60s). Sprint 15C.II Fase F.3 (B.1): aloja también la clave de
 * cooldown del force-refresh manual `refresh_cooldown:<id>` (ver
 * `tryAcquireRefreshCooldown`).
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

  /**
   * Sprint 15C.II Fase F.3 (B.1) — cooldown server-side per-servicio del
   * force-refresh manual (`POST /services/:id/refresh`, cliente y admin).
   *
   * El cooldown de 10s de `MetricsRefreshButton` es solo cliente; el endpoint
   * es martilleable directamente. El TTL del cache `service_info` mitiga el
   * *coste* de un re-fetch (sirve cacheado) pero no el *abuso*: N clientes
   * distintos forzando refresh del mismo servicio dispararían N llamadas al
   * proveedor. Esta clave acota "cuántas veces se re-consulta al proveedor por
   * servicio" — independiente de quién lo pida (cliente y admin comparten la
   * misma ventana; un admin depurando tampoco gana martilleando: orchd
   * responde <5s y el cache retiene su TTL).
   *
   * Semántica `SET key 1 EX ttl NX`:
   *   - `true`  → ventana adquirida; el caller procede con el re-fetch fresco.
   *   - `false` → ventana ya activa; el caller debe degradar a una lectura
   *     cacheada normal (coalescing — NO es un error visible al usuario).
   * Fail-OPEN si Redis falla (devuelve `true`): no bloqueamos el refresh por
   * un fallo de cache — coherente con `get`/`set`/`invalidate` (y, si esta
   * conexión Redis está caída, `get` también falla → cache miss → el wrapper
   * consulta al proveedor igualmente; el cooldown no empeora nada).
   */
  async tryAcquireRefreshCooldown(
    serviceId: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const key = this.buildRefreshCooldownKey(serviceId);
    try {
      const res = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX');
      return res === 'OK';
    } catch (err) {
      this.logger.warn(
        `Refresh cooldown acquire failed for ${key}: ${getErrorMessage(err)} (fail-open)`,
      );
      return true;
    }
  }

  private buildKey(serviceId: string): string {
    return `${this.keyPrefix}:${serviceId}`;
  }

  private buildRefreshCooldownKey(serviceId: string): string {
    return `refresh_cooldown:${serviceId}`;
  }
}
