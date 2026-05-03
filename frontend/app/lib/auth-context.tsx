'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { logoutAction } from './auth-actions';
import type { ServerSessionUser } from './auth-types';

/* ═══════════════════════════════════════════════════════════
   AuthContext — Sprint 13 §13.AUTH Fase E (Modelo A).

   Doctrina ADR-078 Amendment A1:
   - El `user` lo hidrata server-side el SC `app/layout.tsx` desde la
     cookie httpOnly via `getServerSession()`, y lo pasa al provider
     como prop `initialUser`.
   - El cliente NUNCA guarda tokens. NO hay localStorage. NO hay
     scheduling de refresh (lo gestiona `refreshAction` server-side
     bajo demanda cuando `serverFetch` recibe 401).
   - `logout` invoca el Server Action `logoutAction()` que limpia
     cookies + `redirect('/')`.

   Backward-compat:
   - `isLoading` se mantiene por compat (consumido por
     `app/admin/layout.tsx` y `app/dashboard/layout.tsx`); en Modelo A
     siempre es `false` porque la sesión ya está hidratada al render.
     Los layouts admin/dashboard se migrarán a SC en Batch 3.
   - `isAuthenticated` derivado de `!!user`.

   API removida frente al modelo viejo:
   - `login(res)` → ya no existe. Las pages auth-públicas usan Server
     Actions (`loginAction`, `verify2faAction`) que setean cookies y
     hacen redirect server-side; no hay nada que hidratar client-side.
   ═══════════════════════════════════════════════════════════ */

interface AuthContextType {
  user: ServerSessionUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  initialUser: ServerSessionUser | null;
  children: ReactNode;
}

export function AuthProvider({ initialUser, children }: AuthProviderProps) {
  const logout = useCallback(async () => {
    /*
     * `logoutAction` server-side limpia cookies + redirect('/').
     * En CC, llamar el Server Action triggerea el round-trip y la
     * navegación posterior. No es necesario tocar router cliente
     * — Next.js maneja la redirección.
     */
    await logoutAction();
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user: initialUser,
      isLoading: false,
      isAuthenticated: !!initialUser,
      logout,
    }),
    [initialUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/**
 * Variante segura para componentes que pueden montarse fuera de
 * AuthProvider (ej. ChatWidget en la landing pública). Devuelve un
 * fallback con `user: null` en lugar de lanzar.
 */
export function useAuthOptional(): AuthContextType {
  const ctx = useContext(AuthContext);
  return (
    ctx ?? {
      user: null,
      isLoading: false,
      isAuthenticated: false,
      logout: async () => {},
    }
  );
}
