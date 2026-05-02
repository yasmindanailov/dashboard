/**
 * Helpers E2E para tasks — Sprint 16 Fase 16.B (ADR-079).
 *
 * Las tasks ya NO se crean vía POST: la API REST canónica es read-only
 * sobre triggers automáticos cerrados. Los tests que necesitan una task
 * "como si la hubiera creado un trigger" la insertan directamente vía
 * SQL — equivale a simular el listener trigger sin acoplar el test al
 * detalle interno del listener.
 *
 * Pattern canónico:
 *
 *   const taskId = await insertTask(pool, {
 *     source_system: 'support_ticket',
 *     source_id: conversationId,
 *     client_id: clientUserId,
 *     assigned_to: agentId,
 *     priority: 'high',
 *     due_date: addHours(new Date(), 4),
 *   });
 *
 * Para flujos que SÍ deben pasar por el trigger real (validar que el
 * listener canónico crea la task con los campos esperados), el test usa
 * la API del módulo origen — ej. `support.updateConversation` para
 * disparar `conversation.assigned` → listener crea Task. Eso prueba el
 * trigger end-to-end sin SQL directo.
 */

import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

export type TaskSourceSystem =
  | 'support_ticket'
  | 'support_inside_slot'
  | 'provisioning_manual'
  | 'client_lifecycle'
  | 'project';

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'not_completed_in_time';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface InsertTaskOpts {
  source_system: TaskSourceSystem;
  /**
   * ID en el sistema vinculado. Para tests que no requieren FK real
   * (la doctrina ADR-079 §3.1 establece source_id polimórfico sin FK
   * formal), pasa cualquier UUID — el listener canónico cancelaría la
   * task si el sistema vinculado desaparece, pero `insertTask` no
   * dispara listeners. Si se omite, generamos UUID aleatorio para
   * evitar colisiones con UNIQUE INDEX parcial entre tests del mismo
   * `(source_system, client_id)`.
   */
  source_id?: string;
  client_id: string;
  assigned_to?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  due_date?: Date | null;
  created_at?: Date;
}

export async function insertTask(
  pool: Pool,
  opts: InsertTaskOpts,
): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO tasks (
       source_system, source_id, client_id, assigned_to,
       priority, status, due_date, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()), COALESCE($8, NOW()))
     RETURNING id`,
    [
      opts.source_system,
      opts.source_id ?? randomUUID(),
      opts.client_id,
      opts.assigned_to ?? null,
      opts.priority ?? 'medium',
      opts.status ?? 'pending',
      opts.due_date ?? null,
      opts.created_at ?? null,
    ],
  );
  return res.rows[0].id;
}

export async function findTaskById(
  pool: Pool,
  id: string,
): Promise<Record<string, unknown> | null> {
  const res = await pool.query(`SELECT * FROM tasks WHERE id = $1`, [id]);
  return res.rows[0] ?? null;
}

export async function findActiveTaskBySource(
  pool: Pool,
  sourceSystem: TaskSourceSystem,
  sourceId: string,
): Promise<Record<string, unknown> | null> {
  const res = await pool.query(
    `SELECT * FROM tasks
     WHERE source_system = $1 AND source_id = $2
       AND status IN ('pending', 'in_progress')
     LIMIT 1`,
    [sourceSystem, sourceId],
  );
  return res.rows[0] ?? null;
}
