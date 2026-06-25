import {
  requireRole,
  serverFetch,
  ServerFetchError,
} from '../../lib/server-auth';
import { AlertBanner } from '../../components/ui';
import DeletionRequestsManager, {
  type DeletionRequestRow,
} from './_components/DeletionRequestsManager';

/**
 * /admin/account-deletion — revisión de solicitudes de borrado de cuenta
 * (derecho al olvido RGPD, audit 2026-06-25 GL-5 / H3b.2). Solo superadmin
 * (defense in depth con el CASL del backend, `Subject.AccountDeletion`).
 */
export default async function AdminAccountDeletionPage() {
  await requireRole(['superadmin']);

  let requests: DeletionRequestRow[] = [];
  let error: string | null = null;
  try {
    requests = await serverFetch<DeletionRequestRow[]>(
      '/admin/account-deletion-requests?status=pending',
    );
  } catch (err) {
    error =
      err instanceof ServerFetchError
        ? err.message
        : 'No se pudieron cargar las solicitudes.';
  }

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
          Solicitudes de borrado de cuenta
        </h1>
        <p
          style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 8 }}
        >
          Revisa y ejecuta las solicitudes de los clientes. «Anonimizar» es
          irreversible y solo está disponible si el cliente no tiene servicios
          vivos ni pagos pendientes. Las facturas se conservan por obligación
          legal (10 años).
        </p>
      </header>

      {error && (
        <div style={{ marginBottom: 16 }}>
          <AlertBanner variant="danger">{error}</AlertBanner>
        </div>
      )}

      <DeletionRequestsManager requests={requests} />
    </div>
  );
}
