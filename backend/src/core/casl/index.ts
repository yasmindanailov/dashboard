/**
 * CASL PBAC — Barrel export
 *
 * Import everything from '@core/casl' in one line:
 *   import { Action, Subject, CheckPolicies, PoliciesGuard } from '../../core/casl';
 */

export { Action, Subject } from './permissions';
export { ROLE_PERMISSIONS, SIDEBAR_PERMISSIONS } from './permissions';
export type { PermissionRule, RolePermissions } from './permissions';

export { CaslAbilityFactory } from './casl-ability.factory';
export type { AppAbility, AuthenticatedUser } from './casl-ability.factory';

export { CheckPolicies, CHECK_POLICIES_KEY } from './check-policies.decorator';
export type { PolicyHandler } from './check-policies.decorator';

export { PoliciesGuard } from './policies.guard';

export { CaslModule } from './casl.module';
