// ── DNS records (Sprint 15C Fase 15C.G — ADR-082 §6 + ADR-083 §5 decisiones 16-21) ──
//
// Tipos canónicos del flujo DNS records management. El frontend consume los
// 4 endpoints REST `/services/:id/dns/records` cableados en Sprint 15C Fase D.
// Backend canónico: `backend/src/plugins/provisioners/enhance_cp/api/types.ts`
// (`EnhanceDnsRecord`/`EnhanceDnsZone`). Frontend duplica el shape porque NO
// se puede importar desde backend (R4 — el frontend vive en otro paquete).

/**
 * Lista cerrada de record kinds expuestos al cliente v1 (ADR-083 §5
 * decisión 17). Plugins futuros con `has_dns_management=true` deben
 * soportar AL MENOS estos 7 — `SPF/NS/PTR/DS` están diferidos a v1.x.
 */
export type DnsRecordKindV1 =
  | 'A'
  | 'AAAA'
  | 'CNAME'
  | 'MX'
  | 'TXT'
  | 'SRV'
  | 'CAA';

export const DNS_RECORD_KINDS_V1: ReadonlyArray<DnsRecordKindV1> = [
  'A',
  'AAAA',
  'CNAME',
  'MX',
  'TXT',
  'SRV',
  'CAA',
];

export interface DnsRecord {
  readonly id: string;
  readonly kind: DnsRecordKindV1;
  readonly name: string;
  readonly value: string;
  readonly ttl?: number;
  readonly proxy: boolean;
}

export interface DnsSoa {
  readonly adminEmail: string;
  readonly nameServer: string;
  readonly expire: number;
  readonly refresh: number;
  readonly retry: number;
  readonly ttl: number;
}

/**
 * Estado DNSSEC read-only de la zona — Sprint 15C.II Fase E (ADR-083
 * Amendment A5.3). Presente SOLO si la zona tiene DNSSEC firmado en el
 * proveedor (PowerDNS vía Enhance). Aelium NO gestiona DNSSEC (activar /
 * rotar keys = panel del proveedor, DC.NEW-15C-DNSSEC) — la UI solo lo
 * refleja con un Badge informativo. Heredable a cualquier plugin DNS-authority.
 */
export interface DnsZoneDnssec {
  readonly dsRecords: string;
  readonly dnskeyRecords: string;
}

export interface DnsZone {
  readonly origin: string;
  readonly soa: DnsSoa;
  readonly records: readonly DnsRecord[];
  /** Sprint 15C.II Fase E — presente solo si la zona tiene DNSSEC activo. */
  readonly dnssec?: DnsZoneDnssec;
}

/** Shape canónico de `result.data` que devuelve `list_dns_records`. */
export interface DnsListResultData {
  readonly zone: DnsZone;
}

/**
 * Authority del DNS resuelto por `core/provisioning/dns-authority-resolver.ts`.
 * `aelium` → existe plugin DNS authority activo (Enhance hoy). `external` →
 * NS apuntan fuera o no hay plugin con `has_dns_management=true`.
 */
export type DnsAuthority = 'aelium' | 'external';

/** Payload del GET /services/:id/dns/records (status 200).
 *
 *  `result.data` es OPCIONAL: si el plugin lanza `ProvisionerPluginError`
 *  retriable o no-retriable (ej. `INVALID_STATE` cuando el service no tiene
 *  `enhance_website_id` en metadata), el wrapper canónico devuelve
 *  `{success: false, message}` SIN `data`. La SC parent debe ramificar por
 *  `result.success` antes de leer `data.zone`. */
export interface DnsListResponse {
  readonly authority: 'aelium';
  readonly plugin_slug: string;
  readonly nameservers: readonly string[];
  readonly result: {
    readonly success: boolean;
    readonly message?: string;
    readonly data?: DnsListResultData;
  };
}

/** Payload del POST/PATCH/DELETE (status 200/201). */
export interface DnsRecordActionResponse {
  readonly authority: 'aelium';
  readonly plugin_slug: string;
  readonly result: {
    readonly success: boolean;
    readonly data?: { recordId?: string };
  };
}

/**
 * Shape de error 404 cuando el resolver determina que el DNS NO es
 * autoridad Aelium (ADR-082 §6). Frontend ramifica por `code` para
 * pintar banner explicativo + nameservers actuales del dominio.
 */
export interface DnsExternallyManagedError {
  readonly code: 'DNS_MANAGED_EXTERNALLY' | 'DNS_NO_AUTHORITY_PLUGIN';
  readonly reason: string;
  readonly nameservers: readonly string[];
  readonly hint: string;
  readonly message: string;
}

/** Body del POST /services/:id/dns/records. Refleja `CreateDnsRecordDto` backend. */
export interface CreateDnsRecordPayload {
  readonly kind: DnsRecordKindV1;
  readonly name: string;
  readonly value: string;
  readonly ttl?: number;
  readonly proxy?: boolean;
}

/** Body del PATCH /services/:id/dns/records/:recordId. Todos campos opcionales. */
export interface UpdateDnsRecordPayload {
  readonly kind?: DnsRecordKindV1;
  readonly name?: string;
  readonly value?: string;
  readonly ttl?: number;
  readonly proxy?: boolean;
}

