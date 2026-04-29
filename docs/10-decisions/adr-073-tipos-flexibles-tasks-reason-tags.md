# ADR-073 — Tipos de tarea + `reason` libre + `tags`: separar el QUÉ del POR QUÉ (refina ADR-041)

> **Status:** Active (refina [ADR-041](./adr-041-sistema-tareas.md) §"Tipos canónicos" + [ADR-072](./adr-072-tareas-sin-asignar-cola-publica.md) §"Cola pública por tipo")
> **Date:** 2026-04-29
> **Domain:** tasks, operativa interna, automatizaciones
> **Sprint:** Sprint 8 Fase B.7

---

## Contexto

[ADR-041](./adr-041-sistema-tareas.md) declaró un enum cerrado de seis tipos de tarea: `wow_call`, `maintenance`, `maintenance_management`, `project_task`, `custom_work`, `support_setup`. Cada tipo cumplía dos roles a la vez:

1. **Activador de bloques adaptativos** en la UI de detalle (`wow_call` mostraba "Datos del cliente + plan", `maintenance` mostraba checklist, etc.).
2. **Categoría semántica del trabajo** ("esto es una llamada de bienvenida", "esto es un mantenimiento mensual", etc.).

Tras Sprint 8 Fase B.5 (2026-04-29), Yasmin observa que **mezclar ambos roles en un único enum es rígido en operativa real**:

- Una tarea "Contactar al cliente" no siempre es una "llamada de bienvenida" — puede ser un follow-up de queja, una renovación, una llamada de cortesía, un aviso de migración. Hoy todas estas caen en el cajón `wow_call` o pierden su semántica metiéndose en `custom_work`.
- El admin no puede crear sub-categorías sin tocar código. Cada nueva intención operativa exigiría un nuevo valor de enum + migración + redeploy.
- El **título** de la tarea es lo único que captura el contexto real, lo que carga al agente con tener que poner siempre títulos largos y hace que los filtros del tablero sean menos útiles (no se puede filtrar "todas las tareas relacionadas con renovaciones").

> **¿Qué pasaría si NO tomáramos esta decisión?** Cada nueva intención operativa (ej. "llamadas de migración hosting", "follow-up post-incident") requeriría: (a) añadir valor al enum Prisma, (b) añadir mapeo i18n en 3 sitios (`tasks-email.listener.ts` + `frontend/types.ts` + `ClientNotesTab.tsx`), (c) migration SQL, (d) tests E2E nuevos, (e) ADR justificando la categoría. El coste por nueva categoría es prohibitivo y el resultado es un enum hinchado que nadie poda. Acabaríamos con 30+ valores en 12 meses.

---

## Opciones consideradas

### A. Mantener enum cerrado y crear nuevos valores cuando hagan falta

- **Pros:** sin cambios. El compilador atrapa typos.
- **Contras:** coste por categoría explicado arriba. El enum es verdad técnica pero no captura realidad operativa. Los listeners del Sprint 11 (`service.provisioned` → `wow_call`) quedan acoplados a un valor histórico cuyo nombre ya no cuadra con la operativa real.

### B. Tipo abierto + plantillas de tarea editables desde Settings

Eliminar el enum por completo. El admin define plantillas (`task_templates`) desde Settings: nombre, prioridad por defecto, fecha límite calculada (+N días), bloques que activa, tags por defecto. Los listeners se enganchan a `template_id`, no a `type`.

- **Pros:** máxima flexibilidad, sin código por categoría.
- **Contras:** sobre-ingeniería para un equipo pequeño hoy. Migrar listeners + crons de Fase C a depender de `template_id` cuando aún no hay UI de plantillas es un riesgo. La mayor parte del valor no se materializa hasta tener varios admins / múltiples flujos de negocio. Es **YAGNI** en este momento.

### C. (elegida) Tipo cerrado pequeño que activa bloques + `reason` libre + `tags` extensibles

Mantener un enum cerrado **pequeño y orientado a "qué bloque/automatización dispara"**, no a "qué intención tiene el agente". Añadir dos campos ortogonales que capturan el contexto real:

- **`reason`** — texto libre, opcional, máx. 100 caracteres. El POR QUÉ humano de la tarea ("Bienvenida primer servicio", "Renovación próxima a vencer", "Aviso migración hosting"). Visible bajo el título en el detalle. Indexable en búsquedas.
- **`tags`** — etiquetas reutilizables creadas por el admin (`TaskTag` + `TaskTagAssignment` m2m explícita). Multi-asignables. Cada tag tiene `slug` (canónico, sin tildes) y `label` (mostrable). Filtrables desde el tablero.

