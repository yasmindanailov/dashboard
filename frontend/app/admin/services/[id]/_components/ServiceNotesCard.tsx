/**
 * ServiceNotesCard — Sprint 15C.II F.6 → F.12.5 → F4·U24 (réplica 1:1 de la tab
 * Notas del cliente).
 *
 * Server Component que fetcha las notas del servicio (`ClientNote` con
 * `source_system='service' AND source_id=:serviceId` — razones de
 * cancel/suspend/reactivación) y las pasa al cromo compartido `<NotesExplorer>`.
 *
 * Decisión Yasmin (F4·U24): la tab Notas del servicio usa el **mismo diseño**
 * que la tab Notas del cliente-detalle (`/admin/clients/[id]`) — cabecera +
 * chips de categoría + filtro de origen + timeline — en modo **read-only** (el
 * composer de nota manual sigue diferido). Fail-soft: si el fetch falla, NO
 * rompe la página.
 */

import Link from 'next/link';

import { serverFetch, ServerFetchError } from '../../../../lib/server-auth';
import type { ClientNote } from '../../../../lib/types';
import { NotesExplorer } from '../../../../_shared/notes/NotesExplorer';
import { NOTE_SOURCE_FILTER_OPTIONS } from '../../../../_shared/notes/note-meta';
import styles from './ServiceNotesCard.module.css';

interface ServiceNotesCardProps {
  serviceId: string;
  clientUserId: string;
}

export async function ServiceNotesCard({
  serviceId,
  clientUserId,
}: ServiceNotesCardProps) {
  let notes: ClientNote[] = [];
  let errorMessage: string | null = null;
  try {
    notes =
      (await serverFetch<ClientNote[]>(
        `/admin/services/${serviceId}/notes`,
      )) ?? [];
  } catch (err) {
    errorMessage =
      err instanceof ServerFetchError
        ? err.message
        : 'No se pudieron cargar las notas del servicio.';
  }

  if (errorMessage) {
    return <p className={styles.muted}>{errorMessage}</p>;
  }

  return (
    <NotesExplorer
      notes={notes}
      title="Notas internas"
      summarySuffix="Solo el equipo de Aelium ve estas notas."
      sourceOptions={NOTE_SOURCE_FILTER_OPTIONS}
      emptyLabel="Aún no hay notas registradas para este servicio."
      headerAction={
        <Link
          href={`/admin/clients/${clientUserId}?tab=notes`}
          className={styles.link}
        >
          Ver historial completo del cliente →
        </Link>
      }
    />
  );
}
