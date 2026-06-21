# AI Workers — Especificación Técnica

> Sistema de asistentes IA que ayudan a los agentes a completar tareas de desarrollo simples.
> **Sprint 25** — Depende de: Sprint 8 (Tasks), Sprint 15 (Plugins), Sprint 22 (Projects).
> Este documento es una especificación de diseño. No está implementado.

---

## Índice

1. [Concepto](#concepto)
2. [Arquitectura de IA en Aelium](#arquitectura-de-ia-en-aelium)
3. [OpenClaw como AI Worker](#openclaw-como-ai-worker)
4. [Integración con el dashboard](#integración-con-el-dashboard)
5. [Flujo de trabajo](#flujo-de-trabajo)
6. [Modelo de datos](#modelo-de-datos)
7. [Edge cases](#edge-cases)
8. [Seguridad](#seguridad)
9. [UI/UX](#uiux)
10. [Sprint 25 — Roadmap](#sprint-25--roadmap)

---

## Concepto

Un AI Worker es un **asistente** que ayuda al agente a completar tareas de desarrollo simples (landings, sitios estáticos, contenido). El agente siempre revisa, edita, y entrega el resultado al cliente. La IA nunca actúa de forma autónoma ni despliega a producción.

### Lo que ES

- Una herramienta que **genera un primer borrador** que el agente perfecciona
- Un plugin del dashboard que se comunica vía API REST
- Un contenedor Docker **aislado** que nunca toca infraestructura de producción

### Lo que NO es

- No es un agente autónomo que completa tareas sin supervisión
- No es un reemplazo del agente humano
- No despliega código a servidores de clientes
- No unifica ni reemplaza el copilot de chat ni el filtro IA

---

## Arquitectura de IA en Aelium

El dashboard tiene **tres sistemas de IA independientes** que comparten proveedor (LLM) pero NO comparten lógica ni interfaz:

| Sistema | Propósito | Input → Output | Dónde vive en el dashboard | Sprint |
|---------|-----------|----------------|---------------------------|--------|
| **Filtro IA** | Clasificar y responder chats de clientes sin Support Inside | Texto → Texto | Transparente (entre cliente y agente) | 15 |
| **Copilot agente** | Sugerir respuestas y ayudar al agente con el dashboard | Texto → Texto | Dentro del chat del agente (sidebar/panel) | 15 |
| **AI Worker** | Generar artefactos de desarrollo (landing pages, configs) | Descripción de tarea → Archivos | Dentro de la tarea asignada | 25 |

### Por qué no se unifican

- El filtro IA es un **clasificador** — decide si una consulta necesita un humano
- El copilot es un **asistente conversacional** — ayuda al agente en tiempo real
- El AI Worker es un **generador de artefactos** — produce archivos que el agente revisa

Cada uno tiene diferente interfaz, diferente contexto, diferente tiempo de ejecución, y diferente coste. Unificarlos crearía un sistema con demasiadas responsabilidades y acoplamiento innecesario.

### Interfaz común

Lo que SÍ comparten es el **proveedor de LLM** via el sistema de plugins:

```
/plugins
  /ai-providers
    └── /claude            ← proveedor LLM compartido (API key, modelo, config)
  /ai-workers
    └── /openclaw           ← agente de desarrollo (contenedor Docker separado)
```

El plugin `claude` provee la API key y el modelo. OpenClaw la consume como cualquier otro cliente del LLM.

---

## OpenClaw como AI Worker

### Qué es OpenClaw

OpenClaw (anteriormente ClawdBot/Moltbot) es un agente IA open-source que:
- Corre localmente en Docker (self-hosted)
- Se conecta a LLMs (Claude, GPT) vía API
- Puede ejecutar comandos de shell, manejar archivos, controlar browsers
- Almacena configuración e historial localmente

### Por qué OpenClaw y no un wrapper propio

- Es un producto ya hecho para generar artefactos de desarrollo (es el ya existente producto docker aelium)
- Corre en Docker — se integra en el docker-compose existente
- Es open-source y self-hosted — sin dependencia de terceros
- Tiene su propia gestión de memoria y contexto

### Cómo se conecta al dashboard

```
Dashboard (NestJS)                    OpenClaw (Docker container)
       │                                       │
       ├── POST /api/tasks → BullMQ job ──────→│ API REST: crear sesión
       │                                       │ OpenClaw trabaja (minutos)
       │                                       │ Genera archivos
       │   ←── Webhook: progreso/completado ───┤
       │                                       │
       ├── GET artefactos ← MinIO ←────────────┤ Sube archivos a MinIO
       │                                       │
       └── Agente revisa en la tarea           │
```

**Protocolo de comunicación:**
1. Dashboard envía job a BullMQ: `ai.task.execute`
2. Worker BullMQ llama a OpenClaw API REST con el contexto de la tarea
3. OpenClaw trabaja de forma asíncrona (puede tardar minutos)
4. OpenClaw sube artefactos a MinIO y envía webhook al dashboard
5. Dashboard actualiza la tarea con los artefactos recibidos
6. Notificación al agente: "La IA ha completado la tarea X"

---

## Integración con el dashboard

### Con el módulo Tasks (Sprint 8)

La tarea es el contenedor natural del trabajo IA. No se necesita un sistema nuevo:

- `tasks.assigned_type`: `'agent'` (default) o `'ai_worker'`
- `tasks.ai_worker_id`: identificador del worker (ej: `'openclaw'`)
- `tasks.ai_session_id`: ID de la sesión en OpenClaw para continuidad
- Los artefactos se adjuntan a la tarea via `task_artifacts`

### Con el módulo Projects (Sprint 22)

Un proyecto tiene N tareas independientes. Algunas pueden asignarse a IA:

```
Proyecto: "Digitalización Floristería Pérez"
  ├── Tarea 1: "Crear landing web"          → assigned_type: 'ai_worker' (OpenClaw)
  ├── Tarea 2: "Configurar Nextcloud"       → assigned_type: 'agent' (Juan)
  └── Tarea 3: "Migrar email a Nextcloud"   → assigned_type: 'agent' (Juan)
```

El proyecto no sabe ni le importa si una tarea la hace un humano o una IA. Solo ve el % de completado.

### Con el sistema de Plugins (Sprint 15)

OpenClaw es un plugin de categoría `ai-workers`:

```json
{
  "name": "openclaw",
  "version": "1.0.0",
  "category": "ai-workers",
  "description": "Agente IA para generación de landings y sitios estáticos",
  "capabilities": ["landing_page", "static_site", "content_generation"],
  "config_schema": {
    "api_url": { "type": "string", "required": true },
    "api_key": { "type": "string", "encrypted": true },
    "max_tasks_per_day": { "type": "number", "default": 10 },
    "max_retries": { "type": "number", "default": 3 }
  }
}
```

La UI de Settings → Plugins muestra OpenClaw con su configuración y estado.

### Con Provisioning (Sprint 11)

OpenClaw **nunca** interactúa directamente con infraestructura de producción.

```
OpenClaw genera archivos → MinIO
                              ↓
Agente revisa y aprueba en la tarea
                              ↓
Agente pulsa "Desplegar" → ProvisioningService despliega al hosting del cliente
```

OpenClaw solo produce archivos. El despliegue pasa por el flujo estándar de provisioning.

### Módulos que NO interactúan con AI Workers

| Módulo | Razón |
|--------|-------|
| Billing | Las facturas del proyecto no cambian por quién ejecuta la tarea |
| Support/Chat | El copilot del chat es independiente del AI Worker |
| Clients | El cliente no sabe si una tarea la hizo IA o humano |
| Audit | Registra `task.ai_assigned` y `artifact.created` como cualquier otro evento |

---

## Flujo de trabajo

### 1. Asignar tarea a IA

```
Agente abre tarea → ve botón "Asignar a IA" (solo si tipo compatible)
  → Selecciona worker (OpenClaw)
  → Añade instrucciones (descripción, referencias, archivos adjuntos)
  → Confirma
  → tasks.assigned_type = 'ai_worker'
  → BullMQ job: ai.task.execute
```

### 2. IA trabaja

```
OpenClaw recibe contexto:
  - Título y descripción de la tarea
  - Archivos adjuntos (si hay)
  - Contexto del proyecto (nombre, descripción, cliente)
  
OpenClaw genera artefactos (landing HTML/CSS/JS)
OpenClaw sube a MinIO
OpenClaw envía webhook: { status: 'completed', artifacts: [...] }
```

### 3. Agente revisa

```
Agente recibe notificación: "IA completó la tarea X"
Abre la tarea → ve artefactos:
  - Preview en iframe (para landings)
  - Lista de archivos descargables
  - Historial de la conversación IA (para contexto)

Opciones:
  A) Aprobar → artefactos marcados como approved → botón "Desplegar"
  B) Pedir cambios → feedback textual → OpenClaw re-intenta (máx 3)
  C) Rechazar y tomar control → reasigna a sí mismo, usa artefactos como base
```

### 4. Desplegar

```
Agente aprueba y pulsa "Desplegar al hosting del cliente"
  → ProvisioningService.deployArtifacts(serviceId, artifactIds)
  → Los archivos se copian al hosting del cliente
  → El servicio se actualiza
```

---

## Modelo de datos

### Campos nuevos en `tasks`

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| assigned_type | enum | NOT NULL, DEFAULT 'agent' | `agent` · `ai_worker` |
| ai_worker_id | varchar(100) | NULLABLE | Identificador del plugin worker (ej: `'openclaw'`) |
| ai_session_id | varchar(500) | NULLABLE | ID de sesión en el worker para continuidad |

### Tabla `task_artifacts`

Archivos generados por IA (o por agentes en el futuro) vinculados a una tarea.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| task_id | uuid | NOT NULL, FK → tasks(id) ON DELETE CASCADE | |
| type | enum | NOT NULL | `file` · `url` · `preview` |
| name | varchar(300) | NOT NULL | Nombre del artefacto |
| file_path | varchar(1000) | NULLABLE | Ruta en MinIO |
| url | varchar(1000) | NULLABLE | URL externa (si aplica) |
| mime_type | varchar(100) | NULLABLE | ej: `text/html`, `image/png` |
| size_bytes | bigint | NULLABLE | |
| status | enum | NOT NULL, DEFAULT 'draft' | `draft` · `approved` · `rejected` |
| reviewed_by | uuid | NULLABLE, FK → users(id) | Agente que revisó |
| reviewed_at | timestamptz | NULLABLE | |
| feedback | text | NULLABLE | Feedback del agente si rechazó |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_task_artifacts_task` — en task_id
- `idx_task_artifacts_status` — en status

---

## Edge cases

| # | Caso | Solución |
|---|------|----------|
| EC-1 | **OpenClaw no responde** (container caído, timeout) | Tarea pasa a estado `ai_failed`. Notificación al agente. Puede reasignar a sí mismo o reintentar |
| EC-2 | **Resultado de baja calidad** | Agente rechaza con feedback. OpenClaw re-intenta (máximo 3 intentos configurables) |
| EC-3 | **Tarea no apta para IA** | Filtro por `capabilities` del manifest. Solo `project_task` y `custom_work` permiten asignación a IA. La UI oculta el botón si no es compatible |
| EC-4 | **Coste descontrolado** | Límite configurable: `ai.max_tasks_per_day`, `ai.max_cost_per_month`. Plugin rechaza si se supera |
| EC-5 | **Proyecto cancelado con tareas IA en progreso** | Jobs en BullMQ se cancelan. Artefactos parciales se guardan como `cancelled` |
| EC-6 | **Reasignar tarea IA ↔ humano** | Permitido siempre. Artefactos generados quedan adjuntos. El agente puede usarlos como base |
| EC-7 | **Cliente ve progreso IA** | El cliente ve "Tarea en progreso" con %. NO sabe si es IA o humano. Transparente |

---

## Seguridad

### Principio fundamental

> OpenClaw **nunca** tiene acceso directo a infraestructura de producción ni a datos de clientes sensibles.

### Controles

| Control | Implementación |
|---------|---------------|
| **Aislamiento** | OpenClaw corre en su propio contenedor Docker, red aislada |
| **Sin acceso a BD** | No tiene credenciales de PostgreSQL. Solo recibe contexto via API |
| **Sin acceso a hosting** | No puede desplegar. Solo genera archivos en MinIO |
| **Datos mínimos** | Recibe: título de tarea, descripción, archivos adjuntos. NO recibe: datos del cliente, facturas, credenciales |
| **API autenticada** | Comunicación dashboard↔OpenClaw con API key interna |
| **Límites de recursos** | CPU/RAM limitados en docker-compose para el contenedor OpenClaw |

---

## UI/UX

### No se crea página `/dashboard/ai`

Cada funcionalidad IA tiene su hogar natural:

| Funcionalidad | Dónde vive | Razón |
|---------------|-----------|-------|
| Copilot agente | Chat del agente (sidebar/panel) | El agente lo usa mientras chatea |
| Filtro IA | Transparente | El agente no interactúa |
| AI Worker artefactos | En la tarea asignada | La tarea es el contexto de trabajo |
| AI Worker historial | En la tarea (pestaña "Historial IA") | Vinculado a la tarea específica |
| Configuración IA | Settings → Plugins → OpenClaw | Como cualquier otro plugin |
| Consumo/coste IA | Settings → Plugins → OpenClaw (stats) | Datos operativos del plugin |

Una página `/dashboard/ai` no tendría propósito propio — sería un listado filtrado de tareas con `assigned_type = 'ai_worker'`, que ya es un filtro disponible en `/dashboard/tasks`.

### En la página de tareas

- Filtro: "Asignado a IA" en la lista de tareas
- Badge: indicador visual "🤖 IA" en tareas asignadas a un worker
- En el detalle de la tarea:
  - Preview de artefactos (iframe para HTML, lista para archivos)
  - Botones: "Aprobar", "Pedir cambios", "Rechazar y tomar control"
  - Pestaña "Historial IA": log de la sesión con OpenClaw

---

## Sprint 25 — Roadmap

> Depende de: Sprint 8 (Tasks), Sprint 15 (Plugins), Sprint 22 (Projects).

| # | Paso | Estado |
|---|------|--------|
| 25.1 | **Plugin framework para ai-workers** — nueva categoría de plugin con manifest (capabilities, config) | ⬜ |
| 25.2 | **Campos en tasks** — `assigned_type`, `ai_worker_id`, `ai_session_id` | ⬜ |
| 25.3 | **Tabla task_artifacts** — artefactos vinculados a tareas, con status y review | ⬜ |
| 25.4 | **Integración OpenClaw** — docker-compose service, API client, webhook receiver | ⬜ |
| 25.5 | **BullMQ job ai.task.execute** — orquestación: enviar a OpenClaw, recibir resultado, actualizar tarea | ⬜ |
| 25.6 | **Frontend: asignar tarea a IA** — botón condicional en detalle de tarea, selección de worker | ⬜ |
| 25.7 | **Frontend: preview de artefactos** — iframe para HTML, lista de archivos, estados approve/reject | ⬜ |
| 25.8 | **Frontend: filtro IA en lista de tareas** — badge IA, filtro por assigned_type | ⬜ |
| 25.9 | **Flujo completo** — asignar → OpenClaw genera → agente revisa → aprueba/rechaza → despliegue via ProvisioningService | ⬜ |
| 25.10 | docs/features/ai-workers/admin.md | ⬜ |

---

## Referencias cruzadas

- **DECISIONS.md §10** — Sistema de tareas (tipos, estados, panel del agente)
- **DECISIONS.md §44** — Sistema de proyectos (tareas 1:N por proyecto)
- **ARCHITECTURE.md** — Módulo `/plugins/ai-workers/openclaw`
- **DATABASE_SCHEMA.md BLOQUE 6** — Tabla `tasks` (campos `assigned_type`, `ai_worker_id`, `ai_session_id`)
- **DATABASE_SCHEMA.md BLOQUE 14** — Relación `tasks.project_id → projects`
- **ROADMAP.md Sprint 25** — Implementación paso a paso

---

*Documento creado: Abril 2026*
*Estado: especificación de diseño — no implementado*
*Última revisión: Sprint 22+ (se revisará al comenzar Sprint 25)*
