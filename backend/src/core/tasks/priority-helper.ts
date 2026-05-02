/* ═══════════════════════════════════════
   priority-helper — Sprint 16 Fase 16.B (ADR-079 §3.3)
   Cálculo canónico de TaskPriority por (source_system, tier SI del cliente).
   ═══════════════════════════════════════ */

import {
  TaskPriority,
  TaskSourceSystem,
  SupportInsidePriorityTier,
} from '@prisma/client';

/**
 * Mapeo canónico tier SI (schema) → label semántico (ADR-079).
 *
 * El ADR habla de tiers `pro/medium/basic` (nombres comerciales del seed
 * `support-inside-plans.ts`). El schema usa `SupportInsidePriorityTier`
 * con valores `standard/high/max` (nombres semánticos por SLA). El mapping
 * canónico vive aquí — única fuente de verdad para la traducción.
 *
 *   Plan comercial    | priority_tier | Etiqueta ADR
 *   ──────────────────┼───────────────┼──────────────
 *   Support Inside Pro | max           | pro
 *   Support Inside Med | high          | medium
 *   Support Inside Bás | standard      | basic
 *   sin SI             | (null)        | null
 */

/**
 * Calcula la prioridad canónica de una task según ADR-079 §3.3.
 *
 * **Regla de 2 niveles:**
 *  - `support_ticket`: prioridad cruzada con tier SI del cliente.
 *  - Resto de sistemas: `medium` por defecto (la priorización entre ellos
 *    la marca el `due_date` o el FIFO, no este enum — ver `list-ordering.ts`).
 *
 * **Migración V2 (Sprint 12 Settings + KB):** este helper se sustituye por
 * lectura del setting `tasks.priority_rules` (jsonb mapping
 * `source_system × clientSITier → priority`). Misma firma input/output →
 * cero refactor del resto del sistema.
 *
 * @param sourceSystem trigger canónico que creó la task
 * @param clientSITier tier SI del cliente (schema enum) o null si no tiene SI
 */
export function calculateTaskPriority(
  sourceSystem: TaskSourceSystem,
  clientSITier: SupportInsidePriorityTier | null,
): TaskPriority {
  if (sourceSystem === 'support_ticket') {
    if (clientSITier === 'max') return 'critical'; // SI Pro
    if (clientSITier === 'high') return 'high'; // SI Medium
    if (clientSITier === 'standard') return 'high'; // SI Básico
    return 'medium'; // sin Support Inside
  }
  // Resto de sistemas: orden no marcado por priority sino por due_date / FIFO
  // (ver `list-ordering.ts`).
  return 'medium';
}
