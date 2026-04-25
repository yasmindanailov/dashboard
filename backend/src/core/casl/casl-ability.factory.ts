/**
 * ═══════════════════════════════════════════════════════════════
 * AELIUM PBAC — CASL Ability Factory
 * ═══════════════════════════════════════════════════════════════
 *
 * Creates a CASL Ability instance for a given authenticated user.
 * The ability is built from the centralized permissions definition
 * in permissions.ts and is injected into the PoliciesGuard.
 *
 * Usage:
 *   const ability = this.caslAbilityFactory.createForUser(user);
 *   ability.can(Action.Read, Subject.Client); // true/false
 *
 * The factory reads the user's role slug and generates the
 * corresponding ability. Conditions (like user_id filtering)
 * are injected at creation time.
 */

import { Injectable } from '@nestjs/common';
import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import { Action, Subject, ROLE_PERMISSIONS } from './permissions';

// ─── Type definitions ───────────────────────────────────────────

export type AppAbility = MongoAbility<[Action, Subject]>;

// ─── Authenticated user shape (from JwtStrategy.validate) ───────

export interface AuthenticatedUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  role: {
    id?: string;
    slug: string;
    name?: string;
  };
  partner_id?: string | null;
}

// ─── Factory ────────────────────────────────────────────────────

@Injectable()
export class CaslAbilityFactory {
  /**
   * Create a CASL Ability for the given user based on their role.
   *
   * @param user - The authenticated user from req.user (populated by JwtStrategy)
   * @returns MongoAbility with all permissions for the user's role
   */
  createForUser(user: AuthenticatedUser): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(
      createMongoAbility,
    );

    const roleSlug = user.role.slug;
    const permissionsFn = ROLE_PERMISSIONS[roleSlug];

    if (!permissionsFn) {
      // Unknown role → no permissions (safe default)
      return build();
    }

    // Generate the permission rules for this user
    const rules = permissionsFn(user.id, user.partner_id ?? undefined);

    for (const rule of rules) {
      const actions = Array.isArray(rule.action) ? rule.action : [rule.action];

      if (rule.inverted) {
        // "cannot" rules
        for (const action of actions) {
          cannot(action, rule.subject);
        }
      } else {
        // "can" rules
        for (const action of actions) {
          if (rule.conditions) {
            can(action, rule.subject, rule.conditions);
          } else {
            can(action, rule.subject);
          }
        }
      }
    }

    return build();
  }
}
