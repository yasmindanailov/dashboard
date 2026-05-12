import { resolveErrorModule } from './global-exception.filter';
import { ProvisionerPluginError } from '../../provisioning/types';

/**
 * Tests unit `resolveErrorModule` — Sprint 15C.II Fase F.3 (GAP-15CII-N).
 *
 * El filtro deriva `error_log.module` del error o de su cadena `cause`:
 * un `ProvisionerPluginError` marcado por el wrapper de provisioning con
 * `provisioning.<slug>` debe registrarse con ese módulo, no con `'http'`.
 */
describe('resolveErrorModule (GlobalExceptionFilter — GAP-15CII-N)', () => {
  it('error sin `module` → "http"', () => {
    expect(resolveErrorModule(new Error('boom'))).toBe('http');
    expect(resolveErrorModule('not even an error')).toBe('http');
    expect(resolveErrorModule(undefined)).toBe('http');
  });

  it('ProvisionerPluginError con `module` → ese módulo', () => {
    const err = new ProvisionerPluginError(
      'oops',
      'PROVIDER_INTERNAL_ERROR',
      true,
      undefined,
      'provisioning.enhance_cp',
    );
    expect(resolveErrorModule(err)).toBe('provisioning.enhance_cp');
  });

  it('módulo en la cadena `cause` (error envuelto) → lo encuentra', () => {
    const inner = new ProvisionerPluginError(
      'inner',
      'PROVIDER_TIMEOUT',
      true,
      undefined,
      'provisioning.resellerclub',
    );
    const wrapper = new Error('wrapped') as Error & { cause?: unknown };
    wrapper.cause = inner;
    expect(resolveErrorModule(wrapper)).toBe('provisioning.resellerclub');
  });

  it('no entra en bucle infinito con `cause` cíclico', () => {
    const a = new Error('a') as Error & { cause?: unknown };
    const b = new Error('b') as Error & { cause?: unknown };
    a.cause = b;
    b.cause = a;
    expect(resolveErrorModule(a)).toBe('http'); // sin module en ninguno; no cuelga
  });
});
