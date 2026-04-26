# Backlog priorizado — Aelium Dashboard

> Lista priorizada de **trabajo futuro**, alimentada por la [auditoría 2026-04-26](../90-meta/audit-2026-04-26.md) y el ROADMAP legacy.

> **Última actualización:** 2026-04-26 — F6 cierre.

---

## Cómo se priorizan los items

| Prioridad | Significado |
|-----------|-------------|
| **P0** | Crítico pre-producción. Bloquea despliegue real o tiene riesgo legal/financiero. |
| **P1** | Importante para producción profesional. No bloquea desarrollo, sí bloquea calidad/UX al cliente final. |
| **P2** | Funcional core necesario para operar el negocio (módulos pendientes). |
| **P3** | Crecimiento (Fase 2). Features que multiplican el valor pero no son requisito mínimo. |

**Regla:** no se aborda P_N+1 con P_N abierto, salvo que tengan dependencias entre sí o que P_N esté bloqueado por terceros.

---

## P0 — Crítico pre-producción

> Bloquean **despliegue a producción real** o representan **riesgo legal/financiero**. Cerrar antes de Sprint 14 (Deploy).

| # | Item | Esfuerzo | Origen | Bloquea |
|---|------|----------|--------|---------|
| **P0.1** | **Cerrar Sprint 8 mínimo:** listener `@OnEvent('task.assigned')` + validación FK `assigned_to` + tests E2E tasks | 1-2 sesiones | Auditoría §3.2 + Sprint 8 contract | Sprint 9 (notifications listeners), Sprint 7.SI |
| **P0.2** | **Outbox Pattern para `invoice.*`** (4 eventos: created, paid, failed, overdue) | 1-2 sesiones | [ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md), R8 | Despliegue real (riesgo legal/financiero — pérdida de notificaciones de cobro) |
| **P0.3** | **F0.6 saneamiento lint** — resolver ~344 errores `no-unsafe-*`, hacer lint bloqueante en CI | 3-4 sesiones distribuidas | Playbook §1, Auditoría §3.5 | Salvaguarda 5 incompleta — calidad de código en producción |
| **P0.4** | **Tests E2E exhaustivos** — 2FA con código real, checkout completo, PDF download, escalación con WS | 2 sesiones | Playbook §5 | Confianza pre-deploy |

**Total estimado P0:** 7-11 sesiones. Bloquea el primer deploy productivo.

---

## P1 — Importante para producción

> Cierran la Fase 1 antes de Sprint 14 Deploy.

| # | Item | Esfuerzo | Depende de |
|---|------|----------|------------|
| **P1.1** | **Sprint 9 — Audit + Notifications Full** (audit consultas, portal transparencia cliente, plantillas editables, BullMQ emails, DLQ, Outbox worker, Error Log UI) | 2-3 sesiones | P0.1 (listeners task.*), P0.2 (outbox) |
| **P1.2** | **Sprint 7.5 Fase 2 finalizar** — migración progresiva de páginas restantes al Design System (oportunista — al tocar página, migrarla en mismo PR) | continuo | — |
| **P1.3** | **Sprint 14 — Deploy** (Docker Compose producción + Traefik + SSL + MinIO + Grafana/Prometheus/Loki + pipeline + backups Cloudflare R2) | 2-3 sesiones | P0 todo cerrado |
| **P1.4** | **Backup + recovery plan** documentado (RTO < 4h, RPO < 6h) | 1 sesión | P1.3 |

---

## P2 — Funcional core (módulos pendientes)

> Necesarios para operar el negocio en producción profesional.

| # | Item | Esfuerzo | Depende de |
|---|------|----------|------------|
| **P2.1** | **Sprint 10 — Infrastructure** (CRUD servidores + pools + capacidad detectada automáticamente + docker_templates UI) | 2 sesiones | — (independiente) |
| **P2.2** | **Sprint 11 — Provisioning** (orquestación lifecycle servicios, plugins Enhance CP/Docker/Manual, subdominios, métricas Docker cliente) | 3-4 sesiones | P2.1, Sprint 5, Sprint 6 |
| **P2.3** | **Sprint 12 — Settings + Knowledge Base** (página settings con categorías, gestión plugins, editor marca, prefijo numeración configurable, due_date desde settings, KB articles) | 2-3 sesiones | Sprints anteriores |
| **P2.4** | **Sprint 12.5 — Portal Transparencia RGPD** (zona transparencia cliente, integrations registry, consentimientos, editor textos legales, exportación datos, eliminación cuenta, cron retención) | 2-3 sesiones | P1.1 (audit), Sprint 4 |
| **P2.5** | **Sprint 13 — Hardening + Escalabilidad** (httpOnly cookies, refresh rotation, session cleanup cron, audit trail global, validaciones billing edge cases, Redis adapter Socket.io, N+1 audit, cursor pagination, caching, archival messages, R15 restantes) | 3-4 sesiones | Sprints anteriores |

---

## P3 — Crecimiento (Fase 2)

> Features que multiplican valor pero no son requisito mínimo. Orden recomendado por valor de negocio (ver [`docs/ROADMAP.md`](../ROADMAP.md) §"Orden de ejecución recomendado" para justificación detallada):

### Prioridad A — Go to market

| # | Item | Esfuerzo | Justificación |
|---|------|----------|---------------|
| **P3.1** | **Sprint 15 — Plugins** (framework + Stripe + Stripe Connect + Enhance CP + ResellerClub + Docker Engine + Manual + Claude AI) | 4-5 sesiones | Sin Stripe no hay cobros automáticos. Sin provisioners no hay servicios automáticos. |
| **P3.2** | **Sprint 18 — Landing Integration** (catálogo público + buscador dominios + checkout sin cuenta + webchat + formulario contacto) | 2-3 sesiones | Sin cara pública no hay captación online. |

