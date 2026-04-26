/**
 * Extrae el mensaje de un error capturado en `catch (err: unknown) { ... }`.
 *
 * Patrón canónico (cumple R7 + lint `no-unsafe-*`):
 *
 *   try {
 *     await doStuff();
 *   } catch (err) {
 *     this.logger.error(`Algo falló: ${getErrorMessage(err)}`);
 *   }
 *
 * - Si `err` es `Error`: devuelve `err.message`.
 * - Si `err` es string: lo devuelve tal cual.
 * - Si `err` es algo serializable: aplica `String(err)`.
 * - Caso patológico (objeto sin toString): devuelve "unknown error".
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err === 'number' || typeof err === 'boolean') return String(err);
  if (err === null || err === undefined) return 'unknown error';
  // Para objetos no-Error (ej. una promesa rejected con un payload), serializar
  // como JSON evita "[object Object]". Si JSON falla (ciclos, BigInt), fallback.
  try {
    return JSON.stringify(err);
  } catch {
    return 'unknown error';
  }
}
