'use server';

import { revalidatePath } from 'next/cache';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';
import type {
  CreateDnsRecordPayload,
  DnsExternallyManagedError,
  DnsListResponse,
  DnsRecordActionResponse,
  UpdateDnsRecordPayload,
} from '../../../lib/api';

/* ═══════════════════════════════════════════════════════════════════════════
   Server Actions — DNS records management.
   Sprint 15C Fase 15C.G (ADR-082 §6 + ADR-083 §5 decisiones 16-21).
   Sprint 13 §13.AUTH Fase E (Modelo A — ADR-078 Amendment A1).

   4 acciones canónicas wrapping los endpoints REST cableados en Fase D:
   `/services/:id/dns/records` (GET / POST / PATCH / DELETE :recordId).

   Cada acción devuelve un `Result` discriminado uniforme:
     - { ok: true, ... }
     - { ok: false, error: string }
     - { ok: false, externallyManaged: DnsExternallyManagedError } (solo list)

   El caller (CC `DnsRecordsManager`) ramifica por `result.ok` + tipo de error.
   ═══════════════════════════════════════════════════════════════════════════ */

export type ListDnsRecordsResult =
  | { ok: true; data: DnsListResponse }
  | { ok: false; externallyManaged: DnsExternallyManagedError }
  | { ok: false; error: string };

export type DnsMutationResult =
  | { ok: true; result: DnsRecordActionResponse }
  | { ok: false; error: string };

/**
 * GET /services/:id/dns/records — lista records de la zona del service.
 *
 * El backend devuelve 404 con shape canónico cuando el DNS NO es autoridad
 * Aelium (resolver detecta NS externos o no hay plugin DNS authority
 * activo). Esta acción discrimina ese caso y devuelve `externallyManaged`
 * con `nameservers` actuales para que la UI muestre banner explicativo.
 */
export async function listDnsRecordsAction(
  serviceId: string,
): Promise<ListDnsRecordsResult> {
  try {
    const data = await serverFetch<DnsListResponse>(
      `/services/${serviceId}/dns/records`,
    );
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ServerFetchError && err.status === 404) {
      const body = err.body as DnsExternallyManagedError | undefined;
      if (
        body &&
        (body.code === 'DNS_MANAGED_EXTERNALLY' ||
          body.code === 'DNS_NO_AUTHORITY_PLUGIN')
      ) {
        return { ok: false, externallyManaged: body };
      }
    }
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudieron cargar los DNS records',
    };
  }
}

/**
 * POST /services/:id/dns/records — crea un record. El backend valida
 * payload con class-validator (DTO) + payloadSchema Ajv del plugin antes
 * de invocar `executeAction('add_dns_record')`. Cache `service_info` se
 * invalida automáticamente vía wrapper canónico.
 */
export async function createDnsRecordAction(
  serviceId: string,
  payload: CreateDnsRecordPayload,
): Promise<DnsMutationResult> {
  try {
    const result = await serverFetch<DnsRecordActionResponse>(
      `/services/${serviceId}/dns/records`,
      { method: 'POST', body: payload },
    );
    revalidatePath(`/dashboard/services/${serviceId}/dns`);
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo crear el record DNS',
    };
  }
}

/**
 * PATCH /services/:id/dns/records/:recordId — actualiza campos del record
 * (kind, name, value, ttl, proxy). Todos opcionales — solo se envían los
 * que cambian. El backend hace replace lógico vía `executeAction('update_dns_record')`.
 */
export async function updateDnsRecordAction(
  serviceId: string,
  recordId: string,
  payload: UpdateDnsRecordPayload,
): Promise<DnsMutationResult> {
  try {
    const result = await serverFetch<DnsRecordActionResponse>(
      `/services/${serviceId}/dns/records/${recordId}`,
      { method: 'PATCH', body: payload },
    );
    revalidatePath(`/dashboard/services/${serviceId}/dns`);
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo actualizar el record DNS',
    };
  }
}

/**
 * DELETE /services/:id/dns/records/:recordId — elimina record. Audit
 * pesado (action declarada `destructive=true` + `confirmRequired=true`
 * en plugin manifest). UI debe mostrar modal de confirmación.
 */
export async function deleteDnsRecordAction(
  serviceId: string,
  recordId: string,
): Promise<DnsMutationResult> {
  try {
    const result = await serverFetch<DnsRecordActionResponse>(
      `/services/${serviceId}/dns/records/${recordId}`,
      { method: 'DELETE' },
    );
    revalidatePath(`/dashboard/services/${serviceId}/dns`);
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo eliminar el record DNS',
    };
  }
}
