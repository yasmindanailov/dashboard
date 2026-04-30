import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

/**
 * UsersModule — gestión de cuentas staff (Sprint 8 Fase A).
 *
 * Hoy expone únicamente `GET /admin/users` (listado de agentes asignables).
 * Futuras extensiones (Sprint 13 Hardening): `POST/PATCH/DELETE` para CRUD
 * completo de agentes (sólo superadmin, ADR-067 Subject `Agent`).
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
