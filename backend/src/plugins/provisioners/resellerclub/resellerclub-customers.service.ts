/**
 * Sprint 15D Fase 15D.D — `ResellerclubCustomersService`.
 *
 * Materializa ADR-081 §3 (customer lazy + advisory lock + cross-search defensivo)
 * y §4 (contact handles por usuario, reutilizados). Molde directo de
 * `enhance-customers.service.ts` (ADR-083 §2). Garantiza, idempotente y
 * cross-process (advisory lock per `user_id`), la identidad de registrante en
 * ResellerClub que `domains/register` necesita: 1 customer RC + 1 contacto WHOIS
 * compartido en los 4 roles.
 *
 * Doctrina (ADR-081 §3/§4 + Amendment A2):
 *   - 1 customer RC por usuario Aelium (`resellerclub_customers`, PK `user_id`).
 *   - **Cross-search defensivo** por email antes de crear (`customers/search`):
 *     recupera el customer si ya existe en RC pero falta el mapping local (crash
 *     entre signup y persistencia — coherente con DOM-INV-1 a nivel customer).
 *     El "no existe" de RC llega como HTTP 500 (A1.3); el cliente lo traduce a
 *     `null` (no error duro) → ruta "crear".
 *   - **1 contacto RC** (`type='Contact'`) reutilizado en los 4 role-handles
 *     (registrant/admin/tech/billing) — decisión Yasmin 2026-05-23 (Amendment A2):
 *     1 sola llamada `contacts/add`, datos idénticos del mismo perfil. El schema
 *     de 4 filas (`@@unique [user_id, contact_type]`) permite diferenciar por
 *     rol/TLD en el futuro (`.es` con NIF → DOM-INV-5, Fase F).
 *   - **Datos de registrante** desde `ctx.client` (`ClientPublicData` enriquecido
 *     por el orquestador desde `ClientProfile` — ADR-077 A12). Si faltan los
 *     requeridos por RC → `REGISTRANT_INELIGIBLE` (familia DOM-INV-5); NUNCA se
 *     envían placeholders al WHOIS. El `phone-cc` se deriva de `country_code`.
 *
 * Reglas:
 *   - R4: vive en `plugins/provisioners/resellerclub/`. Importa `core/database`,
 *     `core/provisioning/types` (contrato) y el cliente del propio plugin
 *     (`./api`). NO importa el orquestador ni otros plugins — `userAdvisoryLockKey`
 *     se REPLICA aquí (no se importa de `enhance_cp`).
 *   - R12: el `passwd` del customer RC se genera aleatorio en memoria y NUNCA se
 *     persiste (Aelium es puerta unificada, sin SSO al panel RC — ADR-070).
 *   - R7: errores semánticos vía `ProvisionerPluginError`.
 */

import * as crypto from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, ResellerclubContactType } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import {
  ClientPublicData,
  ProvisionerPluginError,
  RegistrantUpdateResult,
} from '../../../core/provisioning/types';

import {
  RcAddContactInput,
  RcContactId,
  RcCustomerId,
  RcModifyContactInput,
  RcSignupCustomerInput,
  ResellerClubApiClient,
} from './api';

/** Slug canónico del plugin — para el campo `module` de los errores (R7). */
const RC_PLUGIN_SLUG = 'resellerclub';

/**
 * Namespace canónico para `pg_advisory_xact_lock(ns, key)` del customer/contact
 * lazy de ResellerClub. Único en el proyecto (Enhance usa `1_500_301`, ADR-083)
 * — evita colisión con otros usos del advisory lock.
 */
const ADVISORY_LOCK_NAMESPACE_RESELLERCLUB_CUSTOMERS = 1_500_401;

/** Los 4 roles de contacto que `domains/register` referencia (ADR-081 §4). */
const CONTACT_ROLES: readonly ResellerclubContactType[] = [
  ResellerclubContactType.registrant,
  ResellerclubContactType.admin,
  ResellerclubContactType.tech,
  ResellerclubContactType.billing,
];

/**
 * Identificadores de registrante RC que `provision(register)` necesita
 * (ADR-081 §5). En v1 los 4 contactos son el mismo id (Amendment A2).
 */
export interface ResellerclubRegistrantRefs {
  readonly customerId: RcCustomerId;
  readonly contacts: {
    readonly registrant: RcContactId;
    readonly admin: RcContactId;
    readonly tech: RcContactId;
    readonly billing: RcContactId;
  };
}

