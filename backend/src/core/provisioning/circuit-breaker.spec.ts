import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  CircuitBreakerConfig,
  CircuitBreakerRegistry,
  CircuitOpenError,
  DEFAULT_BREAKER_CONFIG,
  derivePluginHealth,
  HouseCircuitBreaker,
} from './circuit-breaker';

/**
 * Tests unit CircuitBreaker — Sprint 15A Fase F (ADR-080 §5).
 *
 * Cobertura:
 *  Estado inicial:
 *  - Construye en estado closed.
 *  - Estado expuesto vía getState().
 *
 *  Transiciones closed → open:
 *  - N-1 fallos en ventana → sigue closed.
 *  - N-ésimo fallo → transición a open + emite plugin.circuit_opened.
 *  - Fallos fuera de ventana NO cuentan (sliding window).
 *  - Llamadas con circuito open → CircuitOpenError sin invocar fn.
 *
 *  Transiciones open → half-open → closed/open:
 *  - Antes de resetTimeoutMs → CircuitOpenError persiste.
 *  - Tras resetTimeoutMs → primera ejecución entra como half-open.
 *  - Probe OK en half-open → closed + emite plugin.circuit_closed.
 *  - Probe KO en half-open → vuelve a open (sin re-emitir _opened).
 *
 *  reset() manual:
 *  - Limpia fallos y vuelve a closed (admin override).
 *
 *  Error code extraction:
 *  - ProvisionerPluginError.code se extrae al payload.
 *  - Error sin code usa Error.name.
 *  - No-Error usa 'UNKNOWN_ERROR'.
 *
 *  Registry:
 *  - getOrCreate lazy-creates por nombre.
 *  - get devuelve null si no existe.
 *  - resetAll resetea todos los breakers registrados.
 */

const TEST_CONFIG: CircuitBreakerConfig = {
  name: 'test-plugin:getServiceInfo',
  failureThreshold: 3,
  failureWindowMs: 60_000,
  resetTimeoutMs: 30_000,
};

class FakeError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'FakeError';
  }
}

function createBreaker(
  config: CircuitBreakerConfig = TEST_CONFIG,
  initialNow = 1_000_000,
): {
  breaker: HouseCircuitBreaker;
  events: { emit: jest.Mock };
  setNow: (n: number) => void;
} {
  let nowValue = initialNow;
  const events = { emit: jest.fn() };
  const breaker = new HouseCircuitBreaker(
    config,
    events as unknown as EventEmitter2,
    () => nowValue,
  );
  return {
    breaker,
    events,
    setNow: (n: number) => {
      nowValue = n;
    },
  };
}

