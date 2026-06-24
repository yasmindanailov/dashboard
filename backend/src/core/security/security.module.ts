import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SecretVaultService } from './secret-vault.service';
import { RedisThrottlerStorage } from './redis-throttler.storage';

/**
 * Sprint 15A Fase C (2026-05-05) — SecurityModule canónico.
 *
 * Global por diseño: el `SecretVaultService` es la única vía para cifrar/
 * descifrar secretos en el backend (Sprint 15A — `plugin_installs.secrets`;
 * futuros: `oauth_tokens` cliente, credenciales SMTP custom, etc.). Al
 * ser global cualquier módulo lo inyecta sin tener que importar este
 * módulo en `imports[]`.
 *
 * Dependencias:
 *   - `ConfigModule.forRoot({ isGlobal: true })` ya cargado en `AppModule`.
 *     Reusamos la misma config global; aquí solo declaramos el provider.
 */
@Global()
@Module({
  imports: [ConfigModule],
  // ADR-016: storage Redis del rate limiting, inyectado en `ThrottlerModule`
  // (app.module). Global → disponible para la factory async del throttler.
  providers: [SecretVaultService, RedisThrottlerStorage],
  exports: [SecretVaultService, RedisThrottlerStorage],
})
export class SecurityModule {}
