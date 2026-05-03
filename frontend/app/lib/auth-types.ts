/**
 * Tipos compartidos auth — Sprint 13 §13.AUTH Fase E.
 *
 * Vive fuera de `server-auth.ts` (marcado `'server-only'`) para que
 * Client Components puedan importar las shapes sin romper el bundler.
 * Ref ADR-078 Amendment A1 (Modelo A — user hidratado SC + propagado a CC).
 */

export interface ServerSessionUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  email_verified_at: string | null;
  language: string;
  timezone: string;
  last_login_at: string | null;
  avatar_url: string | null;
  role: { slug: string; name: string };
}

export interface ServerSession {
  user: ServerSessionUser;
  accessToken: string;
}
