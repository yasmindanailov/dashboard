'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { retryJobAction } from './_actions';

const SELECT_STYLE: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--surface)',
};

const BTN_STYLE: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--surface)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
};

export function FailedJobsFilters({
  queue,
  status,
}: {
  queue: string;
  status: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function updateFilter(key: 'queue' | 'status', value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page');
    startTransition(() => router.push(`/admin/jobs/failed?${params.toString()}`));
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        marginBottom: 16,
        flexWrap: 'wrap',
        opacity: pending ? 0.5 : 1,
        transition: 'opacity 120ms',
      }}
    >
      <select
        value={queue}
        onChange={(e) => updateFilter('queue', e.target.value)}
        style={SELECT_STYLE}
      >
        <option value="">Todas las colas</option>
        <option value="pdf-generation">pdf-generation</option>
        <option value="outbox-dispatch">outbox-dispatch</option>
        <option value="notifications-dispatch">notifications-dispatch</option>
      </select>

      <select
        value={status}
        onChange={(e) => updateFilter('status', e.target.value)}
        style={SELECT_STYLE}
      >
        <option value="">Todos los estados</option>
        <option value="failed">Fallido</option>
        <option value="retrying">Reintentando</option>
        <option value="resolved">Resuelto</option>
      </select>
    </div>
  );
}

export function RetryButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (
      !window.confirm(
        '¿Reencolar este job? Se intentará de nuevo con 5 reintentos.',
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await retryJobAction(id);
      if (!result.ok) setError(result.error ?? 'Error al reintentar');
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        style={{ ...BTN_STYLE, cursor: pending ? 'wait' : 'pointer' }}
      >
        {pending ? 'Reintentando…' : 'Reintentar'}
      </button>
      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 11, marginTop: 4 }}>{error}</p>
      )}
    </>
  );
}

export function FailedJobsPagination({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function go(toPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(toPage));
    startTransition(() => router.push(`/admin/jobs/failed?${params.toString()}`));
  }

  if (totalPages <= 1) return null;

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        marginTop: 16,
        alignItems: 'center',
        opacity: pending ? 0.5 : 1,
      }}
    >
      <button
        disabled={page === 1 || pending}
        onClick={() => go(page - 1)}
        style={BTN_STYLE}
      >
        ← Anterior
      </button>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        Página {page} / {totalPages}
      </span>
      <button
        disabled={page >= totalPages || pending}
        onClick={() => go(page + 1)}
        style={BTN_STYLE}
      >
        Siguiente →
      </button>
    </div>
  );
}
