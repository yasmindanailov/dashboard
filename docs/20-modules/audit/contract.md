# audit — Contract

> **Stub mínimo (Sprint 9 Fase E).** Detalle canónico vive en [ADR-017](../../10-decisions/adr-017-audit-log-inmutable.md) + [ADR-010](../../10-decisions/adr-010-rgpd-retencion-datos.md). Redacción completa de las 12 secciones diferida a **DC.9** (Sprint 9.5 recomendado).

## 1. Propósito

Registro inmutable y centralizado de accesos staff a datos del cliente y de cambios sobre entities sensibles. Cumple R3 (audit inmutable) + ADR-017 + ADR-010 §Transparency (RGPD).

## 2. Estado de implementación

✅ **Sprint 9 Fase E cerrado (2026-04-27 — commit `9e2d3a6`, fix `bff4fec`).**
- `AuditService.logAccess` / `logChange` / `cleanupOldAccessLogs` / `findAccessLog`.
- `@AuditAccess('Resource')` decorador + `AuditInterceptor` APP-wide.
- Endpoint cliente `GET /api/v1/audit/access` con ownership filter + actor enriquecido.
- Frontend cliente `/dashboard/transparency`.
- Cron `cleanupOldAuditLogs` (R3 §Excepción única — `EVERY_DAY_AT_3AM` UTC).

**Pendiente DC.8 (oportunista al tocar `auth/*`):** migrar 3 call sites de `auth-login/register/token.service` que escriben directo a `audit_access_log` para que pasen por `AuditService.logAccess(...)`.

## 3. Arquitectura — referencias canónicas

| Aspecto | Documento |
|---------|-----------|
| Diseño general (audit inmutable + portal RGPD) | [ADR-017](../../10-decisions/adr-017-audit-log-inmutable.md) |
| Retención RGPD (730 días) | [ADR-010](../../10-decisions/adr-010-rgpd-retencion-datos.md) |
| Patrón canónico de uso | [`rules.md` §Patrones canónicos](../../00-foundations/rules.md) — `AuditService` + `@AuditAccess` + `AuditInterceptor` |
| Regla R3 (inmutabilidad + excepción cron) | [`rules.md` R3](../../00-foundations/rules.md) |
| Cron retención | [`jobs-reference.md`](../../50-operations/jobs-reference.md) §"Audit retention" |
| Setting `audit.access_retention_days` | [`settings-reference.md`](../../50-operations/settings-reference.md) §audit.* |

## 4. Modelos Prisma

- `AuditAccessLog` — lecturas staff sobre datos cliente.
- `AuditChangeLog` — cambios sobre entities sensibles (uso futuro).
- `AuditIntegrationLog` — diferido (no creado en Sprint 9).

## 5. API REST expuesta

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| `GET` | `/api/v1/audit/access` | Portal transparencia cliente — ownership filter server-side, response enriquecido con actor (nombre + rol) | `JwtAuthGuard` |

## 6–12. Detalle completo

Pendiente DC.9. Los enlaces de §3 cubren todo el comportamiento.
