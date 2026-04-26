/**
 * Errores tipados del StorageService.
 *
 * El caller (controllers de billing, support, etc.) los traduce a HTTP exceptions
 * en su capa, manteniendo el service agnóstico al transporte. Cumple R7
 * (errores registrados) y R14 (frontend recibe mensaje legible).
 */

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export class StorageNotFoundError extends StorageError {
  constructor(key: string, cause?: unknown) {
    super(`Objeto no encontrado en el bucket: ${key}`, cause);
    this.name = 'StorageNotFoundError';
  }
}

export class StorageUploadError extends StorageError {
  constructor(key: string, cause?: unknown) {
    super(`No se pudo subir el objeto al bucket: ${key}`, cause);
    this.name = 'StorageUploadError';
  }
}
