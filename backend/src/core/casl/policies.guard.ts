/**
 * ═══════════════════════════════════════════════════════════════
 * AELIUM PBAC — Policies Guard
 * ═══════════════════════════════════════════════════════════════
 *
 * NestJS guard that enforces CASL-based policies on endpoints.
 * Replaces the simpler RolesGuard for granular permission checks.
 *
 * Behavior:
 *   1. Must be used AFTER JwtAuthGuard (needs req.user populated).
 *   2. Reads @CheckPolicies() handlers from metadata.
 *   3. If no @CheckPolicies() decorator → allows access (auth-only).
 *   4. If all policy handlers return true → allows access.
 *   5. If any handler returns false → throws ForbiddenException.
 *   6. The user's CASL ability is also attached to req.ability
 *      for use in service-level authorization.
 *
 * Usage in controllers:
 *   @UseGuards(JwtAuthGuard, PoliciesGuard)
 *   @CheckPolicies((ability) => ability.can(Action.Read, Subject.Client))
 *   @Get()
 *   findAll() { ... }
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CaslAbilityFactory } from './casl-ability.factory';
import { CHECK_POLICIES_KEY, PolicyHandler } from './check-policies.decorator';

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly caslAbilityFactory: CaslAbilityFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const policyHandlers = this.reflector.getAllAndOverride<PolicyHandler[]>(
      CHECK_POLICIES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @CheckPolicies() → allow access (auth-only endpoint)
    if (!policyHandlers || policyHandlers.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const { user } = request;

    if (!user) {
      throw new ForbiddenException('No tienes permisos para acceder a este recurso.');
    }

    // Build CASL ability for this user
    const ability = this.caslAbilityFactory.createForUser(user);

    // Attach ability to request for downstream service-level checks
    request.ability = ability;

    // Check ALL policy handlers (AND logic)
    const allPassed = policyHandlers.every((handler) => handler(ability));

    if (!allPassed) {
      throw new ForbiddenException('No tienes permisos para realizar esta acción.');
    }

    return true;
  }
}
