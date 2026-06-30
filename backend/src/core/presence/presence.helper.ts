/* ═══════════════════════════════════════
   presence.helper — Rediseño UI · F3·E8 (presencia de staff)
   Estado de presencia (online/away/offline) DERIVADO de la frescura de
   `last_seen_at` (lo actualiza el heartbeat). Sin cron de expiración: se
   calcula al leer. Reutilizable por Support Inside ("tu técnico") y el
   dashboard ejecutivo E7 ("carga del equipo"). Pura y determinista.
   ═══════════════════════════════════════ */

export type PresenceStatus = 'online' | 'away' | 'offline';

/** Visto en los últimos 5 min → online. */
export const PRESENCE_ONLINE_MS = 5 * 60_000;
/** Visto en los últimos 15 min → away; más allá → offline. */
export const PRESENCE_AWAY_MS = 15 * 60_000;

/**
 * Deriva el estado de presencia a partir del último heartbeat.
 * `null` (nunca visto) → offline.
 */
export function derivePresence(
  lastSeenAt: Date | null | undefined,
  now: Date,
): PresenceStatus {
  if (!lastSeenAt) return 'offline';
  const elapsed = now.getTime() - lastSeenAt.getTime();
  if (elapsed <= PRESENCE_ONLINE_MS) return 'online';
  if (elapsed <= PRESENCE_AWAY_MS) return 'away';
  return 'offline';
}
