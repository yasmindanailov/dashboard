/**
 * Extrae un mensaje legible de un error capturado en `catch (err) { ... }`.
 * Análogo a `backend/src/core/common/utils/error.util.ts`.
 *
 * Patrón canónico (cumple R7 + lint `no-explicit-any`):
 *
 *   try {
 *     await fetchSomething();
 *   } catch (err) {
 *     setError(getErrorMessage(err));
 *   }
 *
 * Maneja también el formato propio de `lib/api.ts` donde fetch lanza
 * `{ status, message, correlationId }` (no es Error).
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err === 'number' || typeof err === 'boolean') return String(err);
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  if (err === null || err === undefined) return 'Error desconocido';
  try {
    return JSON.stringify(err);
  } catch {
    return 'Error desconocido';
  }
}
