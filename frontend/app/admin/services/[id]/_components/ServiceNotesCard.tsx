/**
 * ServiceNotesCard — Sprint 15C.II F.6 → F.12.5 → F4·U24 (reskin 1:1).
 *
 * Server Component que renderiza el historial de notas del servicio: los
 * `ClientNote` con `source_system='service' AND source_id=:serviceId` (razones
 * de cancel/suspend/reactivación, manual o auto). La vista federada por cliente
 * (`/admin/clients/[id]` → "Notas") usa el mismo dato sin filtrar.
 *
 * F4·U24 (decisión Yasmin): reutiliza el MISMO diseño de notas del cliente-
 * detalle vía la primitiva compartida `<NotesTimeline>` (sin duplicar). Aquí es
 * read-only (sin fijar); el composer de nota manual queda diferido (sin endpoint
 * POST). Fail-soft: si el fetch falla, NO rompe la página.
 */

import Link from 'next/link';

import { Badge } from '../../../../components/ui';
import { serverFetch, ServerFetchError } from '../../../../lib/server-auth';
import type { ClientNote } from '../../../../lib/types';
import { NotesTimeline } from '../../../../_shared/notes/NotesTimeline';
import styles from './ServiceNotesCard.module.css';

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

  const sorted = notes
    ? [...notes].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
    : [];

  return (
    <div>
      <div className={styles.header}>
        <h2 className={styles.title}>Notas internas</h2>
        {notes !== null && <Badge variant="neutral">{notes.length}</Badge>}
        <Link
          href={`/admin/clients/${clientUserId}?tab=notes`}
          className={styles.link}
        >
          Ver historial completo del cliente →
        </Link>
      </div>

      {errorMessage && <p className={styles.muted}>{errorMessage}</p>}

      {notes !== null && notes.length === 0 && (
        <p className={styles.muted}>
          Aún no hay notas registradas para este servicio.
        </p>
      )}

      {sorted.length > 0 && <NotesTimeline notes={sorted} />}
    </div>
  );
}
