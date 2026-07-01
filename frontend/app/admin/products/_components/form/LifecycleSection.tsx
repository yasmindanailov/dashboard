import { Card, Input } from '../../../../components/ui';
import styles from '../../productForm.module.css';

/* ═══════════════════════════════════════════════════════════════════════════
   LifecycleSection — sección "Ciclo de vida" (política de impago) del
   formulario de producto (crear + editar). 1:1 con `admin/ProductoForm.dc.html`.
   Presentacional. Compartido (R15 DRY).
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  gracePeriod: string;
  onGraceChange: (v: string) => void;
  suspensionDays: string;
  onSuspensionChange: (v: string) => void;
  cancellationDays: string;
  onCancellationChange: (v: string) => void;
  clientCanPause: boolean;
  onClientCanPauseChange: (v: boolean) => void;
}

export function LifecycleSection({
  gracePeriod,
  onGraceChange,
  suspensionDays,
  onSuspensionChange,
  cancellationDays,
  onCancellationChange,
  clientCanPause,
  onClientCanPauseChange,
}: Props) {
  return (
    <Card>
      <div className={styles.formSection}>
        <h3 className={`${styles.sectionTitle} ${styles.sectionTitleTight}`}>
          Ciclo de vida
        </h3>
        <p className={styles.sectionHint}>
          Política de impago: gracia → suspensión → cancelación
        </p>
        <div className={styles.lifecycleGrid}>
          <Input
            label="Gracia (días)"
            type="number"
            min="0"
            value={gracePeriod}
            onChange={(e) => onGraceChange(e.target.value)}
          />
          <Input
            label="Suspensión (días)"
            type="number"
            min="0"
            value={suspensionDays}
            onChange={(e) => onSuspensionChange(e.target.value)}
          />
          <Input
            label="Cancelación (días)"
            type="number"
            min="0"
            value={cancellationDays}
            onChange={(e) => onCancellationChange(e.target.value)}
          />
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={clientCanPause}
              onChange={(e) => onClientCanPauseChange(e.target.checked)}
              className={styles.checkboxInput}
            />
            El cliente puede pausar
          </label>
        </div>
      </div>
    </Card>
  );
}
