# Infrastructure — Schema

> **Dominio:** servidores donde se provisionan productos Docker, pools por producto, métricas.
> **Módulo:** infrastructure (stub hoy — pendiente Sprint 10).
> **Sprint origen:** Sprint 10.
> **Estado:** ⬜ no implementado.
> **ADRs:** [043](../10-decisions/adr-043-infraestructura-self-hosted.md) (infra self-hosted) · [015](../10-decisions/adr-015-encriptacion-credenciales.md) (encriptación de credenciales) · [056](../10-decisions/adr-056-estrategia-escalabilidad.md) (escalabilidad).

---

## Resumen de tablas

| Tabla | Estado | Propósito |
|-------|--------|-----------|
| `servers` | ✅ stub | Servidores externos (Hetzner/OVH/Contabo) registrados. Modelo `Server` existe en Prisma; UI/operativa pendiente Sprint 10. Capacidad detectada automáticamente. |
| `server_pools` | ⬜ | Relación N:N entre servidores y productos. Define qué servidores alojan qué productos. Exclusividad opcional. |
| `server_metrics` | ⬜ | Métricas periódicas de cada servidor (RAM/CPU/disk/containers) |

---

## Tabla: `servers` ✅ stub

Servidores registrados en el sistema. **No incluye el servidor donde corre Aelium mismo** — solo los servidores externos donde se provisionan los productos del cliente ([ADR-043](../10-decisions/adr-043-infraestructura-self-hosted.md)).

> **Estado actual:** modelo `Server` ya existe en `backend/prisma/schema.prisma` con los campos definidos abajo. Operativa (registro, detección de capacidad, dashboard de infra) pendiente Sprint 10.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `name` | varchar(200) | NOT NULL | Nombre interno del equipo |
| `provider` | varchar(100) | NOT NULL | `Hetzner` · `OVH` · `Contabo` · ... |
| `location_country` | varchar(2) | NOT NULL | ISO alpha-2 |
| `location_city` | varchar(100) | NOT NULL | |
| `location_datacenter` | varchar(200) | NULLABLE | |
| `ip_address` | inet | NOT NULL | IPv4 / IPv6 |
| `connection_method` | enum | NOT NULL | `docker_api` (preferido) · `ssh` |
| `connection_port` | integer | NOT NULL | |
| `credentials_encrypted` | text | NOT NULL | **Credenciales encriptadas con AES-256-GCM** ([ADR-015](../10-decisions/adr-015-encriptacion-credenciales.md)). Nunca en claro. |
| `ram_total_mb` | integer | NULLABLE | **Detectado automáticamente** al registrar (no se introduce manualmente) |
| `cpu_cores_total` | integer | NULLABLE | Detectado automáticamente |
| `disk_total_gb` | decimal(10,2) | NULLABLE | Detectado automáticamente |
| `status` | enum | NOT NULL, DEFAULT `'active'` | `active` · `maintenance` · `inactive` |
| `last_health_check_at` | timestamptz | NULLABLE | |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Notas de decisión:**
- La capacidad total se detecta **automáticamente** al registrar via Docker API o SSH (`free`, `df`). No se introduce manualmente — evita inconsistencias entre lo registrado y la realidad ([ADR-043](../10-decisions/adr-043-infraestructura-self-hosted.md)).
- Recursos usados se calculan sumando `services.resource_config` de los servicios `active` en ese servidor (no se almacena — vista calculada).
- **Margen de seguridad** (configurable: `infra.safety_margin_ram_pct`, `infra.safety_margin_cpu_pct`, `infra.safety_margin_disk_pct`) — por defecto 80/80/90%. Ver [settings-reference](../50-operations/settings-reference.md).
- Información de ubicación visible al cliente en su portal de transparencia (RGPD, [ADR-010](../10-decisions/adr-010-rgpd-retencion-datos.md)).

---

## Tabla: `server_pools` ⬜

