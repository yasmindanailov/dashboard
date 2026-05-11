'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

import {
  AlertBanner,
  Badge,
  Button,
  Card,
  Modal,
  useToast,
} from '../../../../components/ui';
import type { DnsRecord, DnsZone } from '../../../../lib/api';
import { deleteDnsRecordAction, listDnsRecordsAction } from '../_actions';

import { DnsRecordForm } from './DnsRecordForm';

/* ═══════════════════════════════════════════════════════════════════════════
   DnsRecordsManager — Sprint 15C Fase 15C.G (ADR-082 §6 + ADR-083 §5).
   Sprint 15C.II Fase E: movido a `_shared/services/dns/_components/` +
   compartido cliente/admin (`isAdmin` prop) + gold-standard hardening:
     - Badge estado DNSSEC (read-only — gestión = panel del proveedor).
     - Pasa `existingRecords` al form para detección de duplicados/conflictos.
     - Back-link adaptativo cliente (`/dashboard/...`) vs admin (`/admin/...`).

   Orquestador del flujo CRUD de DNS records. Recibe `initialZone` desde el
   SC parent (prefetch GET /{admin/}services/:id/dns/records) y orquesta:
     - Tabla de records actuales (kind, name, value, ttl, proxy).
     - Botón "Añadir record" → modal create.
     - Botón "Editar" por fila → modal edit con record prehidratado.
     - Botón "Eliminar" por fila → modal confirm + delete.
     - Refresh in-place tras cada mutación (re-llama listDnsRecordsAction).
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  serviceId: string;
  domain: string;
  nameservers: readonly string[];
  initialZone: DnsZone;
  /** `true` cuando se renderiza en `/admin/services/[id]/dns`. */
  isAdmin?: boolean;
}

type ModalState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; record: DnsRecord }
  | { kind: 'delete'; record: DnsRecord };

