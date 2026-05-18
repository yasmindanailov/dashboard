import { IsIn, IsString } from 'class-validator';

import {
  NOTIFICATION_TEMPLATE_WHITELIST_SERVICE_LIFECYCLE,
  type ServiceLifecycleTemplateKey,
} from '../notification-resend.constants';

/**
 * Sprint 15C.II Fase F.11.2 (R4 frozen §A.11.10.8.2).
 *
 * DTO de `POST /admin/services/:id/notifications/resend`. Defense-in-
 * depth: `@IsIn` valida contra la whitelist canónica del backend
 * (`NOTIFICATION_TEMPLATE_WHITELIST_SERVICE_LIFECYCLE`); cualquier
 * `template_key` arbitrario → 400 BadRequest con un mensaje claro.
 */
export class ResendNotificationDto {
  @IsString()
  @IsIn(NOTIFICATION_TEMPLATE_WHITELIST_SERVICE_LIFECYCLE as unknown as string[])
  template_key!: ServiceLifecycleTemplateKey;
}
