import type { UserStatus } from '../../lib/types';
import type { BadgeVariant } from '../../components/ui';

/**
 * GL-21 — gestión de cuentas de staff (audit 2026-06-25 §6 Tier 3).
 * Shapes que consume el panel `/admin/users`. Espejo de `StaffMemberDto`
 * (backend `users.service.ts`).
 */

/** Los 4 roles staff gestionables (espejo de `MANAGEABLE_STAFF_ROLES` backend). */
export type StaffRole =
  | 'superadmin'
  | 'agent_full'
  | 'agent_billing'
  | 'agent_support';

export interface StaffMember {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: StaffRole;
  status: UserStatus;
  two_factor_enabled: boolean;
  last_login_at: string | null;
  created_at: string;
  avatar_url: string | null;
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  superadmin: 'Superadmin',
  agent_full: 'Agente · acceso total',
  agent_billing: 'Agente · facturación',
  agent_support: 'Agente · soporte',
};

export const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as StaffRole[]).map(
  (value) => ({ value, label: ROLE_LABELS[value] }),
);

export const STATUS_META: Record<
  string,
  { label: string; variant: BadgeVariant }
> = {
  active: { label: 'Activa', variant: 'success' },
  inactive: { label: 'Inactiva', variant: 'neutral' },
  blocked: { label: 'Bloqueada', variant: 'danger' },
  pending_verification: { label: 'Pendiente', variant: 'warning' },
};
