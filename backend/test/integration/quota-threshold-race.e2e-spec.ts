/**
 * Sprint 15C.II Fase G.1.a — §A.2 área 8: threshold race Serializable.
 *
 * Gap cerrado: el spec unit `quota-threshold-detector.service.spec.ts` solo
 * asserta que `$transaction` se invoca con `isolationLevel: Serializable` —
 * NO ejecuta dos detectores concurrentes contra Postgres para verificar que
 * la garantía produce una sola alerta.
 *
 * Este test arranca Prisma real y dispara DOS `detectAndNotify` concurrentes
 * (`Promise.all`) sobre el mismo service que cruza el umbral. Invariante bajo
 * prueba (`quota-threshold-detector.service.ts:128` — Serializable): nunca se
 * generan dos `crossed_up` ni dos emisiones `service.quota_threshold_crossed`,
 * independientemente del interleaving:
 *   - si las tx solapan a nivel DB → SSI aborta una (SQLSTATE 40001) → la
 *     capturada retorna `tx_failed` sin emit;
 *   - si no solapan → la 2ª lee el `crossed_up` ya commiteado → `no_transition`.
 * En ambos caminos: exactamente 1 fila + 1 emit. El test verifica el
 * INVARIANTE, así que es estable frente a la no-determinación del scheduler.
 *
 * Prerrequisito: `docker compose -f docker/docker-compose.dev.yml up -d
 * postgres` + DB migrada/seedeada. Ejecutar con `pnpm --dir backend test:e2e`.
 */

import { EventEmitter2 } from '@nestjs/event-emitter';

import { PrismaService } from '../../src/core/database/prisma.service';
import { QuotaThresholdDetectorService } from '../../src/core/provisioning/quota-threshold-detector.service';
import type { ServiceMetrics } from '../../src/core/provisioning/types';

import {
  type ServiceFixture,
  cleanupService,
  connectPrisma,
  createTestService,
} from './_helpers';

const QUOTA_EVENT = 'service.quota_threshold_crossed';

describe('Integración G.1.a — threshold race Serializable (service_quota_alerts)', () => {
  let prisma: PrismaService;
  let events: EventEmitter2;
  let detector: QuotaThresholdDetectorService;
  let fx: ServiceFixture;

  // 90% de uso (9000/10000) — cruza el umbral 85% al alza.
  const metrics: ServiceMetrics = {
    diskUsedMb: 9000,
    diskTotalMb: 10000,
    fetchedAt: new Date().toISOString(),
  };

  function detectInput() {
    return {
      serviceId: fx.serviceId,
      userId: fx.userId,
      pluginSlug: 'enhance_cp',
      metrics,
      thresholdPct: 85,
    };
  }

  beforeAll(async () => {
    prisma = await connectPrisma();
    events = new EventEmitter2();
    detector = new QuotaThresholdDetectorService(prisma, events);
    fx = await createTestService(prisma);
  });

  afterAll(async () => {
    if (fx) {
      await cleanupService(prisma, fx);
    }
    await prisma.onModuleDestroy();
  });

  it('2 detectores concurrentes que cruzan el umbral → exactamente 1 crossed_up + 1 emit', async () => {
    const emitSpy = jest.spyOn(events, 'emit');

    const [r1, r2] = await Promise.all([
      detector.detectAndNotify(detectInput()),
      detector.detectAndNotify(detectInput()),
    ]);

    // Invariante de correctness: una sola fila crossed_up persistida.
    const upRows = await prisma.serviceQuotaAlert.findMany({
      where: { service_id: fx.serviceId, kind: 'crossed_up' },
    });
    expect(upRows).toHaveLength(1);

    // Una sola emisión del evento (de lo contrario el cliente recibe 2 emails).
    const crossedEmits = emitSpy.mock.calls.filter((c) => c[0] === QUOTA_EVENT);
    expect(crossedEmits).toHaveLength(1);

    // Una invocación gana (crossed_up); la otra es no_transition (sin solape)
    // o tx_failed (solape + abort SSI). Nunca dos crossed_up.
    const actions = [r1.action, r2.action];
    expect(actions.filter((a) => a === 'crossed_up')).toHaveLength(1);
    const other = actions.find((a) => a !== 'crossed_up');
    expect(['no_transition', 'tx_failed']).toContain(other);

    emitSpy.mockRestore();
  }, 30_000);

  it('stress: 5 rondas concurrentes (reset entre rondas) nunca producen doble alerta', async () => {
    for (let round = 0; round < 5; round += 1) {
      // Reset del estado edge-trigger para que cada ronda vuelva a cruzar.
      await prisma.serviceQuotaAlert.deleteMany({
        where: { service_id: fx.serviceId },
      });

      const emitSpy = jest.spyOn(events, 'emit');

      await Promise.all([
        detector.detectAndNotify(detectInput()),
        detector.detectAndNotify(detectInput()),
      ]);

      const upRows = await prisma.serviceQuotaAlert.findMany({
        where: { service_id: fx.serviceId, kind: 'crossed_up' },
      });
      expect(upRows).toHaveLength(1);

      const crossedEmits = emitSpy.mock.calls.filter(
        (c) => c[0] === QUOTA_EVENT,
      );
      expect(crossedEmits).toHaveLength(1);

      emitSpy.mockRestore();
    }
  }, 60_000);
});
