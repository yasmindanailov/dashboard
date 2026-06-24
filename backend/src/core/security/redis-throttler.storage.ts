import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

/**
 * Forma del registro que `ThrottlerStorage.increment` debe devolver. El paquete
 * la define en `throttler-storage-record.interface` pero NO la re-exporta desde su
 * índice (v6.5); se replica aquí (mismo shape → compatible por tipado estructural).
 */
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * RedisThrottlerStorage — storage Redis para `@nestjs/throttler` (ADR-016).
 *
 * ADR-016 §Decisión exige rate limiting **compartido entre instancias** (R6): el
 * storage in-memory por defecto rompe el contador en multi-instancia (un atacante
 * distribuye la carga entre réplicas y elude el límite). Reutiliza la conexión
 * `ioredis` (ya en el stack — ADR-002) en una DB dedicada (db 3; db 0 = settings,
 * 1 = BullMQ, 2 = provisioning-cache).
 *
 * Algoritmo (ventana fija + bloqueo, **atómico vía Lua** para evitar races entre
 * réplicas): `INCR` del contador con `PEXPIRE` en el primer hit; si se supera el
 * límite, setea una clave de bloqueo con `PX = blockDuration`. Mismo modelo que los
 * adapters Redis de la comunidad, sin añadir dependencia (reusa `ioredis`).
 *
 * **Fail-open** (disponibilidad > rigidez): si Redis falla, NO se rompe la request
 * con un 500 — se permite y se loguea. ADR-016 acepta la dependencia de Redis (ya
 * crítica para BullMQ); un blip puntual no debe tirar todo el login.
 */
const INCREMENT_SCRIPT = `
local hitKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

local totalHits = redis.call('INCR', hitKey)
local timeToExpire = redis.call('PTTL', hitKey)
if timeToExpire <= 0 then
  redis.call('PEXPIRE', hitKey, ttl)
  timeToExpire = ttl
end

local blocked = false
local timeToBlockExpire = 0
if redis.call('EXISTS', blockKey) == 1 then
  blocked = true
  timeToBlockExpire = redis.call('PTTL', blockKey)
elseif totalHits > limit then
  redis.call('SET', blockKey, '1', 'PX', blockDuration)
  blocked = true
  timeToBlockExpire = blockDuration
end

return { totalHits, timeToExpire, blocked and 1 or 0, timeToBlockExpire }
`;

@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnModuleDestroy
{
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly redis: Redis;
  private static readonly PREFIX = 'aelium-throttler:';

  constructor(config: ConfigService) {
    this.redis = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      db: 3,
      // Tope de reintentos por comando: si Redis no responde, el `increment`
      // rechaza (→ fail-open en el catch) en vez de colgar la request. La cola
      // offline (default ON) encola los comandos emitidos mientras la conexión
      // aún se establece — sin ella, el primer hit fallaría antes de conectar.
      maxRetriesPerRequest: 2,
    });
    this.redis.on('error', (err: Error) =>
      this.logger.error(`Redis throttler storage error: ${err.message}`),
    );
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitKey = `${RedisThrottlerStorage.PREFIX}${throttlerName}:${key}`;
    const blockKey = `${hitKey}:block`;
    try {
      const res = (await this.redis.eval(
        INCREMENT_SCRIPT,
        2,
        hitKey,
        blockKey,
        ttl,
        limit,
        blockDuration,
      )) as [number, number, number, number];
      return {
        totalHits: res[0],
        timeToExpire: Math.ceil(res[1] / 1000),
        isBlocked: res[2] === 1,
        timeToBlockExpire: Math.ceil(res[3] / 1000),
      };
    } catch (err) {
      // Fail-open: Redis caído no debe romper el auth (devolver 500 a cada
      // request). Sin contador disponible → se permite la petición.
      this.logger.error(
        `Throttler fail-open (Redis no disponible): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return {
        totalHits: 1,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