El enum se renombra para reflejar el QUÉ-bloque, no la intención:

| Antes | Ahora | Bloque que activa |
|---|---|---|
| `wow_call` | **`contact_client`** | "Datos del cliente + plan contratado" (cuando hay `service_id`) |
| `maintenance` | `maintenance` *(intacto)* | Checklist técnico + flujo "Completar y notificar" |
| `maintenance_management` | `maintenance_management` *(intacto)* | Checklist + nota de gestión adicional |
| `project_task` | `project_task` *(intacto)* | Placeholder Sprint 22 (Projects) |
| `custom_work` | `custom_work` *(intacto)* | Sin bloque adaptativo (genérica) |
| `support_setup` | `support_setup` *(intacto)* | Setup soporte (Sprint 8 Fase D Support Inside) |

**El bloque "Datos del cliente + plan" deja de ser exclusivo de `contact_client`** — pasa a renderizarse en cualquier tarea con `service_id` vinculado, porque el contexto de "este trabajo es sobre este servicio" es información valiosa independientemente del tipo.

#### Por qué `contact_client` y no `phone_call` ni `customer_outreach`

- `phone_call` excluye email/WhatsApp/in-app que también entran en la categoría.
- `customer_outreach` es marketing-speak; los agentes españoles no lo usan.
- `contact_client` es neutro, descriptivo, traducible (`Contactar cliente`).

#### Por qué tags y no segundo enum

Los tags los crea el admin desde Settings sin tocar código. Un segundo enum sería igual de rígido que el primero.

---

## Decisión

> Adoptar **Opción C**.

### Reglas canónicas

1. **El enum `TaskType` se mantiene cerrado** y representa "qué bloque/automatización activa la tarea", no "qué intención tiene el agente".
2. **El valor `wow_call` se renombra a `contact_client`** en backend, frontend, schema, tests, plantillas y docs. Migration SQL renombra el enum y propaga a las filas existentes. Las tareas migradas reciben `reason = 'Bienvenida primer servicio'` para preservar contexto.
3. **Toda tarea puede llevar `reason`** (texto libre, máx. 100 chars). Opcional. Visible en el detalle bajo el título y en el tablero (truncado a 60 chars).
4. **Toda tarea puede llevar 0..N tags**. Los tags los crean los admin (`Manage.TaskTag`) y los asignan los staff con `Manage.Task`. Los clientes/partners NO ven tags (igual que no ven tareas).
5. **El bloque adaptativo "Datos del cliente + plan"** deja de depender de `task.type` y pasa a renderizarse cuando `task.service_id` esté presente. Las tareas `contact_client` sin servicio (caso reportado por Yasmin: "llamar al cliente para coordinar setup antes de que compre") siguen siendo válidas, simplemente no muestran ese bloque.
6. **Los listeners del Sprint 11 (`WowCallCreatorListener`)** se renombran a `ContactClientTaskListener` y emiten `type=contact_client` con `reason='Bienvenida primer servicio'` + tag `bienvenida`. La SLA `tasks.unassigned_sla_hours.wow_call` (ADR-072 §"Reglas canónicas") se renombra a `tasks.unassigned_sla_hours.contact_client`.

### Modelo de datos canónico

```prisma
model Task {
  // ... campos existentes ...
  reason      String?        @db.VarChar(100)
  tag_assignments TaskTagAssignment[]
}

model TaskTag {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slug        String   @unique @db.VarChar(50)   // canónico kebab-case
  label       String   @db.VarChar(50)            // mostrable
  color       String?  @db.VarChar(7)             // hex opcional
  created_at  DateTime @default(now()) @db.Timestamptz()
  created_by  String?  @db.Uuid
  assignments TaskTagAssignment[]

  @@map("task_tags")
}

model TaskTagAssignment {
  task_id     String   @db.Uuid
  tag_id      String   @db.Uuid
  assigned_at DateTime @default(now()) @db.Timestamptz()
  task        Task     @relation(fields: [task_id], references: [id], onDelete: Cascade)
  tag         TaskTag  @relation(fields: [tag_id], references: [id], onDelete: Cascade)

  @@id([task_id, tag_id])
  @@index([tag_id])
  @@map("task_tag_assignments")
}
```

### API REST canónica

