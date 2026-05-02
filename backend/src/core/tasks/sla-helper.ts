/* ═══════════════════════════════════════
   sla-helper — Sprint 16 Fase 16.B (ADR-079 §3.5)
   Cálculo canónico de `due_date` por (source_system, tier SI del cliente).
   ═══════════════════════════════════════ */

import { TaskSourceSystem, SupportInsidePriorityTier } from '@prisma/client';

const MS_PER_HOUR = 3_600_000;

/**
 * Calcula `due_date` canónico al crear una task (ADR-079 §3.5).
 *
 * **Mapping canónico (horas desde createdAt):**
 *
 *   support_ticket × tier SI:
 *     pro (max)       → 4h
 *     medium (high)   → 12h
 *     basic (standard)→ 24h
 *     sin SI          → 24h
 *
 *   support_inside_slot   → fin del día (23:59 UTC del día de creación)
 *   provisioning_manual   → 24h (setup estándar)
 *   client_lifecycle      → 48h (bienvenida primer servicio)
 *   project               → null (sin SLA — trabajo de fondo)
 *
 * @param sourceSystem trigger canónico que creó la task
 * @param clientSITier tier SI del cliente (schema enum) o null
 * @param createdAt fecha base
 */
export function calculateTaskDueDate(
  sourceSystem: TaskSourceSystem,
  clientSITier: SupportInsidePriorityTier | null,
  createdAt: Date,
): Date | null {
  switch (sourceSystem) {
    case 'support_ticket': {
      const hours = mapSITierToTicketSlaHours(clientSITier);
      return new Date(createdAt.getTime() + hours * MS_PER_HOUR);
    }
    case 'support_inside_slot': {
      // El slot tiene anniversary_day; el cron crea la task ese día. SLA =
      // fin del día UTC. El agente tiene la jornada para completarlo.
      const eod = new Date(createdAt);
      eod.setUTCHours(23, 59, 59, 999);
      return eod;
    }
    case 'provisioning_manual':
      return new Date(createdAt.getTime() + 24 * MS_PER_HOUR);
    case 'client_lifecycle':
      return new Date(createdAt.getTime() + 48 * MS_PER_HOUR);
    case 'project':
      return null;
  }
}

function mapSITierToTicketSlaHours(
  tier: SupportInsidePriorityTier | null,
): number {
  if (tier === 'max') return 4; // SI Pro
  if (tier === 'high') return 12; // SI Medium
  if (tier === 'standard') return 24; // SI Básico
  return 24; // sin SI — trato igual que el básico (no penalizar)
}
