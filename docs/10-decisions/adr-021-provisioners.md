# ADR-021 — Provisioners (interfaz + reglas de desarrollo por plugin)

> **Status:** Active
> **Date:** 2026-04 (origen) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §28
> **Domain:** products, provisioning

---

## Contexto

Aelium vende productos que requieren activación técnica externa: hosting (Enhance CP), dominios (ResellerClub), contenedores Docker (Cloud Office, OpenClaw), servicios manuales (desarrollo web).

Cada **provisioner** habla con un sistema externo distinto. La pregunta es: **¿cómo organizamos los provisioners para que añadir uno nuevo no requiera tocar el core?**

Esta decisión es una aplicación específica del **plugin pattern (ADR-009)** al dominio de provisioning.

---

## Opciones consideradas

1. **Lógica de provisioning embebida en cada `*.service.ts` de billing** ("si producto es hosting → llamar a Enhance CP, si es dominio → ResellerClub").
   - Pros: simple inicialmente.
   - Contras: añadir provisioner = tocar billing core. Tests difíciles. Acoplamiento masivo.

2. **Microservicio por provisioner.**
   - Pros: aislamiento total.
   - Contras: overkill. Cada provisioner sería un proyecto separado con su deploy.

3. **(Elegida)** **Plugin pattern por provisioner**, con **cada provisioner como plugin independiente con su propio documento de especificación.** Sin generalización entre plugins más allá de la interfaz.
   - Pros: añadir provisioner nuevo = nuevo plugin sin tocar core. Cada plugin documentado por separado al desarrollarlo.
   - Contras: no se aprovechan patrones cross-provisioner que podrían ser comunes (ej: retries, timeouts) — cada plugin los implementa por su cuenta.

---

## Decisión

### Provisioners actuales (planificados)

```
backend/src/plugins/provisioners/
├── enhance_cp/      ← hosting web (documento propio cuando se desarrolle)
├── resellerclub/    ← dominios (documento propio cuando se desarrolle)
├── docker_engine/   ← contenedores Docker (documento propio cuando se desarrolle)
├── internal/        ← activación interna en BD (sin API externa)
└── manual/          ← genera tarea para el agente; el agente activa
```

### Regla de desarrollo

> **Cada provisioner es un plugin independiente con su propio documento de especificación.**
> **No se generalizan campos entre provisioners más allá de la interfaz mínima.**

Esto significa:

- El **bloque de configuración del provisioner en cada producto** (ADR-019) se define cuando se desarrolla el plugin correspondiente. No antes.
- Cada plugin documenta: campos esperados, lógica, errores comunes, configuración de credenciales, callbacks/webhooks si aplica.
- La interfaz que el core conoce es mínima: `provision(service)`, `deprovision(service)`, `getStatus(service)`. El plugin internamente hace lo que tenga que hacer.

### Provisioners "internos" implementados sin plugin externo

#### `internal`

- No hace llamadas externas.
- Al recibir `invoice.paid`, marca el servicio como `active` directamente en BD.
- Uso: Support Inside · addons de cuenta · cualquier producto de activación inmediata sin recursos externos.

#### `manual`

- Al recibir `invoice.paid`, genera **tarea** para el agente asignado al servicio.
- El agente hace el trabajo fuera del dashboard (ej: dev web).
- El agente marca la tarea como completada → un listener de `task.completed` (futuro) marca el servicio como `active`.
- Uso: desarrollo web · configuraciones especiales · servicios personalizados.

> **Estado actual:** los provisioners `internal` y `manual` están **planificados**. El módulo `provisioning` es stub. La activación de servicios hoy se hace **manualmente por el admin** marcando la factura como pagada (workaround temporal).

### Provisioners externos — desarrollo futuro

Cada uno se documentará por separado al construirse. Reglas mínimas:

- Implementar la interfaz `ProvisionerPlugin`.
- No importar plugins desde el core (R4).
- Usar `EncryptionService` (ADR-015) para almacenar credenciales.
- Implementar circuit breaker (R11) en llamadas a la API externa.
- Eventos: emitir `service.provisioned`, `service.provisioning_failed` con payload estandarizado.

---

## Consecuencias

- ✅ **Ganamos:**
  - Añadir provisioner nuevo = nuevo plugin, sin tocar core.
  - Cada plugin tiene sus credenciales en sus tablas, su lógica, su documento.
  - Tests del core con stub provisioner (`internal`) sin necesidad de mockear APIs externas.
- ⚠️ **Aceptamos:**
  - Cada plugin reimplementa retries, timeouts, error handling. Patrón parcialmente duplicado entre provisioners. Aceptable: cada API externa tiene quirks distintos.
  - Diferentes plugins pueden tener diferente nivel de robustez. Mitigación: documentación obligatoria de invariantes y edge cases por plugin.
- 🚪 **Cierra:**
  - **No "framework de provisioning" único.** Cada plugin es libre dentro de la interfaz.
  - **No mezclar lógica de provisioning** en `billing.service.ts` o equivalente.

---

## Cuándo revisar

- Si los provisioners reimplementan demasiada lógica común (retries, circuit breaker, etc.) → considerar abstracciones reutilizables sin caer en framework rígido.
- Si surge un provisioner que necesita mantener mucho estado o procesos largos → evaluar si debe ser microservicio independiente.

---

## Referencias

- **Módulos afectados:** provisioning (stub hoy), billing (consume eventos `service.*`), products (configura provisioners).
- **Reglas relacionadas:** R4 (plugins), R11 (circuit breaker), R12 (credenciales encriptadas).
- **ADRs relacionados:** ADR-009 (estrategia de plugins general), ADR-015 (encriptación de credenciales), ADR-018 (catálogo), ADR-019 (configuración tipos producto).
- **Glosario:** [Provisioner](../00-foundations/glossary.md), [Plugin](../00-foundations/glossary.md), [Servicio](../00-foundations/glossary.md).
- **Eventos relacionados:** `service.suspended`, `service.cancelled`, `service.resumed`, `service.paused` (consumidos por provisioners cuando existan — ver `_events.md`).
