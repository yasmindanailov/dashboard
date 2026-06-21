# Aelium Dashboard

Panel de gestión integral para la plataforma de hosting Aelium.

## Stack

| Componente | Tecnología |
|-----------|------------|
| **API** | NestJS 11 + TypeScript |
| **Frontend** | Next.js 16 + Tailwind CSS 4 |
| **Database** | PostgreSQL 16 (Docker) |
| **Cache / Colas** | Redis 7 (Docker) |
| **ORM** | Prisma 7 |
| **Auth** | JWT + bcrypt |

## Requisitos

- Node.js ≥ 24
- pnpm ≥ 10
- Docker Desktop

## Inicio rápido

```bash
# 1. Levantar PostgreSQL + Redis
docker compose -f docker/docker-compose.dev.yml up -d

# 2. Backend
cd backend
cp ../.env .env          # o configurar manualmente
pnpm install
npx prisma migrate dev
npx prisma db seed
pnpm run dev             # → http://localhost:3001/api/v1

# 3. Frontend
cd frontend
pnpm install
pnpm run dev             # → http://localhost:3002
```

## Estructura

```
dashboard/
├── backend/             # NestJS 11 API
│   ├── src/
│   │   ├── core/        # PrismaModule, middleware, guards, filters
│   │   ├── health/      # /health endpoint
│   │   └── modules/     # 13 módulos de negocio (cascarón)
│   └── prisma/          # Schema + migrations + seed
├── frontend/            # Next.js 16
│   └── app/             # App Router + login con aurora
├── docker/              # Docker Compose (dev + prod)
└── docs/                # Arquitectura, schema, decisiones
```

## Endpoints

- `GET /api/v1/health` — Health check
- `GET /api/v1/docs` — Swagger UI

## Documentación

- [ARCHITECTURE.md](docs/40-reference/ARCHITECTURE.md)
- [DECISIONS.md](docs/99-archive/DECISIONS.md)
- [DATABASE_SCHEMA.md](docs/99-archive/DATABASE_SCHEMA.md)
- [SESSION_RULES.md](docs/90-meta/SESSION_RULES.md)
