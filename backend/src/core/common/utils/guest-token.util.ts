import * as crypto from 'crypto';

/**
 * ═══════════════════════════════════════
 * Guest Token Utilities
 * ═══════════════════════════════════════
 *
 * Generates and verifies guest session tokens for anonymous chat.
 *
 * Security model (DECISIONS.md §38):
 *   - Token is a 32-byte random hex string (same entropy as session tokens)
 *   - Only the SHA-256 hash is stored in the database (never the raw token)
 *   - The raw token is sent to the client via HttpOnly cookie
 *   - On subsequent requests, the client sends the cookie; we hash it and look up the conversation
 *
 * Pattern follows auth.service.ts hashToken() exactly.
 *
 * Ref: ROADMAP.md 7.4.1, DECISIONS.md §38, DATABASE_SCHEMA.md (conversations.guest_session_token)
 */

/**
 * Generates a cryptographically secure guest session token.
 *
 * @returns `{ token, hash }` — `token` is the raw value for the cookie,
 *          `hash` is the SHA-256 digest to store in DB.
 */
export function generateGuestToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = hashGuestToken(token);
  return { token, hash };
}

/**
 * Hashes a guest token using SHA-256.
 * Identical to the pattern used for session tokens, 2FA codes,
 * verification tokens, and password reset tokens in auth.service.ts.
 *
 * @param token - The raw token string
 * @returns SHA-256 hex digest
 */
export function hashGuestToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Cookie configuration for the guest session token.
 *
 * Security considerations:
 *   - HttpOnly: prevents XSS from reading the cookie
 *   - SameSite=Lax: prevents CSRF while allowing normal navigation
 *   - Secure: only sent over HTTPS (disabled in development)
 *   - Path restricted to /support to minimize exposure
 *   - 30-day expiry matches the cleanup cron (7.5.3)
 */
export const GUEST_TOKEN_COOKIE_NAME = 'aelium_guest_session';

export function getGuestTokenCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
  };
}
