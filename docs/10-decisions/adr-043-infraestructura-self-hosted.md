# ADR-043 — Infraestructura self-hosted en Docker Compose

> **Status:** Active
> **Date:** 2026-04 (decisión consolidada) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §14 + §24 + §37
> **Domain:** infrastructure, foundation

---

## Contexto

Aelium debe correr todo su stack (frontend, backend, workers, base de datos, cache, storage, monitoring) y gestionar **además** la infraestructura de los clientes (servidores Docker donde corren Nextcloud, hosting Web, etc.).

Las opciones iniciales eran:

- **Cloud managed (Vercel + Railway + Supabase + ...)** → cero ops, pero coste mensual recurrente alto y dependencia de varios proveedores.
- **Kubernetes** → escalable pero overkill para esta operativa.
- **Bare metal sin contenedores** → ligero pero sin aislamiento, con riesgo de "funciona en mi máquina".
- **Docker Compose en servidor propio** → un solo servidor, todos los servicios contenedorizados, reproducible, sin coste recurrente.

Hay también una segunda dimensión: **gestionar la infraestructura del cliente** (provisioning automático). Aelium necesita registrar servidores externos y desplegar contenedores Docker en ellos.

---

## Decisión

Tres bloques relacionados: el stack propio, la gestión de servidores de clientes, y reglas de capacidad.

### A. Stack self-hosted (Aelium operativa interna)

**Todo el stack corre en un solo servidor propio con Docker Compose.** Cero coste en servicios externos. Cero dependencia de terceros para operar.

```
ANTES (con servicios externos)          AHORA (self-hosted)
─────────────────────────────           ────────────────────
Frontend: Vercel                    →   Next.js en Docker (Node)
Backend:  Railway                   →   NestJS en Docker (Node)
Workers:  Railway                   →   Workers BullMQ en Docker (Node)
Base datos: Supabase PostgreSQL     →   PostgreSQL 16 en Docker
Cache/Colas: (no definido)          →   Redis 7 en Docker
Storage: Supabase Storage           →   MinIO en Docker (S3-compatible)
Reverse proxy: (no definido)        →   Traefik en Docker (SSL automático)
Monitoring: (no definido)           →   Grafana + Prometheus + Loki en Docker
```

```yaml
services:
  traefik:        # Reverse proxy + SSL automático (Let's Encrypt)
  frontend:       # Next.js (puerto interno 3000)
  backend:        # NestJS API (puerto interno 3001)
  worker:         # BullMQ workers (mismo código, modo worker)
  postgres:       # PostgreSQL 16
  redis:          # Redis 7 (cache + BullMQ + pub/sub)
  minio:          # Storage S3-compatible (PDFs, logos, assets)
  grafana:        # Dashboards de monitoring
  prometheus:     # Métricas del sistema
  loki:           # Logs centralizados
```

**Servidor recomendado:**

- **Mínimo arranque:** 4 vCPU · 16 GB RAM · 100 GB SSD (cientos de clientes activos).
- **Producción seria:** 8 vCPU · 32 GB RAM · 500 GB NVMe (miles de clientes).

**Backups:**

- `pg_dump` diario completo + cada 6 horas incremental (WAL).
- Retención: 30 días.
- Almacenados fuera del Docker volume.
- Test de restauración mensual obligatorio.

### B. Gestión de servidores de clientes

El admin registra servidores externos donde se provisionan contenedores Docker para los clientes:

```
Nombre interno       → identificación para el equipo
IP principal
Método de conexión   → Docker API (preferido) o SSH
Credenciales         → guardadas encriptadas (AES-256-GCM, ADR-015)
Proveedor            → Hetzner · OVH · Contabo · etc.
Ubicación            → país · ciudad · datacenter (visible al cliente, ADR-010 RGPD)
```

**La capacidad total (RAM, CPU, disco) NO se introduce manualmente** — el sistema la detecta automáticamente al conectarse al servidor (Docker API o `df`/`free` via SSH). Evita inconsistencias entre lo registrado y lo real.

**Estado calculado:**

```
RAM usada    = suma de RAM asignada a contenedores activos
CPU usada    = suma de CPU asignada
Disco usado  = suma de almacenamiento asignado
Disponible   = Total (detectado) - Usado (calculado)
```

### C. Pools de servidores y exclusividad

La exclusividad **no se define al registrar el servidor** — se define al crear o editar un producto, en la sección de servidores del pool.

```
Estados de un servidor:
  LIBRE      → recién registrado, sin producto asignado
  COMPARTIDO → asignado a un producto sin exclusividad
  EXCLUSIVO  → ligado a un producto, no aparece disponible en otros
```

Al añadir servidor al pool de un producto: checkbox **"Reservar exclusivamente para este producto"**. Si se marca → no aparece al crear otros productos.

### D. Margen de seguridad

El sistema **nunca asigna más del X% de capacidad** de un servidor. Defaults configurables en settings:

