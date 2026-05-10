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
import {
  getServerSession,
  serverFetch,
  ServerFetchError,
} from '../../../lib/server-auth';
import type { ServiceDetailResponse } from '../../../lib/api';
import { isStaffRole } from '../../../lib/portal';
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

  // Sprint 15C Fase 15C.E.2 — derivar isAdmin server-side (set canónico
  // que coincide con `provisioning.controller.ts` ADMIN_ROLES) para
  // filtrar `availableActions.adminOnly` en `ActionsBar`. Esta página
  // sirve principalmente al cliente, pero los staff que la abren ven
  // todos los botones (incluidos los admin-only del plugin enhance_cp:
  // change_package, force_resync, list_available_plans).
  const session = await getServerSession();
  const isAdmin = isStaffRole(session?.user.role.slug);

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

      {info.metrics && (
        <MetricsBar
          metrics={info.metrics}
          serviceId={service.id}
          isAdmin={false}
        />
      )}

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
        isAdmin={isAdmin}
      />

      {/*
        Sprint 15C Fase 15C.G — link a la sub-página de gestión DNS.
        Solo se renderiza si el plugin del service declara
        `has_dns_management=true` (ADR-082 §3 + ADR-077 Amendment A1).
        El SC `/dashboard/services/[id]/dns/page.tsx` revalida la
        capability defensivamente + invoca al resolver canónico que
        decide entre `<DnsRecordsManager>` y `<DnsExternallyBanner>`.
      */}
      {info.capabilities.has_dns_management && (
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
                DNS de tu dominio
              </h2>
              <p
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 13,
                  marginTop: 4,
                }}
              >
                Crea, edita o elimina registros DNS (A, AAAA, CNAME, MX, TXT,
                SRV, CAA) de la zona autoritativa gestionada por Aelium. Los
                cambios pueden tardar minutos en propagarse.
              </p>
            </div>
            <Link
              href={`/dashboard/services/${service.id}/dns`}
              style={{
                padding: '8px 16px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-primary)',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              Gestionar DNS →
            </Link>
          </div>
        </Card>
      )}

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
