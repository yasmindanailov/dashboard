# Clients Module — Documentación de administración

> Módulo: `clients`
> Sprint: 4 (Clients)
> Estado: ✅ Completo

---

## Resumen

El módulo Clients es el CRM del dashboard. Gestiona la ficha completa del cliente: datos de contacto, perfiles de facturación, notas internas, y contexto del negocio. Es accesible solo para admin y agentes.

---

## Endpoints de la API

| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/clients` | admin, agent_full, agent_billing, agent_support | Lista paginada con búsqueda |
| GET | `/clients/:id` | admin, agent_full, agent_billing, agent_support | Ficha completa del cliente |
| PATCH | `/clients/:id` | admin, agent_full, agent_billing | Actualizar perfil del cliente |
| POST | `/clients/:id/notes` | admin, agent_full, agent_billing, agent_support | Añadir nota interna |
| GET | `/clients/:id/billing-profiles` | admin, agent_full, agent_billing | Listar perfiles de facturación |
| POST | `/clients/:id/billing-profiles` | admin, agent_full, agent_billing | Crear perfil de facturación |
| PATCH | `/clients/billing-profiles/:id` | admin, agent_full, agent_billing | Actualizar perfil |
| DELETE | `/clients/billing-profiles/:id` | admin, agent_full, agent_billing | Eliminar perfil (no el default) |
| PATCH | `/clients/:id/billing-profiles/:profileId/default` | admin, agent_full, agent_billing | Marcar como predeterminado |

---

## Páginas del frontend

| Ruta | Función |
|------|---------| 
| `/dashboard/clients` | Lista paginada con búsqueda en tiempo real |
| `/dashboard/clients/:id` | Ficha del cliente con tabs |

---

## Tabs de la ficha de cliente

| Tab | Contenido |
|-----|-----------|
| Resumen | Datos de cuenta + perfil (tipo, teléfono, dirección, etc.) |
| Facturación | Perfiles de facturación (personal, autónomo, empresa) |
| Notas internas | Timeline de notas con campo para añadir nuevas |

---

## Reglas de negocio de billing profiles

- Un cliente puede tener múltiples perfiles: personal, autónomo, empresa.
- **NIF/CIF obligatorio** para autónomo y empresa.
- **Nombre de empresa obligatorio** para tipo empresa.
- El primer perfil creado se marca como predeterminado automáticamente.
- No se puede eliminar el perfil predeterminado (hay que cambiar el default primero).
- Las facturas se asociarán al perfil predeterminado (Sprint 6).

---

## Seguridad

| Mecanismo | Implementación |
|-----------|----------------|
| Autenticación | JwtAuthGuard en todos los endpoints |
| Autorización | RolesGuard + @Roles() decorator |
| Agent support | Solo lectura (list, get, notes). No puede editar perfil ni billing. |
| ParseUUIDPipe | Validación de IDs en params |

---

## Fundamentos creados en este sprint

| Componente | Descripción | Ubicación |
|------------|-------------|-----------|
| RolesGuard | Guardia de autorización por rol | `auth/guards/roles.guard.ts` |
| @Roles() decorator | Decorador para definir roles permitidos | `auth/decorators/roles.decorator.ts` |
| PaginationDto | DTO reutilizable para paginación | `common/dto/pagination.dto.ts` |
| PaginatedResult<T> | Tipo genérico para respuestas paginadas | `common/dto/pagination.dto.ts` |
| paginate() helper | Helper para construir respuestas paginadas | `common/dto/pagination.dto.ts` |
| Auto ClientProfile | Se crea automáticamente al registrar usuario | `auth.service.ts` |
| Dashboard layout | Sidebar + topbar + campana placeholder | `dashboard/layout.tsx` |

---

## Archivos clave

```
backend/
  src/modules/clients/
    clients.module.ts        ← Módulo NestJS
    clients.service.ts       ← Lógica de negocio (9 métodos)
    clients.controller.ts    ← 9 endpoints
    dto/client.dto.ts        ← DTOs de cliente
    dto/billing-profile.dto.ts ← DTOs de billing profile

  src/modules/auth/
    guards/roles.guard.ts    ← RolesGuard
    decorators/roles.decorator.ts ← @Roles()

  src/common/dto/
    pagination.dto.ts        ← Utilidad de paginación

  prisma/schema.prisma       ← +BillingProfile model

frontend/
  app/dashboard/
    layout.tsx               ← Sidebar + topbar
    page.tsx                 ← Dashboard home
    clients/
      page.tsx               ← Tabla de clientes
      [id]/page.tsx          ← Ficha de cliente con tabs
  app/lib/api.ts             ← +clientsApi
```
