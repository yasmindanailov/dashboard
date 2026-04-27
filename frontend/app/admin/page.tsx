'use client';

import Link from 'next/link';

/* ═══════════════════════════════════════
   /admin — landing del árbol staff (Sprint 9 Fase F).
   Lista las herramientas operativas disponibles.
   Sprint 9.6 ampliará con módulos migrados (clients, tasks, settings).
   ═══════════════════════════════════════ */

export default function AdminHomePage() {
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        Panel de operaciones
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
        Herramientas internas para diagnóstico, monitoring y gestión.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        <Link
          href="/admin/error-log"
          style={{
            display: 'block',
            padding: 20,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Error Log</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            Errores operativos del sistema. Filtrar, marcar como resueltos.
          </p>
        </Link>

        <Link
          href="/admin/jobs/failed"
          style={{
            display: 'block',
            padding: 20,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Jobs en DLQ</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            Jobs BullMQ que agotaron retries. Reintentar manualmente.
          </p>
        </Link>
      </div>
    </div>
  );
}
