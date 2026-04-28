import { CaslAbilityFactory } from './casl-ability.factory';
import { Action, Subject } from './permissions';
import type { AuthenticatedUser } from '../common/types/authenticated-request';

/**
 * Tests unit CaslAbilityFactory — Sprint 9.6 (ADR-067).
 *
 * Cobertura:
 *  - Granularidad role-staff sobre Subjects nuevos `NotificationTemplate` + `Job`:
 *    sólo `superadmin` puede `Manage`, los demás roles staff y cliente reciben
 *    `false` (ausencia de regla = denegado por CASL builder).
 *  - Sanidad de la matriz canónica del proyecto: que `agent_billing` siga sin
 *    poder `Manage Conversation` y `agent_support` siga sin `Manage Invoice`,
 *    porque Sprint 9.6 confía en esas reglas para la granularidad de Sidebar.
 *  - Cliente nunca cruza el guard CASL para ningún Subject staff-puro.
 */
describe('CaslAbilityFactory — granularidad rol staff (ADR-067)', () => {
  const factory = new CaslAbilityFactory();

  function userWithRole(slug: string): AuthenticatedUser {
    return {
      id: '00000000-0000-0000-0000-000000000001',
      email: `${slug}@aelium.test`,
      role: { slug, id: 'role-id' },
      partner_id: null,
    } as unknown as AuthenticatedUser;
  }

  /* ════════════════════════════════════════════════════════════════
     Subject.NotificationTemplate — solo superadmin
     ════════════════════════════════════════════════════════════════ */

  describe('Subject.NotificationTemplate', () => {
    test('superadmin puede Manage NotificationTemplate (regla wildcard Manage All)', () => {
      const ability = factory.createForUser(userWithRole('superadmin'));
      expect(ability.can(Action.Manage, Subject.NotificationTemplate)).toBe(
        true,
      );
    });

    test.each(['agent_full', 'agent_billing', 'agent_support'])(
      '%s NO puede Manage NotificationTemplate',
      (role) => {
        const ability = factory.createForUser(userWithRole(role));
        expect(ability.can(Action.Manage, Subject.NotificationTemplate)).toBe(
          false,
        );
      },
    );

    test('client NO puede Manage NotificationTemplate', () => {
      const ability = factory.createForUser(userWithRole('client'));
      expect(ability.can(Action.Manage, Subject.NotificationTemplate)).toBe(
        false,
      );
    });
  });

  /* ════════════════════════════════════════════════════════════════
     Subject.Job — solo superadmin (DLQ retry impacta side effects)
     ════════════════════════════════════════════════════════════════ */

  describe('Subject.Job', () => {
    test('superadmin puede Manage Job', () => {
      const ability = factory.createForUser(userWithRole('superadmin'));
      expect(ability.can(Action.Manage, Subject.Job)).toBe(true);
    });

    test.each(['agent_full', 'agent_billing', 'agent_support'])(
      '%s NO puede Manage Job',
      (role) => {
        const ability = factory.createForUser(userWithRole(role));
        expect(ability.can(Action.Manage, Subject.Job)).toBe(false);
      },
    );

    test('client NO puede Manage Job', () => {
      const ability = factory.createForUser(userWithRole('client'));
      expect(ability.can(Action.Manage, Subject.Job)).toBe(false);
    });
  });

  /* ════════════════════════════════════════════════════════════════
     Sanidad de la matriz canónica que Sprint 9.6 da por sentada
     (no rompemos Sprint 9 / 9.5 con el cambio).
     ════════════════════════════════════════════════════════════════ */

  describe('matriz canónica preservada', () => {
    test('agent_billing puede Manage Invoice + Client + Task', () => {
      const ability = factory.createForUser(userWithRole('agent_billing'));
      expect(ability.can(Action.Manage, Subject.Invoice)).toBe(true);
      expect(ability.can(Action.Manage, Subject.Client)).toBe(true);
      expect(ability.can(Action.Manage, Subject.Task)).toBe(true);
    });

    test('agent_billing NO puede Manage Conversation ni Product', () => {
      const ability = factory.createForUser(userWithRole('agent_billing'));
      expect(ability.can(Action.Manage, Subject.Conversation)).toBe(false);
      expect(ability.can(Action.Manage, Subject.Product)).toBe(false);
    });

    test('agent_support puede Manage Conversation + Task pero solo Read Client', () => {
      const ability = factory.createForUser(userWithRole('agent_support'));
      expect(ability.can(Action.Manage, Subject.Conversation)).toBe(true);
      expect(ability.can(Action.Manage, Subject.Task)).toBe(true);
      expect(ability.can(Action.Read, Subject.Client)).toBe(true);
      expect(ability.can(Action.Update, Subject.Client)).toBe(false);
    });

    test('agent_support NO puede Manage Invoice ni Product', () => {
      const ability = factory.createForUser(userWithRole('agent_support'));
      expect(ability.can(Action.Manage, Subject.Invoice)).toBe(false);
      expect(ability.can(Action.Manage, Subject.Product)).toBe(false);
    });

    test('agent_full NO puede Manage Setting (regla inverted preservada)', () => {
      const ability = factory.createForUser(userWithRole('agent_full'));
      expect(ability.can(Action.Manage, Subject.Setting)).toBe(false);
    });

    test('rol desconocido recibe ability vacía (safe default)', () => {
      const ability = factory.createForUser(userWithRole('rol_inexistente'));
      expect(ability.can(Action.Read, Subject.Dashboard)).toBe(false);
      expect(ability.can(Action.Manage, Subject.NotificationTemplate)).toBe(
        false,
      );
      expect(ability.can(Action.Manage, Subject.Job)).toBe(false);
    });
  });
});
