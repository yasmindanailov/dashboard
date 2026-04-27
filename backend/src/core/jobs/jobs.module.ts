import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '../../modules/auth/auth.module';
import { DlqService } from './dlq.service';
import { RetryService } from './retry.service';
import { JobsController } from './jobs.controller';

/**
 * JobsModule — infra canónica BullMQ (R2 + R13 + ADR-063).
 *
 * Defaults globales: attempts=5, backoff exponencial 30s→480s.
 * El jitter ±10% se aplica por cola cuando sea relevante (override en
 * registerQueue de cada módulo).
 *
 * Redis DB 1 reservada para BullMQ; DB 0 para SettingsService cache.
 *
 * @Global porque cualquier módulo de negocio debe poder inyectar
 * `@InjectQueue('<nombre>')` y `RetryService` sin importar este módulo cada vez.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>('REDIS_URL');
        return {
          connection: { url, db: 1 },
          prefix: config.get<string>('BULLMQ_PREFIX') ?? 'aelium-jobs',
          defaultJobOptions: {
            attempts: 5,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: { age: 3_600 },
            removeOnFail: false,
          },
        };
      },
      inject: [ConfigService],
    }),
    AuthModule,
  ],
  controllers: [JobsController],
  providers: [DlqService, RetryService],
  exports: [BullModule, DlqService, RetryService],
})
export class JobsModule {}
