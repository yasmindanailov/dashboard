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
import { AlertBanner, Card, EmptyState } from '../../../components/ui';
import { t } from '../../../_shared/i18n';
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

  // Sprint 15C.II Fase C round 4 (smoke real Yasmin 2026-05-10):
  // detectar terminal ANTES de drift. Si el cliente abre la página de
  // un service `cancelled` / `terminated`, debe ver un mensaje empático
  // explícito + ocultar TODO lo operativo (SSO, DNS, métricas, etc.).
  // Mostrar drift sobre service terminal sería engañoso (el service
  // YA NO opera, no es un drift recuperable).
  const isTerminal =
    service.status === 'cancelled' || service.status === 'terminated';

  // Sprint 15C.II Fase C (UI_SPEC §4.13 + ADR-083 Amendment A4.3): cuando
  // el plugin reporta drift (`status` ∈ {`unknown`, `failed`}), las
  // acciones que dependen de metadata externa (SSO al panel del proveedor,
  // gestión DNS) producen errores `action.provider_error` si el cliente
  // las dispara — la heurística canónica plugin-agnostic (cero `if
  // (provisioner === 'X')`, R-070) es ocultarlas para no atrapar al
  // cliente en un loop de errores. El admin sí mantiene visibilidad
  // completa en su página `/admin/services/[id]` para diagnosticar.
  const isDrift =
    !isTerminal && (info.status === 'unknown' || info.status === 'failed');

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
        <ServiceHeader
          info={info}
          productName={service.product_name}
          isAdmin={false}
        />
      </Card>

      {/*
        Sprint 15C.II Fase C round 4 (smoke real Yasmin 2026-05-10):
        si service terminal, banner empático arriba de "Detalles" +
        ocultar TODO lo operativo (SSO, DNS, métricas, ActionsBar).
        El cliente solo ve: identidad del service + cancelled banner +
        card "¿Necesitas desarrollo a medida?" abajo (siempre visible).
        UI_SPEC §1.2 P5 voz Aelium — sin tecnicismos al cliente.
      */}
      {isTerminal && (
        <AlertBanner
          variant="info"
          title={t('service.terminal.cancelled.client.title')}
        >
          <p style={{ margin: 0, fontSize: 13 }}>
            {t('service.terminal.cancelled.client.body')}
          </p>
          {service.cancelled_at && (
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}
            >
              Cancelado el{' '}
              {new Date(service.cancelled_at).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          )}
        </AlertBanner>
      )}

      {/*
        Sprint 15C.II Fase B fix-up round 3 (2026-05-10): card "Detalles
        del servicio" canónica SIEMPRE visible al cliente — independiente
        de si el plugin reporta drift / unknown / failed. Materializa la
        garantía de que el cliente nunca queda sin información útil
        (smoke real Yasmin reportó páginas vacías al detectar drift).
      */}
      <Card>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 12 }}>
          Detalles del servicio
        </h2>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'max-content 1fr',
            gap: '6px 16px',
            margin: 0,
            fontSize: 13,
          }}
        >
          {service.provisioner_slug && (
            <>
              <dt style={{ color: 'var(--text-secondary)' }}>Plan</dt>
              <dd style={{ margin: 0 }}>{service.product_name}</dd>
            </>
          )}
          <dt style={{ color: 'var(--text-secondary)' }}>Estado de tu servicio</dt>
          <dd style={{ margin: 0, textTransform: 'capitalize' }}>
            {service.status}
          </dd>
          <dt style={{ color: 'var(--text-secondary)' }}>Contratado el</dt>
          <dd style={{ margin: 0 }}>
            {new Date(service.created_at).toLocaleDateString('es-ES', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
          </dd>
        </dl>
      </Card>

      {/*
        MetricsBar visible SI:
          - service NO terminal (ya no opera contra el proveedor → métricas
            no aplican), Y
          - plugin declara `has_metrics: true` (capability flag canónico
            ADR-077 §3 — Sprint 15C.II Fase C round 5 smoke real Yasmin
            2026-05-10). Plugins triviales `internal` + `manual` y
            futuros productos tipo support_inside (donde la UX correcta
            es audit log, no métricas) declaran `has_metrics: false` y
            la card se oculta automáticamente. Heredable: cualquier
            plugin futuro decide declarativamente sin tocar el SC.
      */}
      {!isTerminal && info.capabilities.has_metrics && (
        <MetricsBar
          metrics={info.metrics ?? { fetchedAt: info.fetchedAt }}
          serviceId={service.id}
          isAdmin={false}
        />
      )}

      {/*
        SSO panel — solo si el plugin lo soporta para esta instancia
        (ADR-070 §B + ADR-077 §3 capability flag por instancia).
        Sprint 15C.II Fase C: ocultamos al cliente cuando hay drift o
        terminal — clickear con metadata corrupta o sobre service
        cancelled produce `provider_error` (UI_SPEC §4.13 + A4.3).
      */}
      {!isTerminal && !isDrift && info.capabilities.hasSsoPanel && info.capabilities.panel_label && (
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

      {!isTerminal && (
        <ActionsBar
          serviceId={service.id}
          actions={info.availableActions}
          isAdmin={isAdmin}
        />
      )}

      {/*
        Sprint 15C Fase 15C.G — link a la sub-página de gestión DNS.
        Solo se renderiza si el plugin del service declara
        `has_dns_management=true` (ADR-082 §3 + ADR-077 Amendment A1).
        Sprint 15C.II Fase C: ocultamos al cliente cuando hay drift o
        terminal (la sub-página DNS depende de metadata externa válida
        — `zone_id`, records iniciales fetched de Enhance — que falla
        con drift / no existe sobre cancelled).
      */}
      {!isTerminal && !isDrift && info.capabilities.has_dns_management && (
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
