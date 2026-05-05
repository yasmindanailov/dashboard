import * as crypto from 'crypto';

import { ConfigService } from '@nestjs/config';

import {
  EncryptedSecret,
  SecretVaultError,
  SecretVaultService,
} from './secret-vault.service';

/**
 * Tests unit SecretVaultService — Sprint 15A Fase C (ADR-080 §3).
 *
 * Cobertura:
 *   - Bootcheck: ENCRYPTION_KEY ausente → fail-fast.
 *   - Bootcheck: ENCRYPTION_KEY mal formada (longitud, no-hex) → fail-fast.
 *   - Bootcheck: ENCRYPTION_KEY válida → instancia OK.
 *   - encrypt → blob con shape canónico (ciphertext + iv + tag + key_version).
 *   - encrypt → IV único en cada llamada (random per-secret).
 *   - encrypt/decrypt round-trip → texto original recuperado.
 *   - decrypt con tag manipulado → SecretVaultError(DECRYPT_FAILED).
 *   - decrypt con ciphertext manipulado → SecretVaultError(DECRYPT_FAILED).
 *   - decrypt con iv distinto → SecretVaultError(DECRYPT_FAILED).
 *   - decrypt con key_version distinta a la actual → SecretVaultError(KEY_VERSION_MISMATCH).
 *   - encryptRecord/decryptRecord round-trip preserva keys + values.
 *   - encryptRecord asigna IV distinto por campo (no reuso).
 */

const VALID_KEY = 'a'.repeat(64); // 32 bytes = 64 hex chars

function buildConfig(value: string | undefined): ConfigService {
  return {
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (key !== 'ENCRYPTION_KEY') {
        throw new Error(`Unexpected config key: ${key}`);
      }
      if (value === undefined) {
        throw new Error(`Missing config: ${key}`);
      }
      return value;
    }),
  } as unknown as ConfigService;
}

