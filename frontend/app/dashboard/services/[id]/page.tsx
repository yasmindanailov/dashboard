'use client';

/**
 * /dashboard/services/[id] — Detalle de servicio del cliente.
 *
 * Sprint 11 Fase 11.D (ADR-070 §"Patrón de página" + ADR-077 §1+§2).
 *
 * Una sola plantilla para TODOS los plugins. La UI ramifica por
 * `info.capabilities` — NUNCA por `service.provisioner_slug`. Esto
 * cierra el debate "if (provisioner === 'X')" del frontend (ADR-070
 * §🚪 Cierra).
 *
 * TODO(ADR-078, Sprint 13): migrar a Server Component cuando cookies
 * httpOnly estén activas. Ref DC.28. Este archivo es la última excepción
 * permitida del patrón 'use client' + localStorage según ADR-078 §3.2.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, EmptyState } from '../../../components/ui';
import { servicesApi, type ServiceDetailResponse } from '../../../lib/api';
import { getErrorMessage } from '../../../lib/error';
import {
  ActionsBar,
  MetricsBar,
  ServiceHeader,
  SsoButton,
} from '../../../_shared/services';

export default function ClientServiceDetailPage() {
  const params = useParams<{ id: string }>();
  const serviceId = params.id;

  const [data, setData] = useState<ServiceDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('access_token') || ''
      : '';

  const load = useCallback(async () => {
    if (!token || !serviceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await servicesApi.detail(token, serviceId);
      setData(res);
    } catch (err) {
      setError(getErrorMessage(err) ?? 'No se pudo cargar el servicio');
    } finally {
      setLoading(false);
    }
  }, [token, serviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p style={{ color: 'var(--text-secondary)' }}>Cargando servicio…</p>;
  }

  if (error || !data) {
    return (
      <EmptyState
        title="No se pudo cargar el servicio"
        description={error ?? 'El servicio no existe o no tienes acceso.'}
        action={
          <Link
            href="/dashboard/services"
            style={{ color: 'var(--brand-600)' }}
          >
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

      {/* SSO panel — solo si el plugin lo soporta para esta instancia
          (ADR-070 §B + ADR-077 §3 capability flag por instancia). */}
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
        onActionExecuted={() => void load()}
      />

      {/* Slot UI placeholder Sprint 22 Projects (`request_custom_development`).
          Sprint 11 deja la sección visible pero deshabilitada para que la UI
          quede preparada — Sprint 22 conectará el endpoint sin tocar este
          layout. */}
      <Card>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
          ¿Necesitas un desarrollo a medida?
        </h2>
        <p
          style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}
        >
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
