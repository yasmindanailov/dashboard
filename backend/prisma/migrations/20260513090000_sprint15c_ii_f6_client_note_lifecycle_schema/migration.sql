-- Sprint 15C.II Fase F.6 (2026-05-13) — Notas operativas vía ClientNote.
--
-- Las acciones críticas de lifecycle de servicio (cancel / suspend / unsuspend,
-- tanto manual admin como automático del cron de billing) dejan rastro en el
-- sistema transversal `client_notes` (ADR-079 §3.8), igual que el cierre de
-- ticket o el completado de un mantenimiento. Tres cambios al modelo (dossier
-- §A.11.10.3 + §A.11.10.3.1):
--
-- 1. `NoteSourceSystem` añade valor `service` — F.6 escribe notas con este
--    `source_system` para que aparezcan inline en `/admin/services/[id]`
--    (filtro `source_system='service' AND source_id=serviceId`) y federadas
--    en `/admin/clients/[id]` → "Notas" (todas las notas del cliente, igual
--    que las demás source_system).
--
-- 2. `NoteCategory` añade valor `lifecycle` — las transiciones de servicio
--    NO son `support` (no es atención al cliente), NO son `billing`
--    (operacional, no contabilidad), NO son `exceptional` (son trazas
--    canónicas de una acción, no nota libre del agente). Categoría nueva
--    refleja honestamente la dimensión "lifecycle del servicio".
--
-- 3. `client_notes.author_id` pasa a NULLABLE con FK ON DELETE SET NULL.
--    Materializa la convención "actor sistema = author_id NULL" que la Fase
--    F.5 ya estableció en `audit_change_log.user_id` y en los eventos
--    `service.suspended` / `service.unsuspended` (con `actor_user_id:
--    string|null` + `actor: 'system:<label>'` cuando `null`). Patrón canónico
--    heredable. `ON DELETE SET NULL`: si un admin se elimina, sus notas se
--    preservan (historial operativo del cliente intacto), pero el autor pasa
--    a NULL — la UI lo renderiza como "Autor original eliminado" o
--    equivalente (vs `ON DELETE CASCADE` que borraría notas valiosas).
--
-- IMPORTANTE: Postgres permite `ALTER TYPE ... ADD VALUE` dentro de la
-- transacción de la migración SIEMPRE QUE el valor nuevo NO se use en la
-- misma transacción. Esta migración solo añade los valores; la migración
-- one-shot de split del `"<motivo>: <nota>"` combinado actual a su forma
-- separada + creación retroactiva de ClientNotes para servicios viejos
-- (F.6.4) vive en una migración POSTERIOR con timestamp distinto, ejecutada
-- en su propia transacción — Prisma garantiza el aislamiento entre
-- migraciones.

-- ─── Enum value additions ────────────────────────────────────────────────
ALTER TYPE "NoteSourceSystem" ADD VALUE 'service';
ALTER TYPE "NoteCategory" ADD VALUE 'lifecycle';

-- ─── ClientNote.author_id → NULLABLE + FK ON DELETE SET NULL ─────────────
-- Postgres requiere drop+recreate de la FK para cambiar la cláusula
-- `ON DELETE` (de NO ACTION default a SET NULL); el cambio de NOT NULL se
-- aprovecha para ir en el mismo bloque y minimizar churn.
ALTER TABLE "client_notes" DROP CONSTRAINT "client_notes_author_id_fkey";

ALTER TABLE "client_notes" ALTER COLUMN "author_id" DROP NOT NULL;

ALTER TABLE "client_notes"
    ADD CONSTRAINT "client_notes_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
