/**
 * /admin/services/[id] — Sprint 15C Fase 15C.J (2026-05-09).
 *
 * Server Component nativo paralelo al detalle cliente
 * `/dashboard/services/[id]/page.tsx` (Sprint 11 Fase 11.D + Sprint 13
 * §13.AUTH Fase E). Materializa el primer objetivo de Fase 15C.J
 * ([dossier 15C §7 fila J](../../../../docs/60-roadmap/completed/sprint-15c-plugin-enhance-cp.md)):
 * vista admin con `info` enriquecido + operaciones admin.
 *
 * Diferencias canónicas vs el detalle cliente:
 *   - Llama `GET /admin/services/${id}` (sin filtro ownership — el
 *     `AdminProvisioningController` saltea el check con `isAdmin=true`).
 *   - `isAdmin = true` siempre (la ruta /admin/* ya está protegida por
 *     middleware staff; el SC defense-in-depth derivaría lo mismo).
 *   - Sección "Datos del servicio (admin)" con info no expuesta al
 *     cliente: owner link a `/admin/clients/[user_id]`, provisioner_slug,
 *     provider_reference, fechas técnicas.
 *   - Sección "Operaciones admin" con botón "Cambiar plan" que abre
 *     `ChangePackageModal` (CC). Los slugs `change_package` y
 *     `list_available_plans` están ocultos del `ActionsBar` por la
 *     blacklist `INTERNAL_HELPER_SLUGS` (Sprint 15C Fase J) — el modal
 *     los invoca directamente desde su flow.
 *   - El `ActionsBar` reusado renderiza únicamente `force_resync` (botón
 *     directo, sin modal — operación read-side que invalida cache).
 *
 * Reprovision/deprovision se difieren a un sprint futuro de hardening
 * admin (los endpoints `POST /admin/services/:id/reprovision` y
 * `POST /admin/services/:id/deprovision` existen desde Sprint 11 Fase D
 * pero la UI no es scope de 15C.J).
 */

import Link from 'next/link';

import { Card, EmptyState } from '../../../components/ui';
import { t } from '../../../_shared/i18n';
import { ActionsBar, MetricsBar, ServiceHeader, SsoButton } from '../../../_shared/services';
import type { ServiceDetailResponse } from '../../../lib/api';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';

import { AdminServiceOperationsCard } from './_components/AdminServiceOperationsCard';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminServiceDetailPage({ params }: PageProps) {
  const { id } = await params;

  let data: ServiceDetailResponse | null = null;
  let errorMessage: string | null = null;
  try {
    data = await serverFetch<ServiceDetailResponse>(`/admin/services/${id}`);
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
        description={errorMessage ?? 'El servicio no existe.'}
        action={
          <Link href="/admin/services" style={{ color: 'var(--brand-600)' }}>
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
        href="/admin/services"
        style={{
          color: 'var(--text-secondary)',
          fontSize: 13,
          textDecoration: 'none',
        }}
      >
        ← Servicios
      </Link>

      <Card>
        <ServiceHeader info={info} productName={service.product_name} />
      </Card>

      {info.metrics && (
        <MetricsBar
          metrics={info.metrics}
          serviceId={service.id}
          isAdmin={true}
        />
      )}

      {/*
        Card "Datos del servicio (admin)" — info NO expuesta al cliente.
        Sección admin-specific con datos técnicos para operativa staff.
      */}
      <Card>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 12 }}>
          Datos del servicio (admin)
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
          <dt style={{ color: 'var(--text-secondary)' }}>Service ID</dt>
          <dd style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>
            {service.id}
          </dd>

          <dt style={{ color: 'var(--text-secondary)' }}>Cliente owner</dt>
          <dd style={{ margin: 0 }}>
            <Link
              href={`/admin/clients/${service.user_id}`}
              style={{ color: 'var(--brand-600)' }}
            >
              {service.user_id}
            </Link>
          </dd>

          <dt style={{ color: 'var(--text-secondary)' }}>Plugin (provisioner)</dt>
          <dd style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>
            {service.provisioner_slug ?? '—'}
          </dd>

          <dt style={{ color: 'var(--text-secondary)' }}>Producto</dt>
          <dd style={{ margin: 0 }}>
            {service.product_name}{' '}
            <span style={{ color: 'var(--text-tertiary)' }}>
              ({service.product_slug} · {service.product_type})
            </span>
          </dd>

          <dt style={{ color: 'var(--text-secondary)' }}>Estado canónico</dt>
          <dd style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>
            {service.status}
          </dd>

          <dt style={{ color: 'var(--text-secondary)' }}>Creado</dt>
          <dd style={{ margin: 0 }}>
            {new Date(service.created_at).toLocaleString('es-ES')}
          </dd>
        </dl>
      </Card>

      {/* SSO panel — espejo del detalle cliente. Audit emite
          `service.admin_sso_impersonation` automáticamente porque
          `getSsoUrlWithAudit` detecta admin sobre service ajeno
          (Sprint 15C Fase F). */}
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
                Abrir el panel del proveedor como admin se registra
                automáticamente como impersonation en el log GDPR del
                cliente afectado (`service.admin_sso_impersonation`,
                portal transparency).
              </p>
            </div>
            <SsoButton
              serviceId={service.id}
              panelLabel={info.capabilities.panel_label}
            />
          </div>
        </Card>
      )}

      {/* ActionsBar reusado — isAdmin=true. Renderiza únicamente las
          actions cuyo slug NO está en INTERNAL_HELPER_SLUGS (Fase J:
          change_package y list_available_plans están en blacklist y se
          operan vía AdminServiceOperationsCard abajo). Para enhance_cp
          esto deja: force_resync (botón directo). */}
      <ActionsBar
        serviceId={service.id}
        actions={info.availableActions}
        isAdmin={true}
      />

      {/* Sección admin dedicada con modal change_package. Solo se
          renderiza si el plugin declara la action change_package en
          availableActions. Patrón canónico: componente colocated en
          _components/ por ser admin-specific Enhance CP. */}
      <AdminServiceOperationsCard
        serviceId={service.id}
        actions={info.availableActions}
        currentPlanLabel={info.display.secondary ? t(info.display.secondary) : undefined}
      />

      {/* DNS link — espejo del detalle cliente. Sprint futuro añadirá
          `/admin/services/[id]/dns` con la misma lógica de la página
          cliente (Fase G) pero reusando endpoints `/admin/...`. Por ahora
          link vacío para no engañar al admin. */}
      {info.capabilities.has_dns_management && (
        <Card>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            Gestión DNS
          </h2>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: 13,
              marginTop: 4,
            }}
          >
            Para revisar la zona DNS de este servicio, abre el panel del
            proveedor (Enhance) — la UI admin nativa de DNS llegará en un
            sprint futuro.
          </p>
        </Card>
      )}

      <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
        Última lectura del proveedor:{' '}
        {new Date(info.fetchedAt).toLocaleString('es-ES')}
      </p>
    </div>
  );
}
