/* ═══════════════════════════════════════
   auto-assign — Sprint 16 Fase 16.B (ADR-079 §3.4)
   Auto-asignación V1 de tasks por carga del agente + rol elegible.
   ═══════════════════════════════════════ */

import { TaskSourceSystem, RoleSlug } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/**
 * Mapping canónico `source_system → roles staff elegibles`.
 *
 * - `support_ticket` y `support_inside_slot`: agentes de soporte (full +
 *   support).
 * - `provisioning_manual`: igual + agente billing podría asistir, pero la
 *   doctrina canónica deja el setup técnico a soporte (decisión consciente
 *   ADR-079 — agent_billing no toca infra).
 * - `client_lifecycle`: bienvenida primer servicio. Cualquier agente
 *   (billing también) puede hacer la llamada — es onboarding comercial,
 *   no técnico.
 * - `project`: cola pública pura — el superadmin asigna manualmente al
 *   promover un item del checklist a task. `[]` = sin auto-asignación.
 *
 * **Migración V2 (Sprint 12):** este mapping se mueve a setting
 * `tasks.auto_assign_rules` jsonb. Misma firma → cero refactor.
 */
const ROLES_BY_SOURCE: Record<TaskSourceSystem, readonly RoleSlug[]> = {
  support_ticket: ['agent_support', 'agent_full'],
  support_inside_slot: ['agent_support', 'agent_full'],
  provisioning_manual: ['agent_support', 'agent_full'],
  client_lifecycle: ['agent_support', 'agent_full', 'agent_billing'],
  project: [],
};

/**
 * Selecciona el agente con MENOR carga activa entre los roles elegibles
 * para `sourceSystem`. "Carga activa" = count de tasks con
 * `status IN ('pending', 'in_progress')` asignadas al agente.
 *
 * Empate: desempate aleatorio (no alfabético — evita sesgo sistemático).
 *
 * Casos especiales canónicos (NO invocan este helper):
 *
 *  - `support_ticket`: el ticket viene asignado al agente desde el módulo
 *    support (auto-asignación de tickets, no de tasks). El listener
 *    `SupportTicketTaskCreatorListener` hereda `assigned_to` directamente
 *    del ticket — NO consulta `autoAssignTask` (excepción documentada).
 *  - `project`: cola pública pura. El superadmin asigna manualmente.
 *    `ROLES_BY_SOURCE.project = []` → este helper devuelve `null`.
 *
 * @returns user_id del agente elegido, o `null` si no hay candidatos.
 */
export async function autoAssignTask(
  prisma: PrismaService,
  sourceSystem: TaskSourceSystem,
): Promise<string | null> {
  const eligibleRoles = ROLES_BY_SOURCE[sourceSystem];
  if (eligibleRoles.length === 0) return null;

  // Postgres `random()` desempata uniforme; LIMIT 1 deja un único candidato.
  // El subquery COUNT cuenta la carga ACTIVA real del agente.
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT u.id
    FROM users u
    INNER JOIN roles r ON r.id = u.role_id
    WHERE r.slug::text = ANY(${eligibleRoles}::text[])
      AND u.status = 'active'
    ORDER BY (
      SELECT COUNT(*) FROM tasks t
      WHERE t.assigned_to = u.id
        AND t.status IN ('pending', 'in_progress')
    ) ASC,
    random() ASC
    LIMIT 1
  `;

  return rows[0]?.id ?? null;
}

/**
 * ¿Es `userId` un asignatario elegible para `sourceSystem`? (staff activo con
 * un rol del mapping canónico). Rediseño UI F3·E8: el cron de mantenimiento
 * usa esto para validar que el "técnico asignado" del cliente sigue siendo
 * elegible antes de heredarle la tarea; si no, cae a `autoAssignTask`. Misma
 * doctrina de roles que la auto-asignación → cero divergencia.
 */
export async function isAssigneeEligible(
  prisma: PrismaService,
  userId: string,
  sourceSystem: TaskSourceSystem,
): Promise<boolean> {
  const eligibleRoles = ROLES_BY_SOURCE[sourceSystem];
  if (eligibleRoles.length === 0) return false;

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      status: 'active',
      role: { slug: { in: [...eligibleRoles] } },
    },
    select: { id: true },
  });
  return user != null;
}