- RAM: 80%
- CPU: 80%
- Disco: 90%

Cuando un servidor supera el límite:
1. No se le asignan nuevas instancias.
2. Alerta al admin via notificación interna.
3. El sistema busca otro servidor del mismo pool.
4. Si todos los servidores del pool superan el límite → alerta al admin: "Pool de [producto] casi lleno".

### E. Provisioning Docker

Las plantillas `.yaml` viven en el dashboard (gestionadas solo por el superadmin). Al provisionar:

1. Sistema inyecta variables del cliente en la plantilla.
2. `docker-compose.yml` generado se envía al servidor seleccionado.
3. `docker-compose up` en ese servidor.
4. Configura Traefik (reverse proxy) para el subdominio.
5. SSL automático via Let's Encrypt.

Variables inyectadas: `SUBDOMINIO`, `RAM`, `CPU`, `STORAGE`, `DB_NAME`, `DB_PASSWORD`, `ADMIN_PASSWORD`, + las que defina el admin al crear el producto.

**Subdominios del cliente:**
- Con dominio en Aelium → `[prefijo].sudominio.com`.
- Sin dominio propio → `[sunombre].cloud.aelium.net`.

**Caso especial Collabora:** una sola instancia en servidor dedicado compartida por todos los Nextcloud (no se provisiona por cliente). En la plantilla de Nextcloud: variable `COLLABORA_URL` apunta al servidor dedicado.

### F. Escalabilidad horizontal preparada

- API NestJS **stateless** — el estado vive en PostgreSQL y Redis.
- Añadir más instancias de API o workers no requiere cambios de código.
- Cola BullMQ compartida via Redis — cualquier worker ejecuta cualquier job.
- Migrar a Docker Swarm es trivial cuando se necesite (ADR-056).

### G. Funciones fuera del dashboard (decisión consciente)

- **Backups de servidores de clientes:** sistema externo a nivel de servidor. Solo se muestra info en el dashboard.
- **Migración entre servidores:** manual. El schema lo soporta (`server_id` en service) pero no hay UI de move automático.
- **Orquestación avanzada (Kubernetes):** futuro. El plugin de provisioning evoluciona, el core no cambia (ADR-021).

---

## Consecuencias

- ✅ **Ganamos:**
  - **Cero coste recurrente externo** — el servidor propio paga uno solo.
  - Reproducibilidad total: `docker compose up` y todo arranca.
  - Aislamiento por contenedor — un servicio no rompe a otro.
  - Backups simples (volúmenes Docker + pg_dump).
  - Capacidad detectada automáticamente — sin desincronización con la realidad.
  - Pool de servidores con exclusividad permite mezclar productos sin conflictos.
- ⚠️ **Aceptamos:**
  - **Single Point of Failure** — si el servidor cae, todo cae. Mitigación: backups automatizados + plan de recovery (Sprint 14.6 + ADR-056).
  - Crons en proceso (`@nestjs/schedule`) — duplicarán trabajo si se escala a múltiples instancias. Migrar a BullMQ con leader election cuando aplique.
  - **Backups de clientes externos al dashboard** — el cliente no puede gestionarlos desde aquí (decisión consciente, no es nuestro alcance hoy).
  - Migración manual entre servidores — operativa de admin, no automatizada.
- 🚪 **Cierra:**
  - **No vendor lock-in con cloud managed** — todo es portable a cualquier servidor con Docker.
  - **No introducir capacidad manual** en servidores — siempre detectada.
  - **No mezclar servidores de Aelium con servidores de clientes** — son pools separados conceptualmente.

---

## Cuándo revisar

- Cuando el servidor único alcance >70% de capacidad sostenido → planificar segundo servidor + load balancer (ADR-056).
- Si la operativa exige uptime 99.9%+ con SLA contractual → considerar HA con Postgres replicado, Redis sentinel, multi-instance.
- Si Kubernetes aporta beneficio claro (>5000 clientes, despliegues continuos complejos) → revisar — hoy es overkill.
- Si Hetzner/OVH/Contabo cambia oferta y el coste cloud managed se vuelve competitivo → reevaluar.

---

## Referencias

- **Módulos afectados:** infrastructure (registro de servidores), provisioning (despliegue), products (definición de pools), billing (factura como base).
- **Reglas relacionadas:** R4 (plugins — provisioner por producto), R12 (encriptación de credenciales).
- **ADRs relacionados:** ADR-009 (plugins), ADR-015 (encriptación AES-256-GCM), ADR-021 (provisioners — patrón plugin), ADR-010 (RGPD — ubicación de servidores visible al cliente), ADR-056 (escalabilidad — umbrales de cambio).
- **Glosario:** [Pool](../00-foundations/glossary.md), [Servidor](../00-foundations/glossary.md), [Provisioning](../00-foundations/glossary.md), [Margen de seguridad](../00-foundations/glossary.md).
- **Implementación pendiente:** módulo `infrastructure` (stub hoy — ver development-playbook §1).
