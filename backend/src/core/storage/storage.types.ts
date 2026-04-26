/**
 * Tipos públicos del StorageService (ADR-062).
 * El service actúa como abstracción S3-compatible sobre `@aws-sdk/client-s3`.
 * Mismas firmas funcionan contra MinIO (dev), AWS S3, Cloudflare R2, Wasabi.
 */

export interface UploadInput {
  /** S3 key — path semántico estable. Ej: `invoices/AEL-2026-000123.pdf`. */
  key: string;
  /** Cuerpo del objeto. Buffer para uploads internos del backend (PDFs, etc.). */
  body: Buffer;
  /** MIME type. Ej: `application/pdf`, `image/png`. */
  contentType: string;
  /**
   * Tamaño en bytes. Si se omite, S3 SDK lo calcula del Buffer. Pasarlo
   * explícitamente cuando venga de un upload externo (validación de tamaño
   * contra `storage.max_upload_size_mb` ANTES de invocar `upload`).
   */
  contentLength?: number;
}

export interface ObjectMetadata {
  contentLength: number;
  contentType: string;
  lastModified: Date;
}
