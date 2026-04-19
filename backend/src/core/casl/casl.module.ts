/**
 * ═══════════════════════════════════════════════════════════════
 * AELIUM PBAC — CASL Module
 * ═══════════════════════════════════════════════════════════════
 *
 * Global module that provides the CaslAbilityFactory and PoliciesGuard
 * to all modules in the application.
 *
 * Registered as global so that any module can use:
 *   @UseGuards(JwtAuthGuard, PoliciesGuard)
 *   @CheckPolicies(...)
 * without importing CaslModule explicitly.
 */

import { Module, Global } from '@nestjs/common';
import { CaslAbilityFactory } from './casl-ability.factory';
import { PoliciesGuard } from './policies.guard';

@Global()
@Module({
  providers: [CaslAbilityFactory, PoliciesGuard],
  exports: [CaslAbilityFactory, PoliciesGuard],
})
export class CaslModule {}
