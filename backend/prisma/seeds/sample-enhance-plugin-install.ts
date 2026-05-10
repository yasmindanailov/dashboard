import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

import { SecretVaultService } from '../../src/core/security/secret-vault.service';

/**
 * Sprint 15C Fase 15C.J (2026-05-09) — seed dev/QA del `plugin_installs`
 * row para el plugin Enhance CP.
 *
 * Materializa el segundo objetivo de la Fase J ([dossier 15C §7 fila J](../docs/60-roadmap/completed/sprint-15c-plugin-enhance-cp.md)):
 * "Plugin install seed condicional `NODE_ENV !== 'production'` —
 * pre-crea `plugin_installs` row con baseUrl + masterOrgId desde env +
 * apiToken desde env var dedicada → DX para QA/staging/dev (admin no
 * necesita configurar manualmente cada `pnpm seed`)."
 *
 * Doctrina (ambigüedad A3 resuelta 2026-05-09):
 *
 *   - Solo siembra si las 3 env vars dev están **completas**:
 *     · `ENHANCE_DEV_BASE_URL`     (https://enhance.lab.aelium.net)
 *     · `ENHANCE_DEV_MASTER_ORG_ID` (UUID del Master Org Aelium en Enhance)
 *     · `ENHANCE_DEV_API_TOKEN`     (Super Admin token revocable)
 *
 *     Si alguna falta → log info + skip silencioso. NO crea fila vacía
 *     enabled=false (anti-patrón: la fila pre-creada confunde al admin
 *     viendo `/admin/settings/plugins` y no aporta DX).
 *
 *   - Guard `NODE_ENV === 'production'` → skip. En producción el plugin
 *     install se configura desde la UI admin con secrets cifrados — el
 *     seed automático con env vars rompería la regla de "secrets sólo
 *     en BD cifrados, nunca en archivos de configuración del proceso".
 *
 *   - Idempotente: `findUnique` por slug. Si la fila YA existe (admin
 *     configuró desde UI o seed previo creó), **NO sobreescribe** —
 *     preserva la configuración operativa del admin. Solo loguea
 *     "preserved".
 *
 * Acoplamiento con SecretVaultService (instanciación standalone):
 *
 *   El seed es un script Node standalone — NO tiene contexto NestJS DI.
 *   Para encriptar el `apiToken` con el algoritmo canónico AES-256-GCM
 *   ([ADR-080 §3](../../docs/10-decisions/adr-080-plugin-framework.md))
 *   instanciamos `SecretVaultService` directamente con un shim
 *   `ConfigService` que delega a `process.env`. Esto garantiza que el
 *   blob cifrado es **idéntico** al que produciría el backend en runtime
 *   — el plugin lee la fila + descifra con la misma clave + arranca OK.
 *
 *   Trade-off: si `SecretVaultService` cambia su shape de inyección, el
 *   shim aquí podría divergir silenciosamente. Mitigación: el spec del
 *   seed verifica el round-trip encrypt → decrypt con un cipher real,
 *   no mock — cualquier cambio rompe el test.
 */

interface EnhanceDevConfig {
  readonly baseUrl: string;
  readonly masterOrgId: string;
  readonly apiToken: string;
}

const ENHANCE_SLUG = 'enhance_cp';

export async function seedSampleEnhancePluginInstall(
  prisma: PrismaClient,
): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log(
      '  ⚠ NODE_ENV=production — saltando sample-enhance-plugin-install',
    );
    return;
  }

  const config = readEnhanceDevConfig();
  if (!config) {
    console.log(
      '  ⚠ ENHANCE_DEV_* env vars incompletas — saltando enhance_cp plugin install',
    );
    console.log(
      '     Para activar: setea ENHANCE_DEV_BASE_URL + ENHANCE_DEV_MASTER_ORG_ID + ENHANCE_DEV_API_TOKEN',
    );
    return;
  }

  const existing = await prisma.pluginInstall.findUnique({
    where: { slug: ENHANCE_SLUG },
  });
  if (existing) {
    console.log(
      `  📦 enhance_cp plugin install: preserved (existing — admin config wins).`,
    );
    return;
  }

  const vault = buildSeedVault();
  const apiTokenBlob = vault.encrypt(config.apiToken);

  await prisma.pluginInstall.create({
    data: {
      slug: ENHANCE_SLUG,
      enabled: true,
      config: {
        baseUrl: config.baseUrl,
        masterOrgId: config.masterOrgId,
        reconciliationIntervalHours: 6,
      },
      secrets: {
        apiToken: {
          ciphertext: apiTokenBlob.ciphertext,
          iv: apiTokenBlob.iv,
          tag: apiTokenBlob.tag,
          key_version: apiTokenBlob.key_version,
        },
      },
      key_version: vault.currentKeyVersion,
    },
  });

  console.log(
    `  📦 enhance_cp plugin install: created (enabled=true, baseUrl=${config.baseUrl})`,
  );
}

/**
 * Lee las 3 env vars dev. Devuelve `null` si alguna falta o está vacía.
 * Hace trim defensivo — el copy-paste a `.env` a veces deja whitespace.
 */
function readEnhanceDevConfig(): EnhanceDevConfig | null {
  const baseUrl = (process.env.ENHANCE_DEV_BASE_URL ?? '').trim();
  const masterOrgId = (process.env.ENHANCE_DEV_MASTER_ORG_ID ?? '').trim();
  const apiToken = (process.env.ENHANCE_DEV_API_TOKEN ?? '').trim();
  if (!baseUrl || !masterOrgId || !apiToken) return null;
  return { baseUrl, masterOrgId, apiToken };
}

/**
 * Instancia `SecretVaultService` con shim `ConfigService` que delega a
 * `process.env`. Mismo algoritmo que el backend en runtime — el blob
 * cifrado por el seed es descifrable por el plugin tras boot.
 */
function buildSeedVault(): SecretVaultService {
  const shim = {
    getOrThrow: (key: string): string => {
      const value = process.env[key];
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(
          `Seed vault: missing env var "${key}" (required by SecretVaultService bootcheck).`,
        );
      }
      return value;
    },
  } as unknown as ConfigService;
  return new SecretVaultService(shim);
}
