/* ═══════════════════════════════════════
   New Product — Constants & types
   Ref: DECISIONS.md §6, §7, §8, §27
   ═══════════════════════════════════════ */

export const PRODUCT_TYPES = [
  {
    value: 'hosting_web', label: 'Hosting Web', icon: '', isAddon: false,
    description: 'Planes de hosting web (Web Inicio, Web Pro, Web Business)',
    defaultProvisioner: 'enhance_cp',
  },
  {
    value: 'domain', label: 'Dominio', icon: '', isAddon: false,
    description: 'Registro y transferencia de dominios',
    defaultProvisioner: 'resellerclub',
  },
  {
    value: 'docker_service', label: 'Docker Service', icon: '', isAddon: false,
    description: 'Contenedores Docker (Nextcloud, OpenClaw, etc.)',
    defaultProvisioner: 'docker_engine',
  },
  {
    value: 'support_inside', label: 'Support Inside', icon: '', isAddon: true,
    description: 'Addon global de cuenta — planes Básico, Medium, Pro (§7)',
    defaultProvisioner: 'internal',
  },
  {
    value: 'we_do_it', label: 'We Do It For You', icon: '', isAddon: true,
    description: 'Addon por producto — desarrollo/configuración (§8)',
    defaultProvisioner: 'manual',
  },
  {
    value: 'custom_service', label: 'Proyecto Custom', icon: '', isAddon: false,
    description: 'Proyectos manuales a escala (ERP, CRM). Creación manual.',
    defaultProvisioner: 'manual',
  },
] as const;

export const CYCLE_OPTIONS = [
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'annual', label: 'Anual' },
  { value: 'one_time', label: 'Único' },
] satisfies { value: string; label: string }[];

export interface PricingRow {
  billing_cycle: string;
  price: string;
  setup_fee: string;
}

