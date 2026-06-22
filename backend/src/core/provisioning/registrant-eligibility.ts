/**
 * Sprint 15D Fase 15D.F.2 — elegibilidad de registrante por TLD (DOM-INV-5).
 *
 * Reglas de registro REGULADAS (del registro, no del registrar): `.es` exige
 * NIF/NIE, `.eu` exige residencia en la UE. Se validan **antes de cobrar**
 * (pre-checkout, ADR-084 §3 DOM-INV-5) para no cobrar un dominio que el cliente
 * no puede registrar.
 *
 * Helper PURO (sin DI, sin HTTP): vive en `core/` para que tanto el checkout
 * (`billing`) como la superficie de dominios lo reusen sin acoplarse a un plugin
 * concreto (R4 — las reglas `.es`/`.eu` son universales, no de ResellerClub). El
 * plugin mantiene su defensa al register (`REGISTRANT_INELIGIBLE`) como backstop.
 *
 * [Generalización futura: un registrar podría declarar requisitos por TLD vía el
 *  contrato; YAGNI en v1 con un único registrar y `.es`/`.eu` conocidos.]
 */

export type TldRegistrantRequirement = 'es_tax_id' | 'eu_residency';

/** Estados miembro de la UE (ISO-3166 alpha-2) — base de la residencia `.eu`. */
const EU_MEMBER_STATES: ReadonlySet<string> = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
]);

/** Requisito de registrante del TLD (sin punto, lowercase), o `null` si no regulado. */
export function tldRegistrantRequirement(
  tld: string,
): TldRegistrantRequirement | null {
  switch (tld.trim().toLowerCase()) {
    case 'es':
      return 'es_tax_id';
    case 'eu':
      return 'eu_residency';
    default:
      return null;
  }
}

export interface RegistrantData {
  readonly taxId?: string | null;
  readonly countryCode?: string | null;
}

export interface EligibilityResult {
  readonly eligible: boolean;
  /** Mensaje accionable para el cliente (solo cuando `eligible=false`). */
  readonly reason?: string;
}

/**
 * Valida que el registrante cumple los requisitos del TLD. TLDs no regulados
 * (`.com`/`.net`/`.org`) → siempre elegibles. No lanza: devuelve el resultado y
 * deja que el caller (checkout) traduzca a su error HTTP.
 */
export function checkTldRegistrantEligibility(
  tld: string,
  registrant: RegistrantData,
): EligibilityResult {
  const requirement = tldRegistrantRequirement(tld);
  if (!requirement) return { eligible: true };

  if (requirement === 'es_tax_id') {
    return registrant.taxId?.trim()
      ? { eligible: true }
      : {
          eligible: false,
          reason:
            'Los dominios .es requieren un NIF/NIE. Añádelo en tu perfil de cliente antes de continuar.',
        };
  }

  // eu_residency
  const cc = registrant.countryCode?.trim().toUpperCase();
  return cc && EU_MEMBER_STATES.has(cc)
    ? { eligible: true }
    : {
        eligible: false,
        reason:
          'Los dominios .eu requieren residencia en un país de la Unión Europea. Revisa el país en tu perfil de cliente.',
      };
}
