'use server';

import { revalidatePath } from 'next/cache';

import { serverFetch, ServerFetchError } from '../../lib/server-auth';

/* ═══════════════════════════════════════════════════════════════════════════
   Server Actions — perfil de titular (WHOIS) self-service (Modelo A).
   Sprint 15D Fase 15D.G·2. Backend: /domains/registrant (GET + PUT).
   ═══════════════════════════════════════════════════════════════════════════ */

export interface RegistrantProfile {
  first_name: string | null;
  last_name: string | null;
  email: string;
  company_name: string | null;
  tax_id: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
}

export interface RegistrantSyncStatus {
  propagated: boolean;
  domainsAffected: number;
  nameChanged: boolean;
  error: string | null;
}

export interface RegistrantProfileResponse {
  profile: RegistrantProfile;
  registrarSync: RegistrantSyncStatus;
}

export type UpdateRegistrantInput = Partial<Omit<RegistrantProfile, 'email'>>;

export async function getRegistrantAction(): Promise<
  { ok: true; data: RegistrantProfile } | { ok: false; error: string }
> {
  try {
    const data = await serverFetch<RegistrantProfile>('/domains/registrant');
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo cargar el perfil de titular.',
    };
  }
}

export async function updateRegistrantAction(
  input: UpdateRegistrantInput,
): Promise<
  { ok: true; data: RegistrantProfileResponse } | { ok: false; error: string }
> {
  try {
    const data = await serverFetch<RegistrantProfileResponse>(
      '/domains/registrant',
      { method: 'PUT', body: input },
    );
    revalidatePath('/dashboard/profile');
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo guardar el perfil de titular.',
    };
  }
}
