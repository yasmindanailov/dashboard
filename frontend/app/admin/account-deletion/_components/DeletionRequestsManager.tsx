'use client';

import { useState, useTransition } from 'react';

import { Button, Badge, useToast } from '../../../components/ui';
import { rejectDeletionAction, executeDeletionAction } from '../_actions';

/* ═══════════════════════════════════════
   Client island: revisión de solicitudes de borrado de cuenta (GL-5 / H3b.2).
   Rechazar (con nota) o Ejecutar (anonimizar). "Ejecutar" se deshabilita si hay
   servicios vivos o facturas impagadas (el backend también lo bloquea, 409).
   ═══════════════════════════════════════ */

export interface DeletionRequestRow {
  id: string;
  user_id: string;
  status: string;
  reason: string | null;
  requested_at: string;
  user: {
    email: string;
    first_name: string;
    last_name: string;
    status: string;
  };
  blockers: { active_services: number; unpaid_invoices: number };
}

export default function DeletionRequestsManager({
  requests,
}: {
  requests: DeletionRequestRow[];
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { toast } = useToast();

  function reject(id: string) {
    const note = window.prompt('Motivo del rechazo (se le mostrará al cliente):');
    if (note === null || note.trim() === '') return;
    setPendingId(id);
    startTransition(async () => {
      const r = await rejectDeletionAction(id, note.trim());
      setPendingId(null);
      toast(r.ok ? 'success' : 'error', r.ok ? 'Solicitud rechazada.' : r.error);
    });
  }

  function execute(id: string, email: string) {
    if (
      !window.confirm(
        `¿Anonimizar la cuenta de ${email}? Es IRREVERSIBLE. Las facturas se ` +
          `conservan por obligación legal.`,
      )
    ) {
      return;
    }
    setPendingId(id);
    startTransition(async () => {
      const r = await executeDeletionAction(id);
      setPendingId(null);
      toast(
        r.ok ? 'success' : 'error',
        r.ok ? 'Cuenta anonimizada.' : r.error,
      );
    });
  }

  if (requests.length === 0) {
    return (
      <div
        style={{
          padding: 32,
          textAlign: 'center',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          color: 'var(--text-secondary)',
        }}
      >
        No hay solicitudes de borrado pendientes.
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {requests.map((r) => {
        const blocked =
          r.blockers.active_services > 0 || r.blockers.unpaid_invoices > 0;
        const busy = pendingId === r.id;
        return (
          <div
            key={r.id}
            style={{
              padding: 16,
              borderTop: '1px solid var(--border)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ minWidth: 240 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {[r.user.first_name, r.user.last_name].filter(Boolean).join(' ')}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {r.user.email}
              </div>
              <div
                style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}
              >
                Solicitado el {new Date(r.requested_at).toLocaleString('es-ES')}
                {r.reason ? ` · «${r.reason}»` : ''}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {blocked ? (
                <Badge variant="warning">
                  {r.blockers.active_services} servicio(s) ·{' '}
                  {r.blockers.unpaid_invoices} impago(s)
                </Badge>
              ) : (
                <Badge variant="success">Sin bloqueadores</Badge>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="secondary"
                onClick={() => reject(r.id)}
                disabled={busy}
              >
                Rechazar
              </Button>
              <Button
                variant="danger"
                onClick={() => execute(r.id, r.user.email)}
                disabled={busy || blocked}
                title={
                  blocked
                    ? 'Resuelve antes los servicios vivos y los impagos'
                    : undefined
                }
              >
                {busy ? 'Procesando…' : 'Anonimizar'}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
