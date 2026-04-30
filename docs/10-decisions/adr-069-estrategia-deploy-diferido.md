# ADR-069 — Estrategia de deploy diferido (proyecto a largo plazo)

> **Status:** Active
> **Date:** 2026-04-29
> **Domain:** cross-cutting (roadmap, infra, operaciones)
> **Sprint:** post-9.6 — re-priorización de roadmap

---

## Contexto

Hasta ahora, la documentación canónica trataba implícitamente el "primer deploy productivo" (Sprint 14) como **un objetivo cercano y prioritario**. Concretamente:

- [`docs/90-meta/development-playbook.md §10`](../90-meta/development-playbook.md) recomendaba a finales de Abril 2026 priorizar P1.2 Sprint 11.5 (MinIO) y P1.1 Sprint 9 (BullMQ + DLQ) **porque son pre-requisitos directos del Sprint 14**.
- [`docs/60-roadmap/backlog.md`](../60-roadmap/backlog.md) clasificaba **P1.4 Sprint 14 — Deploy real** como cola activa P1, con la regla "no se aborda P_N+1 con P_N abierto".
- [`docs/60-roadmap/current.md`](../60-roadmap/current.md) cabecera marcaba "Sprint 14 (Deploy) limpiado — solo lo que realmente requiere producción real".
- ADRs como [ADR-068](./adr-068-multi-path-deprecation-headers.md) §3 dejan deuda explícita "a cerrar antes del primer push productivo de Sprint 14".

En la conversación 2026-04-29, **Yasmin clarificó la postura real del proyecto**: Aelium Dashboard es un proyecto **a largo plazo**, con porciones grandes de funcionalidad aún en desarrollo (Sprint 8 residual, módulos P2 enteros — Infrastructure, Provisioning, Settings, Knowledge Base, Hardening — y Fase 2 P3 completa). **No hay clientes esperando, ni demo pública, ni captación activa que dependa del deploy.** Por tanto, desplegar ahora a producción significaría:

1. **Mantener una superficie productiva sin valor de negocio**: hosting, DNS, SSL, secrets, Sentry real, Grafana/Loki, backups Cloudflare R2 — todo costoso en €€ y en tiempo de mantenimiento (parches, alertas a atender).
2. **Re-tunear infra varias veces**: cada módulo P2/P3 que llegue (Provisioning con Docker Engine, plugins ResellerClub/Enhance, Partner module, AI workers) cambia el shape de servicios, jobs, DBs y secrets de producción. Desplegar antes implica revisitar Traefik routes, WAF rules, rate limiting diferenciado, alertas de Sentry, dashboards Grafana, capacidad de instancias — cada vez.
3. **Atención dividida**: sostener producción mientras se desarrolla feature core distrae del trabajo profundo. Cada incident reportado por Sentry interrumpe el flujo de feature.
4. **Surface attack innecesario**: exponer un servicio aún en construcción a internet (aunque sea bajo dominio propio con auth) es invitar tráfico hostil sin compensación.

> **¿Qué pasaría si NO tomáramos esta decisión?** Implícitamente seguiríamos el plan original: P0 → P1.1 → P1.2 → P1.4 (Deploy) lo antes posible, con todos los módulos P2/P3 ejecutados ya en producción. Resultado: tiempo y presupuesto recurrente sin retorno; revisión repetida de infra; presión por estabilizar una prod que aún no necesita estar viva. Yasmin lo identificó correctamente como un sesgo del playbook hacia "deploy temprano = robusto" — es lo contrario: **robusto = desplegar cuando una función concreta lo requiera**.

---

## Opciones consideradas

### A. Deploy temprano (status quo previo a este ADR)

- **Pros**:
  - Aprendizaje de infra real cuanto antes (secrets, DNS, SSL, observabilidad).
  - Cierra ventanas de deuda como ADR-068 §3 (aliases REST) y la fire-and-forget R2 de PDFs.
  - Confianza pre-deploy demostrada con incidents reales (no simulados).
- **Contras**:
  - Coste recurrente (€€€) sin retorno mientras no haya clientes.
  - Re-trabajo de infra cada sprint P2/P3 que cambie servicios/jobs/secrets.
  - Atención de mantenimiento divide el flujo de feature development.
  - Surface attack sin contrapartida.
  - Asume modelo "MVP + iterar en prod" — **no aplica** a este proyecto, que es backend complejo + multi-rol + multi-portal (no SaaS público de feedback rápido).

### B. Deploy diferido — **gate condicionado por necesidad de negocio**

