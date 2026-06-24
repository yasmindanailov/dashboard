import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { AuditService } from '../audit/audit.service';
import {
  SETTINGS_CATALOG,
  SettingCatalogEntry,
  SettingValidationError,
  SettingValue,
  coerceAndValidateSetting,
  findSettingEntry,
} from '../../core/settings/settings-catalog';

/**
 * Proyección de un setting catalogado para la UI: la metadata del catálogo +
 * el valor actual (crudo) en BD (o `null` si aún no existe la fila).
 */
export interface AdminSettingView {
  category: string;
  key: string;
  type: string;
  label: string;
  description: string;
  group: string;
  editable: boolean;
  managed: boolean;
  options?: readonly string[];
  min?: number;
  max?: number;
  value: Prisma.JsonValue | null;
}

export interface AdminSettingsGroup {
  group: string;
  settings: AdminSettingView[];
}

/**
 * AdminSettingsService — Sprint 12 (ADR-044).
 *
 * CRUD admin de la configuración global de negocio. Sólo expone los settings
 * declarados en `SETTINGS_CATALOG` (qué es editable + cómo se valida). Cada
 * cambio: valida contra el catálogo → upsert crudo → audita (R3) → invalida
 * la caché de `SettingsService`.
 */
@Injectable()
export class AdminSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Lista los settings catalogados agrupados por sección, con su valor actual.
   * El orden de los grupos respeta el primer avistamiento en el catálogo.
   */
  async list(): Promise<AdminSettingsGroup[]> {
    const rows = await this.prisma.setting.findMany({
      where: {
        OR: SETTINGS_CATALOG.map((e) => ({ category: e.category, key: e.key })),
      },
      select: { category: true, key: true, value: true },
    });
    const current = new Map<string, Prisma.JsonValue>(
      rows.map((r) => [`${r.category}.${r.key}`, r.value]),
    );

    const groups: AdminSettingsGroup[] = [];
    const byGroup = new Map<string, AdminSettingView[]>();
    for (const entry of SETTINGS_CATALOG) {
      const view = this.toView(
        entry,
        current.get(`${entry.category}.${entry.key}`) ?? null,
      );
      let bucket = byGroup.get(entry.group);
      if (!bucket) {
        bucket = [];
        byGroup.set(entry.group, bucket);
        groups.push({ group: entry.group, settings: bucket });
      }
      bucket.push(view);
    }
    return groups;
  }

  /**
   * Actualiza un setting catalogado. Rechaza claves no catalogadas, no
   * editables o gestionadas por endpoint dedicado (p.ej. logo). El valor se
   * persiste crudo (sin envoltorio `{value}`); la caché se invalida en la misma
   * operación (ADR-044 §Caching).
   */
  async update(
    category: string,
    key: string,
    rawValue: unknown,
    actorId: string,
  ): Promise<AdminSettingView> {
    const entry = findSettingEntry(category, key);
    if (!entry) {
      throw new BadRequestException(
        `El setting "${category}.${key}" no es configurable.`,
      );
    }
    if (!entry.editable || entry.managed) {
      throw new BadRequestException(
        `El setting "${category}.${key}" no se puede editar directamente.`,
      );
    }

    let value: SettingValue;
    try {
      value = coerceAndValidateSetting(entry, rawValue);
    } catch (err) {
      if (err instanceof SettingValidationError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    const before = await this.prisma.setting.findUnique({
      where: { category_key: { category, key } },
      select: { value: true },
    });

    const row = await this.prisma.setting.upsert({
      where: { category_key: { category, key } },
      update: { value: value as Prisma.InputJsonValue, updated_by: actorId },
      create: {
        category,
        key,
        value: value as Prisma.InputJsonValue,
        description: entry.description,
        updated_by: actorId,
      },
      select: { id: true, value: true },
    });

    // R3 — auditoría inmutable del cambio de configuración (ADR-044 §Auditoría).
    // `logChange` es silent-safe: no rompe el PATCH si el audit falla.
    await this.audit.logChange({
      user_id: actorId,
      entity_type: 'Setting',
      entity_id: row.id,
      action: 'update',
      changes_before: { [`${category}.${key}`]: before?.value ?? null },
      changes_after: { [`${category}.${key}`]: value },
    });

    this.settings.invalidateCache(category, key);

    return this.toView(entry, row.value);
  }

  private toView(
    entry: SettingCatalogEntry,
    value: Prisma.JsonValue | null,
  ): AdminSettingView {
    return {
      category: entry.category,
      key: entry.key,
      type: entry.type,
      label: entry.label,
      description: entry.description,
      group: entry.group,
      editable: entry.editable,
      managed: entry.managed ?? false,
      options: entry.options,
      min: entry.min,
      max: entry.max,
      value,
    };
  }
}
