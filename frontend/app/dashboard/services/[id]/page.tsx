/**
 * /dashboard/services/[id] — Sprint 13 §13.AUTH Fase E (Modelo A).
 * Server Component nativo. ADR-078 Amendment A1.
 *
 * Sprint 11 Fase 11.D (ADR-070 §"Patrón de página" + ADR-077 §1+§2):
 * una sola plantilla para TODOS los plugins. La UI ramifica por
 * `info.capabilities` — NUNCA por `service.provisioner_slug`.
 * SsoButton + ActionsBar son CC interactivos que invocan Server Actions.
 */

import Link from 'next/link';
import { Card, EmptyState } from '../../../components/ui';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';
import type { ServiceDetailResponse } from '../../../lib/api';
import {
  ActionsBar,
  MetricsBar,
  ServiceHeader,
  SsoButton,
} from '../../../_shared/services';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientServiceDetailPage({ params }: PageProps) {
  const { id } = await params;

  let data: ServiceDetailResponse | null = null;
  let errorMessage: string | null = null;
  try {
    data = await serverFetch<ServiceDetailResponse>(`/services/${id}`);
  } catch (err) {
    errorMessage =
      err instanceof ServerFetchError
        ? err.message
        : 'No se pudo cargar el servicio';
  }

  if (!data) {
    return (
      <EmptyState
        title="No se pudo cargar el servicio"
        description={errorMessage ?? 'El servicio no existe o no tienes acceso.'}
        action={
          <Link href="/dashboard/services" style={{ color: 'var(--brand-600)' }}>
            ← Volver al listado
          </Link>
        }
      />
    );
  }

  const { service, info } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link
        href="/dashboard/services"
        style={{
          color: 'var(--text-secondary)',
          fontSize: 13,
          textDecoration: 'none',
        }}
      >
        ← Mis servicios
      </Link>

      <Card>
        <ServiceHeader info={info} productName={service.product_name} />
      </Card>

      {info.metrics && <MetricsBar metrics={info.metrics} />}

      {/*
        SSO panel — solo si el plugin lo soporta para esta instancia
        (ADR-070 §B + ADR-077 §3 capability flag por instancia).
      */}
      {info.capabilities.hasSsoPanel && info.capabilities.panel_label && (
        <Card>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                Panel del proveedor
              </h2>
              <p
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 13,
                  marginTop: 4,
                }}
              >
                Accede al panel especializado para operaciones avanzadas
                (gestión de email, bases de datos, archivos…). La sesión se
                abre en una nueva pestaña con un token temporal y queda
                registrada en tu portal de transparencia.
              </p>
            </div>
            <SsoButton
              serviceId={service.id}
              panelLabel={info.capabilities.panel_label}
            />
          </div>
        </Card>
      )}

      <ActionsBar
        serviceId={service.id}
        actions={info.availableActions}
      />

      {/*
        Slot UI placeholder Sprint 22 Projects (`request_custom_development`).
        Sprint 11 deja la sección visible pero deshabilitada para que la
        UI quede preparada — Sprint 22 conectará el endpoint sin tocar
        este layout.
      */}
      <Card>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
          ¿Necesitas un desarrollo a medida?
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>
          Próximamente podrás solicitar un desarrollo personalizado vinculado
          a este servicio. (Función disponible cuando Sprint 22 Projects esté
          activo.)
        </p>
      </Card>

      <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
        Última lectura del proveedor:{' '}
        {new Date(info.fetchedAt).toLocaleString('es-ES')}
      </p>
    </div>
  );
}
