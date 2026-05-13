/**
 * ServiceNotesCard — Sprint 15C.II Fase F.6 (dossier §F.6.3).
 *
 * Server Component que renderiza el historial de notas operativas del
 * servicio (cancel/suspend/unsuspend, manual o auto). Es la vista por
 * servicio de los `ClientNote` con `source_system='service' AND
 * source_id=:serviceId`. La vista federada por cliente
 * (`/admin/clients/[id]` → "Notas") usa el mismo dato pero sin filtrar por
 * servicio + con filtros adicionales (categoría / sistema / fijadas).
 *
 * Fail-soft: si el fetch falla, NO rompe la página — un mensaje discreto
 * indica que las notas no se pudieron cargar (el resto del detalle del
 * servicio sigue siendo útil para el admin).
 */

import { Card } from '../../../../components/ui';
import { serverFetch, ServerFetchError } from '../../../../lib/server-auth';
import type { ClientNote } from '../../../../lib/types';

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
    <Card>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            Notas operativas
          </h2>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: 13,
              marginTop: 4,
            }}
          >
            Razones humanas de cada cancel / suspend / reactivación de este
            servicio. Se crean automáticamente al ejecutar la acción desde el
            modal admin o al disparar el cron de billing.
          </p>
        </div>
        <a
          href={`/admin/clients/${clientUserId}?tab=notes`}
          style={{
            color: 'var(--brand-600)',
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Ver historial completo del cliente →
        </a>
      </div>

      {errorMessage && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-tertiary)' }}>
          {errorMessage}
        </p>
      )}

      {notes !== null && notes.length === 0 && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-tertiary)' }}>
          Aún no hay notas registradas para este servicio.
        </p>
      )}

      {notes !== null && notes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                style={{
                  border: '1px solid var(--border-default)',
                  borderRadius: 6,
                  padding: 12,
                  background: note.is_pinned
                    ? 'var(--surface-elevated)'
                    : 'transparent',
                }}
              >
                <p
                  style={{
                    margin: '0 0 6px',
                    fontSize: 14,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {note.body}
                </p>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    fontSize: 12,
                    color: 'var(--text-tertiary)',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>
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
    </Card>
  );
}
