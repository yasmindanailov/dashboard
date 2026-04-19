# SESSION_RULES.md — Reglas para el agente IA

> Se lee al inicio de cada sesión. Contiene reglas operativas
> que NO están en ARCHITECTURE.md ni DECISIONS.md.
> Actualizado: Sprint 2 (Abril 2026)

---

## Regla 0 — No abrir el navegador sin permiso

El agente NO abre el navegador por su cuenta.
El usuario abrirá el navegador y dará feedback visual cuando sea necesario.

---

## Regla 1 — Documentar cada feature

Cada feature completado genera documentación en `docs/features/[módulo]/`.

| Audiencia | Archivo | Cuándo |
|-----------|---------|--------|
| **Admin** | admin.md | Siempre |
| **Agente** | agent.md | Cuando el feature es operativo para agentes |
| **Cliente** | client.md | Cuando el feature es visible para clientes |

Se escribe AL COMPLETAR el feature, no después.

---

## Regla 2 — Orden de lectura al iniciar sesión

1. `docs/ROADMAP.md` — saber qué toca hacer
2. `docs/DECISIONS.md` — lógica de negocio del módulo en curso
3. Este archivo — reglas operativas
4. Los archivos del módulo que se va a tocar

---

## Regla 3 — Si hay ambigüedad, preguntar

Si una regla de negocio no está en DECISIONS.md → **preguntar al usuario**.
No inventar lógica de negocio. No asumir flujos que no estén documentados.

---

## Regla 4 — Validar el roadmap al cerrar un sprint

Al completar cada sprint, el agente DEBE:

1. **Commit** con mensaje descriptivo del sprint.
2. **Actualizar ROADMAP.md**: marcar pasos como ✅, añadir hash del commit.
3. **Escribir admin.md** en `docs/features/[módulo]/`.
4. **Verificar coherencia** entre ROADMAP.md, ARCHITECTURE.md y DECISIONS.md.
5. **Notificar al usuario** qué se completó y qué sigue.

Si algún documento tiene información contradictoria con la implementación actual,
corregirlo ANTES de avanzar al siguiente sprint.

---

## Limitaciones conocidas y mitigaciones

| Limitación | Mitigación |
|------------|------------|
| Pérdida de contexto en sesiones largas | Cada sesión = un sprint o menos. Documentar decisiones ANTES de implementar. |
| No hay memoria entre sesiones | Los .md del proyecto son la fuente de verdad. Los Knowledge Items dan contexto. |
| Errores en lógica de negocio compleja | TDD para billing, prorrateo, descuentos. Si no está en DECISIONS.md, preguntar. |
| Migrations destructivas | Siempre `prisma migrate dev --create-only` para revisar SQL. Seeds idempotentes. |
| Diseño visual requiere feedback humano | Describir qué debería verse, pedir al usuario que abra el navegador. |
| Exceso de tokens | Pasos pequeños, archivos uno a la vez, no generar bloques de código > 200 líneas. |

---

## Design system del dashboard

```
LANDING (marketing)              →  DASHBOARD (herramienta)
Botones pill (radius full)       →  Botones radius 8px
Glass cards con glow             →  Cards sólidas, border sutil
Animaciones con delay            →  Transiciones solo de estado
Gradient mesh backgrounds        →  Fondos planos (#FFF y #F7F7F8)
Floating island nav              →  Sidebar fija izquierda
```

**Excepción:** La página de login usa la Aurora Digital en layout split-screen.

### Paleta

```
Brand:            #3B82F6
Brand hover:      #2563EB
Brand light:      #DBEAFE
Brand subtle:     rgba(59, 130, 246, 0.06)
Surface primary:  #FFFFFF
Surface secondary: #F7F7F8
Text primary:     #0A0A0B
Text secondary:   #6B7280
Text tertiary:    #9CA3AF
Border:           rgba(0, 0, 0, 0.06)
```

### Tipografía
DM Sans — pesos: 400 (body) · 500 (botones) · 600 (headings)

> Stack completo y versiones exactas: ver ARCHITECTURE.md.

---

## Workflow de desarrollo

```
1. docker compose -f docker/docker-compose.dev.yml up -d
   → PostgreSQL :5432 · Redis :6379 · MailPit :8025 (UI) :1025 (SMTP)

2. cd backend && pnpm run dev
   → API en localhost:3001 · Swagger en localhost:3001/api/v1/docs

3. cd frontend && pnpm run dev
   → Dashboard en localhost:3002
```

---

## Commits

```
feat:     nueva funcionalidad
fix:      corrección de bug
chore:    configuración, deps, scaffolding
docs:     documentación
refactor: reestructuración sin cambio funcional
test:     tests
```

---

## Documentos del proyecto

| Archivo | Contenido |
|---------|-----------|
| `ARCHITECTURE.md` | Stack, módulos, 13 reglas arquitectónicas |
| `DECISIONS.md` | Lógica de negocio completa (fuente de verdad) |
| `DATABASE_SCHEMA.md` | Schema de la base de datos |
| `ROADMAP.md` | Plan de ejecución con pasos granulares |
| `SESSION_RULES.md` | Este archivo — reglas operativas del agente |
| `features/` | Documentación por módulo y audiencia |
