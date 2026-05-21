/**
 * Sprint 15C.II Fase G.1.b — §A.2 área 2: encryption key rotation graceful.
 *
 * Gap cerrado: `secret-vault.service.spec.ts` cubre el round-trip y el
 * mismatch de `key_version` a nivel de contrato, pero NO el escenario
 * operativo real: un secreto cifrado con la clave A queda persistido en
 * `plugin_installs.secrets`; el operador rota `ENCRYPTION_KEY` (mismos
 * `key_version=1`, bytes distintos — el caso de campo más común: swap del
 * env var sin bump de versión); al releer el blob persistido y descifrarlo
 * con la clave B, el sistema debe FALLAR LIMPIAMENTE — `SecretVaultError`
 * semántico, sin crash, sin devolver basura ni filtrar el ciphertext.
 *
 * Parte de integración: el blob hace un round-trip real por Postgres
 * (`plugin_installs.secrets` JSON) para probar que la serialización JSON es
 * lossless y que la rotación es lo único que rompe el descifrado.
 *
 * Prerrequisito: `docker compose -f docker/docker-compose.dev.yml up -d
 * postgres`. Ejecutar con `pnpm --dir backend test:e2e`.
 */

import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../src/core/database/prisma.service';
import {
  type EncryptedRecord,
  SecretVaultError,
  SecretVaultService,
} from '../../src/core/security/secret-vault.service';

import { connectPrisma } from './_helpers';

const KEY_A = 'a'.repeat(64); // 32 bytes hex — clave maestra original
const KEY_B = 'b'.repeat(64); // 32 bytes hex — clave maestra rotada
const SECRET_PLAINTEXT = 'enhance-super-admin-token-NEVER-LEAK';

/** Construye un SecretVaultService con una clave maestra dada (simula rotación). */
function vaultWithKey(hex: string): SecretVaultService {
  const config = {
    getOrThrow: () => hex,
  } as unknown as ConfigService;
  return new SecretVaultService(config);
}

describe('Integración G.1.b — encryption key rotation graceful (secret-vault)', () => {
  let prisma: PrismaService;
  const createdSlugs: string[] = [];

  beforeAll(async () => {
    prisma = await connectPrisma();
  });

  afterAll(async () => {
    for (const slug of createdSlugs) {
      await prisma.pluginInstall
        .delete({ where: { slug } })
        .catch(() => undefined);
    }
    await prisma.onModuleDestroy();
  });

  async function persistSecret(record: EncryptedRecord): Promise<string> {
    const slug = `g1b-${randomUUID()}`.slice(0, 80);
    createdSlugs.push(slug);
    await prisma.pluginInstall.create({
      data: {
        slug,
        enabled: false,
        secrets: record as object,
        key_version: 1,
      },
    });
    return slug;
  }

  async function readSecret(slug: string): Promise<EncryptedRecord> {
    const row = await prisma.pluginInstall.findUniqueOrThrow({
      where: { slug },
      select: { secrets: true },
    });
    return row.secrets as unknown as EncryptedRecord;
  }

  it('clave rotada (mismos key_version, bytes distintos) → DECRYPT_FAILED limpio, sin fuga', async () => {
    const vaultA = vaultWithKey(KEY_A);
    const blob = vaultA.encryptRecord({ apiToken: SECRET_PLAINTEXT });

    const slug = await persistSecret(blob);
    const persisted = await readSecret(slug);

    // El operador rota ENCRYPTION_KEY: nueva instancia con clave B.
    const vaultB = vaultWithKey(KEY_B);

    let thrown: unknown;
    try {
      vaultB.decryptRecord(persisted);
      throw new Error('decryptRecord debería haber lanzado tras la rotación');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(SecretVaultError);
    expect((thrown as SecretVaultError).code).toBe('DECRYPT_FAILED');
    // Defensa-en-profundidad: el error NUNCA debe contener el plaintext.
    expect((thrown as SecretVaultError).message).not.toContain(
      SECRET_PLAINTEXT,
    );
  }, 30_000);

  it('clave original sobre el blob persistido → recupera el plaintext (round-trip lossless)', async () => {
    const vaultA = vaultWithKey(KEY_A);
    const blob = vaultA.encryptRecord({ apiToken: SECRET_PLAINTEXT });

    const slug = await persistSecret(blob);
    const persisted = await readSecret(slug);

    // Misma clave A tras el round-trip por Postgres → descifra correctamente.
    const recovered = vaultWithKey(KEY_A).decryptRecord(persisted);
    expect(recovered.apiToken).toBe(SECRET_PLAINTEXT);
  }, 30_000);

  it('blob con key_version futura (rotación versionada) → KEY_VERSION_MISMATCH', async () => {
    const vaultA = vaultWithKey(KEY_A);
    const blob = vaultA.encrypt(SECRET_PLAINTEXT);
    // Simula un secreto cifrado por una clave de versión futura (key_version=2)
    // contra un servicio que solo conoce la v1 (currentKeyVersion=1).
    const futureBlob = { ...blob, key_version: 2 };

    const slug = await persistSecret({ apiToken: futureBlob });
    const persisted = await readSecret(slug);

    let thrown: unknown;
    try {
      vaultWithKey(KEY_A).decryptRecord(persisted);
      throw new Error('decryptRecord debería haber lanzado por key_version');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(SecretVaultError);
    expect((thrown as SecretVaultError).code).toBe('KEY_VERSION_MISMATCH');
  }, 30_000);
});
