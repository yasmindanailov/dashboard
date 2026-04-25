# ADR-004 — Arquitectura: monolito modular orientado a eventos

> **Status:** Active
> **Date:** 2026-04 (origen) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §4
> **Domain:** foundation, architecture

---

## Contexto

El sistema tiene 8+ dominios de negocio con interdependencias (auth ↔ clients ↔ billing ↔ support ↔ tasks ↔ partner ↔ provisioning). La pregunta es: **¿microservicios desde el principio o monolito modular?**

Ambos extremos tienen costes:

- **Microservicios prematuros**: cada servicio es un proyecto con su deploy, su CI, su monitoring, su data store. Para un equipo pequeño, multiplica el coste operacional sin aportar la escala que justificaría el split.
- **Monolito acoplado**: módulos que se llaman directamente entre sí terminan en spaghetti. Cambiar uno requiere tocar otros. La testabilidad cae.

Hace falta un punto medio: un solo deploy, un solo proceso, pero con módulos **realmente independientes** internamente.

---

## Opciones consideradas

1. **Microservicios desde día 1.**
   - Pros: independencia total. Escalado por servicio. Tecnologías heterogéneas.
   - Contras: 10x coste operacional. Distribución innecesaria a nuestra escala. Transacciones cross-servicio requieren sagas o eventual consistency.

2. **Monolito clásico** sin modularidad estricta.
   - Pros: máxima simplicidad inicial.
   - Contras: en 6 meses los módulos se llaman entre sí ad hoc. Refactor doloroso cuando crezca.

3. **(Elegida)** **Monolito modular orientado a eventos**: un solo deploy, módulos que **NO se llaman directamente** entre sí (Regla R1), comunicación vía bus de eventos interno.
   - Pros: simplicidad de deploy de monolito + independencia conceptual de microservicios. Escalable horizontalmente cuando se necesite (no antes).
   - Contras: requiere disciplina arquitectónica desde el primer commit. Si se rompe R1 una vez, la entropía aumenta.

---

## Decisión

**Monolito modular orientado a eventos** con las siguientes propiedades:

### Estructura física

```
backend/src/
├── modules/         ← lógica de negocio por dominio (independientes)
│   ├── auth/
│   ├── clients/
│   ├── billing/
│   ├── products/
│   ├── support/
│   ├── tasks/
│   ├── notifications/
│   ├── audit/
│   └── ...
├── plugins/         ← integraciones intercambiables (R4)
│   ├── payment/
│   ├── provisioners/
│   ├── notification-channels/
│   └── ai-providers/
├── core/            ← bus de eventos · config · database · queue · email · settings
│   ├── database/
│   ├── settings/
│   ├── email/
│   └── casl/
└── common/          ← utilidades compartidas
```

### Principios

1. **Comunicación entre módulos solo vía eventos (Regla R1).** `EventEmitter2` global. Ningún `import { ServicioDeOtroModulo }` cross-módulo.
2. **Servicios del core SÍ son inyectables globalmente** (`PrismaService`, `SettingsService`, `EmailService`, `EventEmitter2`, `CaslAbilityFactory`). No se consideran acoplamiento.
3. **Lectura cross-módulo de tablas Prisma** se acepta como patrón aggregator (ej: `dashboard` lee `users`, `invoices`, `services`, etc.). Documentado en `docs/20-modules/_matrix.md`.
4. **Sub-services intra-módulo (Regla R15)** son legítimos: `BillingService` es fachada de `BillingInvoiceService`, `BillingCheckoutService`, `BillingCalculatorService`. **No es acoplamiento entre dominios.**
5. **Plugins (R4)** se inyectan vía interfaz, el core nunca importa la implementación concreta.

### Eventos críticos

Eventos que disparan cambios de estado en otros dominios usan **Outbox Pattern (R8)**: persistencia del evento en la misma transacción del cambio. Garantiza que el evento se entrega aunque el proceso muera tras commit.

> **Estado actual:** 0/25 eventos usan Outbox. Es deuda técnica documentada en ADR-033.

---

## Consecuencias

- ✅ **Ganamos:**
  - Un solo proceso, un solo deploy → operación simple.
  - Módulos conceptualmente independientes → testables aislados.
  - Escalable horizontalmente cuando aplique (Redis comparte estado de rate limiting, sessions, etc.).
  - Migración a microservicios futura es viable: cada módulo → su servicio, los eventos ya están definidos.
- ⚠️ **Aceptamos:**
  - Disciplina obligatoria: si un commit rompe R1, la arquitectura se degrada. Requiere code review (humano o IA) consciente.
  - El "monolito" sigue siendo un proceso. Si crashea, todo se cae. Mitigación: stateless (R6), restart rápido, observabilidad (Sentry).
- 🚪 **Cierra:**
  - **No microservicios prematuros.** Antes de escalar, optimizar el monolito (caching, índices, queries, BullMQ workers).

---

## Cuándo revisar

- Si la base de código supera ~50 módulos (hoy 8 activos + 8 stub) y el deploy se vuelve tortuoso.
- Si un dominio (ej: provisioning con miles de jobs/min) demanda recursos que justifican su propio servicio.
- Si el equipo crece a >10 personas y la coordinación en monorepo se vuelve cuello de botella.

Mientras esos triggers no aparezcan, no se considera el split.

---

## Referencias

- **Módulos afectados:** todos.
- **Reglas relacionadas:** R1 (eventos entre módulos), R4 (plugins), R6 (stateless), R8 (Outbox), R15 (límites por archivo).
- **ADRs relacionados:** ADR-002 (stack backend), ADR-009 (plugins), ADR-033 (Outbox), ADR-056 (escalabilidad).
- **Documentos:** [`docs/20-modules/_matrix.md`](../20-modules/_matrix.md), [`docs/20-modules/_events.md`](../20-modules/_events.md).
- **Glosario:** [Módulo](../00-foundations/glossary.md), [Evento](../00-foundations/glossary.md), [Outbox](../00-foundations/glossary.md), [Listener](../00-foundations/glossary.md), [Worker](../00-foundations/glossary.md).
