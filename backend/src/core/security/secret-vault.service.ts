import * as crypto from 'crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Sprint 15A Fase C (2026-05-05) — Vault canónico de secretos.
 * Materializa ADR-080 §3 literal.
 *
 * Algoritmo: AES-256-GCM (authenticated encryption — NIST SP 800-38D).
 * Clave maestra: env var `ENCRYPTION_KEY` (32 bytes hex = 64 caracteres).
 * IV: 12 bytes random per-secret (recomendación NIST GCM).
 * Tag: 16 bytes (default Node.js GCM) para integridad — manipulación detectada.
 *
 * Doctrina canónica:
 *   - Este servicio es lo ÚNICO que toca la clave maestra. Cualquier otro
 *     módulo recibe los secretos descifrados como string en memoria, nunca
 *     la clave en sí.
 *   - Cifrado fail-loud: si el tag GCM no valida, `decrypt()` LANZA en lugar
 *     de devolver basura.
 *   - Rotación: `encrypt()` registra `key_version` actual; `decrypt(blob)`
 *     verifica que el blob fue cifrado con la versión actual. Sprint 15A v1
 *     soporta una sola clave activa; la migración multi-key se difiere a
 *     sub-sprint condicionado (ADR-080 §3 — Política de rotación).
 *   - El servicio es stateless (no cachea — el coste de derivar la key
 *     buffer una vez es despreciable).
 *
 * Bootcheck: el constructor lanza fail-fast si `ENCRYPTION_KEY` no es
 * exactamente 64 caracteres hex (regex estricta). Esto IMPIDE el boot del
 * backend con una key mal configurada — no es un warning silencioso.
 *
 * Reglas:
 *   - R7: errores semánticos, no `Error` plano sin contexto.
 *   - R12: no persiste secretos en metadata cliente (el blob persiste
 *     en `plugin_installs.secrets`, no en `services.metadata`).
 */
@Injectable()
export class SecretVaultService {
  /** Versión actual de la clave maestra. Hoy: 1. */
  readonly currentKeyVersion = 1;

  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const hex = config.getOrThrow<string>('ENCRYPTION_KEY');
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error(
        'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). ' +
          'Generate one with: openssl rand -hex 32',
      );
    }
    this.key = Buffer.from(hex, 'hex');
  }

  /**
   * Cifra un string con AES-256-GCM.
   * Devuelve blob serializable (base64 partes + key_version).
   */
  encrypt(plaintext: string): EncryptedSecret {
    if (typeof plaintext !== 'string') {
      throw new TypeError('SecretVaultService.encrypt expects a string');
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return {
      ciphertext: ct.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      key_version: this.currentKeyVersion,
    };
  }

  /**
   * Descifra un blob. LANZA si:
   *  - el tag GCM no valida (manipulación detectada).
   *  - el blob fue cifrado con una key_version distinta a la actual
   *    (Sprint 15A v1 — única key activa).
   */
  decrypt(blob: EncryptedSecret): string {
    if (blob.key_version !== this.currentKeyVersion) {
      throw new SecretVaultError(
        `Secret encrypted with key_version=${blob.key_version}, ` +
          `current=${this.currentKeyVersion}. Rotation needed (see ADR-080 §3).`,
        'KEY_VERSION_MISMATCH',
      );
    }
    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(blob.iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(blob.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch (err) {
      // GCM falla con OperationError si el tag no valida — manipulación.
      const cause = err instanceof Error ? err.message : String(err);
      throw new SecretVaultError(
        `Failed to decrypt secret (tag mismatch or corrupted blob): ${cause}`,
        'DECRYPT_FAILED',
      );
    }
  }

  /**
   * Serializa un mapa de secretos planos a su forma cifrada por campo.
   * Útil para `plugin_installs.secrets` — cada campo del shape declarado
   * en `manifest.secretsSchema` se cifra individualmente con su IV propio.
   */
  encryptRecord(record: Record<string, string>): EncryptedRecord {
    const out: EncryptedRecord = {};
    for (const [key, value] of Object.entries(record)) {
      out[key] = this.encrypt(value);
    }
    return out;
  }

  /** Descifra un mapa producido por `encryptRecord`. */
  decryptRecord(record: EncryptedRecord): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, blob] of Object.entries(record)) {
      out[key] = this.decrypt(blob);
    }
    return out;
  }
}

/**
 * Shape persistido en `plugin_installs.secrets[<field>]`.
 * Todos los campos en base64 + key_version.
 */
export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
  key_version: number;
}

export type EncryptedRecord = Record<string, EncryptedSecret>;

/** Error semántico canónico del vault. */
export class SecretVaultError extends Error {
  constructor(
    message: string,
    public readonly code: 'KEY_VERSION_MISMATCH' | 'DECRYPT_FAILED',
  ) {
    super(message);
    this.name = 'SecretVaultError';
  }
}
