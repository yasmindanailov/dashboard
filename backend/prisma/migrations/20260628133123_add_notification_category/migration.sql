-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('facturacion', 'servicios', 'dominios', 'soporte', 'seguridad', 'tareas', 'sistema', 'plugins', 'negocio', 'general');

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "category" "NotificationCategory" NOT NULL DEFAULT 'general';

-- Backfill (F3·E10): deriva `category` desde `metadata->>'event'` para las filas
-- existentes. Mapea 1:1 con `notification-taxonomy.ts` (fuente única). Idempotente
-- y seguro: lo no mapeado / sin `metadata.event` se queda en el default 'general'.
UPDATE "notifications" SET "category" = 'facturacion'
  WHERE "metadata"->>'event' IN ('invoice.paid');
UPDATE "notifications" SET "category" = 'servicios'
  WHERE "metadata"->>'event' IN ('service.suspended', 'service.unsuspended', 'service.quota_threshold_crossed', 'service.cancellation_scheduled', 'service.cancelled', 'service.password_reset', 'maintenance.completed');
UPDATE "notifications" SET "category" = 'dominios'
  WHERE "metadata"->>'event' IN ('domain.renewed', 'domain.restored', 'domain.transfer_initiated', 'domain.transfer_completed', 'domain.transfer_failed', 'domain.expiring_soon', 'domain.expired', 'domain.entered_redemption');
UPDATE "notifications" SET "category" = 'seguridad'
  WHERE "metadata"->>'event' IN ('domain.nameservers_changed', 'domain.lock_changed', 'auth.refresh_replay_detected');
UPDATE "notifications" SET "category" = 'soporte'
  WHERE "metadata"->>'event' IN ('conversation.created', 'conversation.resolved', 'conversation.assigned', 'conversation.auto_closed', 'message.created', 'task.completed');
UPDATE "notifications" SET "category" = 'tareas'
  WHERE "metadata"->>'event' IN ('task.assigned', 'task.overdue', 'task.unassigned_overdue');
UPDATE "notifications" SET "category" = 'sistema'
  WHERE "metadata"->>'event' IN ('dlq.job_failed', 'outbox.event_failed', 'system.error', 'maintenance.critical');
UPDATE "notifications" SET "category" = 'plugins'
  WHERE "metadata"->>'event' IN ('plugin.circuit_opened', 'plugin.circuit_closed');

-- CreateIndex
CREATE INDEX "notifications_user_id_category_idx" ON "notifications"("user_id", "category");
