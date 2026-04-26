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

**Total cerrados:** 8 sprints. Cobren todo el flujo: scaffolding → auth → notificaciones core → CRM clientes → catálogo productos + PBAC → motor de billing.

---

## Sprints en curso (NO en este archive)

Sprints 7, 7.5, 8 viven en [`../current.md`](../current.md) — están parcialmente avanzados pero no cerrados.

---

## Próximos sprints (NO en este archive)

Sprints 9 en adelante viven en [`../backlog.md`](../backlog.md) — no se han iniciado. Priorizados P0/P1/P2/P3.

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
