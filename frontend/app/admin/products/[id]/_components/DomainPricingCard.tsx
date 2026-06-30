'use client';

import { useState } from 'react';

import {
  Badge,
  Button,
  Card,
  Input,
  Table,
  useToast,
  type TableColumn,
} from '../../../../components/ui';
import {
  listDomainPricingAction,
  revertDomainPriceAction,
  setManualDomainPriceAction,
  syncDomainPricingAction,
  type DomainPricingRow,
} from '../../../../_shared/domains/_admin-actions';

/* ═══════════════════════════════════════════════════════════════════════════
   DomainPricingCard — Sprint 15D Fase 15D.G·1.

   Matriz de precios de un producto de tipo `domain` (la card "Planes de precio"
   no aplica: el precio vive por TLD en `domain_tld_pricing`). Permite:
     - ver coste·markup·precio·margen·fuente por TLD×operación×años,
     - "Sincronizar precios ahora" (cron manual del registrar),
     - fijar un override manual del precio de venta de una fila o revertirlo.
   ═══════════════════════════════════════════════════════════════════════════ */

const OP_LABELS: Record<DomainPricingRow['operation'], string> = {
  register: 'Registro',
  renew: 'Renovación',
  transfer: 'Transferencia',
  restore: 'Restauración',
};

interface Props {
  registrar: string;
  initialRows: DomainPricingRow[];
}

export default function DomainPricingCard({ registrar, initialRows }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<DomainPricingRow[]>(initialRows);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const startEdit = (row: DomainPricingRow) => {
    setEditingId(row.id);
    setEditPrice(row.price_amount);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditPrice('');
  };

  const replaceRow = (row: DomainPricingRow) =>
    setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));

  const saveEdit = async (row: DomainPricingRow) => {
    const price = Number.parseFloat(editPrice);
    if (!Number.isFinite(price) || price < 0) {
      toast('error', 'Introduce un precio válido.');
      return;
    }
    setBusyId(row.id);
    const res = await setManualDomainPriceAction(row.id, price);
    setBusyId(null);
    if (!res.ok) {
      toast('error', res.error);
      return;
    }
    replaceRow(res.data);
    cancelEdit();
    toast('success', `Precio de .${row.tld} fijado manualmente.`);
  };

  const revert = async (row: DomainPricingRow) => {
    setBusyId(row.id);
    const res = await revertDomainPriceAction(row.id);
    setBusyId(null);
    if (!res.ok) {
      toast('error', res.error);
      return;
    }
    replaceRow(res.data);
    toast('success', `.${row.tld} vuelve a precio automático.`);
  };

  const sync = async () => {
    setSyncing(true);
    const res = await syncDomainPricingAction();
    if (!res.ok) {
      setSyncing(false);
      toast('error', res.error);
      return;
    }
    const refreshed = await listDomainPricingAction(registrar);
    setSyncing(false);
    if (refreshed.ok) setRows(refreshed.data);
    const s = res.data;
    toast(
      'success',
      `Sincronizado: ${s.written} precios actualizados` +
        (s.skippedManual > 0 ? ` · ${s.skippedManual} overrides preservados` : ''),
    );
  };

  const columns: TableColumn<DomainPricingRow>[] = [
    { key: 'tld', header: 'TLD', render: (r) => <strong>.{r.tld}</strong> },
    { key: 'operation', header: 'Operación', render: (r) => OP_LABELS[r.operation] },
    { key: 'years', header: 'Años', align: 'center', render: (r) => r.years },
    {
      key: 'cost',
      header: 'Coste',
      align: 'right',
      render: (r) => `${r.cost_amount} ${r.cost_currency}`,
    },
    {
      key: 'price',
      header: 'Precio venta',
      align: 'right',
      render: (r) =>
        editingId === r.id ? (
          <Input
            type="number"
            step="0.01"
            min="0"
            value={editPrice}
            onChange={(e) => setEditPrice(e.target.value)}
            aria-label={`Precio de .${r.tld}`}
          />
        ) : (
          <strong>
            {r.price_amount} {r.price_currency}
          </strong>
        ),
    },
    {
      key: 'margin',
      header: 'Margen',
      align: 'right',
      render: (r) =>
        r.effective_margin_pct !== null ? (
          <span
            style={{ color: 'var(--success-dark)', fontWeight: 'var(--font-weight-semibold)' }}
          >
            {r.effective_margin_pct}%
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'source',
      header: 'Fuente',
      align: 'center',
      render: (r) =>
        r.source === 'manual' ? (
          <Badge variant="brand">Manual</Badge>
        ) : (
          <Badge variant="neutral">Auto</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) =>
        editingId === r.id ? (
          <span style={{ display: 'inline-flex', gap: 8 }}>
            <Button
              variant="primary"
              loading={busyId === r.id}
              onClick={() => void saveEdit(r)}
            >
              Guardar
            </Button>
            <Button variant="secondary" onClick={cancelEdit}>
              Cancelar
            </Button>
          </span>
        ) : (
          <span style={{ display: 'inline-flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => startEdit(r)}>
              Editar
            </Button>
            {r.source === 'manual' && (
              <Button
                variant="secondary"
                loading={busyId === r.id}
                onClick={() => void revert(r)}
              >
                Revertir
              </Button>
            )}
          </span>
        ),
    },
  ];

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          Precios por extensión (TLD)
        </h2>
        <Button variant="secondary" loading={syncing} onClick={() => void sync()}>
          Sincronizar precios ahora
        </Button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 12px' }}>
        El precio = coste mayorista × (1 + markup del plugin). Edita una fila para
        fijar un <strong>override manual</strong> (el cron de sincronización no lo
        pisa); revierte para volver al cálculo automático.
      </p>
      <Table
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        emptyTitle="Sin precios todavía"
        emptyDescription='Pulsa "Sincronizar precios ahora" para traerlos del registrar.'
      />
    </Card>
  );
}
