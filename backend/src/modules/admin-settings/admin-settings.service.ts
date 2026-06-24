import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { StorageService } from '../../core/storage/storage.service';
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
 * Subconjunto del `Express.Multer.File` que consumimos (evita depender de
 * `@types/multer`): el logo se sube como multipart vía `FileInterceptor`.
 */
export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

/**
 * Mimetypes aceptados para el logo + su extensión. Sólo PNG/JPEG: son los
 * formatos que PDFKit puede incrustar en la factura (WEBP/SVG no), y el logo
 * existe precisamente para aparecer en el PDF. Vectorial → follow-up.
 */
const LOGO_MIME_EXT: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

/**
 * AdminSettingsService — Sprint 12 (ADR-044).
 *
 * CRUD admin de la configuración global de negocio. Sólo expone los settings
 * declarados en `SETTINGS_CATALOG` (qué es editable + cómo se valida). Cada
 * cambio: valida contra el catálogo → upsert crudo → audita (R3) → invalida
 * la caché de `SettingsService`. La marca incluye la subida del logo a MinIO
 * (ADR-062), persistido como `branding.logo_key`.
 */
@Injectable()
export class AdminSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
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

    const row = await this.persist(entry, value, actorId);
    return this.toView(entry, row.value);
  }

  /**
   * Sube el logo de marca a MinIO y persiste su S3 key en `branding.logo_key`.
   * Valida mimetype de imagen + tamaño (`storage.max_upload_size_mb`). Borra el
   * logo anterior best-effort (no acumula huérfanos). Devuelve la key + una URL
   * firmada para el preview inmediato.
   */
  async uploadBrandingLogo(
    file: UploadedImage | undefined,
    actorId: string,
  ): Promise<{ logo_key: string; url: string }> {
    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException('No se recibió ningún archivo de logo.');
    }
    const ext = LOGO_MIME_EXT[file.mimetype];
    if (!ext) {
      throw new BadRequestException('El logo debe ser una imagen PNG o JPG.');
    }
    const maxMb = await this.settings.getNumber(
      'storage',
      'max_upload_size_mb',
      10,
    );
    if (file.size > maxMb * 1024 * 1024) {
      throw new BadRequestException(`El logo no puede superar ${maxMb} MB.`);
    }

    const entry = findSettingEntry('branding', 'logo_key');
    if (!entry) {
      // Invariante de programación: el catálogo declara `branding.logo_key`.
      throw new Error('Catálogo incoherente: falta branding.logo_key.');
    }

    const previousKey = await this.readRawString('branding', 'logo_key');
    const key = `branding/logo-${randomUUID()}.${ext}`;
    await this.storage.upload({
      key,
      body: file.buffer,
      contentType: file.mimetype,
      contentLength: file.size,
    });

    await this.persist(entry, key, actorId);

    if (previousKey && previousKey !== key) {
      try {
        await this.storage.delete(previousKey);
      } catch {
        // fail-soft: un logo huérfano no debe romper la subida.
      }
    }

    const url = await this.storage.presignedDownloadUrl(key);
    return { logo_key: key, url };
  }

  /**
   * URL firmada del logo de marca actual (o `null` si no hay logo subido).
   * Usada por la UI para el preview.
   */
  async getBrandingLogo(): Promise<{
    logo_key: string | null;
    url: string | null;
  }> {
    const key = await this.readRawString('branding', 'logo_key');
    if (!key) return { logo_key: null, url: null };
    const url = await this.storage.presignedDownloadUrl(key);
    return { logo_key: key, url };
  }

  /**
   * Upsert crudo + auditoría R3 + invalidación de caché. Punto único de
   * escritura — lo usan tanto `update` (tras validar) como `uploadBrandingLogo`
   * (setting `managed`, ya validado por el flujo de subida).
   */
  private async persist(
    entry: SettingCatalogEntry,
    value: SettingValue,
    actorId: string,
  ): Promise<{ id: string; value: Prisma.JsonValue }> {
    const { category, key } = entry;
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
    return row;
  }

  /** Lee un setting crudo como string directamente de BD (sin caché). */
  private async readRawString(category: string, key: string): Promise<string> {
    const row = await this.prisma.setting.findUnique({
      where: { category_key: { category, key } },
      select: { value: true },
    });
    return typeof row?.value === 'string' ? row.value : '';
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
