import {
  checkTldRegistrantEligibility,
  tldRegistrantRequirement,
} from './registrant-eligibility';

/**
 * Tests unit del helper de elegibilidad de registrante (DOM-INV-5) — 15D.F.2.
 */
describe('registrant-eligibility — Sprint 15D Fase 15D.F.2 (DOM-INV-5)', () => {
  describe('tldRegistrantRequirement', () => {
    it('.es → es_tax_id; .eu → eu_residency; otros → null', () => {
      expect(tldRegistrantRequirement('es')).toBe('es_tax_id');
      expect(tldRegistrantRequirement('EU')).toBe('eu_residency');
      expect(tldRegistrantRequirement('com')).toBeNull();
      expect(tldRegistrantRequirement('net')).toBeNull();
      expect(tldRegistrantRequirement(' Es ')).toBe('es_tax_id'); // trim + lower
    });
  });

  describe('checkTldRegistrantEligibility', () => {
    it('TLD no regulado → siempre elegible (sin mirar el registrante)', () => {
      expect(checkTldRegistrantEligibility('com', {}).eligible).toBe(true);
      expect(
        checkTldRegistrantEligibility('org', { taxId: null, countryCode: null })
          .eligible,
      ).toBe(true);
    });

    it('.es con NIF → elegible; sin NIF → no elegible + razón', () => {
      expect(
        checkTldRegistrantEligibility('es', { taxId: '12345678Z' }).eligible,
      ).toBe(true);
      const miss = checkTldRegistrantEligibility('es', { taxId: '  ' });
      expect(miss.eligible).toBe(false);
      expect(miss.reason).toMatch(/NIF/i);
    });

    it('.eu con país UE → elegible; país no-UE o ausente → no elegible', () => {
      expect(
        checkTldRegistrantEligibility('eu', { countryCode: 'es' }).eligible,
      ).toBe(true);
      expect(
        checkTldRegistrantEligibility('eu', { countryCode: 'DE' }).eligible,
      ).toBe(true);
      expect(
        checkTldRegistrantEligibility('eu', { countryCode: 'US' }).eligible,
      ).toBe(false);
      const miss = checkTldRegistrantEligibility('eu', { countryCode: null });
      expect(miss.eligible).toBe(false);
      expect(miss.reason).toMatch(/UE|Unión Europea/i);
    });
  });
});
