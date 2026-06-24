/**
 * /dashboard/domains/[id] — Detalle + gestión de un dominio — Sprint 15D F.4.
 *
 * Server Component (Modelo A): carga el detalle del service vía
 * `GET /services/:id` (ownership server-side). Los dominios son services; el
 * estado de gestión rico vive en `info.domain` (DomainInfo, ADR-077 A11,
 * capability-driven por presencia). La gestión (NS/privacy/lock/auth-code) reusa
 * el endpoint genérico `POST /services/:id/actions/:slug` (handlers F.1) vía la
 * isla cliente `<DomainManagement>`.
 */

import Link from 'next/link';

import { AlertBanner, Card, ListPage } from '../../../components/ui';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';
import type { ServiceDetailResponse } from '../../../lib/api';
import { SERVICE_STATUS_LABEL } from '../../../_shared/services';
import DomainManagement from './_components/DomainManagement';

interface PageProps {
  params: Promise<{ id: string }>;
}

function mapStatusKey(status: string): keyof typeof SERVICE_STATUS_LABEL {
  switch (status) {
    case 'active':
    case 'pending':
    case 'suspended':
    case 'expired':
    case 'failed':
    case 'cancelled':
      return status;
    case 'provisioning':
      return 'pending';
    case 'terminated':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const LIFECYCLE_LABEL: Record<string, string> = {
  active: 'Activo',
  expired: 'Expirado',
  redemption: 'En redención',
  pending_delete: 'Pendiente de borrado',
};

export default async function DomainDetailPage({ params }: PageProps) {
  const { id } = await params;

  let detail: ServiceDetailResponse | null = null;
  let errorMessage: string | null = null;
  try {
    detail = await serverFetch<ServiceDetailResponse>(`/services/${id}`);
  } catch (err) {
    errorMessage =
      err instanceof ServerFetchError
        ? err.message
        : 'No se pudo cargar el dominio';
  }

  if (!detail) {
    return (
      <ListPage title="Dominio" subtitle="">
        <AlertBanner variant="danger">
          {errorMessage ?? 'Dominio no encontrado.'}{' '}
          <Link href="/dashboard/domains" style={{ fontWeight: 600 }}>
            Volver a mis dominios
          </Link>
        </AlertBanner>
      </ListPage>
    );
  }

  const { service, info } = detail;
  const fqdn = service.domain ?? service.product_name;
  const statusKey = mapStatusKey(service.status);
  const domain = info.domain;
  const actionSlugs = info.availableActions.map((a) => a.slug);

  return (
    <ListPage title={fqdn} subtitle={SERVICE_STATUS_LABEL[statusKey]}>
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}
      >
        {!domain && (
          <AlertBanner variant="info">
            Este dominio está pendiente de registro. La gestión (nameservers,
            privacidad, bloqueo) estará disponible cuando el registro se complete.
          </AlertBanner>
        )}

        {/* Recovery hints de dominio (15D.G·2): expirado → renovar; redención → restaurar. */}
        {info.recoveryHint === 'renew' && (
          <AlertBanner variant="warning">
            Tu dominio ha <strong>expirado</strong> pero aún puedes renovarlo.
            Renuévalo desde{' '}
            <Link href="/dashboard/billing" style={{ fontWeight: 600 }}>
              Mis facturas
            </Link>{' '}
            para no perderlo.
          </AlertBanner>
        )}
        {info.recoveryHint === 'restore' && (
          <AlertBanner variant="danger">
            Tu dominio está <strong>en redención</strong>. Restaurarlo requiere
            una tarifa especial —{' '}
            <Link href="/dashboard/support" style={{ fontWeight: 600 }}>
              contacta con soporte
            </Link>
            .
          </AlertBanner>
        )}

        {domain && (
          <Card>
            <div style={{ padding: 20 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>
                Resumen
              </h2>
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 1fr',
                  rowGap: 10,
                  columnGap: 16,
                  margin: 0,
                  fontSize: 14,
                }}
              >
                <Row label="Estado del dominio">
                  {LIFECYCLE_LABEL[domain.lifecycle] ?? domain.lifecycle}
                </Row>
                <Row label="Caduca">{formatDate(domain.expiresAt)}</Row>
                <Row label="Nameservers">
                  {domain.nameservers.length > 0
                    ? domain.nameservers.join(', ')
                    : '—'}
                </Row>
                <Row label="Privacidad WHOIS">
                  {domain.whoisPrivacy ? 'Activada' : 'Desactivada'}
                </Row>
                <Row label="Bloqueo de transferencia">
                  {domain.registrarLock ? 'Bloqueado' : 'Desbloqueado'}
                </Row>
              </dl>
            </div>
          </Card>
        )}

        {domain && service.status === 'active' && (
          <DomainManagement
            serviceId={service.id}
            domain={domain}
            actionSlugs={actionSlugs}
          />
        )}
      </div>
    </ListPage>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: 'var(--text-tertiary)' }}>{label}</dt>
      <dd style={{ margin: 0, fontWeight: 500 }}>{children}</dd>
    </>
  );
}
