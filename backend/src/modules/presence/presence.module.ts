import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { PresenceService } from './presence.service';
import { PresenceController } from './presence.controller';

/**
 * PresenceModule — Rediseño UI F3·E8.
 *
 * Presencia de staff (heartbeat + estado derivado). Exporta `PresenceService`
 * para que otros módulos (Support Inside "tu técnico", E7 carga del equipo)
 * lean la presencia sin duplicar la lógica.
 */
@Module({
  imports: [PrismaModule],
  controllers: [PresenceController],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
