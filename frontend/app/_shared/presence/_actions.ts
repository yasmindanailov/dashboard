'use server';

import { serverFetch } from '../../lib/server-auth';

/* ═══════════════════════════════════════
   Server Action — presencia del staff (Rediseño UI F3·E8).
   Modelo A (ADR-078 A1): `serverFetch` inyecta el JWT httpOnly.
   ═══════════════════════════════════════ */

/**
 * Heartbeat de presencia: `POST /presence/heartbeat` (upsert `last_seen_at`).
 * Lo invoca `PresenceHeartbeat` periódicamente mientras el staff tiene la app
 * abierta. Best-effort: cualquier error se ignora (la presencia no es crítica).
 */
export async function sendHeartbeatAction(): Promise<void> {
  try {
    await serverFetch('/presence/heartbeat', { method: 'POST' });
  } catch {
    // fail-soft: la presencia es informativa, nunca bloquea la UI.
  }
}
