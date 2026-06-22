/**
 * Tests unit `audit-sanitizer` — Sprint 15C.II Fase D (2026-05-10).
 *
 * Cobertura genérica (test contract canónico ADR-083 Amendment A4.5):
 *   - Redact case-insensitive de password|secret|token|apiKey|privateKey.
 *   - Walk recursivo (objetos anidados, arrays con objetos, mixed).
 *   - allowList opcional skip per-key.
 *   - Default `[]` allowList: TODOS los matches se redactan.
 *   - Idempotencia (aplicar dos veces no rompe).
 *   - Null / undefined input pasa intacto.
 *   - Inputs primitivos no-objeto pasan intactos cuando se usan como hijos.
 */

import {
  CANONICAL_SENSITIVE_KEY_REGEX,
  REDACTED_FIELD_PLACEHOLDER,
  redactSensitiveFields,
} from './audit-sanitizer';

describe('audit-sanitizer — Sprint 15C.II Fase D (ADR-083 Amendment A4.5)', () => {
  describe('regex canónico (case-insensitive)', () => {
    it.each([
      'password',
      'Password',
      'PASSWORD',
      'newPassword',
      'old_password',
      'secret',
      'Secret',
      'apiSecret',
      'token',
      'Token',
      'accessToken',
      'refresh_token',
      'apiKey',
      'apiKEY',
      'ApiKey',
      'privateKey',
      'PrivateKey',
      'PRIVATEKEY',
      // Sprint 15D.F (ADR-081 A5): el EPP/auth code de registrar.
      'authCode',
      'auth_code',
      'authcode',
      'domsecret', // matchea por "secret"
    ])('matches sensitive key "%s"', (key) => {
      expect(CANONICAL_SENSITIVE_KEY_REGEX.test(key)).toBe(true);
    });

    it.each([
      'username',
      'email',
      'service_id',
      'plan_id',
      'domain',
      'enhance_org_id',
      'subscription_id',
      'side_effects',
      'recordId',
      'note',
      'author', // contiene "auth" pero NO matchea "auth.?code" (no over-match)
    ])('does NOT match neutral key "%s"', (key) => {
      expect(CANONICAL_SENSITIVE_KEY_REGEX.test(key)).toBe(false);
    });
  });

  describe('redactSensitiveFields — flat objects', () => {
    it('redacta password con [REDACTED]', () => {
      const out = redactSensitiveFields({ password: 'super-secret-pwd' });
      expect(out).toEqual({ password: REDACTED_FIELD_PLACEHOLDER });
    });

    it('redacta múltiples keys sensibles en el mismo objeto', () => {
      const out = redactSensitiveFields({
        password: 'pwd',
        apiKey: 'key',
        privateKey: 'priv',
        token: 'tok',
        secret: 'sec',
      });
      expect(out).toEqual({
        password: REDACTED_FIELD_PLACEHOLDER,
        apiKey: REDACTED_FIELD_PLACEHOLDER,
        privateKey: REDACTED_FIELD_PLACEHOLDER,
        token: REDACTED_FIELD_PLACEHOLDER,
        secret: REDACTED_FIELD_PLACEHOLDER,
      });
    });

    it('preserva keys no sensibles intactas', () => {
      const out = redactSensitiveFields({
        username: 'alice',
        password: 'pwd',
        plan_id: 7,
        active: true,
        notes: null,
      });
      expect(out).toEqual({
        username: 'alice',
        password: REDACTED_FIELD_PLACEHOLDER,
        plan_id: 7,
        active: true,
        notes: null,
      });
    });

    it('case-insensitive — Password / PASSWORD / apiKEY se redactan', () => {
      const out = redactSensitiveFields({
        Password: 'a',
        PASSWORD: 'b',
        apiKEY: 'c',
      });
      expect(out).toEqual({
        Password: REDACTED_FIELD_PLACEHOLDER,
        PASSWORD: REDACTED_FIELD_PLACEHOLDER,
        apiKEY: REDACTED_FIELD_PLACEHOLDER,
      });
    });

    it('redacta authCode / domsecret (get_auth_code 15D.F — ADR-081 A5)', () => {
      const out = redactSensitiveFields({
        authCode: 'Epp-Secret-123',
        domsecret: 'xyz',
        fqdn: 'example.com',
      });
      expect(out).toEqual({
        authCode: REDACTED_FIELD_PLACEHOLDER,
        domsecret: REDACTED_FIELD_PLACEHOLDER,
        fqdn: 'example.com',
      });
    });

    it('substring match — newPassword / old_password / accessToken se redactan', () => {
      const out = redactSensitiveFields({
        newPassword: 'np',
        old_password: 'op',
        accessToken: 'at',
        refresh_token: 'rt',
      });
      expect(out).toEqual({
        newPassword: REDACTED_FIELD_PLACEHOLDER,
        old_password: REDACTED_FIELD_PLACEHOLDER,
        accessToken: REDACTED_FIELD_PLACEHOLDER,
        refresh_token: REDACTED_FIELD_PLACEHOLDER,
      });
    });
  });

  describe('redactSensitiveFields — walk recursivo', () => {
    it('redacta dentro de objetos anidados', () => {
      const out = redactSensitiveFields({
        user: {
          email: 'a@b.com',
          credentials: { password: 'pwd', apiKey: 'k' },
        },
      });
      expect(out).toEqual({
        user: {
          email: 'a@b.com',
          credentials: {
            password: REDACTED_FIELD_PLACEHOLDER,
            apiKey: REDACTED_FIELD_PLACEHOLDER,
          },
        },
      });
    });

    it('redacta dentro de arrays con objetos', () => {
      const out = redactSensitiveFields({
        members: [
          { id: 1, password: 'p1' },
          { id: 2, password: 'p2', name: 'b' },
        ],
      });
      expect(out).toEqual({
        members: [
          { id: 1, password: REDACTED_FIELD_PLACEHOLDER },
          { id: 2, password: REDACTED_FIELD_PLACEHOLDER, name: 'b' },
        ],
      });
    });

    it('redacta en estructuras mixed (object → array → object con keys sensibles)', () => {
      const out = redactSensitiveFields({
        sessions: [
          {
            id: 's1',
            credentials: [
              { kind: 'access', value: 'a1', password: 'pwd1' },
              { kind: 'refresh', value: 'r1', secret: 'sec1' },
            ],
          },
        ],
        metadata: { region: 'eu' },
      });
      expect(out).toEqual({
        sessions: [
          {
            id: 's1',
            credentials: [
              {
                kind: 'access',
                value: 'a1',
                password: REDACTED_FIELD_PLACEHOLDER,
              },
              {
                kind: 'refresh',
                value: 'r1',
                secret: REDACTED_FIELD_PLACEHOLDER,
              },
            ],
          },
        ],
        metadata: { region: 'eu' },
      });
    });

    it('over-redact safety: plural "tokens" como key contenedora redacta el valor entero (substring match)', () => {
      // Doctrina canónica: el regex matchea cualquier key cuyo nombre
      // CONTENGA "token" — incluido el plural "tokens". Sustituye el
      // valor entero (array, object, primitive) por '[REDACTED]'. Es
      // over-redact intencional: prefiere falsos positivos a leakage.
      // Si un plugin necesita auditar una colección llamada "tokens"
      // sin redactar (uncommon), declara `allowsSensitiveDataInAudit:
      // ['tokens']` (requiere ADR específico per ADR-083 Amendment A4.5).
      const out = redactSensitiveFields({
        tokens: [{ kind: 'access', value: 'a1' }],
      });
      expect(out).toEqual({ tokens: REDACTED_FIELD_PLACEHOLDER });
    });

    it('preserva primitives en arrays', () => {
      const out = redactSensitiveFields({ ids: [1, 2, 3], tags: ['a', 'b'] });
      expect(out).toEqual({ ids: [1, 2, 3], tags: ['a', 'b'] });
    });
  });

  describe('redactSensitiveFields — allowList', () => {
    it('default [] (no allowList): TODOS los matches se redactan', () => {
      const out = redactSensitiveFields({ password: 'pwd', token: 'tok' });
      expect(out).toEqual({
        password: REDACTED_FIELD_PLACEHOLDER,
        token: REDACTED_FIELD_PLACEHOLDER,
      });
    });

    it('allowList con un campo: ese pasa intacto, el resto se redacta', () => {
      const out = redactSensitiveFields(
        { password: 'pwd', token: 'tok', secret: 'sec' },
        ['token'],
      );
      expect(out).toEqual({
        password: REDACTED_FIELD_PLACEHOLDER,
        token: 'tok',
        secret: REDACTED_FIELD_PLACEHOLDER,
      });
    });

    it('allowList aplica a keys exactas (case-sensitive en el match exact)', () => {
      // El allowList se compara con `Array.includes` (===), por tanto
      // case-sensitive en el exacto. La key debe matchear letra-a-letra.
      const out = redactSensitiveFields(
        { Password: 'pwd1', password: 'pwd2' },
        ['Password'],
      );
      expect(out).toEqual({
        Password: 'pwd1', // intacta (en allowList)
        password: REDACTED_FIELD_PLACEHOLDER, // redactada (no en allowList)
      });
    });

    it('allowList aplica a todos los niveles del walk', () => {
      const out = redactSensitiveFields(
        {
          password: 'pwd',
          inner: { token: 'tok', other_token: 'ok' },
        },
        ['other_token'],
      );
      expect(out).toEqual({
        password: REDACTED_FIELD_PLACEHOLDER,
        inner: {
          token: REDACTED_FIELD_PLACEHOLDER,
          other_token: 'ok',
        },
      });
    });
  });

  describe('redactSensitiveFields — idempotencia', () => {
    it('aplicar dos veces produce el mismo resultado', () => {
      const input = { password: 'pwd', user: { token: 'tok' } };
      const once = redactSensitiveFields(input);
      const twice = redactSensitiveFields(once);
      expect(twice).toEqual(once);
      expect(twice).toEqual({
        password: REDACTED_FIELD_PLACEHOLDER,
        user: { token: REDACTED_FIELD_PLACEHOLDER },
      });
    });

    it('no muta el input original (devuelve fresh object)', () => {
      const input = { password: 'pwd' };
      const out = redactSensitiveFields(input);
      expect(input.password).toBe('pwd');
      expect(out).not.toBe(input);
    });
  });

  describe('redactSensitiveFields — edge cases', () => {
    it('null pasa intacto', () => {
      expect(redactSensitiveFields(null)).toBeNull();
    });

    it('undefined pasa intacto', () => {
      expect(redactSensitiveFields(undefined)).toBeUndefined();
    });

    it('objeto vacío devuelve objeto vacío', () => {
      expect(redactSensitiveFields({})).toEqual({});
    });

    it('valores null en keys sensibles también se redactan (no se conservan)', () => {
      // La doctrina canónica dice: si la key es sensible, el VALOR se
      // sustituye por '[REDACTED]' independientemente de su contenido.
      // Esto vale incluso si el valor es null — preserva R12 cuando un
      // plugin retorna explícitamente `password: null` (no leak por
      // omisión, pero tampoco "señal" de que el campo existió).
      const out = redactSensitiveFields({ password: null, ok: null });
      expect(out).toEqual({
        password: REDACTED_FIELD_PLACEHOLDER,
        ok: null,
      });
    });

    it('valores undefined en keys sensibles también se redactan', () => {
      const out = redactSensitiveFields({ password: undefined } as Record<
        string,
        unknown
      >);
      expect(out).toEqual({ password: REDACTED_FIELD_PLACEHOLDER });
    });

    it('arrays como input top-level NO se soportan (firma exige object)', () => {
      // El sanitizer está pensado para `ActionResult.data` que es siempre
      // `Record<string, unknown>`. Un array top-level no es un caso real.
      // El test documenta el comportamiento si alguien lo invocara mal:
      // walk() devuelve un array sanitizado, pero el tipo del callsite
      // canónico (`executeActionWithCacheInvalidation`) garantiza que
      // siempre se pasa un Record.
      const arr = [{ password: 'p' }] as unknown as Record<string, unknown>;
      const out = redactSensitiveFields(arr);
      expect(out).toEqual([{ password: REDACTED_FIELD_PLACEHOLDER }]);
    });
  });

  describe('redactSensitiveFields — caso real plugin enhance_cp', () => {
    it('redacta data.password de actionResetAccountPassword (caso G2)', () => {
      // Caso real Sprint 15C Fase 15C.C: `actionResetAccountPassword`
      // retorna `{ password: '<32 hex chars>' }` en `ActionResult.data`.
      // El wrapper auditor redacta antes de persistir audit_change_log.
      const actionData = {
        password: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
      };
      const out = redactSensitiveFields(actionData);
      expect(out).toEqual({ password: REDACTED_FIELD_PLACEHOLDER });
    });

    it('preserva data.zone.records (caso list_dns_records — sin sensibles)', () => {
      // Caso real Sprint 15C Fase 15C.C: `actionListDnsRecords` retorna
      // `{ zone: { origin, soa, records } }`. NINGUNO sensible.
      const actionData = {
        zone: {
          origin: 'cliente.es',
          soa: { adminEmail: 'h@aelium.net', nameServer: 'ns1.aelium.net' },
          records: [
            { id: 'r1', kind: 'A', name: '@', value: '1.2.3.4' },
            { id: 'r2', kind: 'TXT', name: '@', value: 'v=spf1' },
          ],
        },
      };
      const out = redactSensitiveFields(actionData);
      expect(out).toEqual(actionData);
    });

    it('redacta password incluso si está anidado dentro de data.changes', () => {
      // Caso defensivo futuro: si un plugin retorna un shape complejo
      // donde la password vive en una sub-clave (ej. `data.changes.password`),
      // el walk recursivo la captura igualmente.
      const actionData = {
        changes: {
          field: 'password',
          before: '[REDACTED]',
          after: { password: 'new-pwd-value' },
        },
      };
      const out = redactSensitiveFields(actionData);
      expect(out).toEqual({
        changes: {
          field: 'password', // 'field' NO matchea regex (es metadato, no contiene secreto)
          before: '[REDACTED]',
          after: { password: REDACTED_FIELD_PLACEHOLDER },
        },
      });
    });
  });
});