@Injectable()
export class ResellerclubCustomersService {
  private readonly logger = new Logger(ResellerclubCustomersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Garantiza el customer RC + los 4 contact handles del usuario y devuelve los
   * refs para `domains/register`. Idempotente y serializado per-`user_id` por
   * advisory lock: dos checkouts de dominio concurrentes del mismo usuario no
   * crean customer/contactos duplicados (el segundo lee lo ya persistido).
   */
  async ensureRegistrant(
    client: ClientPublicData,
    api: ResellerClubApiClient,
  ): Promise<ResellerclubRegistrantRefs> {
    return this.prisma.$transaction(async (tx) => {
      // Step 0: advisory lock per-user (auto-released on tx commit/rollback).
      // `$executeRaw` (no `$queryRaw`): `pg_advisory_xact_lock` retorna VOID
      // (lección 15C Fase I — Prisma rompe deserializando void con queryRaw).
      const lockKey = userAdvisoryLockKey(client.id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_NAMESPACE_RESELLERCLUB_CUSTOMERS}::int4, ${lockKey}::int4)`;

      const customerId = await this.ensureCustomerId(tx, client, api);
      const contactId = await this.ensureSharedContactId(
        tx,
        client,
        api,
        customerId,
      );

      // v1: 1 contacto reutilizado en los 4 roles (Amendment A2).
      return {
        customerId,
        contacts: {
          registrant: contactId,
          admin: contactId,
          tech: contactId,
          billing: contactId,
        },
      };
    });
  }

  /**
   * Actualiza el contacto WHOIS compartido del cliente en RC desde su perfil
   * (15D.G·2). El contacto es uno solo (reutilizado en los 4 roles) y compartido
   * por todos sus dominios → un único `contacts/modify` propaga el WHOIS a todos.
   *
   * DC.NEW-66: la llamada HTTP a RC NO se hace dentro de una transacción de BD
   * (lee el contact-id con una query corta y modifica fuera de tx). Verify-after-write:
   * relee `contacts/details` y confirma que el nombre se aplicó (si no →
   * `PROVIDER_INTERNAL_ERROR` retriable). Detecta el cambio de nombre (aviso ICANN).
   * Si el cliente no tiene contacto aún (sin dominios) → no-op (`propagated:false`).
   */
  async updateRegistrantContact(
    client: ClientPublicData,
    api: ResellerClubApiClient,
  ): Promise<RegistrantUpdateResult> {
    const handle = await this.prisma.resellerclubContactHandle.findFirst({
      where: { user_id: client.id },
      select: { resellerclub_contact_id: true },
    });
    if (!handle) {
      return { propagated: false, domainsAffected: 0, nameChanged: false };
    }
    const contactId = handle.resellerclub_contact_id;
    const newName = fullName(client);

    const before = await api.getContactDetails(contactId);
    await api.modifyContactDetails(
      contactId,
      buildModifyContactInput(client, contactId),
    );
    const after = await api.getContactDetails(contactId);

    if ((after.name ?? '').trim() !== newName) {
      throw new ProvisionerPluginError(
        `contacts/modify (contact=${contactId}) no aplicó el nombre del titular ` +
          `(esperado "${newName}", got "${after.name ?? ''}"). Reintentar.`,
        'PROVIDER_INTERNAL_ERROR',
        true,
        undefined,
        RC_PLUGIN_SLUG,
      );
    }

    const domainsAffected = await this.prisma.service.count({
      where: {
        user_id: client.id,
        product: { type: 'domain' },
        provider_reference: { not: null },
      },
    });
    const nameChanged = (before.name ?? '').trim() !== newName;
    this.logger.log(
      `updateRegistrantContact user=${client.id}: contacto ${contactId} ` +
        `actualizado (dominios=${domainsAffected}, nameChanged=${nameChanged}).`,
    );
    return { propagated: true, domainsAffected, nameChanged };
  }

  /** Customer RC (cache local → cross-search → signup), persistiendo el mapping. */
  private async ensureCustomerId(
    tx: Prisma.TransactionClient,
    client: ClientPublicData,
    api: ResellerClubApiClient,
  ): Promise<RcCustomerId> {
    // Step 1: cache local.
    const existing = await tx.resellerclubCustomer.findUnique({
      where: { user_id: client.id },
    });
    if (existing) {
      this.logger.debug(
        `resellerclub_customers cache hit for user=${client.id} (customer=${existing.resellerclub_customer_id})`,
      );
      return existing.resellerclub_customer_id;
    }

    // Step 2: cross-search defensivo por email (recovery cross-restart/crash).
    const found = await api.searchCustomerByEmail(client.email);
    if (found) {
      this.logger.warn(
        `resellerclub_customers cross-restart recovery for user=${client.id}: ` +
          `customer ${found} ya existe en RC (re-vincula mapping local).`,
      );
      await tx.resellerclubCustomer.create({
        data: {
          user_id: client.id,
          resellerclub_customer_id: found,
          email: client.email,
        },
      });
      return found;
    }

    // Step 3: signup lazy.
    const created = await api.signupCustomer(buildSignupInput(client));
    await tx.resellerclubCustomer.create({
      data: {
        user_id: client.id,
        resellerclub_customer_id: created,
        email: client.email,
      },
    });
    this.logger.log(
      `resellerclub_customers: customer ${created} creado para user=${client.id}.`,
    );
    return created;
  }

  /**
   * Contacto WHOIS compartido en los 4 role-handles (v1 — Amendment A2). Crea 1
   * contacto si no existe ninguno; garantiza las 4 filas de rol (idempotente).
   */
  private async ensureSharedContactId(
    tx: Prisma.TransactionClient,
    client: ClientPublicData,
    api: ResellerClubApiClient,
    customerId: RcCustomerId,
  ): Promise<RcContactId> {
    const handles = await tx.resellerclubContactHandle.findMany({
      where: { user_id: client.id },
    });

    // v1: todas las filas comparten el mismo contact_id → cualquiera sirve.
    let contactId = handles[0]?.resellerclub_contact_id;
    if (!contactId) {
      contactId = await api.addContact(buildContactInput(client, customerId));
      this.logger.log(
        `resellerclub_contact_handles: contacto ${contactId} creado para user=${client.id}.`,
      );
    }

    const present = new Set(handles.map((h) => h.contact_type));
    const missing = CONTACT_ROLES.filter((role) => !present.has(role));
    if (missing.length > 0) {
      await tx.resellerclubContactHandle.createMany({
        data: missing.map((contact_type) => ({
          user_id: client.id,
          contact_type,
          resellerclub_contact_id: contactId,
        })),
        skipDuplicates: true,
      });
    }

    return contactId;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Mapping ClientPublicData → shapes RC (ADR-081 §3/§4 + ADR-077 A12)
// ────────────────────────────────────────────────────────────────────────────

/** `customers/signup` desde el perfil de registrante (ADR-077 A12). */
function buildSignupInput(client: ClientPublicData): RcSignupCustomerInput {
  const name = fullName(client);
  const country = requireField(client.country_code, 'country');
  return {
    username: client.email,
    passwd: generateRcPassword(),
    name,
    company: nonEmptyCompany(client, name),
    'address-line-1': requireField(client.address_line1, 'address_line1'),
    city: requireField(client.city, 'city'),
    state: requireField(client.state, 'state'),
    country,
    zipcode: requireField(client.postal_code, 'postal_code'),
    'phone-cc': derivePhoneCc(country),
    phone: requireField(client.phone, 'phone'),
    'lang-pref': client.locale ?? undefined,
  };
}

/** `contacts/add` (type genérico v1). `.es`/`.eu` con NIF → DOM-INV-5 (Fase F). */
function buildContactInput(
  client: ClientPublicData,
  customerId: RcCustomerId,
): RcAddContactInput {
  const name = fullName(client);
  const country = requireField(client.country_code, 'country');
  return {
    name,
    company: nonEmptyCompany(client, name),
    email: client.email,
    'address-line-1': requireField(client.address_line1, 'address_line1'),
    city: requireField(client.city, 'city'),
    state: requireField(client.state, 'state'),
    country,
    zipcode: requireField(client.postal_code, 'postal_code'),
    'phone-cc': derivePhoneCc(country),
    phone: requireField(client.phone, 'phone'),
    'customer-id': customerId,
    type: 'Contact',
  };
}

/** `contacts/modify` desde el perfil (15D.G·2). Mismos campos que add, con contact-id. */
function buildModifyContactInput(
  client: ClientPublicData,
  contactId: RcContactId,
): RcModifyContactInput {
  const name = fullName(client);
  const country = requireField(client.country_code, 'country');
  return {
    'contact-id': contactId,
    name,
    company: nonEmptyCompany(client, name),
    email: client.email,
    'address-line-1': requireField(client.address_line1, 'address_line1'),
    city: requireField(client.city, 'city'),
    state: requireField(client.state, 'state'),
    country,
    zipcode: requireField(client.postal_code, 'postal_code'),
    'phone-cc': derivePhoneCc(country),
    phone: requireField(client.phone, 'phone'),
  };
}

/** Nombre del registrante (first + last). Requerido por RC. */
function fullName(client: ClientPublicData): string {
  const name = [client.first_name, client.last_name]
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(' ')
    .trim();
  return requireField(name, 'name');
}

/** RC exige `company` no vacío; para individuos cae al nombre del registrante. */
function nonEmptyCompany(client: ClientPublicData, fallback: string): string {
  return client.company_name?.trim() || fallback;
}

/**
 * Valida un campo de registrante requerido por RC. Vacío/ausente →
 * `REGISTRANT_INELIGIBLE` (familia DOM-INV-5): NUNCA se envían placeholders al
 * WHOIS. La validación rica pre-checkout ("completa tu perfil") es Fase F.
 */
function requireField(value: string | null | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new ProvisionerPluginError(
      `El perfil del cliente no tiene "${field}", requerido para registrar el ` +
        `dominio. Completa tu dirección y teléfono en el perfil de cliente.`,
      'REGISTRANT_INELIGIBLE',
      false,
      undefined,
      RC_PLUGIN_SLUG,
    );
  }
  return trimmed;
}

/**
 * Prefijo telefónico (`phone-cc`) derivado del país ISO-3166 alpha-2
 * (ADR-081 §3 — `ClientProfile` guarda `phone` en un solo campo). País
 * desconocido → `REGISTRANT_INELIGIBLE` (nunca WHOIS con prefijo erróneo).
 * [CONSERVADOR — el set se amplía según los países que se vendan].
 */
function derivePhoneCc(countryIso2: string): string {
  const cc = COUNTRY_PHONE_CC[countryIso2.toUpperCase()];
  if (!cc) {
    throw new ProvisionerPluginError(
      `No se pudo derivar el prefijo telefónico del país "${countryIso2}". ` +
        `Contacta con soporte para registrar el dominio.`,
      'REGISTRANT_INELIGIBLE',
      false,
      undefined,
      RC_PLUGIN_SLUG,
    );
  }
  return cc;
}

/** ISO-3166 alpha-2 → código de país telefónico (E.164, sin '+'). */
const COUNTRY_PHONE_CC: Readonly<Record<string, string>> = {
  ES: '34',
  PT: '351',
  FR: '33',
  DE: '49',
  IT: '39',
  GB: '44',
  IE: '353',
  NL: '31',
  BE: '32',
  LU: '352',
  AT: '43',
  CH: '41',
  DK: '45',
  SE: '46',
  NO: '47',
  FI: '358',
  PL: '48',
  CZ: '420',
  RO: '40',
  GR: '30',
  US: '1',
  CA: '1',
  MX: '52',
  AR: '54',
  BR: '55',
  CL: '56',
  CO: '57',
};

/**
 * Password aleatoria del customer RC. RC (LogicBoxes) exige complejidad
 * (mayúscula + minúscula + dígito + símbolo, 8-15 chars). Aelium NUNCA la usa
 * (puerta unificada, sin SSO al panel RC — ADR-070) ni la persiste (R12).
 * [CONSERVADOR — la política exacta de RC se confirma en el smoke OT&E, Fase G].
 */
function generateRcPassword(): string {
  const rand = crypto.randomBytes(8).toString('hex'); // 16 hex (minúsculas + dígitos)
  return `A${rand.slice(0, 10)}z9#`; // upper + lower + dígitos + símbolo, 14 chars
}

/**
 * UUID v4 string → signed int32 para `pg_advisory_xact_lock(ns, key)`.
 * Determinístico. Réplica del helper de `enhance-customers.service.ts` (R4: no
 * se importa de otro plugin). Colisiones posibles ~65k users → solo serializan
 * dos locks distintos (coste: latencia), NUNCA bug de correctness.
 */
export function userAdvisoryLockKey(userId: string): number {
  return parseInt(userId.replace(/-/g, '').slice(0, 8), 16) | 0;
}