describe('SecretVaultService — Sprint 15A Fase C', () => {
  describe('bootcheck', () => {
    it('lanza si ENCRYPTION_KEY está ausente', () => {
      expect(() => new SecretVaultService(buildConfig(undefined))).toThrow();
    });

    it('lanza si ENCRYPTION_KEY no es 64 caracteres', () => {
      expect(() => new SecretVaultService(buildConfig('abc'))).toThrow(
        /must be exactly 64 hex characters/,
      );
    });

    it('lanza si ENCRYPTION_KEY tiene caracteres no-hex', () => {
      expect(() => new SecretVaultService(buildConfig('z'.repeat(64)))).toThrow(
        /must be exactly 64 hex characters/,
      );
    });

    it('acepta ENCRYPTION_KEY válida de 64 hex chars', () => {
      expect(
        () => new SecretVaultService(buildConfig(VALID_KEY)),
      ).not.toThrow();
    });

    it('acepta ENCRYPTION_KEY generada con crypto.randomBytes(32).toString("hex")', () => {
      const realKey = crypto.randomBytes(32).toString('hex');
      expect(() => new SecretVaultService(buildConfig(realKey))).not.toThrow();
    });
  });

  describe('encrypt + decrypt', () => {
    let vault: SecretVaultService;
    beforeEach(() => {
      vault = new SecretVaultService(buildConfig(VALID_KEY));
    });

    it('encrypt devuelve blob con shape canónico', () => {
      const blob = vault.encrypt('hello world');
      expect(blob).toEqual(
        expect.objectContaining({
          ciphertext: expect.any(String) as unknown,
          iv: expect.any(String) as unknown,
          tag: expect.any(String) as unknown,
          key_version: 1,
        }),
      );

      // base64 válido
      expect(() => Buffer.from(blob.ciphertext, 'base64')).not.toThrow();
      expect(() => Buffer.from(blob.iv, 'base64')).not.toThrow();
      expect(() => Buffer.from(blob.tag, 'base64')).not.toThrow();

      // longitudes canónicas
      expect(Buffer.from(blob.iv, 'base64')).toHaveLength(12);
      expect(Buffer.from(blob.tag, 'base64')).toHaveLength(16);
    });

    it('IV es único en llamadas consecutivas (no reutilización)', () => {
      const a = vault.encrypt('same plaintext');
      const b = vault.encrypt('same plaintext');
      expect(a.iv).not.toBe(b.iv);
      expect(a.ciphertext).not.toBe(b.ciphertext); // diff IV → diff ciphertext
    });

    it('round-trip recupera el plaintext original', () => {
      const original = 'sk_live_super_secret_api_key_1234';
      const blob = vault.encrypt(original);
      expect(vault.decrypt(blob)).toBe(original);
    });

    it('round-trip soporta UTF-8 (acentos, emoji)', () => {
      const original = 'pásswórd-con-acentos-y-emoji-🔐';
      const blob = vault.encrypt(original);
      expect(vault.decrypt(blob)).toBe(original);
    });

    it('encrypt rechaza no-strings (defensivo)', () => {
      // @ts-expect-error -- verificación runtime defensiva: la firma exige string,
      // pero el service también valida en runtime para defenderse de payloads mal formados.
      expect(() => vault.encrypt(123)).toThrow(TypeError);
      // @ts-expect-error -- igual que arriba, prueba runtime de null
      expect(() => vault.encrypt(null)).toThrow(TypeError);
    });

    it('decrypt con tag manipulado lanza SecretVaultError(DECRYPT_FAILED)', () => {
      const blob = vault.encrypt('secret');
      const tampered: EncryptedSecret = {
        ...blob,
        tag: Buffer.alloc(16, 0).toString('base64'), // tag de ceros
      };
      let thrown: unknown;
      try {
        vault.decrypt(tampered);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(SecretVaultError);
      expect((thrown as SecretVaultError).code).toBe('DECRYPT_FAILED');
    });

    it('decrypt con ciphertext manipulado lanza DECRYPT_FAILED', () => {
      const blob = vault.encrypt('secret');
      const ctBuf = Buffer.from(blob.ciphertext, 'base64');
      ctBuf[0] ^= 0xff; // flip primer byte
      const tampered: EncryptedSecret = {
        ...blob,
        ciphertext: ctBuf.toString('base64'),
      };
      let thrown: unknown;
      try {
        vault.decrypt(tampered);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(SecretVaultError);
      expect((thrown as SecretVaultError).code).toBe('DECRYPT_FAILED');
    });

    it('decrypt con IV distinto lanza DECRYPT_FAILED (tag no valida)', () => {
      const blob = vault.encrypt('secret');
      const tampered: EncryptedSecret = {
        ...blob,
        iv: crypto.randomBytes(12).toString('base64'),
      };
      expect(() => vault.decrypt(tampered)).toThrow(SecretVaultError);
    });

    it('decrypt con key_version distinta a la actual lanza KEY_VERSION_MISMATCH', () => {
      const blob = vault.encrypt('secret');
      const futureBlob: EncryptedSecret = { ...blob, key_version: 2 };
      let thrown: unknown;
      try {
        vault.decrypt(futureBlob);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(SecretVaultError);
      expect((thrown as SecretVaultError).code).toBe('KEY_VERSION_MISMATCH');
    });

    it('decrypt con clave distinta lanza DECRYPT_FAILED', () => {
      const blob = vault.encrypt('secret');
      const otherVault = new SecretVaultService(buildConfig('b'.repeat(64)));
      expect(() => otherVault.decrypt(blob)).toThrow(SecretVaultError);
    });
  });

  describe('encryptRecord + decryptRecord', () => {
    let vault: SecretVaultService;
    beforeEach(() => {
      vault = new SecretVaultService(buildConfig(VALID_KEY));
    });

    it('round-trip preserva keys + values del mapa original', () => {
      const original = {
        api_key: 'sk_live_abc',
        webhook_secret: 'whsec_xyz',
        reseller_id: 'reseller-42',
      };
      const encrypted = vault.encryptRecord(original);
      expect(Object.keys(encrypted).sort()).toEqual(
        ['api_key', 'reseller_id', 'webhook_secret'].sort(),
      );

      const decrypted = vault.decryptRecord(encrypted);
      expect(decrypted).toEqual(original);
    });

    it('encryptRecord asigna IV distinto por campo (no reuso cross-field)', () => {
      const encrypted = vault.encryptRecord({
        a: 'same',
        b: 'same',
        c: 'same',
      });
      const ivs = new Set([encrypted.a.iv, encrypted.b.iv, encrypted.c.iv]);
      expect(ivs.size).toBe(3);
    });

    it('encryptRecord con mapa vacío devuelve mapa vacío', () => {
      expect(vault.encryptRecord({})).toEqual({});
      expect(vault.decryptRecord({})).toEqual({});
    });
  });
});
