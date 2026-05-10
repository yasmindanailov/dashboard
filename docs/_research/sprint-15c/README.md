# Sprint 15C — Material de research (Enhance CP)

> Carpeta de **research** (no canónica). Contiene insumos brutos consultados durante el pre-sprint para diseñar el plugin Enhance CP. Cuando Sprint 15C cierre, lo canónico vive en `docs/60-roadmap/completed/sprint-15c-plugin-enhance-cp.md` + ADRs (077 Amendment A1, 082, 083) + `docs/features/provisioning/admin-plugins-enhance.md`.

## Contenidos

- [`orchd-oas3-api.yaml`](./orchd-oas3-api.yaml) — OpenAPI 3.0.3 del daemon `orchd` v12.21.3 (Enhance master). 588 KB / 20.848 líneas / ~280 paths. Fuente: `https://apidocs.enhance.com/spec/oas3-api.yaml` capturado 2026-05-07.

## Auth canónico (extracto de §components.securitySchemes)

- `bearerAuth` — HTTP Bearer (token Super Admin emitido en panel Enhance: Settings → Access Tokens).
- `sessionCookie` — HTTP Cookie (login interactivo, NO se usa desde Aelium).

## Tags relevantes para Aelium plugin

| Tag | Endpoints aprox | Uso plugin Aelium |
|---|---|---|
| `orgs` | 15+ | Master org + customer sub-orgs |
| `customers` | 4 | Lazy create customer al primer hosting |
| `subscriptions` | 6 | Crear/cancel/suspend/change plan |
| `websites` | 30+ | Crear website tras subscription, status, php-version |
| `domains` | 15+ | Add/remove domain del website + dns-status + dns-query |
| `dns` | 6 | DNS zone CRUD + records CRUD (11 kinds) + DNSSEC |
| `members` | 7 | SSO via OTP `/orgs/{org}/members/{m}/sso` |
| `logins` | 12+ | Listar customer logins, password reset admin |
| `plans` | 8 | Lectura para mapear `Product.config.enhance_plan_id` |
| `ssl` | (per-website) | Lectura status SSL en `getServiceInfo` |
| `emails` | 12+ | Métricas counts (CRUD diferido — Customer Panel) |
| `mysql` | 10+ | Métricas counts (CRUD diferido — Customer Panel) |
| `apps` | 30+ | Métrica installable apps + WordPress (SSO v1.x) |
| `backups` | 5 | Diferido v1.x (Customer Panel) |
| `branding` | 5 | NO usado (branding se gestiona en panel) |

## Limpieza

Esta carpeta puede archivarse o eliminarse cuando Sprint 15C cierre y la doc canónica esté completa. Conservar mientras el plugin esté en activo desarrollo o si el spec cambia (re-pull comparativo).
