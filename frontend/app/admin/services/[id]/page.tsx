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

import { AlertBanner, Card, EmptyState } from '../../../components/ui';
import { t } from '../../../_shared/i18n';
import { ActionsBar, MetricsBar, ServiceHeader, SsoButton } from '../../../_shared/services';
import type { ServiceDetailResponse } from '../../../lib/api';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';

import { AdminDriftBanner } from './_components/AdminDriftBanner';
import { AdminServiceDataCard } from './_components/AdminServiceDataCard';
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

  // Sprint 15C.II Fase C round 4 (smoke real Yasmin 2026-05-10):
  // detectar `service.status` terminal ANTES que cualquier heurística
  // de drift. Doctrina canónica: services `cancelled` / `terminated`
  // YA NO operan contra el proveedor — la cola provisioning skipea
  // cualquier job sobre status terminal
  // (`provisioning-orchestrator.service.ts:144`). La UI debe reflejar
  // este estado terminal con un banner explícito y ocultar TODAS las
  // acciones futiles (SSO, reprovisionar, métricas, change_package).
  // Mostrar AdminDriftBanner sobre service cancelled es semánticamente
  // FALSO — el service NO es un drift, es un estado operativo final.
  const isTerminal =
    service.status === 'cancelled' || service.status === 'terminated';

  // Sprint 15C.II Fase C (UI_SPEC §4.13 + ADR-083 Amendment A4.3 frozen
  // 2026-05-10): patrón doctrinal "drift UX discriminada por rol". Cuando
  // el plugin reporta `status` ∈ {`unknown`, `failed`} con `statusReason`
  // no nulo, el admin necesita un AlertBanner técnico crudo ARRIBA del
  // MetricsBar con CTA SSO + (si aplica) Re-aprovisionar prominente.
  // NO se aplica si el service está terminal (handled arriba).
  const isDrift =
    !isTerminal &&
    (info.status === 'unknown' || info.status === 'failed') &&
    info.statusReason !== null &&
    info.statusReason !== undefined;
  const showReprovision =
    isDrift &&
    typeof info.statusReason === 'string' &&
    info.statusReason.endsWith('.status_reason.not_yet_provisioned');

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
        <ServiceHeader
          info={info}
          productName={service.product_name}
          isAdmin={true}
        />
      </Card>

      {/*
        Sprint 15C.II Fase C round 4 (smoke real Yasmin 2026-05-10):
        cuando service está terminal (cancelled / terminated), banner
        explícito + razón técnica cruda (admin necesita info literal
        para diagnosticar la cancelación). NO renderizamos AdminDriftBanner,
        MetricsBar, SSO ni AdminServiceOperationsCard — todas las
        operaciones contra el proveedor son futiles sobre service
        terminal (orquestador skipea con guard idempotente).
      */}
      {isTerminal && (
        <AlertBanner
          variant="danger"
          title={t('service.terminal.cancelled.admin.title')}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 13 }}>
              {t('service.terminal.cancelled.admin.body')}
            </p>
            {info.statusReason && (
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontStyle: 'italic',
                  color: 'var(--text-secondary)',
                }}
              >
                {t(info.statusReason)}
              </p>
            )}
            {service.cancellation_reason && (
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-tertiary)',
                }}
              >
                cancellation_reason:{' '}
                <code>{service.cancellation_reason}</code>
                {service.cancelled_at &&
                  ` · ${new Date(service.cancelled_at).toLocaleString('es-ES')}`}
              </p>
            )}
          </div>
        </AlertBanner>
      )}

      {/*
        Sprint 15C.II Fase C: AdminDriftBanner ARRIBA del MetricsBar
        cuando hay drift y service NO está terminal. Renderiza
        statusReason técnico crudo + CTA "Investigar en panel del
        proveedor" + (cuando aplique) botón Re-aprovisionar prominente.
      */}
      {isDrift && info.statusReason && (
        <AdminDriftBanner
          serviceId={service.id}
          statusReason={t(info.statusReason)}
          hasSsoPanel={info.capabilities.hasSsoPanel}
          panelLabel={info.capabilities.panel_label ?? undefined}
          showReprovision={showReprovision}
        />
      )}

      {/*
        MetricsBar visible SI:
          - service NO terminal, Y
          - plugin declara `has_metrics: true` (capability flag canónico
            ADR-077 §3 — Sprint 15C.II Fase C round 5). Plugins
            triviales `internal` + `manual` y futuros productos tipo
            support_inside declaran `has_metrics: false` → la card se
            oculta automáticamente sin tocar el SC.
      */}
      {!isTerminal && info.capabilities.has_metrics && (
        <MetricsBar
          metrics={info.metrics ?? { fetchedAt: info.fetchedAt }}
          serviceId={service.id}
          isAdmin={true}
        />
      )}

      {/*
        Sprint 15C.II Fase C round 7 (smoke real Yasmin 2026-05-10):
        rediseño card "Datos del servicio (admin)" según estándar
        industria Stripe/Vercel admin: información primaria visible
        (nombre cliente, email, domain, plan), IDs secundarios con
        copy-to-clipboard, Badge para estados en lugar de texto crudo,
        agrupación lógica en 3 secciones (Cliente / Servicio / Fechas)
        en lugar de una <dl> plana de 6 filas.
      */}
      <AdminServiceDataCard data={data} />

      {/* SSO panel — espejo del detalle cliente. Audit emite
          `service.admin_sso_impersonation` automáticamente porque
          `getSsoUrlWithAudit` detecta admin sobre service ajeno
          (Sprint 15C Fase F). Sprint 15C.II Fase C round 4: oculto
          si service terminal — abrir panel del proveedor sobre service
          cancelled puede dar 404 o sesión orfana. */}

      {/* SSO panel — espejo del detalle cliente. Audit emite
          `service.admin_sso_impersonation` automáticamente porque
          `getSsoUrlWithAudit` detecta admin sobre service ajeno
          (Sprint 15C Fase F). Sprint 15C.II Fase C round 4: oculto
          si service terminal — abrir panel del proveedor sobre service
          cancelled puede dar 404 o sesión orfana. */}
      {!isTerminal && info.capabilities.hasSsoPanel && info.capabilities.panel_label && (
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
              isAdmin={true}
            />
          </div>
        </Card>
      )}

      {/* ActionsBar reusado — isAdmin=true. Renderiza únicamente las
          actions cuyo slug NO está en INTERNAL_HELPER_SLUGS (Fase J:
          change_package y list_available_plans están en blacklist y se
          operan vía AdminServiceOperationsCard abajo). Para enhance_cp
          esto deja: force_resync (botón directo). Sprint 15C.II Fase C
          round 4: oculto si terminal — `info.availableActions` viene
          vacío del backend shortcircuit, pero el guard explícito
          documenta la doctrina. */}
      {!isTerminal && (
        <ActionsBar
          serviceId={service.id}
          actions={info.availableActions}
          isAdmin={true}
        />
      )}

      {/* Sección admin dedicada con modal change_package. Solo se
          renderiza si el plugin declara la action change_package en
          availableActions. Patrón canónico: componente colocated en
          _components/ por ser admin-specific Enhance CP. Sprint 15C.II
          Fase C round 4: oculta si terminal — change_package contra un
          service cancelled retornaría action.provider_error. */}
      {!isTerminal && (
        <AdminServiceOperationsCard
          serviceId={service.id}
          actions={info.availableActions}
          currentPlanLabel={info.display.secondary ? t(info.display.secondary) : undefined}
        />
      )}

      {/* DNS link — espejo del detalle cliente. Sprint futuro añadirá
          `/admin/services/[id]/dns` con la misma lógica de la página
          cliente (Fase G) pero reusando endpoints `/admin/...`. Por ahora
          link vacío para no engañar al admin. Sprint 15C.II Fase C round
          4: oculto si terminal (no hay zona DNS contra subscription
          cancelled). */}
      {!isTerminal && info.capabilities.has_dns_management && (
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
