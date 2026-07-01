import type { AdminPluginListItem } from '../../../../lib/api';
import { t } from '../../../../_shared/i18n';

/**
 * Opciones del Select de provisioner desde la lista del backend. Etiqueta humana
 * del manifest si existe; si no, fallback al slug. `manual` siempre disponible
 * (plugin trivial bootstrap). Si `currentSlug` no está registrado (plugin
 * removido / registry caído), se añade como opción "(no registrado)" para no
 * perder el valor del producto en edición.
 *
 * Compartido entre `NewProductForm` y `ProductEditForm` (F4·U27, R15 DRY).
 */
export function buildProvisionerOptions(
  plugins: readonly AdminPluginListItem[],
  currentSlug?: string,
): { value: string; label: string }[] {
  const seen = new Set<string>();
  const options: { value: string; label: string }[] = [];
  for (const p of plugins) {
    if (seen.has(p.slug)) continue;
    seen.add(p.slug);
    options.push({
      value: p.slug,
      label: p.manifest?.label ? `${t(p.manifest.label)} (${p.slug})` : p.slug,
    });
  }
  if (!seen.has('manual')) {
    options.push({ value: 'manual', label: 'manual' });
    seen.add('manual');
  }
  if (currentSlug && !seen.has(currentSlug)) {
    options.push({ value: currentSlug, label: `${currentSlug} (no registrado)` });
  }
  return options;
}
