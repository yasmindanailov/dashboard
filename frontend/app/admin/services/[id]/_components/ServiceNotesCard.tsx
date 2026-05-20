/**
 * ServiceNotesCard — Sprint 15C.II Fase F.6 → F.12.5 (Amendment VIII).
 *
 * Server Component que renderiza el historial de notas operativas del servicio
 * (cancel/suspend/unsuspend, manual o auto): los `ClientNote` con
 * `source_system='service' AND source_id=:serviceId`. La vista federada por
 * cliente (`/admin/clients/[id]` → "Notas") usa el mismo dato sin filtrar.
 *
 * F.12.5 (Amendment VIII): migrado a `<SectionCard>` + tokens. El CTA "Ver
 * historial completo del cliente" se posiciona en el **slot de acciones** del
 * SectionCard con el **mismo estilo `.link`** (réplica de `ctaText`) que el CTA
 * "Ver historial completo" del tab Auditoría. Corrige los tokens inexistentes
 * (`--brand-600`/`--border-default`/`--surface-elevated`).
 *
 * Fail-soft: si el fetch falla, NO rompe la página (mensaje discreto).
 */

import Link from 'next/link';

import { SectionCard } from '../../../../components/ui';
import { serverFetch, ServerFetchError } from '../../../../lib/server-auth';
import type { ClientNote } from '../../../../lib/types';
import styles from './ServiceNotesCard.module.css';

/* Etiquetas locales del componente. Coherentes con `ClientNotesTab` —
   duplicación intencional porque los maps allá son client-side; aquí
   somos SC. Si crecen, extraer a un módulo compartido. */
const ACTION_LABELS: Record<string, string> = {
  'service.cancelled': 'Servicio cancelado',
  'service.suspended': 'Servicio suspendido',
  'service.unsuspended': 'Servicio reactivado',
  'service.auto_suspended_overdue': 'Suspendido por impago (auto)',
  'service.auto_unsuspended_overdue': 'Reactivado al pagar (auto)',
  manual_entry: 'Entrada manual',
};

interface ServiceNotesCardProps {
  serviceId: string;
  clientUserId: string;
}

export async function ServiceNotesCard({
  serviceId,
  clientUserId,
}: ServiceNotesCardProps) {
  let notes: ClientNote[] | null = null;
  let errorMessage: string | null = null;
  try {
    notes = await serverFetch<ClientNote[]>(
      `/admin/services/${serviceId}/notes`,
    );
  } catch (err) {
    errorMessage =
      err instanceof ServerFetchError
        ? err.message
        : 'No se pudieron cargar las notas del servicio.';
  }

  return (
    <SectionCard
      title="Notas operativas"
      subtitle="Razones humanas de cada cancel / suspend / reactivación de este servicio. Se crean automáticamente al ejecutar la acción desde el modal admin o al disparar el cron de billing."
      actions={
        <Link
          href={`/admin/clients/${clientUserId}?tab=notes`}
          className={styles.link}
        >
          Ver historial completo del cliente →
        </Link>
      }
    >
      {errorMessage && <p className={styles.muted}>{errorMessage}</p>}

      {notes !== null && notes.length === 0 && (
        <p className={styles.muted}>
          Aún no hay notas registradas para este servicio.
        </p>
      )}

      {notes !== null && notes.length > 0 && (
        <div className={styles.notesList}>
          {notes.map((note) => {
            const date = new Date(note.created_at);
            const dateStr = date.toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
            const timeStr = date.toLocaleTimeString('es-ES', {
              hour: '2-digit',
              minute: '2-digit',
            });
            const actionLabel = note.triggered_by_action
              ? (ACTION_LABELS[note.triggered_by_action] ??
                note.triggered_by_action)
              : null;
            return (
              <div
                key={note.id}
                className={`${styles.note} ${note.is_pinned ? styles.notePinned : ''}`}
              >
                <p className={styles.noteBody}>{note.body}</p>
                <div className={styles.noteMeta}>
                  <span className={styles.noteAuthor}>
                    {note.author_name ?? 'Desconocido'}
                  </span>
                  {actionLabel && (
                    <>
                      <span>·</span>
                      <span>{actionLabel}</span>
                    </>
                  )}
                  <span>·</span>
                  <span>
                    {dateStr} · {timeStr}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
