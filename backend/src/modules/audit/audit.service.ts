import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { getErrorMessage } from '../../core/common/utils/error.util';
import {
  GetServiceTimelineOptions,
  ServiceTimelineActor,
  ServiceTimelineEntry,
  ServiceTimelinePage,
} from './dto/service-timeline.dto';

export interface AuditAccessEntry {
  user_id: string;
  action: string;
  /** IP del request HTTP. Sprint 13.5 Fase E (DC.8): opcional para
      callers no-HTTP (listeners de eventos asíncronos `auth.*` que
      no tienen contexto request). Cuando el caller es un controller,
      siempre debe pasar el IP del cliente. */
  ip_address?: string | null;
  user_agent?: string | null;
  resource?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditChangeEntry {
  user_id?: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  changes_before?: Record<string, unknown> | null;
  changes_after?: Record<string, unknown> | null;
  correlation_id?: string | null;
}

export interface AuditAccessQuery {
  user_id?: string;
  resource?: string;
  action?: string;
  resource_id?: string;
  page?: number;
  limit?: number;
}

/**
 * AuditService — registro centralizado de accesos y cambios sensibles
 * (Sprint 9 Fase E + ADR-017 + ADR-010 RGPD).
 *
 * R3 (audit inmutable): solo INSERT. Único DELETE permitido es el cron
 * `cleanupOldAuditLogs` que borra rows con `created_at < now() - 730 días`
 * (ADR-017 §Retención).
 *
 * Alcance Fase E (Opción A — mínimo viable defendible):
 *  - `logAccess`: lecturas staff sobre datos personales/financieros del
 *    cliente. Auto-aplicado vía `AuditInterceptor` + decorador
 *    `@AuditAccess('Resource')` en controllers staff.
 *  - `logChange`: disponible para uso explícito desde controllers cuando
 *    haya un PATCH sensible.
 *
 * Los `auth.*` listeners ya escriben directo a `audit_access_log` desde
 * Sprint 5. NO se migran en Fase E para no romper tests E2E ya verdes;
 * queda como deuda DC.8 (oportunista al tocar el archivo).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra una lectura de recurso sensible. NUNCA relanza — el caller
   * no debe romperse si el audit falla (R7: log de stderr y degradación
   * silenciosa).
   */
  async logAccess(entry: AuditAccessEntry): Promise<void> {
    try {
      await this.prisma.auditAccessLog.create({
        data: {
          user_id: entry.user_id,
          action: entry.action,
          // Sprint 13.5 DC.8: callers no-HTTP (listeners async `auth.*`)
          // pueden no tener IP. El schema acepta string vacío como
          // fallback canónico — la columna no es NULL pero un valor
          // vacío señala "registrado fuera de contexto request".
          ip_address: entry.ip_address ?? '',
          user_agent: entry.user_agent ?? null,
          resource: entry.resource ?? null,
          ...(entry.metadata
            ? { metadata: entry.metadata as Prisma.InputJsonValue }
            : {}),
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to persist audit access entry: ${getErrorMessage(err)}`,
      );
    }
  }

  async logChange(entry: AuditChangeEntry): Promise<void> {
    try {
      await this.prisma.auditChangeLog.create({
        data: {
          user_id: entry.user_id ?? null,
          entity_type: entry.entity_type,
          entity_id: entry.entity_id,
          action: entry.action,
          ...(entry.changes_before
            ? {
                changes_before: entry.changes_before as Prisma.InputJsonValue,
              }
            : {}),
          ...(entry.changes_after
            ? {
                changes_after: entry.changes_after as Prisma.InputJsonValue,
              }
            : {}),
          correlation_id: entry.correlation_id ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to persist audit change entry: ${getErrorMessage(err)}`,
      );
    }
  }

  /**
   * Query para portal transparencia + auditoría admin. El controller
   * aplica filtro de ownership pasando `resource_id` o `user_id`
   * apropiados — nunca devuelve accesos a recursos ajenos al cliente.
   */
  async findAccessLog(query: AuditAccessQuery) {
    const where: Prisma.AuditAccessLogWhereInput = {};
    if (query.user_id) where.user_id = query.user_id;
    if (query.action) where.action = query.action;
    if (query.resource) where.resource = query.resource;
    if (query.resource_id) {
      where.metadata = {
        path: ['resource_id'],
        equals: query.resource_id,
      };
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);

    const [items, total] = await Promise.all([
      this.prisma.auditAccessLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          user_id: true,
          action: true,
          ip_address: true,
          user_agent: true,
          resource: true,
          metadata: true,
          created_at: true,
        },
      }),
      this.prisma.auditAccessLog.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Sprint 15C.II Fase F.3 (GAP-15CII-M) — timeline de auditoría per-servicio
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Devuelve el timeline de auditoría de un servicio: UNION ordenado de
   * `audit_change_log` (`entity_type='Service'` + `entity_id`) y
   * `audit_access_log` (`metadata->>'resource_id'`), paginado por
   * keyset/cursor `(created_at, id)` DESC.
   *
   * **No comprueba ownership** — el caller (`ProvisioningService`) ya cargó
   * el servicio y verificó que el `userId` es el dueño (o que `isAdmin`).
   * Este método solo aplica el filtro **GDPR** cuando `opts.isAdmin === false`:
   * whitelist explícita de acciones + recorte de `changes_*`/`correlation_id`/
   * IP del staff + subconjunto cliente-seguro de `metadata` por acción.
   *
   * Implementación vía `$queryRaw` UNION ALL (un solo round-trip; Postgres
   * hace el merge+sort+limit usando el índice compuesto
   * `(entity_type, entity_id)` y el índice de expresión parcial
   * `((metadata->>'resource_id')) WHERE metadata ? 'resource_id'`). El cursor
   * `limit+1` permite saber si hay más páginas sin un `count(*)` adicional.
   */
  async getServiceTimeline(
    serviceId: string,
    opts: GetServiceTimelineOptions,
  ): Promise<ServiceTimelinePage> {
    const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
    const cursor = parseTimelineCursor(opts.cursor);

    const cursorClause = cursor
      ? Prisma.sql`AND (created_at < ${cursor.created_at} OR (created_at = ${cursor.created_at} AND id < ${cursor.id}::uuid))`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<RawTimelineRow[]>(Prisma.sql`
      SELECT id, 'change'::text AS source, action, created_at, user_id AS actor_id,
             NULL::varchar AS ip_address, changes_before, changes_after,
             correlation_id, NULL::jsonb AS metadata
      FROM audit_change_log
      WHERE entity_type = 'Service' AND entity_id = ${serviceId}::uuid ${cursorClause}
      UNION ALL
      SELECT id, 'access'::text AS source, action, created_at, user_id AS actor_id,
             ip_address, NULL::jsonb AS changes_before, NULL::jsonb AS changes_after,
             NULL::varchar AS correlation_id, metadata
      FROM audit_access_log
      WHERE metadata ? 'resource_id' AND metadata->>'resource_id' = ${serviceId} ${cursorClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit + 1}
    `);

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const nextCursor =
      hasMore && page.length > 0
        ? `${page[page.length - 1].created_at.toISOString()}|${String(page[page.length - 1].id)}`
        : null;

    // Filtro GDPR para la vista cliente (antes de enriquecer actores —
    // ahorra lookups de usuarios de filas que el cliente no verá).
    const visible = opts.isAdmin
      ? page
      : page.filter((row) => isClientVisibleTimelineRow(row));

    const actor = await this.buildTimelineActorMap(visible);

    const items: ServiceTimelineEntry[] = visible.map((row) =>
      opts.isAdmin
        ? buildAdminTimelineEntry(row, actor)
        : buildClientTimelineEntry(row, actor),
    );

    return { items, next_cursor: nextCursor };
  }

  /**
   * Enriquece los actores de un conjunto de filas del timeline con
   * `name` + `role` (un solo `findMany` por lote — ADR-017: el cliente VE
   * el nombre real del agente, no solo la IP).
   */
  private async buildTimelineActorMap(
    rows: ReadonlyArray<RawTimelineRow>,
  ): Promise<Map<string, ServiceTimelineActor>> {
    const ids = Array.from(
      new Set(
        rows
          .map((r) => r.actor_id)
          .filter((id): id is string => typeof id === 'string'),
      ),
    );
    if (ids.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        role: { select: { slug: true } },
      },
    });
    return new Map(
      users.map((u) => [
        u.id,
        {
          user_id: u.id,
          name:
            `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email,
          role: u.role?.slug ?? null,
        } as ServiceTimelineActor,
      ]),
    );
  }

  /**
   * Cron de retención (R3 — única operación DELETE permitida).
   * Borra rows con `created_at < now() - retention_days`.
   * Devuelve el count borrado para logging.
   */
  async cleanupOldAccessLogs(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 86400_000);
    const result = await this.prisma.auditAccessLog.deleteMany({
      where: { created_at: { lt: cutoff } },
    });
    return result.count;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers file-private del timeline de auditoría per-servicio (Fase F.3)
// ────────────────────────────────────────────────────────────────────────────

/** Fila cruda del `UNION ALL` change-log + access-log. */
interface RawTimelineRow {
  id: string;
  source: 'change' | 'access';
  action: string;
  created_at: Date;
  actor_id: string | null;
  ip_address: string | null;
  changes_before: unknown;
  changes_after: unknown;
  correlation_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface TimelineCursor {
  created_at: Date;
  id: string;
}

/** Parsea el cursor opaco `"<iso8601>|<uuid>"`. `null`/`undefined` → sin cursor. */
function parseTimelineCursor(
  raw: string | null | undefined,
): TimelineCursor | null {
  if (!raw) return null;
  const sep = raw.indexOf('|');
  if (sep <= 0 || sep === raw.length - 1) {
    throw new BadRequestException('Invalid timeline cursor format.');
  }
  const iso = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  const created_at = new Date(iso);
  if (Number.isNaN(created_at.getTime())) {
    throw new BadRequestException('Invalid timeline cursor timestamp.');
  }
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    throw new BadRequestException('Invalid timeline cursor id.');
  }
  return { created_at, id };
}

/**
 * Whitelist GDPR de acciones visibles al cliente en el timeline de su
 * servicio (ADR-010 + ADR-017 + ADR-083 §4 decisión 14):
 *   - `read` / `admin_sso_impersonation` (access-log) — accesos staff a su
 *     servicio; coherente con el portal `/dashboard/transparency`.
 *   - `service.suspended` / `service.unsuspended` / `service.deprovisioned_admin`
 *     (change-log) — cambios de estado que afectan directamente al cliente.
 *   - `reconciled_external_change` (change-log) — solo si su `_meta` tiene
 *     `gdpr_visible_to_data_subject === true` (subscription_missing /
 *     status_divergence sí; plan_divergence NO — implicación billing).
 * Cualquier otra acción (notas internas, `service.action_executed:*` salvo
 * que se whiteliste, `service.reprovision_requested`, …) es admin-only.
 */
const CLIENT_VISIBLE_TIMELINE_ACTIONS: ReadonlySet<string> = new Set([
  'read',
  'admin_sso_impersonation',
  'service.suspended',
  'service.unsuspended',
  'service.deprovisioned_admin',
]);

function getReconciledMeta(
  changesAfter: unknown,
): Record<string, unknown> | null {
  if (!changesAfter || typeof changesAfter !== 'object') return null;
  const meta = (changesAfter as Record<string, unknown>)._meta;
  return meta && typeof meta === 'object'
    ? (meta as Record<string, unknown>)
    : null;
}

function isClientVisibleTimelineRow(row: RawTimelineRow): boolean {
  if (row.action === 'reconciled_external_change') {
    const meta = getReconciledMeta(row.changes_after);
    return meta?.gdpr_visible_to_data_subject === true;
  }
  return CLIENT_VISIBLE_TIMELINE_ACTIONS.has(row.action);
}

function resolveActor(
  actorId: string | null,
  actorMap: Map<string, ServiceTimelineActor>,
): ServiceTimelineActor | null {
  if (!actorId) return null; // sistema
  return (
    actorMap.get(actorId) ?? { user_id: actorId, name: null, role: null }
  );
}

function buildAdminTimelineEntry(
  row: RawTimelineRow,
  actorMap: Map<string, ServiceTimelineActor>,
): ServiceTimelineEntry {
  const base: ServiceTimelineEntry = {
    id: String(row.id),
    source: row.source,
    action: row.action,
    actor: resolveActor(row.actor_id, actorMap),
    created_at: row.created_at.toISOString(),
  };
  if (row.source === 'change') {
    return {
      ...base,
      changes_before: row.changes_before ?? null,
      changes_after: row.changes_after ?? null,
      correlation_id: row.correlation_id ?? null,
    };
  }
  return {
    ...base,
    ip_address: row.ip_address ?? undefined,
    metadata: row.metadata ?? null,
  };
}

/**
 * Proyección cliente-segura: NUNCA `changes_*`/`correlation_id`/IP del staff;
 * `metadata` recortado a un subconjunto por acción.
 */
function buildClientTimelineEntry(
  row: RawTimelineRow,
  actorMap: Map<string, ServiceTimelineActor>,
): ServiceTimelineEntry {
  let metadata: Record<string, unknown> | null = null;
  if (row.action === 'admin_sso_impersonation') {
    const panel = row.metadata?.panel_label;
    metadata = typeof panel === 'string' ? { panel_label: panel } : null;
  } else if (row.action === 'reconciled_external_change') {
    const meta = getReconciledMeta(row.changes_after);
    const changeType = meta?.change_type;
    metadata = typeof changeType === 'string' ? { change_type: changeType } : null;
  }
  return {
    id: String(row.id),
    source: row.source,
    action: row.action,
    actor: resolveActor(row.actor_id, actorMap),
    created_at: row.created_at.toISOString(),
    metadata,
  };
}
