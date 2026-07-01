import { Card, Input, Textarea } from '../../../../components/ui';
import styles from '../../productForm.module.css';

/* ═══════════════════════════════════════════════════════════════════════════
   IdentitySection — sección "Identidad" del formulario de producto (crear +
   editar). 1:1 con `admin/ProductoForm.dc.html`. Presentacional: recibe los
   valores + callbacks del form contenedor (R5). Compartido (R15 DRY).
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  name: string;
  onNameChange: (v: string) => void;
  slug: string;
  onSlugChange: (v: string) => void;
  badgeText: string;
  onBadgeChange: (v: string) => void;
  partnerCommission: string;
  onPartnerCommissionChange: (v: string) => void;
  shortDescription: string;
  onShortDescriptionChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  /** Placeholder del nombre según el tipo (solo crear). */
  namePlaceholder?: string;
  /** Subtítulo bajo el título (editar: "Tipo · slug"). */
  subtitle?: string;
}

export function IdentitySection({
  name,
  onNameChange,
  slug,
  onSlugChange,
  badgeText,
  onBadgeChange,
  partnerCommission,
  onPartnerCommissionChange,
  shortDescription,
  onShortDescriptionChange,
  description,
  onDescriptionChange,
  namePlaceholder,
  subtitle,
}: Props) {
  return (
    <Card>
      <div className={styles.formSection}>
        <h3 className={styles.sectionTitle}>Identidad</h3>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        <div className={styles.formGrid}>
          <Input
            label="Nombre *"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={namePlaceholder}
          />
          <Input
            label="Slug"
            value={slug}
            onChange={(e) => onSlugChange(e.target.value)}
            className={styles.monoInput}
          />
          <Input
            label="Badge"
            value={badgeText}
            onChange={(e) => onBadgeChange(e.target.value)}
            placeholder="Más popular"
          />
          <Input
            label="Comisión partner (%)"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={partnerCommission}
            onChange={(e) => onPartnerCommissionChange(e.target.value)}
            placeholder="20"
          />
        </div>
        <div className={styles.stackTop}>
          <Input
            label="Descripción corta"
            value={shortDescription}
            onChange={(e) => onShortDescriptionChange(e.target.value)}
            maxLength={500}
            placeholder="Una línea de resumen"
          />
          <Textarea
            label="Descripción completa"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            rows={3}
            placeholder="Detalle del producto…"
          />
        </div>
      </div>
    </Card>
  );
}
