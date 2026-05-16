/**
 * /admin/services/[id] — Sprint 15C Fase 15C.J (2026-05-09) + Sprint 15C.II
 * Fase E (2026-05-11 — admin DNS + operaciones consolidadas).
 *
 * Server Component nativo paralelo al detalle cliente
 * `/dashboard/services/[id]/page.tsx` (Sprint 11 Fase 11.D + Sprint 13
 * §13.AUTH Fase E). Vista admin con `info` enriquecido + operaciones admin.
 *
 * Diferencias canónicas vs el detalle cliente:
 *   - Llama `GET /admin/services/${id}` (sin filtro ownership — el
 *     `AdminProvisioningController` saltea el check con `isAdmin=true`).
 *   - `isAdmin = true` siempre (la ruta /admin/* ya está protegida por
 *     middleware staff; el SC defense-in-depth derivaría lo mismo).
 *   - Sección "Datos del servicio (admin)" con info no expuesta al cliente.
 *   - Sección "Operaciones admin" (`AdminServiceOperationsCard`): "Cambiar
 *     plan…" (modal `ChangePackageModal`), "Recalcular métricas en el
 *     proveedor" (action `recalculate_provider_metrics` — Amendment A5.1,
 *     renombrada desde `force_resync`), "Cancelar servicio…" (modal
 *     `CancelServiceModal` — typing-confirm + motivo + nota + toggle
 *     notificar). Los slugs `change_package`, `list_available_plans` y
 *     `recalculate_provider_metrics` están en `INTERNAL_HELPER_SLUGS` del
 *     `ActionsBar` — se operan desde esta card, no como botones standalone.
 *   - Sección "Gestión DNS" con link a `/admin/services/[id]/dns` (UI admin
 *     DNS nativa — GAP-15CII-L). Ramifica por `has_dns_management`.
 *   - El CTA "Re-aprovisionar" del `AdminDriftBanner` se gatea por
 *     `info.recoveryHint === 'reprovision'` (ADR-077 Amendment A5 — el
 *     plugin clasifica su drift, NO matcheamos `statusReason` por string).
 */

import Link from 'next/link';

import { AlertBanner, Card, EmptyState } from '../../../components/ui';
import { t } from '../../../_shared/i18n';
import {
  ActionsBar,
  MetricsBar,
  ServiceHeader,
  SslStatusCard,
  SsoButton,
} from '../../../_shared/services';
import type { ServiceDetailResponse } from '../../../lib/api';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';

