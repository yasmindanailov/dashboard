'use client';

import { useEffect, useState } from 'react';
import { authApi } from '../lib/api';

interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: { slug: string; name: string };
  last_login_at: string;
}

export default function DashboardPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      window.location.href = '/';
      return;
    }

    authApi.me(token)
      .then((data) => setUser(data as UserProfile))
      .catch(() => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/';
      })
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    const token = localStorage.getItem('access_token');
    if (token) {
      try { await authApi.logout(token); } catch { /* ignore */ }
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.location.href = '/';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface-secondary)' }}>
        <div className="flex items-center gap-3">
          <svg className="animate-spin h-6 w-6" style={{ color: 'var(--brand)' }} viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span style={{ color: 'var(--text-secondary)' }}>Cargando...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-secondary)' }}>
      {/* Top bar */}
      <header
        className="h-16 flex items-center justify-between px-6"
        style={{ background: 'var(--surface-primary)', borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          aelium
        </span>
        <div className="flex items-center gap-4">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {user.first_name} {user.last_name}
          </span>
          <span
            className="text-xs px-2 py-1 rounded-full font-medium"
            style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}
          >
            {user.role.name}
          </span>
          <button
            onClick={handleLogout}
            className="text-sm font-medium transition-colors duration-200 cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="p-8 max-w-4xl mx-auto">
        <div
          className="rounded-2xl p-8"
          style={{ background: 'var(--surface-primary)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border)' }}
        >
          <h1 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            Bienvenido, {user.first_name} 👋
          </h1>
          <p className="text-base mb-6" style={{ color: 'var(--text-secondary)' }}>
            Has iniciado sesión correctamente. El dashboard se construirá en los próximos sprints.
          </p>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="p-4 rounded-lg" style={{ background: 'var(--surface-secondary)' }}>
              <span className="block mb-1" style={{ color: 'var(--text-tertiary)' }}>Email</span>
              <span style={{ color: 'var(--text-primary)' }}>{user.email}</span>
            </div>
            <div className="p-4 rounded-lg" style={{ background: 'var(--surface-secondary)' }}>
              <span className="block mb-1" style={{ color: 'var(--text-tertiary)' }}>Rol</span>
              <span style={{ color: 'var(--text-primary)' }}>{user.role.name}</span>
            </div>
            <div className="p-4 rounded-lg" style={{ background: 'var(--surface-secondary)' }}>
              <span className="block mb-1" style={{ color: 'var(--text-tertiary)' }}>ID</span>
              <span className="font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{user.id}</span>
            </div>
            <div className="p-4 rounded-lg" style={{ background: 'var(--surface-secondary)' }}>
              <span className="block mb-1" style={{ color: 'var(--text-tertiary)' }}>Último acceso</span>
              <span style={{ color: 'var(--text-primary)' }}>
                {user.last_login_at ? new Date(user.last_login_at).toLocaleString('es-ES') : 'Primera vez'}
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
