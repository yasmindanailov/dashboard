import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SecretVaultService } from './secret-vault.service';

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
  providers: [SecretVaultService],
  exports: [SecretVaultService],
})
export class SecurityModule {}
