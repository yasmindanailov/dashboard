'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { authApi, type LoginResponse } from './api';

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: { slug: string; name: string };
  last_login_at: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (res: LoginResponse) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/', '/register', '/forgot-password', '/reset-password', '/verify-email'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const router = useRouter();
  const pathname = usePathname();

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  // Schedule token refresh before expiration.
  // Usa ref para romper la auto-referencia (la recursión `scheduleRefresh →
  // setTimeout → scheduleRefresh` confunde al React Compiler de React 19).
  const scheduleRefreshRef = useRef<(expiresIn: number) => void>(() => {});
  const scheduleRefresh = useCallback(
    (expiresIn: number) => scheduleRefreshRef.current(expiresIn),
    [],
  );

  useEffect(() => {
    scheduleRefreshRef.current = (expiresIn: number) => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

      // Refresh 60 seconds before expiration (or at half-life if < 2 min)
      const refreshMs =
        expiresIn > 120 ? (expiresIn - 60) * 1000 : (expiresIn / 2) * 1000;

      refreshTimerRef.current = setTimeout(async () => {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) return;

        try {
          const res = await authApi.refresh(refreshToken);
          if (res.access_token) {
            localStorage.setItem('access_token', res.access_token);
            // Recursión vía ref → no atraviesa el analyzer del compiler.
            scheduleRefreshRef.current(res.expires_in || 900);
          }
        } catch (err) {
          console.warn('[Auth] 401 interceptor refresh failed:', err);
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          setUser(null);
          router.push('/');
        }
      }, refreshMs);
    };
  }, [router]);

  // Store tokens after login and set user immediately
  const login = useCallback((res: LoginResponse) => {
    if (res.access_token) {
      localStorage.setItem('access_token', res.access_token);
      if (res.refresh_token) {
        localStorage.setItem('refresh_token', res.refresh_token);
      }
      if (res.user) {
        setUser(res.user as User);
      }
      scheduleRefresh(res.expires_in || 900);
    }
  }, [scheduleRefresh]);

  // Logout
  const logout = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (token) {
      try { await authApi.logout(token); } catch (err) { console.warn('[Auth] logout notification failed:', err); }
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    setUser(null);
    router.push('/');
  }, [router]);

  // On mount: check if user is authenticated
  useEffect(() => {
    const token = localStorage.getItem('access_token');

    if (!token) {
      setIsLoading(false);
      // Redirect to login if on protected route
      if (!isPublicRoute) {
        router.replace('/');
      }
      return;
    }

    // Auto-redirect: if on public route with valid token, go to dashboard
    authApi.me(token)
      .then((data) => {
        setUser(data as User);
        // Schedule refresh based on default 15 min
        scheduleRefresh(900);
        // If on a public route (login, register), redirect to dashboard
        if (isPublicRoute) {
          router.replace('/dashboard');
        }
      })
      .catch(async () => {
        // Access token expired — try refresh
        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
          try {
            const res = await authApi.refresh(refreshToken);
            if (res.access_token) {
              localStorage.setItem('access_token', res.access_token);
              const userData = await authApi.me(res.access_token);
              setUser(userData as User);
              scheduleRefresh(res.expires_in || 900);
              if (isPublicRoute) {
                router.replace('/dashboard');
              }
              return;
            }
          } catch (err) { console.warn('[Auth] refresh failed:', err); }
        }
        // Both tokens invalid
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        setUser(null);
        if (!isPublicRoute) {
          router.replace('/');
        }
      })
      .finally(() => setIsLoading(false));

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
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
      login: () => {},
      logout: async () => {},
    }
  );
}
