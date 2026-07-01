import { Info } from 'lucide-react';
import styles from '../../productForm.module.css';

/* ═══════════════════════════════════════════════════════════════════════════
   Banners del formulario de producto — 1:1 con `admin/ProductoForm.dc.html`.
   AddonBanner (azul, cabecera del paso 2 en addons) + ProductInfoBanner (gris,
   nota informativa por tipo: dominio / we_do_it / custom).
   ═══════════════════════════════════════════════════════════════════════════ */

export function AddonBanner({ text }: { text: string }) {
  return (
    <div className={styles.addonBanner}>
      <span className={styles.addonBannerPill}>Addon</span>
      <span className={styles.addonBannerText}>{text}</span>
    </div>
  );
}

export function ProductInfoBanner({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className={styles.infoBanner}>
      <Info size={17} strokeWidth={1.6} className={styles.infoBannerIcon} />
      <span className={styles.infoBannerText}>
        <strong>{title}</strong> — {text}
      </span>
    </div>
  );
}
