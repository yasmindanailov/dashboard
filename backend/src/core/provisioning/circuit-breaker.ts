import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Sprint 15A Fase F (2026-05-05) — Circuit breaker canónico (ADR-080 §5).
 *
 * Doctrina: protege wrappers cross-cutting de plugins contra proveedores
 * caídos. Se aplica EXCLUSIVAMENTE a operaciones que cumplen los 3
 * criterios canónicos (ADR-080 §5):
 *   (a) idempotentes,
 *   (b) frecuentes,
 *   (c) propagables a UX en tiempo real.
 *
 * Operaciones envueltas:
 *   ✅ getServiceInfoWithCache — lectura repetida y barata.
 *   ✅ executeActionWithCacheInvalidation — feedback inmediato al cliente.
 *
 * Operaciones NO envueltas:
 *   ❌ provision()/deprovision() — one-shot del orquestador con retry
 *      BullMQ propio. Meter breaker arriba crearía dos circuitos
 *      competidores (anti-patrón "blanket protection" — ADR-080 §5).
 *
 * Estados:
 *   - closed:     normal. Cuenta fallos en ventana deslizante.
 *                 ≥ failureThreshold en failureWindowMs → transición a open.
 *   - open:       rechaza llamadas con error semántico inmediato.
 *                 Tras resetTimeoutMs → transición a half-open.
 *   - half-open:  permite UNA llamada de prueba.
 *                 Si OK → closed. Si KO → open (reset el timer de nuevo).
 *
 * Encapsulado tras interface canónica `CircuitBreaker` para permitir
 * migración futura a `opossum` (Netflix-grade) sin tocar call-sites
 * cuando el número de plugins supere el rango razonable para casero
 * (~10 plugins / 10+ rps por plugin / métricas Prometheus). Ver ADR-080
 * §"Cuándo revisar".
 */

const SPRINT_15A_LOGGER_PREFIX = 'provisioning.circuit-breaker';

/**
 * Configuración del breaker. Aplicada por instancia (un breaker por plugin
 * + operación, gestionado por `CircuitBreakerRegistry`).
 *
 * Defaults canónicos Sprint 15A:
 *  - failureThreshold = 5 fallos
 *  - failureWindowMs = 60_000 (1 minuto)
 *  - resetTimeoutMs = 30_000 (30 segundos antes de half-open)
 *
 * Ajustables via setting `provisioning.breaker.<param>` cuando llegue
 * el primer plugin real (Sprint 15C/D/E) si los defaults se quedan
 * cortos. Por ahora hardcoded — YAGNI.
 */
export interface CircuitBreakerConfig {
  /** Nombre del breaker (canónico: `<plugin_slug>:<operation>`). */
  readonly name: string;
  /** Número de fallos en ventana deslizante para abrir el circuito. */
  readonly failureThreshold: number;
  /** Ventana deslizante en ms. */
  readonly failureWindowMs: number;
  /** Tiempo en ms antes de pasar de open a half-open. */
  readonly resetTimeoutMs: number;
}

export const DEFAULT_BREAKER_CONFIG: Omit<CircuitBreakerConfig, 'name'> = {
  failureThreshold: 5,
  failureWindowMs: 60_000,
  resetTimeoutMs: 30_000,
};

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/**
 * Error semántico canónico cuando el breaker está open.
 * El orquestador lo distingue de errores del proveedor real para no
 * contaminar las métricas de fiabilidad del proveedor.
 */
export class CircuitOpenError extends Error {
  constructor(
    public readonly breakerName: string,
    public readonly retryAfterMs: number,
  ) {
    super(
      `Circuit breaker "${breakerName}" is open. Retry in ~${Math.round(retryAfterMs / 1000)}s.`,
    );
    this.name = 'CircuitOpenError';
  }
}

/**
 * Interface canónica del breaker. Implementación intercambiable
 * (casera Sprint 15A, opossum futuro).
 */
export interface CircuitBreaker {
  /**
   * Ejecuta `fn`. Si el circuito está open, lanza `CircuitOpenError`
   * sin invocar `fn` (fail-fast). Si half-open, permite UNA llamada y
   * decide la transición según el resultado.
   */
  execute<T>(fn: () => Promise<T>): Promise<T>;

  /** Estado actual del breaker. */
  getState(): CircuitBreakerState;

  /** Resetea el breaker manualmente (admin override). */
  reset(): void;
}

/**
 * Implementación casera ~150 LOC del breaker.
 * Emite `plugin.circuit_opened` / `plugin.circuit_closed` cuando cambia
 * de estado (consumido por `notifications-on-plugin-circuit-opened` —
 * Sprint 15A Fase F.2).
 *
 * El nombre del breaker DEBE codificar `<plugin_slug>:<operation>`
 * (ej. `enhance_cp:getServiceInfo`) para que los listeners puedan
 * extraer el slug del plugin del payload del evento.
 */
export class HouseCircuitBreaker implements CircuitBreaker {
  private readonly logger = new Logger(SPRINT_15A_LOGGER_PREFIX);

