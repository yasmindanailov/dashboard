import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';

import { AdminSettingsController } from './admin-settings.controller';
import { AdminSettingsService } from './admin-settings.service';

/**
 * AdminSettingsModule — Sprint 12 (ADR-044).
 *
 * Expone la capa REST `/admin/settings` para que el superadmin gestione la
 * configuración global de negocio (marca, facturación, soporte, notificaciones,
 * DNS) con validación contra el catálogo + auditoría R3.
 *
 * Dependencias:
 *  - `AuditModule` para `AuditService.logChange` (R3).
 *  - `SettingsModule` (global) para `SettingsService` (lectura + invalidación de caché).
 *  - `PrismaModule` (global) para el modelo `setting`.
 */
@Module({
  imports: [AuditModule],
  controllers: [AdminSettingsController],
  providers: [AdminSettingsService],
  exports: [AdminSettingsService],
})
export class AdminSettingsModule {}
