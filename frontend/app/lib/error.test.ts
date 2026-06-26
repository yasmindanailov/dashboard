/**
 * Tests de `error.ts` — `getErrorMessage` (cumple R7/R14 en el frontend).
 * Cubre cada rama: Error, string, primitivos, shape de `lib/api.ts`
 * `{ status, message, correlationId }`, objeto sin mensaje legible,
 * null/undefined y objeto no serializable (circular).
 */
import { getErrorMessage } from './error';

describe('getErrorMessage', () => {
  it('extrae el mensaje de una instancia Error', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('devuelve el string tal cual', () => {
    expect(getErrorMessage('fallo de red')).toBe('fallo de red');
  });

  it('serializa primitivos numéricos y booleanos', () => {
    expect(getErrorMessage(404)).toBe('404');
    expect(getErrorMessage(false)).toBe('false');
  });

  it('lee `message` del shape de lib/api.ts { status, message, correlationId }', () => {
    const apiError = { status: 400, message: 'Datos inválidos', correlationId: 'abc' };
    expect(getErrorMessage(apiError)).toBe('Datos inválidos');
  });

  it('cae a JSON.stringify cuando el objeto no tiene un message string', () => {
    expect(getErrorMessage({ message: 123 })).toBe('{"message":123}');
    expect(getErrorMessage({ code: 'E_X' })).toBe('{"code":"E_X"}');
  });

  it('devuelve un mensaje genérico para null y undefined', () => {
    expect(getErrorMessage(null)).toBe('Error desconocido');
    expect(getErrorMessage(undefined)).toBe('Error desconocido');
  });

  it('no revienta ante un objeto circular (JSON.stringify lanza)', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(getErrorMessage(circular)).toBe('Error desconocido');
  });
});
