'use client';

/**
 * ═══════════════════════════════════════════════════════════════
 * NoPermission — 403 Component
 * ═══════════════════════════════════════════════════════════════
 *
 * Shown when a user navigates to a route they don't have access to.
 * Premium design consistent with Aelium's visual identity.
 */

import Link from 'next/link';

export default function NoPermission() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div
        className="text-center max-w-md mx-auto p-10 rounded-2xl"
        style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Icon */}
        <div
          className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center"
          style={{ background: 'var(--brand-light)' }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--brand)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        {/* Title */}
        <h2
          className="text-xl font-semibold mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          Sin acceso
        </h2>

        {/* Description */}
        <p
          className="text-sm mb-8 leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          No tienes permisos para acceder a esta sección.
          Si crees que es un error, contacta con tu administrador.
        </p>

        {/* Back button */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all duration-200"
          style={{
            background: 'var(--brand)',
            boxShadow: 'var(--shadow-brand)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--brand-hover)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--brand)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Volver al dashboard
        </Link>
      </div>
    </div>
  );
}
