import { Card, IconWell } from '../../../../components/ui';
import { PRODUCT_TYPES } from '../constants';
import styles from '../../productForm.module.css';

/* ═══════════════════════════════════════════════════════════════════════════
   TypeSelectorGrid — paso 1 del alta de producto: rejilla de tipos creables
   (icon-well + label + píldora Addon + descripción). 1:1 con
   `admin/ProductoForm.dc.html`. `support_inside` va aparte (ADR-075) → no está
   en `PRODUCT_TYPES`.
   ═══════════════════════════════════════════════════════════════════════════ */

export function TypeSelectorGrid({
  onSelect,
}: {
  onSelect: (value: string) => void;
}) {
  return (
    <Card>
      <div className={styles.formSection}>
        <p className={styles.stepDesc}>¿Qué tipo de producto quieres crear?</p>
        <div className={styles.typeGrid}>
          {PRODUCT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => onSelect(t.value)}
              className={styles.typeCard}
            >
              <div className={styles.typeCardHeader}>
                <IconWell icon={t.icon} tone="brand" size="sm" />
                <span className={styles.typeLabel}>{t.label}</span>
                {t.isAddon && <span className={styles.addonBadge}>Addon</span>}
              </div>
              <p className={styles.typeDesc}>{t.description}</p>
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
