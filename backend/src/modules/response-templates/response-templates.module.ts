import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResponseTemplatesController } from './response-templates.controller';
import { ResponseTemplatesService } from './response-templates.service';

/**
 * ResponseTemplatesModule — Respuestas guardadas (macros de soporte).
 * Rediseño UI F3·E12.
 *
 * Biblioteca de equipo compartida por el staff de soporte. CRUD hoja sin
 * eventos cross-módulo. `AuthModule` aporta `JwtAuthGuard` (resolución del
 * guard de auth); `CaslAbilityFactory`/`PoliciesGuard` vienen de `CaslModule`
 * (`@Global`) y `AdminOnlyGuard` no tiene deps. `PrismaService` es global.
 */
@Module({
  imports: [AuthModule],
  controllers: [ResponseTemplatesController],
  providers: [ResponseTemplatesService],
  exports: [ResponseTemplatesService],
})
export class ResponseTemplatesModule {}
