# Migración 20260522173919 — Sprint 15D.B: fundación de comercio de dominios

> Nota explicativa (Prisma solo lee `migration.sql`; este README no afecta al checksum).

## Qué añade esta migración (Sprint 15D.B — el cambio intencionado)

- Enums `DomainPriceOperation`, `DomainPriceSource`, `ResellerclubContactType`.
- Tablas `domain_tld_pricing` ([ADR-084 §1](../../../../docs/10-decisions/adr-084-comercio-dominios-registrar.md)),
  `resellerclub_customers` + `resellerclub_contact_handles` ([ADR-081 §3/§4](../../../../docs/10-decisions/adr-081-plugin-resellerclub-specifics.md)).
- Columna `services.expires_at` + índice ([ADR-082 A2.3](../../../../docs/10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md)).

## Por qué toca también FKs de `client_notes`/`tasks` + `support_inside_config`

Esas líneas (`DROP/ADD CONSTRAINT *_fkey` en `client_notes`/`tasks`/`task_checklist_completions`/`maintenance_logs` y `ALTER ... DROP DEFAULT` en `support_inside_config`) **NO son parte de 15D**: son la **reconciliación de un drift preexistente** entre `schema.prisma` y el historial de migraciones que master arrastraba desde después de la migración F.9 (`20260516130000`) — el schema se editó (relaciones / default) sin generar migración en alguna fase posterior (15C.II F.10–G).

`prisma migrate dev` detecta el diff completo entre el schema y la shadow DB, por lo que capturó ese drift en esta migración. Es **seguro** en CI/prod: el DROP/ADD recrea FKs idénticas (con `ON UPDATE CASCADE`) y el `DROP DEFAULT` es un no-op si no existe default.

El split en una migración aparte requería `prisma migrate reset` (no ejecutable por el agente — Prisma+harness lo bloquean; solo un humano en terminal). Decisión consciente (Yasmin, 2026-05-22): mantener la migración bundled, documentada, en vez de cirugía frágil del historial. Ver `backlog.md` DC.NEW-64.