export function DnsRecordsManager({
  serviceId,
  domain,
  nameservers,
  initialZone,
  isAdmin = false,
}: Props) {
  const [zone, setZone] = useState<DnsZone>(initialZone);
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [, startTransition] = useTransition();
  const { toast } = useToast();

  const backHref = isAdmin
    ? `/admin/services/${serviceId}`
    : `/dashboard/services/${serviceId}`;

  function refreshZone(): void {
    setRefreshing(true);
    startTransition(async () => {
      const result = await listDnsRecordsAction(serviceId, isAdmin);
      setRefreshing(false);
      if (!result.ok) {
        const message =
          'externallyManaged' in result
            ? 'El dominio ha pasado a DNS externo. Recarga la página.'
            : result.error;
        toast('error', message);
        return;
      }
      const inner = result.data.result;
      if (!inner.success || !inner.data) {
        toast(
          'error',
          inner.message ??
            'El plugin DNS authority no pudo completar la lectura.',
        );
        return;
      }
      setZone(inner.data.zone);
    });
  }

  function handleSaved(action: 'create' | 'edit'): void {
    toast(
      'success',
      action === 'create'
        ? 'Record creado. Puede tardar unos minutos en propagarse.'
        : 'Record actualizado. Puede tardar unos minutos en propagarse.',
    );
    refreshZone();
  }

  function handleDelete(record: DnsRecord): void {
    setDeleting(true);
    startTransition(async () => {
      const result = await deleteDnsRecordAction(serviceId, record.id, isAdmin);
      setDeleting(false);
      if (!result.ok) {
        toast('error', result.error);
        return;
      }
      toast('success', 'Record eliminado. Puede tardar unos minutos en propagarse.');
      setModal({ kind: 'closed' });
      refreshZone();
    });
  }

  // Records ordenados: primero por kind canónico, luego por name (apex "@"
  // antes que subdominios).
  const sorted = [...zone.records].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    if (a.name === '@' && b.name !== '@') return -1;
    if (b.name === '@' && a.name !== '@') return 1;
    return a.name.localeCompare(b.name);
  });

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

      <Card>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
                  DNS de {zone.origin}
                </h1>
                {zone.dnssec ? (
                  <Badge variant="success">DNSSEC activo</Badge>
                ) : (
                  <Badge variant="neutral">DNSSEC inactivo</Badge>
                )}
              </div>
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                }}
              >
                {isAdmin
                  ? 'Zona DNS autoritativa gestionada por Aelium. Los cambios se aplican directamente en el proveedor y pueden tardar minutos en propagarse.'
                  : 'Aelium gestiona la zona DNS autoritativa de tu dominio. Los cambios pueden tardar minutos en propagarse.'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button variant="secondary" onClick={refreshZone} disabled={refreshing}>
                {refreshing ? 'Actualizando…' : 'Refrescar'}
              </Button>
              <Button onClick={() => setModal({ kind: 'create' })}>
                Añadir record
              </Button>
            </div>
          </div>

          {nameservers.length > 0 && (
            <section
              style={{
                padding: 8,
                background: 'var(--surface-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 12,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              <strong style={{ fontWeight: 600 }}>Nameservers:</strong>{' '}
              {nameservers.join(' · ')}
            </section>
          )}

          {zone.dnssec && (
            <section
              style={{
                padding: 8,
                background: 'var(--surface-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}
            >
              <strong style={{ fontWeight: 600 }}>DNSSEC:</strong> esta zona
              está firmada. Los registros DS deben estar publicados en el
              registrar del dominio. La gestión (activar/rotar) se hace desde
              el panel del proveedor.
            </section>
          )}
        </div>
      </Card>

      <Card>
        {sorted.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
              Esta zona no tiene records DNS todavía
            </p>
            <p style={{ margin: '6px 0 16px', fontSize: 13 }}>
              Añade el primero con el botón de arriba — por ejemplo un record A
              apuntando el apex (<code>@</code>) a la IP del servidor.
            </p>
            <Button onClick={() => setModal({ kind: 'create' })}>
              Añadir el primer record
            </Button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--surface-secondary)' }}>
                <tr>
                  <th style={th}>Tipo</th>
                  <th style={th}>Nombre</th>
                  <th style={th}>Valor</th>
                  <th style={th}>TTL</th>
                  <th style={th}>Proxy</th>
                  <th style={{ ...th, textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((record) => (
                  <tr key={record.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={td}>
                      <Badge variant="neutral">{record.kind}</Badge>
                    </td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono, monospace)' }}>
                      {record.name}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontFamily: 'var(--font-mono, monospace)',
                        wordBreak: 'break-all',
                        maxWidth: 360,
                      }}
                    >
                      {record.value}
                    </td>
                    <td style={td}>
                      {record.ttl !== undefined ? `${record.ttl} s` : 'default'}
                    </td>
                    <td style={td}>
                      {record.proxy ? (
                        <Badge variant="success">on</Badge>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setModal({ kind: 'edit', record })}
                      >
                        Editar
                      </Button>
                      <span style={{ marginLeft: 6 }}>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setModal({ kind: 'delete', record })}
                        >
                          Eliminar
                        </Button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AlertBanner variant="info">
        <strong>Los cambios DNS son operacionalmente sensibles.</strong> Si
        tienes dudas sobre qué record afecta a qué servicio (web, email,
        verificaciones, etc.), revisa la documentación o consulta antes de
        modificar. Dominio: <code>{domain}</code>.
      </AlertBanner>

      {/* ── Modal create ─────────────────────────────────────────────────── */}
      {modal.kind === 'create' && (
        <DnsRecordForm
          mode="create"
          serviceId={serviceId}
          isAdmin={isAdmin}
          existingRecords={zone.records}
          open={true}
          onClose={() => setModal({ kind: 'closed' })}
          onSaved={() => handleSaved('create')}
        />
      )}

      {/* ── Modal edit ───────────────────────────────────────────────────── */}
      {modal.kind === 'edit' && (
        <DnsRecordForm
          mode="edit"
          serviceId={serviceId}
          isAdmin={isAdmin}
          existingRecords={zone.records}
          record={modal.record}
          open={true}
          onClose={() => setModal({ kind: 'closed' })}
          onSaved={() => handleSaved('edit')}
        />
      )}

      {/* ── Modal delete confirm ─────────────────────────────────────────── */}
      {modal.kind === 'delete' && (
        <Modal
          open={true}
          onClose={() => setModal({ kind: 'closed' })}
          title="Eliminar record DNS"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setModal({ kind: 'closed' })}
                disabled={deleting}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => handleDelete(modal.record)}
                disabled={deleting}
                loading={deleting}
              >
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 14 }}>
            ¿Eliminar este record DNS? Esta acción no se puede deshacer. La
            propagación del cambio puede tardar minutos.
          </p>
          <pre
            style={{
              marginTop: 12,
              padding: 10,
              background: 'var(--surface-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'var(--font-mono, monospace)',
              overflowX: 'auto',
            }}
          >
            {modal.record.kind} {modal.record.name} → {modal.record.value}
          </pre>
        </Modal>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: 0.04,
};

const td: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 13,
  color: 'var(--text-primary)',
  verticalAlign: 'middle',
};
