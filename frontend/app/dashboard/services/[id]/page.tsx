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
import type {
  ServiceBillingCrossLink,
  ServiceDetailResponse,
} from '../../../lib/api';
import { isStaffRole } from '../../../lib/portal';
import {
  ActionsBar,
  AppShortcutsCard,
  BillingCrossLinkCard,
  MetricsBar,
  ServiceHeader,
  SslStatusCard,
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
  // sirve principalmente al cliente, pero los staff que la abren ven los
  // botones admin-only no-blacklisted del plugin enhance_cp. (Las admin
  // ops `change_package`, `list_available_plans` y `recalculate_provider_metrics`
  // están en `INTERNAL_HELPER_SLUGS` — se operan desde `/admin/services/[id]`,
  // no desde aquí.)
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

  // Sprint 15C.II Fase F.11.3 (§A.11.10.8.2 + L16): cross-link
  // Service↔billing. Endpoint unificado cliente/admin (el backend deriva
  // isAdmin del JWT y aplica owner check si !isAdmin). Fail-soft: si el
  // fetch falla, el card no se renderiza pero el resto de la página
  // funciona.
  let billingCrossLink: ServiceBillingCrossLink | null = null;
  if (data) {
    try {
      billingCrossLink = await serverFetch<ServiceBillingCrossLink>(
        `/billing/services/${id}/cross-link`,
      );
    } catch {
      billingCrossLink = null;
    }
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

  // Sprint 15C.II Fase F.4.2 — servicio suspendido. `info.status` ya viene
  // reconciliado con el estado administrativo (`getInfoForUser` F.4.1: si
  // Aelium lo tiene `suspended`, fuerza `info.status='suspended'`). Cuando lo
  // está, el cliente ve un banner explícito con el motivo cliente-seguro (la
  // etiqueta localizada del enum `SuspensionReason` — NUNCA la nota interna
  // del admin) + un CTA según el motivo, y se ocultan las acciones que no
  // tienen sentido sobre un servicio suspendido (SSO al panel, acciones
  // inline, gestión DNS) — el cliente no debería poder operar como si nada.
  const isSuspended = !isTerminal && info.status === 'suspended';
  const suspensionReasonCode = isSuspended
    ? parseSuspensionReasonCode(service.suspension_reason)
    : null;

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
        Sprint 15C.II Fase F.4.2 — banner de suspensión para el cliente.
        Estado reversible (NO terminal). Muestra el motivo cliente-seguro
        (etiqueta localizada del enum — NUNCA la nota interna del admin) +
        un CTA según el motivo: impago → regularizar pago; resto → soporte.
        Mientras esté suspendido se ocultan SSO + acciones + DNS (más abajo).
      */}
      {isSuspended && suspensionReasonCode && (
        <AlertBanner
          variant="warning"
          title={t('service.suspended.client.title')}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 13 }}>
              {t('service.suspended.client.body')}
            </p>
            <p style={{ margin: 0, fontSize: 13 }}>
              <strong>{t('service.suspended.client.reason_label')}:</strong>{' '}
              {t(`service.suspension_reason.${suspensionReasonCode}`)}
            </p>
            <div>
              {suspensionReasonCode === 'overdue_payment' ? (
                <Link
                  href="/dashboard/billing"
                  style={{
                    display: 'inline-block',
                    padding: '8px 16px',
                    background: 'var(--brand-600)',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#fff',
                    textDecoration: 'none',
                  }}
                >
                  {t('service.suspended.client.cta_pay')}
                </Link>
              ) : (
                <Link
                  href="/dashboard/support"
                  style={{
                    display: 'inline-block',
                    padding: '8px 16px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    textDecoration: 'none',
                  }}
                >
                  {t('service.suspended.client.cta_support')}
                </Link>
              )}
            </div>
            {service.suspended_at && (
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                }}
              >
                Suspendido el{' '}
                {new Date(service.suspended_at).toLocaleDateString('es-ES', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            )}
          </div>
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
          // Sprint 15C.II Fase F.8: threshold del manifest install que el
          // backend expone en el summary (capability-driven — `null` si
          // el plugin no es relevante o el admin no editó). MetricsBar
          // colorea la barra de disco si está presente.
          quotaAlertThresholdPct={service.quota_alert_threshold_pct}
        />
      )}

      {/*
        Sprint 15C.II Fase F.7 (ADR-077 Amendment A7) — card SSL read-only.
        Capability-driven: SOLO se renderiza si `info.ssl` está presente
        (presencia = señal de capability; no hay flag nuevo en
        ServiceInfoCapabilities). Plugins que no exponen SSL omiten el
        campo y el card no aparece. NO se muestra en servicios terminales
        (cancelled/expired) — el cert ya no aplica al recurso. L16: mismo
        componente `_shared/` para cliente y admin; aquí omitimos `isAdmin`
        (cliente) y no pasamos `ssoPanelHref` (no es CTA cliente).
      */}
      {!isTerminal && info.ssl && <SslStatusCard ssl={info.ssl} />}

      {/*
        Sprint 15C.II Fase F.10 (ADR-077 Amendment A9 + ADR-083 A9) —
        card de atajos al admin de apps CMS instaladas (WordPress / Joomla /
        futuros). Capability-driven por presencia: SOLO se renderiza si
        info.apps está definido Y no vacío (presencia = señal de capability;
        plugins sin apps instalables omiten el campo). NO se muestra en
        servicios terminales ni suspended (no aplica abrir un admin si el
        servicio está cancelled/expired/suspended). L16: mismo componente
        cliente y admin; isAdmin aporta tooltip extra display-only.
      */}
      {!isTerminal &&
        !isSuspended &&
        info.apps !== undefined &&
        info.apps.length > 0 && (
          <AppShortcutsCard
            apps={info.apps}
            serviceId={service.id}
            isAdmin={isAdmin}
          />
        )}

      {/*
        Sprint 15C.II Fase F.11.3 (§A.11.10.8.2 + L16) — card cross-link
        Service↔billing. Capability-driven por presencia (el componente
        retorna null si no hay nextDueDate ni lastInvoice). Visible
        también si terminal — cliente cancelado puede querer ver la
        última factura emitida. El link "Ver factura" apunta a
        /dashboard/billing/[id] (isAdmin omitido = false).
      */}
      {billingCrossLink && <BillingCrossLinkCard data={billingCrossLink} />}

      {/*
        SSO panel — solo si el plugin lo soporta para esta instancia
        (ADR-070 §B + ADR-077 §3 capability flag por instancia).
        Sprint 15C.II Fase C: ocultamos al cliente cuando hay drift o
        terminal — clickear con metadata corrupta o sobre service
        cancelled produce `provider_error` (UI_SPEC §4.13 + A4.3).
      */}
      {!isTerminal && !isSuspended && !isDrift && info.capabilities.hasSsoPanel && info.capabilities.panel_label && (
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
              isAdmin={isAdmin}
            />
          </div>
        </Card>
      )}

      {!isTerminal && !isSuspended && (
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
      {!isTerminal && !isSuspended && !isDrift && info.capabilities.has_dns_management && (
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

      {/* Historial de auditoría — Sprint 15C.II Fase F.3 (GAP-15CII-M).
          Siempre visible (también si drift/terminal): el cliente debe poder
          consultar el historial de su servicio. El backend
          (`GET /services/:id/audit`) aplica la whitelist GDPR — incluye los
          accesos de staff a su panel del proveedor (ADR-083 §4 dec.14). */}
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
              {t('service.audit.subtitle_client')}
            </p>
          </div>
          <Link
            href={`/dashboard/services/${service.id}/audit`}
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
            {t('service.audit.link')} →
          </Link>
        </div>
      </Card>

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

/**
 * Sprint 15C.II Fase F.4.2 — extrae SOLO el código `SuspensionReason` canónico
 * de `service.suspension_reason` (cadena combinada `"<reason>"` o
 * `"<reason>: <internal_note>"`). El cliente NUNCA ve la nota interna del
 * admin — solo la etiqueta localizada del enum (`service.suspension_reason.*`).
 * Si la parte previa al `": "` no es un código conocido, devuelve `'other'`
 * (etiqueta genérica "Otros motivos" + CTA a soporte). Espejo cliente del
 * `parseSuspensionReason` de `/admin/services/[id]` (que sí muestra la nota).
 */
type ClientSuspensionReasonCode =
  | 'overdue_payment'
  | 'abuse_investigation'
  | 'scheduled_maintenance'
  | 'gdpr_restriction'
  | 'other';

const KNOWN_SUSPENSION_REASON_CODES = new Set<ClientSuspensionReasonCode>([
  'overdue_payment',
  'abuse_investigation',
  'scheduled_maintenance',
  'gdpr_restriction',
  'other',
]);

function parseSuspensionReasonCode(
  raw: string | null,
): ClientSuspensionReasonCode {
  if (!raw) return 'other';
  const sep = raw.indexOf(': ');
  const prefix = (sep >= 0 ? raw.slice(0, sep) : raw).trim();
  return KNOWN_SUSPENSION_REASON_CODES.has(prefix as ClientSuspensionReasonCode)
    ? (prefix as ClientSuspensionReasonCode)
    : 'other';
}
