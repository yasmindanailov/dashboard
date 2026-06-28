import { Module } from '@nestjs/common';
import { AdminOverviewController } from './admin-overview.controller';
import { AdminOverviewService } from './admin-overview.service';

/* ═══════════════════════════════════════
   AdminOverviewModule — Dashboard ejecutivo /admin (E7).
   Self-contained: solo depende de PrismaService (global vía CoreModule),
   espejo de DashboardModule.
   ═══════════════════════════════════════ */

@Module({
  controllers: [AdminOverviewController],
  providers: [AdminOverviewService],
})
export class AdminOverviewModule {}