### Prioridad B — Operaciones de negocio

| # | Item | Esfuerzo | Justificación |
|---|------|----------|---------------|
| **P3.3** | **Sprint 22 — Projects** (sistema de propuestas + budget + estados + items snapshot + agentes + history) | 3-4 sesiones | Tu modelo de negocio es: ir a negocios → proponer tecnología → crear proyecto → vender. |
| **P3.4** | **Sprint 21 — CRM Completeness** (gestión completa de clientes) | 2 sesiones | Complementa proyectos. |
| **P3.5** | **Sprint 23 — Tickets Redesign** (UI thread-based + sidebar enriquecida + vinculación servicio/proyecto + tags + SLA + adjuntos) | 2-3 sesiones | Tickets necesitan vinculación a proyectos/servicios. Depende de P3.3. |
| **P3.6** | **Sprint 24 — Citation System** (citas estructuradas en mensajes — `references` jsonb) | 1-2 sesiones | Comunicación contextual. Depende de P3.3 + P3.5. |
| **P3.7** | **Sprint 25 — AI Workers** (asistente IA para tareas — OpenClaw como AI Worker) | 2-3 sesiones | Eficiencia del equipo. Depende de Sprint 8 + P3.1 + P3.3. |

### Prioridad C — Crecimiento

| # | Item | Esfuerzo | Justificación |
|---|------|----------|---------------|
| **P3.8** | **Sprint 17 — Promotions & Discounts** (upsell, crossell, descuentos, contadores atómicos, BullMQ promotions) | 2-3 sesiones | Aumenta ARPU. |
| **P3.9** | **Sprint 20 — Referral System** (códigos referido por cliente, créditos mensuales, descuento primera compra) | 2 sesiones | Adquisición orgánica. |
| **P3.10** | **Sprint 19 — Partner Module** (canal de ventas B2B, comisiones, payouts, tickets bidireccionales, vinculación cuenta cliente) | 4-5 sesiones | Canal de crecimiento sin renunciar al control operativo. Depende de P3.1 (Stripe Connect). |

### Prioridad D — Internacionalización

| # | Item | Esfuerzo | Justificación |
|---|------|----------|---------------|
| **P3.11** | **Sprint 16 — i18n + Multi-Currency** | 2-3 sesiones | Solo importa si vendes fuera de España. **Inversión prematura** hasta que haya tracción en mercado local. |

---

## Deuda continua (no urgente, importante)

Items que deben **integrarse en sprints existentes** (oportunismo) en lugar de tener su propio sprint:

| # | Item | Cuándo abordar |
|---|------|----------------|
| **DC.1** | **Drift de nomenclatura** schema vs doc legacy (`assigned_to` ↔ `assigned_agent_id`, `parent_conversation_id` ↔ `escalated_from_id`, `ai_handled` ↔ `is_ai_filtered`) | Decidir nombre canónico al refactorizar, no antes |
| **DC.2** | **Generación automática de `docs/30-data/*.md` desde Prisma** (script + tests de sincronización) | F7-9 si valor > esfuerzo |
| **DC.3** | **Comentarios `///` en Prisma** para descripciones de campos | Al editar schema, oportunismo |
| **DC.4** | **TODO en `dashboard.service.ts:next_settlement = null`** — feature no documentado | Cuando se decida settlement real (Sprint 6 o futuro billing) |
| **DC.5** | **Refactor R15 restantes** (billing-email.listener split, billing.controller helpers, page landing secciones, GradientMesh hook) | Al tocar el archivo |

---

## Items NO en backlog (decididos no hacer)

| # | Item | Motivo |
|---|------|--------|
| **NO.1** | ~~We Do It For You como addon~~ ([ADR-022](../10-decisions/adr-022-wdify-deprecado-proyectos.md)) | Reemplazado por Sprint 22 Projects |
| **NO.2** | ~~Microservicios + Kubernetes~~ ([ADR-056](../10-decisions/adr-056-estrategia-escalabilidad.md)) | Overkill para esta escala. Monolito modular es correcto. |
| **NO.3** | ~~GraphQL~~ ([ADR-056](../10-decisions/adr-056-estrategia-escalabilidad.md)) | REST es la decisión. |
| **NO.4** | ~~Hosting agency como tipo de producto~~ ([ADR-024](../10-decisions/adr-024-eliminacion-hosting-agency.md)) | Eliminado. Partners venden hosting_web. |
| **NO.5** | ~~Cambiar de Prisma a otro ORM~~ ([ADR-056](../10-decisions/adr-056-estrategia-escalabilidad.md)) | Limitaciones conocidas pero cambio = más riesgo que beneficio. Para hot paths: `$queryRaw`. |

---

## Cómo añadir items a este backlog

1. Si el item nace de una **auditoría/incidente**, referenciar el documento origen.
2. Si es un **sprint completo**, redactar usando [`_sprint-template.md`](./_sprint-template.md) en una hoja aparte y aquí solo poner el resumen.
3. Si es **deuda continua**, ponerlo en sección DC y describir cuándo se debe abordar (oportunismo) en lugar de sprint dedicado.
4. Si se decide **NO hacer algo**, moverlo a "Items NO en backlog" con ADR como respaldo.

**Regla:** este backlog se actualiza al cierre de cada sprint mayor. La auditoría 2026-04-26 estableció el baseline.
