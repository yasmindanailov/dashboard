import { SettingsService } from '../settings/settings.service';
import { esc } from './email-layout';

/**
 * Línea legal del footer del email (razón social + NIF + dirección fiscal) desde
 * los settings `branding.*` — MISMA fuente única que las facturas
 * (`invoice-pdf.getCompanyInfo`). Editable por el admin en /admin/settings →
 * grupo «Marca»; cacheada 60s por `SettingsService`.
 *
 * La usan tanto el pipeline de notificaciones (`NotificationTemplateService`)
 * como los correos de auth en código (`auth.templates`), para que TODOS los
 * emails muestren el mismo footer legal. Se inyecta como `legal` en
 * `buildEmailLayout`.
 */
export async function resolveEmailFooterLegal(
  settings: SettingsService,
): Promise<string> {
  const get = (key: string, fallback: string) =>
    settings.get('branding', key, fallback);
  const [name, nif, address, city, postal] = await Promise.all([
    get('company_name', 'Aelium S.L.'),
    get('company_nif', 'B12345678'),
    get('company_address', 'Calle Ejemplo 1'),
    get('company_city', 'Madrid'),
    get('company_postal_code', '28001'),
  ]);
  const year = new Date().getFullYear();
  return `© ${year} ${esc(name)} · NIF ${esc(nif)} · ${esc(address)}, ${esc(postal)} ${esc(city)}`;
}
