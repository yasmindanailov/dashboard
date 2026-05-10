'use client';

/**
 * CopyableId — Aelium Design System (Sprint 15C.II Fase C round 7).
 *
 * Componente canónico para mostrar UUIDs / IDs técnicos secundarios en
 * la UI admin. Estándar industria Stripe/Vercel admin: información
 * legible primero (nombre, email, domain), IDs en monospace pequeño
 * con click-to-copy + feedback toast. Evita la pollution visual de
 * UUIDs crudos sin contexto que reportó Yasmin en smoke real
 * 2026-05-10.
 *
 * Patrón compartido a futuras páginas admin (clients, products,
 * invoices) — vive en `components/ui/` para uso cross-feature.
 *
 * @example
 *   <CopyableId id={service.id} />
 *   <CopyableId id={service.user_id} truncate={8} />
 */

import { useState } from 'react';
import { useToast } from '../Toast';

export interface CopyableIdProps {
  /** El ID a mostrar y copiar al clipboard. */
  id: string;
  /**
   * Cuántos caracteres mostrar antes/después del ellipsis. Si se
   * omite, se muestra el ID entero. Default: 8 (típico para UUIDs:
   * `91c0e015-...-1d885fa278b8`).
   */
  truncate?: number;
  /** Etiqueta opcional para el toast de confirmación. Default "ID copiado". */
  label?: string;
}

export function CopyableId({
  id,
  truncate = 8,
  label = 'ID',
}: CopyableIdProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const display =
    truncate && id.length > truncate * 2 + 3
      ? `${id.slice(0, truncate)}…${id.slice(-truncate)}`
      : id;

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      toast('success', `${label} copiado al portapapeles`);
      // Reset feedback visual tras 2s.
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast(
        'error',
        'No se pudo copiar al portapapeles. Selecciona el ID y copia manualmente.',
      );
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      title={`Copiar: ${id}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        background: 'var(--surface-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        cursor: 'pointer',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 11,
        color: 'var(--text-secondary)',
        transition: 'background var(--transition-fast)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          'var(--surface-tertiary, var(--surface))';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          'var(--surface-secondary)';
      }}
    >
      <code style={{ background: 'transparent', padding: 0 }}>{display}</code>
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-label="Copiado">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Copiar">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}