- **Pros**:
  - Recursos (€ + tiempo) concentrados en feature work.
  - Sprint 14 se ejecuta una vez con la infra **estable y completa** (todos los módulos productivos ya en su forma final, todos los jobs/colas/DBs definidos).
  - La deuda dependiente de prod (ADR-068 §3 aliases REST, fire-and-forget R2, Sentry real, etc.) se cierra **toda junta** en el commit pre-deploy.
  - Permite que cambios arquitectónicos grandes (ej. ADR-056 leader election cuando se escale) ocurran sin presión de "no romper prod".
- **Contras**:
  - El primer deploy real concentra todo el riesgo de aprendizaje (secrets, DNS, SSL, WAF) en una sola sesión.
  - Mitigación: hacer **dry-run de Sprint 14 contra staging antes** del primer deploy real. Sprint 14 incluye plan recovery + smoke checklist + runbook (ya documentado).
  - La doc canónica de pre-deploy (R8 Outbox, R2 fire-and-forget, ADR-068 §3) se mantiene "abierta" más tiempo. **No es deuda real** mientras prod no exista — es trabajo pendiente que se ejecuta cuando aplique.

### C. Deploy a staging permanente (sin cliente real)

- **Pros**: aprendizaje gradual de infra sin comprometer prod.
- **Contras**: **es deploy disfrazado** — staging requiere los mismos secrets, mismo SSL, mismo monitoring que prod. Mismo coste recurrente. Mismo re-trabajo cada sprint. Mismo split de atención. La diferencia de "no hay clientes" la da prod-vs-staging del DNS, no del esfuerzo. **No resuelve el problema, lo enmascara.**

---

## Decisión

**Se elige Opción B: deploy diferido — gate condicionado por necesidad de negocio.**

### Política canónica

1. **Sprint 14 Deploy real NO está en cola activa.** Se reclasifica como **gate condicionado** (`P-DEPLOY`), fuera del orden P1 → P2 → P3 normal.
2. **El Sprint 14 se activa solo cuando se cumple uno de estos triggers explícitos:**
   - **Cliente real esperando**: contrato firmado, fecha de onboarding acordada.
   - **Demo pública requerida**: presentación a inversor/partner/cliente potencial que necesite URL real.
   - **Captación activa**: campaña de marketing, landing pública con formulario de alta.
   - **Validación externa de UX**: usability test con usuarios externos que requiera entorno productivo.
   - **Decisión consciente de Yasmin** documentada con razón (ej. "quiero aprendizaje de infra antes de empezar Provisioning").
3. **Mientras tanto, la cola activa real es feature work** según valor funcional (Sprint 8 residual, módulos P2/P3, deuda continua DC.*).
4. **Toda la deuda "pre-deploy"** (R8 Outbox para `service.*`/`partner.*`, fire-and-forget R2 de PDFs, cierre de aliases REST por ADR-068 §3, plan recovery, secrets reales, Sentry DSN, etc.) se mantiene listada como **trabajo dependiente del gate Sprint 14**, no como deuda urgente.
5. **Cuando el gate se active**, Sprint 14 ejecuta **TODA la deuda pre-deploy de una sola pasada** (commit atómico o cadena corta) + el deploy productivo. Sin parches incrementales contra prod.
6. **El playbook §10** se actualiza para reflejar esta política y dejar de recomendar Sprint 14 como "siguiente paso natural".

### Cómo se documenta en el roadmap

`backlog.md` introduce sección **"Gate condicionado: P-DEPLOY (Sprint 14)"** entre P1 y P2:

```markdown
## Gate condicionado: P-DEPLOY (Sprint 14)

> No está en cola activa. Se ejecuta cuando se cumple un trigger de negocio (ver ADR-069).
> Mientras tanto, P-DEPLOY agrupa toda la deuda dependiente de producción real.

| # | Item | Trigger requerido |
|---|------|-------------------|
| P-DEPLOY.1 | Sprint 14 Deploy real (Docker prod + Traefik + SSL + observabilidad + WAF + rate limits) | Cliente real / demo / captación |
| P-DEPLOY.2 | Backup + recovery plan documentado (RTO < 4h, RPO < 6h) | Parte del Sprint 14 |
| P-DEPLOY.3 | Cierre ventana aliases REST (ADR-068 §3) | Parte del Sprint 14 |
| P-DEPLOY.4 | Outbox extendido a `service.*` / `partner.*` cuando se implementen | Sprint que implemente esos módulos + cierre Sprint 14 |
| P-DEPLOY.5 | Reemplazo fire-and-forget R2 de PDFs por job persistente | Parte del Sprint 14 (o antes si se descubre incidente local) |
```

