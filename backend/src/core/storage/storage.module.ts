import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * StorageModule — abstracción S3-compatible canónica (ADR-062).
 *
 * @Global porque cualquier módulo de negocio (billing → PDFs, support →
 * adjuntos chat/tickets, products → imágenes, etc.) inyecta `StorageService`
 * sin importar el módulo cada vez. Mismo patrón que `OutboxModule`,
 * `SettingsModule`, `EmailModule`.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