import { AdminDriftBanner } from './_components/AdminDriftBanner';
import { AdminProviderStateDesyncBanner } from './_components/AdminProviderStateDesyncBanner';
import { AdminServiceDataCard } from './_components/AdminServiceDataCard';
import { AdminServiceOperationsCard } from './_components/AdminServiceOperationsCard';
import { ServiceNotesCard } from './_components/ServiceNotesCard';

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

  // Sprint 15C.II Fase F.9 (R9 frozen §A.11.10.6.2): capability detection
  // per-plugin para gatear el CTA "Reconciliar contra el proveedor" del
  // AdminDriftBanner. Fetch del admin overview F.2 fail-soft (si falla,
  // el banner pasa a fallback F.3 — redirect a settings reconcile-all).
  // El overview tiene cache server-side ~600s (F.2 doctrine).
  let supportsReconcileOne = false;
  const reconcileSlug =
    data?.service.provisioner_slug ?? data?.service.product_provisioner ?? null;
  if (reconcileSlug) {
    try {
      const overview = await serverFetch<{
        reconciliation: { supports_reconcile_one: boolean };
      }>(`/admin/plugins/${reconcileSlug}/operational-overview`);
      supportsReconcileOne =
        overview.reconciliation?.supports_reconcile_one === true;
    } catch {
      // fail-soft: el banner usa fallback F.3 (redirect a settings).
      supportsReconcileOne = false;
    }
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

  // Sprint 15C.II Fase F (ADR-077 Amendment A4): estado `suspended` — banner
  // amarillo informativo (NO drift, NO terminal: es un estado operativo
  // reversible). Usamos `service.status` (la verdad canónica de Aelium) — si
  // hay drift con el proveedor (Enhance dice active pero Aelium suspended), el
  // cron L3 reconcilia; aquí mostramos lo que Aelium tiene registrado. El
  // motivo + nota interna viven en `service.suspension_reason` (cadena
  // combinada `"<reason>: <internal_note>"`); el admin ve ambos.
  const isSuspended = !isTerminal && service.status === 'suspended';
  const suspension = isSuspended
    ? parseSuspensionReason(service.suspension_reason)
    : null;

  // Sprint 15C.II Fase F.4.1 — desincronización del estado de suspensión
  // entre `services.status` (autoritativo para el lifecycle administrativo) y
  // el estado operativo que reporta el proveedor. El backend lo detecta y lo
  // expone en `service.provider_state_desync`. La UI admin avisa y ofrece el
  // botón "Realinear estado del proveedor con Aelium". Solo se muestra para
  // servicios `active`/`suspended` (los demás no tienen estado de suspensión
  // del proveedor que realinear — el backend tampoco lo marcaría).
  const showProviderStateDesync =
    !isTerminal &&
    service.provider_state_desync === true &&
    (service.status === 'active' || service.status === 'suspended');

  // Sprint 15C.II Fase C (UI_SPEC §4.13 + ADR-083 Amendment A4.3 frozen
  // 2026-05-10): patrón doctrinal "drift UX discriminada por rol". Cuando
  // el plugin reporta `status` ∈ {`unknown`, `failed`} con `statusReason`
  // no nulo, el admin necesita un AlertBanner técnico crudo ARRIBA del
  // MetricsBar con CTA SSO + (si aplica) Re-aprovisionar prominente.
  // NO se aplica si el service está terminal ni suspended (handled arriba).
  const isDrift =
    !isTerminal &&
    !isSuspended &&
    (info.status === 'unknown' || info.status === 'failed') &&
    info.statusReason !== null &&
    info.statusReason !== undefined;
  // Sprint 15C.II Fase E — BUG-15CII-I (smoke real Yasmin Fase D 2026-05-10)
  // resuelto por contrato, no por heurística de string. El plugin clasifica
  // su drift al campo declarativo `info.recoveryHint` (ADR-077 Amendment A5);
  // el CTA "Re-aprovisionar ahora" se ofrece SOLO cuando el plugin dice que
  // el recurso es re-creable (`recoveryHint === 'reprovision'` — caso enhance
  // `not_yet_provisioned` y `subscription_missing`, antes faltaba el segundo).
  // `reconcile`/`contact_support` no ofrecen este CTA (el banner ramifica el
  // resto de clases — ver AdminDriftBanner). NUNCA matcheamos `statusReason`
  // por string: eso es i18n display, no comportamiento. Heredable 15D/15E/15G.
  const showReprovision = isDrift && info.recoveryHint === 'reprovision';

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
        Sprint 15C.II Fase F (ADR-077 Amendment A4): banner amarillo
        "Servicio suspendido" — estado operativo reversible (NO drift, NO
        terminal). Muestra el motivo canónico localizado + (si hay) la nota
        interna del admin + cuándo se suspendió. La reactivación se opera desde
        `AdminServiceOperationsCard` ("Reanudar servicio"). El cliente ve una
        versión genérica de esto en su `/dashboard/services/[id]` (ServiceHeader
        con `statusReason` i18n) — aquí el admin ve el detalle real.
      */}
      {isSuspended && suspension && (
        <AlertBanner variant="warning" title="Servicio suspendido">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ margin: 0, fontSize: 13 }}>
              Este servicio está suspendido — el cliente no tiene acceso, pero
              sus datos se conservan en el proveedor. Reactívalo desde
              «Operaciones admin» cuando proceda.
            </p>
            <p style={{ margin: 0, fontSize: 13 }}>
              <strong>Motivo:</strong> {suspension.label}
              {suspension.note ? (
                <span style={{ color: 'var(--text-secondary)' }}>
                  {' — '}
                  {suspension.note}
                </span>
              ) : null}
            </p>
            {service.suspended_at && (
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: 'var(--text-tertiary)',
                }}
              >
                Suspendido el {new Date(service.suspended_at).toLocaleString('es-ES')}
              </p>
            )}
          </div>
        </AlertBanner>
      )}

      {/*
        Sprint 15C.II Fase F.4.1+F.4.3 — aviso de desincronización entre el
        estado de suspensión de Aelium y el del proveedor. Independiente del
        banner de suspensión: cubre las DOS direcciones (BD `suspended` /
        proveedor `active` → también `isSuspended`; BD `active` / proveedor
        `suspended` → `isSuspended` false). Ofrece el realineado idempotente
        (sin transición de lifecycle). El banner amarillo de suspensión + el
        botón "Reanudar" de «Operaciones admin» ya funcionan correctamente
        gracias al override de `getInfoForUser` (F.4.1).
      */}
      {showProviderStateDesync && (
        <AdminProviderStateDesyncBanner
          serviceId={service.id}
          adminStatus={service.status === 'suspended' ? 'suspended' : 'active'}
        />
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
          showReconcile={isDrift && info.recoveryHint === 'reconcile'}
          pluginSlug={service.provisioner_slug ?? service.product_provisioner}
          supportsReconcileOne={supportsReconcileOne}
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
          // Sprint 15C.II Fase F.8: threshold del manifest install que el
          // backend expone en el summary. Mismo prop que cliente — `_shared/`
          // + capability-driven (L16, ningún ramificado admin vs cliente).
          quotaAlertThresholdPct={service.quota_alert_threshold_pct}
        />
      )}

      {/*
        Sprint 15C.II Fase F.7 (ADR-077 Amendment A7 + ADR-083 A8) — card
        SSL read-only. Capability-driven (presencia de `info.ssl` = señal
        de capability). Admin gana tooltip con fecha exacta en el badge.
        El CTA "Gestionar SSL en el panel" no se cablea aquí — el admin
        usa el `<SsoButton>` general (sección "Panel del proveedor" abajo);
        cuando F.12 (layout canónico) compacte cards, evaluará si el card
        SSL gana su propio link directo a la sección SSL del panel.
      */}
      {!isTerminal && info.ssl && (
        <SslStatusCard ssl={info.ssl} isAdmin={true} />
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
          actions cuyo slug NO está en INTERNAL_HELPER_SLUGS. Para enhance_cp
          eso deja `reset_account_password` (botón directo). `change_package`,
          `list_available_plans` y `recalculate_provider_metrics` (Sprint
          15C.II Fase E — Amendment A5.1, renombrada desde `force_resync`)
          están en la blacklist y se operan desde `AdminServiceOperationsCard`
          abajo. Sprint 15C.II Fase C round 4: oculto si terminal —
          `info.availableActions` viene vacío del backend shortcircuit, pero
          el guard explícito documenta la doctrina. */}
      {!isTerminal && (
        <ActionsBar
          serviceId={service.id}
          actions={info.availableActions}
          isAdmin={true}
        />
      )}

      {/* Sección "Operaciones admin" — contenedor canónico de operaciones
          administrativas del service detail (Sprint 15C.II Fase E):
          "Cambiar plan…" (modal), "Recalcular métricas en el proveedor"
          (action `recalculate_provider_metrics` si está disponible),
          "Cancelar servicio…" (modal con typing-confirm — GAP-15CII-J).
          Siempre se renderiza si el service NO está terminal (el guard
          `!isTerminal` evita ofrecer operaciones futiles sobre service
          cancelled — el orquestador las skipearía). */}
      {!isTerminal && (
        <AdminServiceOperationsCard
          serviceId={service.id}
          actions={info.availableActions}
          currentPlanLabel={info.display.secondary ? t(info.display.secondary) : undefined}
          serviceDisplayName={info.display.primary}
        />
      )}

      {/* Sprint 15C.II Fase F.6 (§F.6.3) — historial de notas operativas del
          servicio (cancel/suspend/unsuspend, manual o automático del cron).
          Siempre visible (también si terminal: ahí es donde más interesa ver
          por qué se canceló). Vista federada por cliente en
          `/admin/clients/[id]` → tab Notas. */}
      <ServiceNotesCard
        serviceId={service.id}
        clientUserId={service.user_id}
      />

      {/* DNS link — espejo del detalle cliente. Sprint 15C.II Fase E
          (GAP-15CII-L): UI admin DNS nativa en `/admin/services/[id]/dns`
          reusando los endpoints `/admin/services/:id/dns/records` + los
          mismos componentes que el cliente (`DnsRecordsManager` con
          `isAdmin`). Ramifica por capability flag `has_dns_management`
          (NUNCA por slug — ADR-070 + ADR-077 Amendment A1). Sprint 15C.II
          Fase C round 4: oculto si terminal (no hay zona DNS contra
          subscription cancelled). */}
      {!isTerminal && info.capabilities.has_dns_management && (
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
                Gestión DNS
              </h2>
              <p
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 13,
                  marginTop: 4,
                }}
              >
                Revisa y edita los registros DNS de la zona de este servicio.
                Los cambios se aplican directamente en el proveedor.
              </p>
            </div>
            <Link
              href={`/admin/services/${service.id}/dns`}
              style={{
                color: 'var(--brand-600)',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              Gestionar DNS →
            </Link>
          </div>
        </Card>
      )}

      {/* Historial de auditoría — Sprint 15C.II Fase F.3 (GAP-15CII-M).
          Siempre visible (también si terminal: ahí es donde más interesa ver
          qué pasó). Vista admin sin filtro en `/admin/services/[id]/audit`. */}
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
              {t('service.audit.title')}
            </h2>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: 13,
                marginTop: 4,
              }}
            >
              {t('service.audit.subtitle_admin')}
            </p>
          </div>
          <Link
            href={`/admin/services/${service.id}/audit`}
            style={{
              color: 'var(--brand-600)',
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {t('service.audit.link')} →
          </Link>
        </div>
      </Card>

      <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
        Última lectura del proveedor:{' '}
        {new Date(info.fetchedAt).toLocaleString('es-ES')}
      </p>
    </div>
  );
}

