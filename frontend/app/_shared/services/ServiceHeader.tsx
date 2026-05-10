/**
 * ServiceHeader — Sprint 11 Fase 11.D (ADR-070 §"Patrón de página").
 *
 * Header normalizado de la página `/dashboard/services/[id]`. Renderiza
 * `info.display` + Badge de estado + statusReason cuando aplica.
 *
 * Componente presentacional puro — sin auth, sin fetch. Server-component
 * compatible: NO añade `'use client'`. Sprint 13 §13.AUTH Fase E lo
 * mantiene intacto.
 */
import { Badge } from '../../components/ui';
import { t } from '../i18n';
import type { ServiceInfo } from '../../lib/api';
import { SERVICE_STATUS_LABEL, SERVICE_STATUS_TONE } from './service-status';

interface ServiceHeaderProps {
  info: ServiceInfo;
  productName: string;
}

export function ServiceHeader({ info, productName }: ServiceHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            margin: 0,
            wordBreak: 'break-word',
          }}
        >
          {info.display.primary}
        </h1>
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: 14,
            marginTop: 6,
          }}
        >
          {info.display.secondary ? t(info.display.secondary) : productName}
        </p>
        {info.statusReason && (
          <p
            style={{
              color: 'var(--text-tertiary)',
              fontSize: 13,
              marginTop: 8,
              fontStyle: 'italic',
            }}
          >
            {info.statusReason}
          </p>
        )}
      </div>
      <div style={{ flex: 'none', alignSelf: 'center' }}>
        <Badge variant={SERVICE_STATUS_TONE[info.status]}>
          {SERVICE_STATUS_LABEL[info.status]}
        </Badge>
      </div>
    </div>
  );
}
