/* ═══════════════════════════════════════
   list-ordering — Sprint 16 Fase 16.B (ADR-079 §3.3)
   Regla canónica de orden del listado /admin/tasks (2 niveles).
   ═══════════════════════════════════════ */

import { Task, TaskSourceSystem } from '@prisma/client';

/**
 * Orden canónico del listado de tasks (ADR-079 §3.3).
 *
 *  1. Tasks vencidas (status='not_completed_in_time') aparecen en banner
 *     rojo arriba del todo.
 *  2. Bloque de tickets primero, ordenado por:
 *     - tier SI del cliente (Pro > Medium > Basic > sin SI) — manejado
 *       indirectamente por `priority` (critical > high > medium).
 *     - dentro de cada tier, FIFO por `created_at` (más viejo primero).
 *  3. Resto de tasks debajo, agrupadas por `source_system` con orden
 *     interno propio:
 *     - support_inside_slot: por anniversary_day (ascendente — derivado
 *       de created_at, ya que el cron crea el día aniversario).
 *     - provisioning_manual / client_lifecycle / project: FIFO por
 *       created_at.
 *
 * **Por qué no `priority DESC, due_date ASC` puro:** la priorización por
 * enum funciona dentro de cada bloque pero no cross-bloque (un mantenimiento
 * mensual con due_date mañana NO es "menos urgente" que un ticket SI Pro de
 * hoy — son trabajos distintos). Agrupar por sistema preserva la coherencia
 * operativa: el agente ve todos los tickets del día juntos, todos los
 * mantenimientos juntos, etc.
 *
 * Esta función ordena IN-MEMORY un array de tasks. Para el filtrado y
 * paginación hay que aplicar `where` en la query Prisma; el orden final
 * se aplica aquí.
 */
const SOURCE_BLOCK_ORDER: Record<TaskSourceSystem, number> = {
  support_ticket: 0,
  support_inside_slot: 1,
  provisioning_manual: 2,
  client_lifecycle: 3,
  project: 4,
};

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function applyCanonicalOrdering<
  T extends Pick<
    Task,
    'source_system' | 'priority' | 'status' | 'created_at' | 'due_date'
  >,
>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    // 1. Vencidas arriba del todo.
    const aOverdue = a.status === 'not_completed_in_time' ? 0 : 1;
    const bOverdue = b.status === 'not_completed_in_time' ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;

    // 2. Bloque por source_system.
    const aBlock = SOURCE_BLOCK_ORDER[a.source_system];
    const bBlock = SOURCE_BLOCK_ORDER[b.source_system];
    if (aBlock !== bBlock) return aBlock - bBlock;

    // 3. Dentro del bloque support_ticket: priority DESC, luego FIFO.
    if (a.source_system === 'support_ticket') {
      const ap = PRIORITY_RANK[a.priority] ?? 99;
      const bp = PRIORITY_RANK[b.priority] ?? 99;
      if (ap !== bp) return ap - bp;
    }

    // 4. Dentro del bloque support_inside_slot: due_date ASC (= anniversary_day
    //    ascendente porque el cron crea la task el día aniversario y el
    //    due_date es fin del día). Tasks sin due_date al final.
    if (a.source_system === 'support_inside_slot') {
      const ad = a.due_date ? a.due_date.getTime() : Infinity;
      const bd = b.due_date ? b.due_date.getTime() : Infinity;
      if (ad !== bd) return ad - bd;
    }

    // 5. Resto de bloques: FIFO por created_at.
    return a.created_at.getTime() - b.created_at.getTime();
  });
}

/**
 * Helper para construir `orderBy` Prisma cuando se quiere paginar y aplicar
 * el orden a nivel de SQL en lugar de en memoria. Versión simplificada:
 * orden lexicográfico por (status='not_completed_in_time' DESC, source_system,
 * priority DESC, created_at). No reproduce TODA la regla canónica (Postgres
 * no permite custom enum ordering por bloque sin CASE), pero sirve para
 * paginación inicial — la UI puede aplicar `applyCanonicalOrdering` sobre
 * el lote devuelto si necesita orden exacto.
 */
export const PRISMA_ORDER_BY_CANONICAL = [
  { status: 'asc' as const }, // 'not_completed_in_time' < otros estados terminales/no — aproximación
  { source_system: 'asc' as const },
  { priority: 'desc' as const },
  { created_at: 'asc' as const },
];
