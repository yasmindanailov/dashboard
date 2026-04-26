import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';
import { SettingsService } from '../settings/settings.service';
import { getErrorMessage } from '../common/utils/error.util';
import {
  StorageError,
  StorageNotFoundError,
  StorageUploadError,
} from './storage.errors';
import type { UploadInput, ObjectMetadata } from './storage.types';

/**
 * StorageService — abstracción S3-compatible canónica del proyecto (ADR-062).
 *
 * Funciona contra MinIO (dev), AWS S3, Cloudflare R2, Wasabi. Lo único
 * que cambia entre providers son las env vars `S3_*`.
 *
 * Uso típico desde un módulo de negocio:
 *
 *   await this.storage.upload({ key, body, contentType: 'application/pdf' });
 *   const url = await this.storage.presignedDownloadUrl(key);
 *   res.redirect(302, url);
 *
 * Convención de keys: ver `docs/10-decisions/adr-062-storage-canonico-minio.md` §D.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {
    const endpoint = this.config.get<string>('S3_ENDPOINT', '');
    const region = this.config.get<string>('S3_REGION', 'eu-west-1');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY', '');
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY', '');
    const forcePathStyle =
      this.config.get<string>('S3_FORCE_PATH_STYLE', 'true') === 'true';

    this.bucket = this.config.get<string>('S3_BUCKET', 'aelium-storage');

    this.client = new S3Client({
      region,
      // Cuando endpoint está vacío (prod AWS S3 puro), el SDK usa el default.
      endpoint: endpoint || undefined,
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
      forcePathStyle,
    });
  }

  /**
   * Garantiza que el bucket existe (idempotente). Llamado en boot.
   * No rompe el arranque si el storage no responde — el resto del backend
   * sigue operativo. La primera operación real al storage volverá a
   * intentarlo (S3Client mantiene la conexión, no es un singleton frágil).
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.ensureBucket();
    } catch (err) {
      this.logger.warn(
        `Storage no disponible en boot (bucket=${this.bucket}): ${getErrorMessage(err)}. ` +
          `Las operaciones de storage volverán a intentar al primer uso.`,
      );
    }
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch (err) {
      // 404 / NoSuchBucket → crear. Otros errores (5xx, auth) propagan.
      if (!this.isNotFound(err)) {
        throw new StorageError(
          `No se pudo verificar el bucket "${this.bucket}".`,
          err,
        );
      }
    }
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket "${this.bucket}" creado.`);
    } catch (err) {
      throw new StorageError(
        `No se pudo crear el bucket "${this.bucket}".`,
        err,
      );
    }
  }

  async upload(input: UploadInput): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          ContentLength: input.contentLength ?? input.body.byteLength,
        }),
      );
    } catch (err) {
      this.logger.error(
        `Upload falló (key=${input.key}): ${getErrorMessage(err)}`,
      );
      throw new StorageUploadError(input.key, err);
    }
  }

  async download(key: string): Promise<Buffer> {
    try {
      const out = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return await this.streamToBuffer(out.Body as Readable);
    } catch (err) {
      if (this.isNotFound(err)) throw new StorageNotFoundError(key, err);
      throw new StorageError(`No se pudo leer el objeto ${key}.`, err);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      throw new StorageError(`No se pudo borrar el objeto ${key}.`, err);
    }
  }

  async headObject(key: string): Promise<ObjectMetadata | null> {
    try {
      const out: HeadObjectCommandOutput = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        contentLength: out.ContentLength ?? 0,
        contentType: out.ContentType ?? 'application/octet-stream',
        lastModified: out.LastModified ?? new Date(0),
      };
    } catch (err) {
      if (this.isNotFound(err)) return null;
      throw new StorageError(
        `No se pudo leer metadata del objeto ${key}.`,
        err,
      );
    }
  }

  /**
   * Genera una URL firmada de descarga con TTL configurable.
   *
   * - El TTL viene de `storage.signed_url_expiry_minutes` (default 60). El
   *   caller puede sobreescribir para casos puntuales.
   * - `responseContentDisposition` y `responseContentType` permiten forzar
   *   en la respuesta firmada los headers `Content-Disposition` y
   *   `Content-Type` que ven los clientes — útil para que el navegador
   *   descargue como `attachment; filename="..."` aunque el bucket no los
   *   guarde por defecto.
   */
  async presignedDownloadUrl(
    key: string,
    options?: {
      ttlSeconds?: number;
      responseContentDisposition?: string;
      responseContentType?: string;
    },
  ): Promise<string> {
    const ttl = options?.ttlSeconds ?? (await this.getDefaultTtlSeconds());
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ResponseContentDisposition: options?.responseContentDisposition,
          ResponseContentType: options?.responseContentType,
        }),
        { expiresIn: ttl },
      );
    } catch (err) {
      throw new StorageError(
        `No se pudo generar URL firmada para ${key}.`,
        err,
      );
    }
  }

  private async getDefaultTtlSeconds(): Promise<number> {
    const minutes = await this.settings.getNumber(
      'storage',
      'signed_url_expiry_minutes',
      60,
    );
    return Math.max(1, minutes) * 60;
  }

  private isNotFound(err: unknown): boolean {
    if (typeof err !== 'object' || err === null) return false;
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    return (
      e.name === 'NotFound' ||
      e.name === 'NoSuchKey' ||
      e.name === 'NoSuchBucket' ||
      e.$metadata?.httpStatusCode === 404
    );
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer | string) => {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      });
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
