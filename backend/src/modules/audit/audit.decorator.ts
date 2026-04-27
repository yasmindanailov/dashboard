import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key para `AuditInterceptor` (Sprint 9 Fase E + ADR-017).
 *
 * Uso:
 *   @AuditAccess('Invoice')
 *   @Get(':id')
 *   findOne(@Param('id') id: string) { ... }
 *
 * El interceptor lee el metadata, ejecuta el handler y, si el caller es
 * staff actuando sobre un recurso de OTRO usuario, registra la lectura
 * en `audit_access_log` con:
 *   - `action`: 'read'
 *   - `resource`: '<ResourceType>:<resource_id>'
 *   - `metadata.resource_id`: el id del recurso
 *   - `metadata.resource_type`: ResourceType
 *   - `metadata.target_user_id`: dueño del recurso (si se puede inferir)
 *
 * Cuando el cliente lee SUS propios datos, NO se registra (es su
 * derecho natural).
 */
export const AUDIT_ACCESS_KEY = 'audit:access:resource_type';

export const AuditAccess = (resourceType: string) =>
  SetMetadata(AUDIT_ACCESS_KEY, resourceType);
