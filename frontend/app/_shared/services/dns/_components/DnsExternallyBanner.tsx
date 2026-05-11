/**
 * DnsExternallyBanner — Sprint 15C Fase 15C.G (ADR-082 §6).
 * Sprint 15C.II Fase E: movido a `_shared/services/dns/_components/` + prop
 * `isAdmin` (back-link adaptativo cliente/admin). Componente compartido por
 * `/dashboard/services/[id]/dns` y `/admin/services/[id]/dns`.
 *
 * Server Component. Render del estado canónico cuando el resolver
 * `core/provisioning/dns-authority-resolver.ts` determina que el DNS NO
 * es autoridad Aelium:
 *   - `DNS_MANAGED_EXTERNALLY` → NS del dominio apuntan fuera.
 *   - `DNS_NO_AUTHORITY_PLUGIN` → match NS Aelium pero ningún plugin DNS
 *     authority activo en cluster (estado raro — alerta admin).
 *
 * UX: banner explicativo + nameservers actuales del dominio (data del 404)
 * + hint canónico (`modify_ns_to_aelium_to_enable_dns_management`).
 * No hay botón operativo aquí — el cliente debe modificar NS en su
 * registrar externo si quiere que Aelium gestione DNS.
 */

import Link from 'next/link';
import { AlertBanner, Card } from '../../../../components/ui';
import type { DnsExternallyManagedError } from '../../../../lib/api';

interface Props {
  serviceId: string;
  error: DnsExternallyManagedError;
  /** `true` cuando se renderiza en `/admin/services/[id]/dns`. Ajusta el back-link. */
  isAdmin?: boolean;
}

const NO_AUTHORITY_TITLE = 'No hay plugin DNS activo en el cluster';
const EXTERNALLY_TITLE = 'Este DNS está gestionado fuera de Aelium';

export function DnsExternallyBanner({ serviceId, error, isAdmin = false }: Props) {
  const isExternal = error.code === 'DNS_MANAGED_EXTERNALLY';
  const title = isExternal ? EXTERNALLY_TITLE : NO_AUTHORITY_TITLE;
  const backHref = isAdmin
    ? `/admin/services/${serviceId}`
    : `/dashboard/services/${serviceId}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link
        href={backHref}
        style={{
          color: 'var(--text-secondary)',
          fontSize: 13,
          textDecoration: 'none',
        }}
      >
        ← Volver al servicio
      </Link>

      <AlertBanner variant={isExternal ? 'info' : 'warning'}>
        <strong>{title}</strong>
      </AlertBanner>

      <Card>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)' }}>
            {isExternal
              ? 'Los registros DNS de este dominio se gestionan en el proveedor donde están delegados los nameservers. Aelium no puede crear, modificar ni eliminar registros mientras los NS apunten fuera.'
              : 'Estado inesperado: los nameservers del dominio apuntan a Aelium pero no hay ningún plugin DNS authority activo en el cluster. Revisa la configuración del plugin en /admin/settings/plugins.'}
          </p>

          {error.nameservers.length > 0 && (
            <section
              style={{
                padding: 12,
                background: 'var(--surface-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.04,
                  marginBottom: 8,
                }}
              >
                Nameservers actuales del dominio
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 20,
                  fontSize: 13,
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--text-primary)',
                }}
              >
                {error.nameservers.map((ns) => (
                  <li key={ns}>{ns}</li>
                ))}
              </ul>
            </section>
          )}

          {isExternal && (
            <section style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              <p style={{ margin: '0 0 8px' }}>
                <strong>
                  {isAdmin
                    ? '¿Quieres que Aelium gestione el DNS de este dominio?'
                    : '¿Quieres que Aelium gestione tu DNS?'}
                </strong>
              </p>
              <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
                <li>
                  {isAdmin
                    ? 'Pide al cliente que entre al panel del registrar donde compró el dominio.'
                    : 'Entra al panel del registrar donde compraste el dominio.'}
                </li>
                <li>
                  Cambia los nameservers a{' '}
                  <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                    ns1.aelium.net
                  </code>{' '}
                  y{' '}
                  <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                    ns2.aelium.net
                  </code>
                  .
                </li>
                <li>
                  La propagación tarda entre 1 y 48 horas. Vuelve a esta
                  página cuando los NS hayan cambiado.
                </li>
              </ol>
            </section>
          )}
        </div>
      </Card>
    </div>
  );
}
