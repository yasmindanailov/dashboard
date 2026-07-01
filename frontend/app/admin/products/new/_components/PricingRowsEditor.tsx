import { Plus, X } from 'lucide-react';

import { Card, Input, Select } from '../../../../components/ui';
import { CYCLE_OPTIONS, type PricingRow } from '../constants';
import styles from '../../productForm.module.css';

/* ═══════════════════════════════════════════════════════════════════════════
   PricingRowsEditor — sección "Pricing" del ALTA de producto: filas editables
   inline (ciclo · precio · setup fee · quitar) + "Añadir plan". 1:1 con
   `admin/ProductoForm.dc.html`. En editar, los planes son persistidos (CRUD
   atómico) → otra UI.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  rows: PricingRow[];
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onUpdate: (idx: number, field: keyof PricingRow, val: string) => void;
}

export function PricingRowsEditor({ rows, onAdd, onRemove, onUpdate }: Props) {
  return (
    <Card>
      <div className={styles.formSection}>
        <h3 className={styles.sectionTitle}>Pricing</h3>
        <div className={styles.pricingRows}>
          {rows.map((row, idx) => (
            <div key={idx} className={styles.pricingGridRow}>
              <Select
                label="Ciclo"
                value={row.billing_cycle}
                onChange={(e) => onUpdate(idx, 'billing_cycle', e.target.value)}
                options={CYCLE_OPTIONS}
              />
              <Input
                label="Precio (€) *"
                type="number"
                step="0.01"
                min="0"
                value={row.price}
                onChange={(e) => onUpdate(idx, 'price', e.target.value)}
                placeholder="9.99"
              />
              <Input
                label="Setup fee (€)"
                type="number"
                step="0.01"
                min="0"
                value={row.setup_fee}
                onChange={(e) => onUpdate(idx, 'setup_fee', e.target.value)}
                placeholder="0"
              />
              <button
                type="button"
                onClick={() => onRemove(idx)}
                disabled={rows.length <= 1}
                className={styles.pricingRemoveBtn}
                aria-label="Quitar plan"
              >
                <X size={16} strokeWidth={1.6} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={onAdd} className={styles.addPricingBtn}>
          <Plus size={14} strokeWidth={2} />
          Añadir plan
        </button>
      </div>
    </Card>
  );
}
