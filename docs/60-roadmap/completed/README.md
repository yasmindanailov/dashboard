# Sprints completados — Aelium Dashboard

> Archive de sprints cerrados con resumen ejecutivo. Cada sprint en su propio archivo. Verificados contra código en auditoría 2026-04-26.

> El detalle granular paso-a-paso de cada sprint vive en [`docs/ROADMAP.md`](../../ROADMAP.md) (legacy). Aquí: visión sintética + decisiones clave + verificación de cierre + deuda heredada.

---

## Índice cronológico

| Sprint | Título | Archivo | Estado |
|--------|--------|---------|--------|
| **0** | Scaffolding | [sprint-0-scaffolding.md](./sprint-0-scaffolding.md) | ✅ |
| **1** | Auth | [sprint-1-auth.md](./sprint-1-auth.md) | ✅ |
| **2** | Notifications Core | [sprint-2-notifications-core.md](./sprint-2-notifications-core.md) | ✅ |
| **3** | Auth Frontend Polish | [sprint-3-auth-frontend-polish.md](./sprint-3-auth-frontend-polish.md) | ✅ |
| **3.5** | Auth Hardening | [sprint-3.5-auth-hardening.md](./sprint-3.5-auth-hardening.md) | ✅ |
| **4** | Clients | [sprint-4-clients.md](./sprint-4-clients.md) | ✅ |
| **5** | Products + Role-Aware Dashboard | [sprint-5-products.md](./sprint-5-products.md) | ✅ |
| **6** | Billing Engine | [sprint-6-billing-engine.md](./sprint-6-billing-engine.md) | ✅ |
| **8** | Tasks + Support Inside | [sprint-8-tasks-support-inside.md](./sprint-8-tasks-support-inside.md) | ✅ (cerrado 2026-05-01) |
| **9** | Audit + Notifications Full + BullMQ + DLQ (P1.1) | [sprint-9-audit-notifications-bullmq.md](./sprint-9-audit-notifications-bullmq.md) | ✅ (cerrado 2026-04-27) |
| **9.5** | UX admin de notifications (P1.1.5) | [sprint-9-5-ux-admin-notifications.md](./sprint-9-5-ux-admin-notifications.md) | ✅ (cerrado 2026-04-27) |
| **9.6** | Split admin/cliente + 3 portales raíz (P1.1.6 / DC.7) | [sprint-9-6-split-admin-cliente.md](./sprint-9-6-split-admin-cliente.md) | ✅ (cerrado 2026-04-28) |
| **11.5** | MinIO Storage local (P1.2) | [sprint-11-5-minio-storage.md](./sprint-11-5-minio-storage.md) | ✅ (cerrado 2026-04-26) |
| **11** | Provisioning (P2.1 — orquestador + chasis canónico + plugins triviales + frontend) | [sprint-11-provisioning.md](./sprint-11-provisioning.md) | ✅ (cerrado 2026-05-02) |
| **16** | Tasks refactor + Notes consolidation (P2.1.5 — bridge unidireccional canónico ADR-079 + Amendments A1/A2/A3) | [sprint-16-tasks-notes-refactor.md](./sprint-16-tasks-notes-refactor.md) | ✅ (cerrado 2026-05-02) |

**Total cerrados:** 15 sprints (Sprint 7/7.5 son sprints paraguas continuos, no se cierran formalmente hasta Sprint 14).

---

## Sprints en curso (NO en este archive)

Sprints 7 (Billing + Support — paraguas, ~95% bloqueado por dependencias) y 7.5 (Design System — Fase 2 oportunista) viven en [`../current.md`](../current.md) — son **sprints paraguas continuos** y no se cierran hasta que sus dependencias externas (Sprint 14, Sprint 15) lo permitan.

---

## Próximos sprints (NO en este archive)

Sprints 10 (Infrastructure), 12 (Settings + KB), 12.5 (Portal RGPD), 13 (Hardening), 14 (Deploy — gate condicionado [ADR-069](../../10-decisions/adr-069-estrategia-deploy-diferido.md)), 15A-H (Plugins), 19 (Partner) y 22+ viven en [`../backlog.md`](../backlog.md) — no se han iniciado. Priorizados P0/P1/P2/P3.

---

## Plantilla de archive

Cada sprint cerrado se archiva con esta estructura:

```markdown
# Sprint N — Título ✅

> Estado: ✅ Cerrado
> Commit cierre: <hash>
> Sprint origen: ...

## Objetivo (1 frase)

## Lo que entregó (categorías + items con cross-ref a ADRs)

## Decisiones clave consolidadas

## Verificación de cierre (auditoría YYYY-MM-DD)
- ✅ ...
- Drift detectado (si lo hay)
- Deuda heredada
```

**Cuándo archivar un sprint:** cuando cumpla [Definition of Done](../../90-meta/definition-of-done.md) **y** se haya verificado contra código real (no solo declaración).
