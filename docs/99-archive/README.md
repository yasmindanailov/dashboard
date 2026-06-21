# 99-archive — Archivo histórico (NO vigente)

Documentos **conservados por trazabilidad**, ya superseded por la doc viva. **No son fuente de verdad actual** — no desarrolles contra ellos.

| Doc archivado | Superseded por |
|---------------|----------------|
| [DECISIONS.md](./DECISIONS.md) (legacy monolito) | [`../10-decisions/`](../10-decisions/) (ADRs individuales). Conserva el mapping §N → ADR para citas antiguas en código. |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) (legacy monolito) | [`../30-data/`](../30-data/) (schema por dominio). Conserva el mapping tabla → archivo. |
| [ROADMAP.md](./ROADMAP.md) (legacy detallado) | [`../60-roadmap/`](../60-roadmap/) (current/backlog/completed). Conserva el detalle paso-a-paso histórico. |
| [edge_cases.md](./edge_cases.md) | Auditoría puntual Sprint 7 (cerrada). |
| [audit-2026-04-26.md](./audit-2026-04-26.md) | Auditoría previa. **Vigente:** [`../90-meta/audit-2026-06-21.md`](../90-meta/audit-2026-06-21.md). |
| [phase-0-completed.md](./phase-0-completed.md) | Snapshot de onboarding (abril 2026). Estado real → audit-2026-06-21 + current.md. |

> Por qué se conservan y no se borran: muchas citas en código y commits referencian estos monolitos por sección (`DECISIONS.md §N`, `ROADMAP.md Sprint N`). El archivo mantiene esas referencias resolubles.