/**
 * Sprint 15C.II Fase F (ADR-077 Amendment A4) — parsea `service.suspension_reason`
 * en su etiqueta + la nota interna (admin-only). El campo tiene 2 formas:
 *   - Canónica (`suspendAsAdmin`): `"<reason>"` o `"<reason>: <internal_note>"`
 *     donde `<reason>` ∈ taxonomía `SuspensionReason` → etiqueta localizada
 *     `service.suspension_reason.<reason>` + (si hay) la nota.
 *   - Legacy (`ServiceLifecycleWorker.autoSuspendServices`, suspensión por
 *     impago): texto libre tipo `"Impago — Factura INV-123"` → se muestra
 *     tal cual (ya es informativo). Mismo patrón de coexistencia que
 *     `cancellation_reason` (`buildTerminalStatusReasonKey`).
 */
const KNOWN_SUSPENSION_REASONS = new Set([
  'overdue_payment',
  'abuse_investigation',
  'scheduled_maintenance',
  'gdpr_restriction',
  'other',
]);

function parseSuspensionReason(raw: string | null): {
  label: string;
  note: string | null;
} {
  if (!raw) return { label: t('service.suspension_reason.other'), note: null };
  const sep = raw.indexOf(': ');
  const prefix = (sep >= 0 ? raw.slice(0, sep) : raw).trim();
  const note = sep >= 0 ? raw.slice(sep + 2).trim() : '';
  if (KNOWN_SUSPENSION_REASONS.has(prefix)) {
    return {
      label: t(`service.suspension_reason.${prefix}`),
      note: note.length > 0 ? note : null,
    };
  }
  // Forma legacy / motivo no canónico: el `suspension_reason` completo ya es
  // legible — lo mostramos tal cual, sin nota separada.
  return { label: raw, note: null };
}
