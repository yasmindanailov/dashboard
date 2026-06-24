/**
 * Integración HIGH-1 (auditoría 2026-06-21) — rate limiting con Redis (ADR-016).
 *
 * El fix de HIGH-1 es seguridad: si el contador o el bloqueo fallan, el rate
 * limiting es papel mojado. Por eso se ejercita contra **Redis real** (db 3):
 *   1. `RedisThrottlerStorage`: cuenta hits atómicamente y bloquea al superar el
 *      límite (la lógica Lua, la parte crítica).
 *   2. `ThrottlerGuard` global → **429 + Retry-After + mensaje de marca (R14)** al
 *      superar el límite, sobre una app Nest mínima vía supertest.
 *
 * Prerrequisito: Redis arriba (`docker compose ... up -d redis`). Ejecutar con
 * `pnpm --dir backend test:e2e`.
 */
import { randomUUID } from 'node:crypto';

import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import Redis from 'ioredis';
import request from 'supertest';

import { RedisThrottlerStorage } from '../../src/core/security/redis-throttler.storage';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const configStub = { getOrThrow: () => REDIS_URL } as unknown as ConfigService;

@Controller()
class PingController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

describe('Integración HIGH-1 — rate limiting (ADR-016, Redis real)', () => {
  describe('RedisThrottlerStorage', () => {
    let storage: RedisThrottlerStorage;

    beforeAll(() => {
      storage = new RedisThrottlerStorage(configStub);
    });
    afterAll(async () => {
      await storage.onModuleDestroy();
    });

    it('cuenta hits atómicamente y bloquea al superar el límite', async () => {
      const key = `it-${randomUUID()}`;
      const r1 = await storage.increment(key, 60000, 2, 60000, 'default');
      expect(r1.totalHits).toBe(1);
      expect(r1.isBlocked).toBe(false);

      const r2 = await storage.increment(key, 60000, 2, 60000, 'default');
      expect(r2.totalHits).toBe(2);
      expect(r2.isBlocked).toBe(false);

      // 3er hit supera el límite (2) → bloqueado, con tiempo de bloqueo > 0.
      const r3 = await storage.increment(key, 60000, 2, 60000, 'default');
      expect(r3.totalHits).toBe(3);
      expect(r3.isBlocked).toBe(true);
      expect(r3.timeToBlockExpire).toBeGreaterThan(0);
    }, 15_000);

    it('aísla el contador por clave (otra clave parte de cero)', async () => {
      const other = await storage.increment(
        `it-${randomUUID()}`,
        60000,
        2,
        60000,
        'default',
      );
      expect(other.totalHits).toBe(1);
      expect(other.isBlocked).toBe(false);
    }, 15_000);
  });

  describe('ThrottlerGuard global → 429', () => {
    let app: INestApplication;
    let storage: RedisThrottlerStorage;

    beforeAll(async () => {
      // Limpia las claves del throttler 'default' para que el contador por IP
      // parta de cero (los tests corren con maxWorkers:1 — sin carrera).
      const cleaner = new Redis(REDIS_URL, { db: 3 });
      const keys = await cleaner.keys('aelium-throttler:default:*');
      if (keys.length > 0) await cleaner.del(...keys);
      await cleaner.quit();

      storage = new RedisThrottlerStorage(configStub);
      const mod = await Test.createTestingModule({
        imports: [
          ThrottlerModule.forRoot({
            throttlers: [{ name: 'default', ttl: 60000, limit: 2 }],
            storage,
            errorMessage:
              'Demasiados intentos. Espera unos segundos e inténtalo de nuevo.',
          }),
        ],
        controllers: [PingController],
        providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
      }).compile();
      app = mod.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
      await storage.onModuleDestroy();
    });

    it('429 + Retry-After + mensaje de marca al superar el límite (2/min)', async () => {
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      await request(server).get('/ping').expect(200);
      await request(server).get('/ping').expect(200);

      const res = await request(server).get('/ping').expect(429);
      expect(res.headers['retry-after']).toBeDefined();
      const body = res.body as { message?: string };
      expect(body.message).toMatch(/Demasiados intentos/i);
    }, 20_000);
  });
});
