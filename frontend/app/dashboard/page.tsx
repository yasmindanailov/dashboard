'use client';

import { useAuth } from '../lib/auth-context';

export default function DashboardPage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="max-w-4xl">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
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
    </div>
  );
}