| Método | Ruta | Descripción | CASL |
|--------|------|-------------|------|
| `GET` | `/admin/task-tags` | Listar tags disponibles | `Read.TaskTag` |
| `POST` | `/admin/task-tags` | Crear tag (slug auto-generado del label si no se pasa) | `Manage.TaskTag` |
| `DELETE` | `/admin/task-tags/:id` | Eliminar tag (cascada borra assignments) | `Manage.TaskTag` |

CRUD avanzado (rename, color picker, fusión de tags duplicados) queda para Sprint 12 Settings (UI dinámica).

### CASL

- `Subject.TaskTag` — nuevo subject.
- `manage` para `superadmin` + `agent_full`. `read` para todo staff (necesitan listarlos para asignar).
- Clientes/partners: ninguno.

### UI

- **NewTaskModal**: input "Motivo (opcional)" debajo del título + multiselect tags con búsqueda (autocomplete sobre tags existentes + "Crear nuevo: <texto>" inline si la búsqueda no coincide con ninguno).
- **TaskDetail**: muestra `reason` como subtítulo bajo el `title`, en `--text-secondary`. Tags aparecen como chips bajo la cabecera, alineados con la fila de prioridad.
- **TaskTable**: nueva columna opcional "Etiquetas" (chips truncados, max 2 visibles + `+N`). El `reason` se muestra como segunda línea en negrita ligera bajo el título cuando existe.
- **Filtro tablero**: select multi de tags (en barra de filtros, junto a `type`).

---

## Consecuencias

### Positivas

- **Flexibilidad operativa real** sin sobre-ingeniería. Los agentes ven al fin tareas con contexto humano (`reason="Renovación hosting"`), no solo tipos abstractos.
- **Filtros más útiles**: el admin puede pivotar el tablero por tags ("ver todas las tareas de renovación de este mes").
- **Menor ruido en el enum**: nuevos contextos operativos = nuevo tag (1 click), no nuevo enum value (commit + migration + ADR).
- **Listeners desacoplados de nombres histórico**: `ContactClientTaskListener` describe lo que hace, `WowCallCreatorListener` describe una analogía.
- **Sprint 12 (Settings + KB) recibe la UI de gestión de tags** ya con el modelo de datos consolidado — extensión natural, no replanteo.

### Negativas / riesgos

- **Migración de tareas existentes** introduce 1 paso de SQL (`UPDATE tasks SET type = 'contact_client'::TaskType, reason = 'Bienvenida primer servicio' WHERE type = 'wow_call'`). Se ejecuta en la misma migration Prisma que renombra el enum.
- **Doc ADR-041 §"Tipos canónicos" queda parcialmente obsoleta**. Se actualiza con un §"Refina ADR-073" puntero. ADR-072 también recibe rename de SLA key.
- **Tests E2E que crean tareas con `type: 'wow_call'`** (3 archivos) deben migrar. Coste mecánico, no de diseño.
- **Tabla nueva `task_tags`** vive sin uso real hasta que el admin cree tags. Mientras tanto, la lista de selección está vacía. Mitigación: seedear 4-5 tags canónicos (`bienvenida`, `renovación`, `incidencia`, `migración`, `cortesía`) en `prisma/seeds/sample-task-tags.ts` para que la UI tenga semilla.

### Coste estimado

~1 sesión (Sprint 8 Fase B.7). Sin bloqueadores externos.

### Cuándo revisar

- Si en Sprint 12 (Settings + KB) se decide implementar Vía B (plantillas editables desde Settings), este ADR queda como paso intermedio: `task_templates.default_tags` y `task_templates.default_reason` pueden poblar las tareas creadas desde plantilla, conservando el modelo `reason+tags` introducido aquí.
- Si la lista de tags supera ~30 entradas con muchos duplicados (`renovacion` vs `renovación`, `migracion-hosting` vs `migracion_hosting`), priorizar la fusión + `slug` validation estricta antes que añadir más features.

---

## Referencias

- [ADR-041](./adr-041-sistema-tareas.md) §"Tipos canónicos" — refinada por este ADR (enum cerrado + dos ejes ortogonales: `reason` libre + `tags` extensibles).
- [ADR-072](./adr-072-tareas-sin-asignar-cola-publica.md) §"Reglas canónicas" — la SLA `tasks.unassigned_sla_hours.wow_call` se renombra a `.contact_client`.
- [ADR-061](./adr-061-support-inside-tier-cuenta-ux.md) — el tipo `support_setup` se preserva para Fase D Support Inside.
- [glossary.md](../00-foundations/glossary.md) — término "Task type" pasa a "qué bloque/automatización activa", no "qué intención tiene".
- [tasks/contract.md](../20-modules/tasks/contract.md) §3 — modelo de datos.
