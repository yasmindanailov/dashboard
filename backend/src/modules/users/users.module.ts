import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

/**
 * UsersModule — gestión de cuentas staff.
 *
 * - `GET /admin/users` — selector de agentes asignables (Sprint 8 Fase A).
 * - `/admin/users/staff/*` — CRUD de cuentas staff (alta/baja/rol), solo
 *   superadmin (CASL `Manage.Agent`, ADR-067). GL-21 (audit 2026-06-25 §6).
 *
 * `UsersService` inyecta `AuditService` (R3) — disponible vía `AuditModule`
 * (`@Global`), sin necesidad de importarlo aquí.
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