`current.md` cabecera añade nota: *"Sprint 14 — gate condicionado, ver ADR-069. NO está en cola activa."*

`development-playbook.md §10` reescribe la recomendación según valor funcional, no según cercanía a deploy.

---

## Consecuencias

- ✅ **Ganamos:**
  - **Foco**: la cola activa son features de negocio reales (Sprint 8 Tasks, Sprint 10 Infrastructure, Sprint 11 Provisioning, Sprint 12 Settings/KB) sin presión cruzada de mantenimiento de prod.
  - **Coste evitado**: 0 € recurrentes en hosting/SSL/Sentry/Grafana/backups hasta que aporten valor.
  - **Robustez**: Sprint 14 se ejecuta una sola vez con infra estable, no en sucesivos parches.
  - **Decisión arquitectónica explícita**: deja de haber tensión entre "regla del backlog" y "criterio operativo" — ambos alineados.
  - **Coherencia con principio de YAGNI** aplicado al nivel de infra de producción.
- ⚠️ **Perdemos / aceptamos:**
  - **Sin aprendizaje incremental de infra real** hasta el primer deploy. Mitigación: dry-run en staging desechable previo + checklist + runbook.
  - **Deuda pre-deploy queda abierta más tiempo**: ADR-068 §3, R8 Outbox `service.*`, fire-and-forget R2. **Aceptable** — son cierres documentados, no fugas. La doc canónica los traquea explícitamente bajo P-DEPLOY.
  - **Sentry sin DSN real** — los bugs en local seguirán observándose por logs Pino + correlation IDs. Suficiente en desarrollo.
- 🚪 **Puertas que cierra:**
  - "Deploy temprano por aprendizaje" — descartado salvo trigger explícito.
  - "Staging permanente" — descartado por Opción C.
  - "Iterar en prod con MVP" — no aplica a este modelo de producto.

---

## Cuándo revisar

Esta decisión se revisa (potencialmente con ADR nuevo que la supersede) si:

1. **Aparece cliente real con fecha de onboarding** — Sprint 14 se activa, este ADR queda histórico.
2. **El equipo crece** y la división de atención mantenimiento/feature deja de ser un problema (más de 1 dev sosteniendo prod sin freno feature).
3. **Modelo de negocio cambia** a uno que requiera prod online por defecto (ej. SaaS público con onboarding self-service).
4. **Yasmin decide conscientemente** que el aprendizaje de infra real ya tiene más valor que evitar el coste recurrente.

> **No es predicción del futuro** — es definir el trigger explícito.

---

## Referencias

- **Módulos afectados:** ninguno directamente; afecta a `docs/60-roadmap/backlog.md`, `docs/60-roadmap/current.md`, `docs/90-meta/development-playbook.md`.
- **Reglas relacionadas:** R8 (Outbox), R14 (manejo de errores) — la doctrina general de "robusto sólo cuando aporta valor real" alinea con YAGNI implícito en el conjunto.
- **ADRs relacionados:**
  - [ADR-008](./adr-008-orden-construccion-sprints.md) — sprints incrementales (esta política refina el criterio "qué viene siguiente").
  - [ADR-033](./adr-033-outbox-pattern-pendiente.md) — §7 alerta superadmin queda P-DEPLOY hasta deploy real.
  - [ADR-043](./adr-043-infraestructura-self-hosted.md) — describe la infra de prod; Sprint 14 la ejecuta.
  - [ADR-056](./adr-056-estrategia-escalabilidad.md) — pre-requisitos de escalabilidad ya cerrados (BullMQ + leader election natural). Cuando Sprint 14 se active, no añade trabajo extra.
  - [ADR-068](./adr-068-multi-path-deprecation-headers.md) — §3 cierre de aliases REST queda pendiente bajo P-DEPLOY, no urgente.
- **Glosario:** *gate condicionado*, *P-DEPLOY*, *Sprint 14* (definidos en este ADR; añadir a `glossary.md` cuando se referencien fuera de este contexto).
- **Discusión externa:** conversación Yasmin ↔ Claude 2026-04-29 ("¿es momento de hacer deploy teniendo gran parte de las funciones del proyecto en desarrollo? El proyecto es a largo plazo").

---

## Notas de revisión

> **2026-04-29:** ADR creado tras crítica explícita de Yasmin al sesgo "deploy temprano" del playbook §10. La política se cristaliza aquí para que futuras invocaciones de Claude no re-recomienden Sprint 14 sin trigger explícito.
