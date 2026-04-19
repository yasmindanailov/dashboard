# Plan de Infraestructura — Respuestas y Decisiones

---

## DISTRIBUCIÓN DE SERVIDORES

### Tu inventario

| Servidor | CPU | RAM | Disco | Tipo |
|----------|-----|-----|-------|------|
| **Dedicado OVH** | Xeon E-2136 (6c/12t, 4.5GHz) | 32 GB **ECC** | 2×512 GB NVMe **RAID** | Bare metal |
| **VPS-16** | 16 vCores | 16 GB | 160 GB | VPS |
| **VPS-2** | 6 vCores | 12 GB | 100 GB | VPS |

### Mi recomendación

```
DEDICADO (32 GB ECC · NVMe RAID)  →  DASHBOARD + LANDING
├── Dashboard completo (NestJS API + Next.js frontend + workers)
├── PostgreSQL 16 (la DB más crítica del negocio)
├── Redis 7
├── MinIO (storage)
├── Traefik (reverse proxy + SSL)
├── Landing web (Next.js)
├── Monitoring (Grafana + Prometheus + Loki)
└── Backups locales antes de enviar a Cloudflare R2

VPS-16 (16 vCores · 16 GB)  →  HOSTING CLIENTES
├── Enhance CP (servidor de hosting de clientes)
└── Capacidad para escalar: 16 vCores manejan bien muchos sitios PHP

VPS-2 (6 vCores · 12 GB)  →  ENHANCE CP MASTER + PRODUCTOS DOCKER
├── Enhance CP Master Panel
├── Docker products (Nextcloud, OpenClaw, futuros)
└── Collabora (instancia compartida)
```

### Por qué el dedicado para el dashboard

| Razón | Detalle |
|-------|---------|
| **ECC RAM** | Corrige errores de memoria en tiempo real. Para una base de datos de facturación y billing, esto evita corrupción silenciosa de datos. Los VPS no tienen ECC. |
| **NVMe RAID** | Dos discos en RAID. Si un disco falla, los datos siguen intactos. Los VPS tienen un solo disco virtual. |
| **32 GB RAM** | Dashboard + landing + PostgreSQL + Redis + monitoring ≈ 12-15 GB usados. Quedan 17+ GB libres para crecer. |
| **Bare metal** | Sin overhead de virtualización. Rendimiento real, no compartido. |

> [!IMPORTANT]
> La base de datos de billing (facturas, pagos, suscripciones) es lo más crítico del negocio. Ponerla en el servidor con ECC + RAID es la decisión correcta. Los hostings de clientes se pueden restaurar desde backups sin impacto legal — una factura corrupta no.

### ¿Necesitarás cambiar de servidor?
**No para el dashboard.** El dedicado con 32 GB es más que suficiente para miles de clientes. El dashboard + landing + toda la infra no superará 15 GB RAM ni con 5.000 clientes activos.

Lo que sí puede necesitar upgrade es el **VPS-16** cuando los hostings de clientes crezcan. Pero eso es independiente del dashboard.

---

## ENTORNO DE DESARROLLO

### Recomendación: desarrollar en localhost (tu Windows)

```
EN TU PC (DESARROLLO)
├── Código del dashboard (backend + frontend)
├── PostgreSQL + Redis corriendo en Docker Desktop
├── Hot reload instantáneo (cambias código → se actualiza al segundo)
├── Sin latencia de red
├── Mismo workflow que tu landing en Next.js
└── Todo funciona sin internet

EN EL DEDICADO (PRODUCCIÓN)
├── Docker Compose con toda la infra
├── Deploy via git push → rebuild automático
└── La config de producción es diferente (dominio real, SSL, etc.)
```

### Lo que necesitas instalado en Windows

```
OBLIGATORIO (antes de empezar)
├── Docker Desktop for Windows (incluye Docker Compose)
│   → Permite correr PostgreSQL + Redis localmente sin instalar nada
├── Node.js 20+ (ya lo tienes si corres la landing en Next.js)
├── Git (para control de versiones)
└── pnpm (gestor de paquetes — más rápido que npm)

YA LO TIENES
├── VS Code / cursor / editor
└── Next.js (ya lo usas para la landing)
```

### Workflow de desarrollo

```
1. Abres el proyecto en tu editor
2. Levantas PostgreSQL + Redis con: docker compose -f docker-compose.dev.yml up
3. Levantas el backend con: pnpm run dev (NestJS con hot reload)
4. Levantas el frontend con: pnpm run dev (Next.js con hot reload)
5. Desarrollas y pruebas todo en localhost
6. Cuando esté listo: push a git → deploy al dedicado
```

Los emails en desarrollo se muestran en la consola (no se envían de verdad).
Los emails en producción usan sendmail del servidor hasta que configures SMTP.

---

## DECISIONES CERRADAS

| Pregunta | Respuesta |
|----------|-----------|
| **Dominio** | `portal.aelium.net` |
| **Servidor dashboard** | Dedicado OVH (Xeon, 32GB ECC, NVMe RAID) |
| **Servidor hosting** | VPS-16 (16 vCores, 16GB) |
| **Servidor CP + Docker** | VPS-2 (6 vCores, 12GB) |
| **Landing** | En el dedicado junto al dashboard (comparten API) |
| **Desarrollo** | Localhost (Windows) con Docker Desktop |
| **Email día 1** | Console log en dev · sendmail en prod · SMTP configurable |
| **Backups** | Cloudflare R2 (S3-compatible — MinIO SDK funciona directo) |
| **Git** | Nuevo repo en el workspace actual |

---

## PASOS PREVIOS (antes de que yo empiece a codear)

### Lo que necesito que hagas tú

1. **Instalar Docker Desktop** si no lo tienes
   → https://docs.docker.com/desktop/install/windows-install/
   → Tras instalar, verifica con: `docker --version` y `docker compose version`

2. **Instalar pnpm** si no lo tienes
   → `npm install -g pnpm`

3. **Confirmar que tienes Node.js 20+**
   → `node --version` (debe ser 20.x o superior)

4. **Confirmarme que puedo iniciar el proyecto** en el workspace:
   `c:\Users\yasmi\Desktop\proyectos_tecnologiasdigital\aelium\dashboard\`

### Lo que hago yo en cuanto confirmes

```
Sprint 1 — Fase 1: Scaffolding completo
├── Inicializar git
├── Crear monorepo: /backend + /frontend + /docker + /docs
├── docker-compose.dev.yml (PostgreSQL + Redis para desarrollo)
├── docker-compose.prod.yml (infra completa para producción)
├── NestJS scaffolding con toda la estructura modular
├── Next.js scaffolding con layout Aelium
├── Prisma schema generado desde DATABASE_SCHEMA.md
├── Seeds: roles, superadmin, settings iniciales
└── README con instrucciones de setup
```

¿Tienes Docker Desktop instalado? ¿Confirmamos y arrancamos?
