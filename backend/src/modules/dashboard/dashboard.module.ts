import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/* ═══════════════════════════════════════
   DashboardModule — Overview aggregation
   Self-contained: only depends on PrismaService
   (globally available via CoreModule).
   Ref: ARCHITECTURE.md Regla 2
   ═══════════════════════════════════════ */

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
