/**
 * ═══════════════════════════════════════════════════════════════
 * @CheckPolicies() Decorator
 * ═══════════════════════════════════════════════════════════════
 *
 * Defines the policy check function that the PoliciesGuard will
 * execute against the user's CASL ability.
 *
 * Usage:
 *   @CheckPolicies((ability) => ability.can(Action.Read, Subject.Client))
 *   @Get()
 *   findAll() { ... }
 *
 * Multiple policies can be stacked — ALL must pass (AND logic):
 *   @CheckPolicies(
 *     (ability) => ability.can(Action.Read, Subject.Client),
 *     (ability) => ability.can(Action.List, Subject.Client),
 *   )
 *
 * For "any role with auth" endpoints, omit the decorator entirely
 * — the PoliciesGuard allows access if no policy is defined.
 */

import { SetMetadata } from '@nestjs/common';
import { AppAbility } from './casl-ability.factory';

export type PolicyHandler = (ability: AppAbility) => boolean;

export const CHECK_POLICIES_KEY = 'check_policies';

export const CheckPolicies = (...handlers: PolicyHandler[]) =>
  SetMetadata(CHECK_POLICIES_KEY, handlers);
