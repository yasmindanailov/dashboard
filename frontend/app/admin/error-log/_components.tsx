'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { resolveErrorAction } from './_actions';

/* ═══════════════════════════════════════
   Client islands — /admin/error-log.

   `ErrorLogFilters` reescribe la URL (searchParams) para que el SC
   padre re-renderice con los nuevos filtros. Cero useEffect+fetch.

   `ResolveButton` invoca el Server Action `resolveErrorAction` que
   llama al backend + `revalidatePath('/admin/error-log')`. El SC
   recarga server-side el listado.
   ═══════════════════════════════════════ */

const SELECT_STYLE: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--surface)',
};

export function ErrorLogFilters({
  level,
  resolved,
}: {
  level: string;
  resolved: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function updateFilter(key: 'level' | 'resolved', value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    /* Cualquier cambio de filtro vuelve a la página 1. */
    params.delete('page');
    startTransition(() => router.push(`/admin/error-log?${params.toString()}`));
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
        value={level}
        onChange={(e) => updateFilter('level', e.target.value)}
        style={SELECT_STYLE}
      >
        <option value="">Todos los niveles</option>
        <option value="error">error</option>
        <option value="warn">warn</option>
        <option value="fatal">fatal</option>
      </select>

      <select
        value={resolved}
        onChange={(e) => updateFilter('resolved', e.target.value)}
        style={SELECT_STYLE}
      >
        <option value="">Todos</option>
        <option value="false">Sin resolver</option>
        <option value="true">Resueltos</option>
      </select>
    </div>
  );
}

export function ResolveButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await resolveErrorAction(id);
      if (!result.ok) setError(result.error ?? 'Error al resolver');
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        style={{
          padding: '6px 12px',
          fontSize: 12,
          border: '1px solid var(--border)',
          borderRadius: 6,
          background: 'var(--surface)',
          color: 'var(--text-primary)',
          cursor: pending ? 'wait' : 'pointer',
        }}
      >
        {pending ? 'Resolviendo…' : 'Marcar resuelto'}
      </button>
      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 11, marginTop: 4 }}>{error}</p>
      )}
    </>
  );
}

export function PaginationLink({
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
    startTransition(() => router.push(`/admin/error-log?${params.toString()}`));
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
        style={btnStyle}
      >
        ← Anterior
      </button>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        Página {page} / {totalPages}
      </span>
      <button
        disabled={page >= totalPages || pending}
        onClick={() => go(page + 1)}
        style={btnStyle}
      >
        Siguiente →
      </button>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--surface)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
};
