-- Sprint 13 §13.AUTH Fase B (2026-05-03) — Refresh rotation con replay detection (ADR-078 §1.4).
-- Doctrina: ADR-078 Amendment A1 + OWASP "Token-based Authentication" cheat sheet.
--
-- Cambios en sessions:
--  1. used_at (timestamptz, NULL): timestamp del canje del refresh token.
--     NULL = todavía válido. Cuando AuthTokenService.refresh() canjea uno,
--     marca este campo + crea sesión nueva enlazada vía replaced_by_session_id.
--     Si llega un refresh con `used_at IS NOT NULL` → REPLAY → revoca toda la
--     cadena del user + emite `auth.refresh_replay_detected` (alerta superadmin
--     vía D12 NotificationsService.dispatchToSuperadmins).
--     Indexado para auditoría rápida de tokens canjeados (cron de limpieza
--     futuro podría purgar > 30 días).
--
--  2. replaced_by_session_id (uuid, NULL, FK self ON DELETE SET NULL): la
--     sesión vieja (refresh canjeado) apunta a la nueva. Cadena de auditoría.
--     Si la sesión nueva se borra (cascade del user delete), esta queda
--     apuntando a NULL — no rompe la integridad por esa vía.
--
--  3. revoked_reason (varchar 50, NULL): razón canónica de revocación.
--     Valores: 'logout' | 'replay_detected' | 'manual_revoke' | 'expired'.
--     NULL si la sesión sigue activa o expiró por TTL sin acción.
--
-- Compat hacia atrás: las 3 columnas son NULL para sesiones existentes (no
-- romper datos pre-migración). En el peor caso, un refresh viejo se acepta
-- una vez tras la migración (used_at NULL); la próxima ronda detectará replay
-- si hay reuso. Aceptado en pre-producción (ADR-069).

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "replaced_by_session_id" UUID,
ADD COLUMN     "revoked_reason" VARCHAR(50),
ADD COLUMN     "used_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "sessions_used_at_idx" ON "sessions"("used_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_replaced_by_session_id_fkey" FOREIGN KEY ("replaced_by_session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