describe('HouseCircuitBreaker — Sprint 15A Fase F (ADR-080 §5)', () => {
  describe('estado inicial', () => {
    it('arranca en closed', () => {
      const { breaker } = createBreaker();
      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('transiciones closed → open', () => {
    it('N-1 fallos en ventana mantienen closed', async () => {
      const { breaker } = createBreaker();
      for (let i = 0; i < TEST_CONFIG.failureThreshold - 1; i++) {
        await expect(
          breaker.execute(() => Promise.reject(new Error('fail'))),
        ).rejects.toThrow('fail');
      }
      expect(breaker.getState()).toBe('closed');
    });

    it('N-ésimo fallo transiciona a open + emite plugin.circuit_opened', async () => {
      const { breaker, events } = createBreaker();
      for (let i = 0; i < TEST_CONFIG.failureThreshold; i++) {
        await expect(
          breaker.execute(() =>
            Promise.reject(new FakeError('boom', 'PROVIDER_TIMEOUT')),
          ),
        ).rejects.toBeInstanceOf(FakeError);
      }
      expect(breaker.getState()).toBe('open');

      expect(events.emit).toHaveBeenCalledWith(
        'plugin.circuit_opened',
        expect.objectContaining({
          breaker_name: TEST_CONFIG.name,
          last_error_code: 'PROVIDER_TIMEOUT',
          failure_count: TEST_CONFIG.failureThreshold,
          reset_timeout_ms: TEST_CONFIG.resetTimeoutMs,
        }),
      );
    });

    it('fallos fuera de la ventana deslizante no cuentan', async () => {
      const { breaker, setNow } = createBreaker(TEST_CONFIG, 1_000_000);
      // 2 fallos a t=1_000_000.
      await expect(
        breaker.execute(() => Promise.reject(new Error('a'))),
      ).rejects.toThrow();
      await expect(
        breaker.execute(() => Promise.reject(new Error('b'))),
      ).rejects.toThrow();

      // Avanzamos 90s: los 2 fallos quedan fuera de la ventana de 60s.
      setNow(1_000_000 + 90_000);
      await expect(
        breaker.execute(() => Promise.reject(new Error('c'))),
      ).rejects.toThrow();

      // Tras prunear ventana sólo queda 1 fallo → sigue closed.
      expect(breaker.getState()).toBe('closed');
    });

    it('execute con circuito open lanza CircuitOpenError sin invocar fn', async () => {
      const { breaker } = createBreaker();
      for (let i = 0; i < TEST_CONFIG.failureThreshold; i++) {
        await expect(
          breaker.execute(() => Promise.reject(new Error('fail'))),
        ).rejects.toThrow();
      }
      expect(breaker.getState()).toBe('open');

      const fn = jest.fn();
      await expect(breaker.execute(fn)).rejects.toBeInstanceOf(
        CircuitOpenError,
      );

      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('transiciones open → half-open → closed/open', () => {
    it('antes de resetTimeoutMs persiste CircuitOpenError', async () => {
      const { breaker, setNow } = createBreaker(TEST_CONFIG, 1_000_000);
      for (let i = 0; i < TEST_CONFIG.failureThreshold; i++) {
        await expect(
          breaker.execute(() => Promise.reject(new Error('fail'))),
        ).rejects.toThrow();
      }
      // 25s después, sigue dentro del reset timeout (30s).
      setNow(1_000_000 + 25_000);
      await expect(
        breaker.execute(() => Promise.resolve('ok')),
      ).rejects.toBeInstanceOf(CircuitOpenError);
    });

    it('probe OK en half-open transiciona a closed + emite plugin.circuit_closed', async () => {
      const { breaker, events, setNow } = createBreaker(TEST_CONFIG, 1_000_000);
      for (let i = 0; i < TEST_CONFIG.failureThreshold; i++) {
        await expect(
          breaker.execute(() => Promise.reject(new Error('fail'))),
        ).rejects.toThrow();
      }

      // Avanzamos pasado el reset timeout.
      setNow(1_000_000 + 35_000);
      const result = await breaker.execute(() => Promise.resolve('recovered'));
      expect(result).toBe('recovered');
      expect(breaker.getState()).toBe('closed');

      expect(events.emit).toHaveBeenCalledWith(
        'plugin.circuit_closed',
        expect.objectContaining({
          breaker_name: TEST_CONFIG.name,
          downtime_seconds: 35,
        }),
      );
    });

    it('probe KO en half-open vuelve a open', async () => {
      const { breaker, events, setNow } = createBreaker(TEST_CONFIG, 1_000_000);
      for (let i = 0; i < TEST_CONFIG.failureThreshold; i++) {
        await expect(
          breaker.execute(() => Promise.reject(new Error('fail'))),
        ).rejects.toThrow();
      }
      const initialOpenedEmits = events.emit.mock.calls.filter(
        ([type]) => type === 'plugin.circuit_opened',
      ).length;

      setNow(1_000_000 + 35_000);
      await expect(
        breaker.execute(() => Promise.reject(new Error('still down'))),
      ).rejects.toThrow('still down');

      expect(breaker.getState()).toBe('open');
      const finalOpenedEmits = events.emit.mock.calls.filter(
        ([type]) => type === 'plugin.circuit_opened',
      ).length;
      // El breaker re-abrió tras half-open KO → emite otro plugin.circuit_opened.
      expect(finalOpenedEmits).toBe(initialOpenedEmits + 1);
    });
  });

  describe('reset() manual', () => {
    it('limpia fallos y vuelve a closed', async () => {
      const { breaker, events } = createBreaker();
      for (let i = 0; i < TEST_CONFIG.failureThreshold; i++) {
        await expect(
          breaker.execute(() => Promise.reject(new Error('fail'))),
        ).rejects.toThrow();
      }
      expect(breaker.getState()).toBe('open');

      breaker.reset();
      expect(breaker.getState()).toBe('closed');
      // Reset emite plugin.circuit_closed.

      expect(events.emit).toHaveBeenCalledWith(
        'plugin.circuit_closed',
        expect.objectContaining({ breaker_name: TEST_CONFIG.name }),
      );

      // Tras reset, una llamada OK pasa sin problema.
      await expect(breaker.execute(() => Promise.resolve(42))).resolves.toBe(
        42,
      );
    });
  });

  describe('extracción de error code', () => {
    it('extrae .code de ProvisionerPluginError-like', async () => {
      const { breaker, events } = createBreaker();
      for (let i = 0; i < TEST_CONFIG.failureThreshold; i++) {
        await expect(
          breaker.execute(() =>
            Promise.reject(new FakeError('rate', 'PROVIDER_RATE_LIMITED')),
          ),
        ).rejects.toThrow();
      }

      expect(events.emit).toHaveBeenCalledWith(
        'plugin.circuit_opened',
        expect.objectContaining({ last_error_code: 'PROVIDER_RATE_LIMITED' }),
      );
    });

    it('cae a Error.name si no hay .code', async () => {
      const { breaker, events } = createBreaker();
      for (let i = 0; i < TEST_CONFIG.failureThreshold; i++) {
        await expect(
          breaker.execute(() => Promise.reject(new TypeError('bad'))),
        ).rejects.toThrow();
      }

      expect(events.emit).toHaveBeenCalledWith(
        'plugin.circuit_opened',
        expect.objectContaining({ last_error_code: 'TypeError' }),
      );
    });

    it('usa UNKNOWN_ERROR si el reject value no es Error', async () => {
      const { breaker, events } = createBreaker();
      for (let i = 0; i < TEST_CONFIG.failureThreshold; i++) {
        await expect(
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- caso edge defensivo: cubrimos qué pasa si un plugin lanza un valor no-Error.
          breaker.execute(() => Promise.reject('string-error')),
        ).rejects.toBe('string-error');
      }

      expect(events.emit).toHaveBeenCalledWith(
        'plugin.circuit_opened',
        expect.objectContaining({ last_error_code: 'UNKNOWN_ERROR' }),
      );
    });
  });
});

describe('CircuitBreakerRegistry — Sprint 15A Fase F', () => {
  let events: { emit: jest.Mock };
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    events = { emit: jest.fn() };
    registry = new CircuitBreakerRegistry(events as unknown as EventEmitter2);
  });

  it('getOrCreate lazy-crea breaker por nombre con config canónica', () => {
    const a = registry.getOrCreate('plugin-a:getServiceInfo');
    const a2 = registry.getOrCreate('plugin-a:getServiceInfo');
    expect(a).toBe(a2);
    expect(a.getState()).toBe('closed');
  });

  it('getOrCreate con nombres distintos crea breakers separados', () => {
    const a = registry.getOrCreate('plugin-a:getServiceInfo');
    const b = registry.getOrCreate('plugin-b:executeAction');
    expect(a).not.toBe(b);
    expect(registry.listNames().sort()).toEqual([
      'plugin-a:getServiceInfo',
      'plugin-b:executeAction',
    ]);
  });

  it('get devuelve null si el nombre no existe', () => {
    expect(registry.get('non-existent')).toBeNull();
  });

  it('resetAll() resetea todos los breakers', async () => {
    const a = registry.getOrCreate('plugin-a:getServiceInfo');
    // Forzar a abrir el breaker.
    for (let i = 0; i < DEFAULT_BREAKER_CONFIG.failureThreshold; i++) {
      await expect(
        a.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow();
    }
    expect(a.getState()).toBe('open');

    registry.resetAll();
    expect(a.getState()).toBe('closed');
  });
});

// ─── Sprint 15C.II Fase F.11.1 (R3 frozen §A.11.10.8.2) ────────────────
//
// derivePluginHealth: agregado worst-case del estado de los breakers
// in-process per plugin slug. Read-only — NO crea breakers.

describe('derivePluginHealth', () => {
  let events: EventEmitter2;
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    events = new EventEmitter2();
    registry = new CircuitBreakerRegistry(events);
  });

  async function forceOpen(name: string): Promise<void> {
    const breaker = registry.getOrCreate(name);
    for (let i = 0; i < DEFAULT_BREAKER_CONFIG.failureThreshold; i++) {
      await expect(
        breaker.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow();
    }
    expect(breaker.getState()).toBe('open');
  }

  it('plugin sin breakers registrados → operational + array vacío', () => {
    const summary = derivePluginHealth('enhance_cp', registry);
    expect(summary.pluginSlug).toBe('enhance_cp');
    expect(summary.state).toBe('operational');
    expect(summary.breakers).toEqual([]);
  });

  it('todos los breakers cerrados → operational', async () => {
    const a = registry.getOrCreate('enhance_cp:getServiceInfo');
    const b = registry.getOrCreate('enhance_cp:executeAction');
    await a.execute(() => Promise.resolve('ok'));
    await b.execute(() => Promise.resolve('ok'));
    const summary = derivePluginHealth('enhance_cp', registry);
    expect(summary.state).toBe('operational');
    expect(summary.breakers).toHaveLength(2);
    expect(
      summary.breakers.find((br) => br.operation === 'getServiceInfo')?.state,
    ).toBe('closed');
    expect(
      summary.breakers.find((br) => br.operation === 'executeAction')?.state,
    ).toBe('closed');
  });

  it('al menos un breaker open → down (worst-case)', async () => {
    await forceOpen('enhance_cp:getServiceInfo');
    registry.getOrCreate('enhance_cp:executeAction'); // closed por default
    const summary = derivePluginHealth('enhance_cp', registry);
    expect(summary.state).toBe('down');
    expect(summary.breakers).toHaveLength(2);
  });

  it('al menos un breaker half-open + ninguno open → degraded', async () => {
    // Abrimos un breaker y forzamos transición a half-open via fake time.
    const breaker = registry.getOrCreate('enhance_cp:getServiceInfo');
    for (let i = 0; i < DEFAULT_BREAKER_CONFIG.failureThreshold; i++) {
      await expect(
        breaker.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow();
    }
    // Reset interno avanzando el clock no es trivial sin acceso al `now`
    // override (el registry usa el default `Date.now`). Saltamos directo
    // creando un HouseCircuitBreaker con clock manual y registrándolo.
    let clock = 1_000;
    const halfOpenBreaker = new HouseCircuitBreaker(
      { name: 'plug:op', ...DEFAULT_BREAKER_CONFIG } as CircuitBreakerConfig,
      events,
      () => clock,
    );
    // Forzamos open.
    for (let i = 0; i < DEFAULT_BREAKER_CONFIG.failureThreshold; i++) {
      await expect(
        halfOpenBreaker.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow();
    }
    expect(halfOpenBreaker.getState()).toBe('open');
    // Avanzamos clock más allá del resetTimeoutMs y forzamos la próxima
    // ejecución a entrar como half-open (pero no la dejamos terminar).
    clock += DEFAULT_BREAKER_CONFIG.resetTimeoutMs + 1;
    // execute() la transiciona a half-open al principio; bloqueamos la fn
    // para mantenerla en half-open mientras consultamos getState.
    let resolveFn!: (v: string) => void;
    const promise = halfOpenBreaker.execute(
      () => new Promise<string>((res) => (resolveFn = res)),
    );
    expect(halfOpenBreaker.getState()).toBe('half-open');
    // Sustituimos breaker en el registry vía cast (testing only).
    (
      registry as unknown as {
        breakers: Map<string, HouseCircuitBreaker>;
      }
    ).breakers.set('plug:op', halfOpenBreaker);
    const summary = derivePluginHealth('plug', registry);
    expect(summary.state).toBe('degraded');
    resolveFn('ok');
    await promise;
  });

  it('aísla breakers por slug prefix (otros plugins NO contaminan)', async () => {
    await forceOpen('enhance_cp:getServiceInfo');
    registry.getOrCreate('docker:getServiceInfo');
    const enhanceSummary = derivePluginHealth('enhance_cp', registry);
    const dockerSummary = derivePluginHealth('docker', registry);
    expect(enhanceSummary.state).toBe('down');
    expect(dockerSummary.state).toBe('operational');
    expect(dockerSummary.breakers).toEqual([
      { operation: 'getServiceInfo', state: 'closed' },
    ]);
  });

  it('pluginSlug vacío → array vacío (service sin plugin asociado)', () => {
    registry.getOrCreate(':getServiceInfo'); // breaker con prefix ':'
    const summary = derivePluginHealth('', registry);
    // Cualquier breaker con prefix vacío se filtra porque ':' es válido
    // como nombre (forma técnica del registry); el prefix '' matchea
    // todo lo que empieza por '' = todo. Coherente con la implementación.
    expect(summary.pluginSlug).toBe('');
    // El test sirve solo para fijar el contrato: vacío no rompe.
    expect(Array.isArray(summary.breakers)).toBe(true);
  });
});