  private state: CircuitBreakerState = 'closed';

  /** Timestamps de fallos en ms. Pruned a la ventana deslizante. */
  private failures: number[] = [];

  /** Timestamp del último open() — usado para calcular retryAfter. */
  private openedAt: number | null = null;

  /** Último código de error que disparó el open (para audit/notif). */
  private lastErrorCode: string | null = null;

  constructor(
    private readonly config: CircuitBreakerConfig,
    private readonly events: EventEmitter2,
    /** Inyectable para tests deterministas. Default: `Date.now`. */
    private readonly now: () => number = () => Date.now(),
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // 1. Si el circuito está open, evaluar si debe pasar a half-open.
    if (this.state === 'open') {
      const elapsed = this.now() - (this.openedAt ?? 0);
      if (elapsed >= this.config.resetTimeoutMs) {
        this.transitionTo('half-open');
      } else {
        throw new CircuitOpenError(
          this.config.name,
          this.config.resetTimeoutMs - elapsed,
        );
      }
    }

    // 2. Ejecutar la operación.
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  reset(): void {
    this.failures = [];
    if (this.state !== 'closed') {
      this.transitionTo('closed');
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      // Probe call OK → cerrar el circuito.
      this.failures = [];
      this.transitionTo('closed');
      return;
    }
    // En closed, prunear los fallos antiguos para mantener la ventana
    // deslizante limpia.
    this.pruneFailures();
  }

  private onFailure(err: unknown): void {
    this.lastErrorCode = this.extractErrorCode(err);

    if (this.state === 'half-open') {
      // Probe call KO → re-abrir el circuito.
      this.transitionTo('open');
      return;
    }

    // closed → registrar el fallo en la ventana.
    const ts = this.now();
    this.failures.push(ts);
    this.pruneFailures();

    if (this.failures.length >= this.config.failureThreshold) {
      this.transitionTo('open');
    }
  }

  private pruneFailures(): void {
    const cutoff = this.now() - this.config.failureWindowMs;
    this.failures = this.failures.filter((ts) => ts >= cutoff);
  }

  private transitionTo(next: CircuitBreakerState): void {
    const previous = this.state;
    if (previous === next) return;
    this.state = next;

    if (next === 'open') {
      this.openedAt = this.now();
      this.logger.warn(
        `Circuit "${this.config.name}" OPENED after ${this.failures.length} failures ` +
          `(last_error_code=${this.lastErrorCode ?? 'unknown'})`,
      );
      this.events.emit('plugin.circuit_opened', {
        breaker_name: this.config.name,
        opened_at: new Date(this.openedAt).toISOString(),
        last_error_code: this.lastErrorCode,
        failure_count: this.failures.length,
        reset_timeout_ms: this.config.resetTimeoutMs,
      });
      return;
    }

    if (next === 'closed' && previous !== 'closed') {
      const downtimeMs = this.openedAt ? this.now() - this.openedAt : 0;
      this.logger.log(
        `Circuit "${this.config.name}" CLOSED after ~${Math.round(downtimeMs / 1000)}s downtime`,
      );
      this.events.emit('plugin.circuit_closed', {
        breaker_name: this.config.name,
        closed_at: new Date(this.now()).toISOString(),
        downtime_seconds: Math.round(downtimeMs / 1000),
      });
      this.openedAt = null;
      this.lastErrorCode = null;
      return;
    }

    if (next === 'half-open') {
      this.logger.log(
        `Circuit "${this.config.name}" → HALF-OPEN (probe call allowed)`,
      );
      // No emitimos evento canónico — half-open es transitorio interno.
    }
  }

  private extractErrorCode(err: unknown): string {
    if (err instanceof Error) {
      // Plugins lanzan ProvisionerPluginError con `code` semántico.
      const codeProp = (err as Error & { code?: unknown }).code;
      if (typeof codeProp === 'string') return codeProp;
      return err.name;
    }
    return 'UNKNOWN_ERROR';
  }
}

/**
 * Registry de breakers por nombre. Lazy-creates un breaker la primera
 * vez que se solicita por nombre.
 *
 * Patrón canónico de uso (Sprint 15A Fase F.2):
 *
 *   const breaker = registry.getOrCreate(`${plugin.slug}:getServiceInfo`);
 *   return breaker.execute(() => plugin.getServiceInfo(service));
 */
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(private readonly events: EventEmitter2) {}

  /**
   * Devuelve el breaker existente por nombre, o crea uno nuevo con
   * config canónica si no existe.
   */
  getOrCreate(name: string): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new HouseCircuitBreaker(
        { name, ...DEFAULT_BREAKER_CONFIG },
        this.events,
      );
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  /** Lookup directo (devuelve null si no existe). Útil para tests. */
  get(name: string): CircuitBreaker | null {
    return this.breakers.get(name) ?? null;
  }

  /** Lista los nombres registrados. */
  listNames(): string[] {
    return [...this.breakers.keys()];
  }

  /** Reset todos (admin override / tests). */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}