Relación N:N entre servidores y productos. Define qué servidores pueden alojar qué productos. Exclusividad opcional.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `server_id` | uuid | NOT NULL, FK → `servers(id)` ON DELETE CASCADE | |
| `product_id` | uuid | NOT NULL, FK → `products(id)` ON DELETE CASCADE | |
| `is_exclusive` | boolean | NOT NULL, DEFAULT `false` | Si `true`, el servidor no aparece disponible al crear otros productos |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- UNIQUE `(server_id, product_id)`

**Notas de decisión:**
- La exclusividad se define al asignar al pool de un producto, no al registrar el servidor — ADR-043.
- Estados conceptuales del servidor:
  - **LIBRE** — recién registrado, sin entrada en `server_pools`.
  - **COMPARTIDO** — al menos una entrada con `is_exclusive = false`.
  - **EXCLUSIVO** — al menos una entrada con `is_exclusive = true` (no aparece para otros productos).

---

## Tabla: `server_metrics` ⬜

Métricas periódicas de cada servidor. Job `poll-server-metrics` registra periódicamente.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `server_id` | uuid | NOT NULL, FK → `servers(id)` ON DELETE CASCADE | |
| `ram_used_mb` | integer | NOT NULL | |
| `cpu_usage_percent` | decimal(5,2) | NOT NULL | |
| `disk_used_gb` | decimal(10,2) | NOT NULL | |
| `active_containers` | integer | NOT NULL | |
| `recorded_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_server_metrics_server_id` — en `server_id`
- `idx_server_metrics_recorded_at` — en `recorded_at` (para limpieza por retención)

**Notas de decisión:**
- Retención configurable en settings (default 30 días).
- Cron `poll-server-metrics` aspiracional — pendiente módulo `infrastructure`. Ver [jobs-reference](../50-operations/jobs-reference.md).

---

## Diagrama de relaciones (infrastructure)

```
servers
  ├── server_pools (1:N)        ← define qué productos puede alojar
  │     └── product_id → products
  └── server_metrics (1:N)      ← time-series de uso

services
  └── server_id (opcional) → servers   ← solo productos Docker
```

---

## Provisioning Docker (visión general)

Al provisionar un servicio Docker:

1. Sistema identifica el `product_id` del servicio.
2. Busca servidores en `server_pools` donde el producto está autorizado.
3. Filtra los disponibles (`status = active` + por debajo de margen de seguridad — calculado de `server_metrics`).
4. Selecciona el de menor carga.
5. Inyecta variables del cliente en `docker_templates.yaml_content` ([products.md](./products.md)).
6. Envía `docker-compose.yml` generado al servidor seleccionado vía Docker API o SSH.
7. Configura Traefik (reverse proxy) para subdominio.
8. SSL automático via Let's Encrypt.
9. Si todos los servidores del pool superan límite → notificación al admin: "Pool de [producto] casi lleno".

Detalle completo en [ADR-043](../10-decisions/adr-043-infraestructura-self-hosted.md).

---

## Cross-references

- **Apuntan aquí:**
  - `services.server_id` → `servers` ([billing.md](./billing.md)) — solo productos Docker
- **Aquí apuntan:**
  - `products` ([products.md](./products.md)) — vía `server_pools.product_id`
  - `docker_templates` ([products.md](./products.md)) — vía `products.docker_template_id`
- **ADRs principales:** [043](../10-decisions/adr-043-infraestructura-self-hosted.md), [015](../10-decisions/adr-015-encriptacion-credenciales.md), [021](../10-decisions/adr-021-provisioners.md), [056](../10-decisions/adr-056-estrategia-escalabilidad.md).
- **Settings consumidos:** `infra.safety_margin_ram_pct`, `infra.safety_margin_cpu_pct`, `infra.safety_margin_disk_pct` — ver [settings-reference](../50-operations/settings-reference.md).
- **Funciones fuera del dashboard (decisión consciente):**
  - **Backups de servidores de clientes** — sistema externo a nivel de servidor.
  - **Migración entre servidores** — manual; el schema lo soporta (`server_id` mutable) pero sin UI automática.
  - **Orquestación avanzada (Kubernetes)** — futuro. Plugin de provisioning evoluciona, core no cambia.
- **Errores API:** ninguno específico todavía (módulo no implementado).
