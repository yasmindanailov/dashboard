# SESSION_RULES.md — Reglas para el agente IA en cada sesión
> Este documento lo lee el agente IA al inicio de cada sesión.
> Contiene reglas operativas, limitaciones conocidas, y decisiones de diseño
> que NO están en ARCHITECTURE.md ni DECISIONS.md.
> Versión 1.0 | Abril 2026

---

## REGLA 0 — NO ABRIR EL NAVEGADOR SIN PERMISO

El agente NO abre el navegador por su cuenta.
Siempre pide permiso al usuario antes de abrir cualquier URL.
El usuario abrirá el navegador y dará feedback visual cuando sea necesario.

---

## REGLA 1 — DOCUMENTAR CADA FEATURE AL IMPLEMENTARLO

Cada feature completado genera documentación **obligatoria** antes de considerarse terminado.
La documentación vive en `docs/features/` organizada por módulo.

### Estructura de documentación por feature

```
docs/features/
├── auth/
│   ├── admin.md          ← Cómo funciona para el superadmin
│   ├── agent.md          ← Cómo lo usa el agente (cuando aplique)
│   └── client.md         ← Cómo lo ve y usa el cliente
├── billing/
│   ├── admin.md
│   ├── agent.md
│   └── client.md
├── products/
│   ├── admin.md
│   └── ...
└── ...
```

### Tres audiencias, tres documentos

| Audiencia | Qué documenta | Tono |
|-----------|---------------|------|
| **Admin** (superadmin) | Cómo funciona el feature en detalle. Configuración, reglas de negocio, qué hace cada campo, flujos internos, qué eventos se emiten, cómo afecta a otros módulos. | Técnico pero claro. Sin jerga de código. |
| **Agente** (agent_full, agent_billing, agent_support) | Cómo usar el feature en su trabajo diario. Dónde encontrarlo, qué acciones tiene, qué ve según su rol, qué NO puede hacer. | Operativo, paso a paso, con ejemplos. |
| **Cliente** | Cómo usar el feature desde su dashboard. Qué ve, qué puede hacer, qué significan los estados, cómo resolver problemas comunes. | Sencillo, cercano, sin tecnicismos. En la voz de Aelium. |

### Reglas de la documentación

1. **Se escribe AL COMPLETAR el feature**, no después. Es parte del Definition of Done.
2. **admin.md siempre se escribe.** agent.md y client.md se escriben cuando el feature es visible para esas audiencias.
3. **Incluye screenshots o mockups** cuando sea visual (descritos en texto si no se puede capturar).
4. **Se actualiza si el feature cambia.** Documentación desactualizada es peor que no tener documentación.
5. **Sirve de base para:** la documentación interna de soporte (knowledge_base) y la ayuda del dashboard para el cliente.

---

## LIMITACIONES DEL AGENTE — MITIGACIONES

### 1. Pérdida de contexto en sesiones largas
**Problema:** En sesiones muy largas, el agente puede olvidar decisiones tomadas al principio.
**Mitigación:**
- Al inicio de cada sesión: leer ARCHITECTURE.md, DECISIONS.md, y este archivo.
- Cada decisión nueva se documenta en el archivo correspondiente ANTES de implementarla.
- Una sesión = un módulo o un sprint. No mezclar trabajo de módulos distintos.

### 2. No hay memoria entre sesiones
**Problema:** Cada conversación empieza desde cero.
**Mitigación:**
- Los Knowledge Items (KI) del workspace almacenan contexto entre sesiones.
- Los archivos .md del proyecto son la fuente de verdad.
- Nunca asumir que se recuerda algo de una sesión anterior sin verificar en los docs.

### 3. Errores en lógica de negocio compleja
**Problema:** La lógica de prorrateo, facturación, promociones, y slots es compleja. El agente puede generar código incorrecto.
**Mitigación:**
- Cada regla de negocio tiene tests unitarios ANTES de implementarse.
- El enfoque es TDD para lógica crítica: billing, prorrateo, descuentos, slots.
- Si la regla no está en DECISIONS.md → PREGUNTAR, no inventar.

### 4. Prisma migrations pueden ser destructivas
**Problema:** Un error en el schema Prisma puede perder datos.
**Mitigación:**
- Siempre usar `prisma migrate dev --create-only` para revisar la SQL antes de aplicar.
- Nunca eliminar columnas sin deprecar primero (patrón expand-contract).
- Los seeds deben ser idempotentes (ejecutar dos veces = mismo resultado).

### 5. CSS/diseño visual requiere feedback humano
**Problema:** El agente no puede verificar visualmente el resultado sin abrir el navegador.
**Mitigación:**
- El agente describe qué debería verse y pide al usuario que abra el navegador.
- Los tokens de diseño están documentados (ver sección siguiente).
- Si hay duda visual → pedir screenshot al usuario.

### 6. Un solo archivo a la vez
**Problema:** Editar el mismo archivo en paralelo causa conflictos.
**Mitigación:**
- Nunca hacer múltiples ediciones paralelas al mismo archivo.
- Verificar el estado del archivo antes de editarlo.

---

## DISCREPANCIA RESUELTA — Color principal

Los documentos del dashboard (ARCHITECTURE.md) dicen `#4b77bb`.
La landing real (globals.css) usa `#3B82F6`.

**DECISIÓN: el color principal es `#3B82F6`.**
La landing es la fuente de verdad visual. ARCHITECTURE.md se actualizará al iniciar el Sprint 0.

Paleta completa heredada de la landing:
```
Brand:            #3B82F6
Brand hover:      #2563EB
Brand light:      #DBEAFE
Brand subtle:     rgba(59, 130, 246, 0.06)
Surface primary:  #FFFFFF
Surface secondary: #F7F7F8
Surface dark:     #0A0A0B
Text primary:     #0A0A0B
Text secondary:   #6B7280
Text tertiary:    #9CA3AF
Border:           rgba(0, 0, 0, 0.06)
```

## DISCREPANCIA RESUELTA — Pesos tipográficos

ARCHITECTURE.md dice pesos 400 y 500.
La landing usa 400, 500, y 600.

**DECISIÓN: se usan los tres pesos: 400 (body) · 500 (botones, títulos) · 600 (headings).**

---

## DESIGN SYSTEM DEL DASHBOARD — DIFERENCIAS CON LA LANDING

El dashboard hereda la identidad visual de la landing pero adapta componentes para UX de herramienta:

```
LANDING (marketing)              →  DASHBOARD (herramienta)
──────────────────                  ──────────────────────
Botones pill (radius full)       →  Botones radius 8px
Glass cards con glow             →  Cards sólidas, border sutil
Animaciones con delay            →  Transiciones solo de estado
Gradient mesh backgrounds        →  Fondos planos (#FFF y #F7F7F8)
Floating island nav              →  Sidebar fija izquierda
Lenis smooth scroll              →  Scroll nativo del navegador
Texto hero 80px                  →  Títulos máximo 24-32px
```

**EXCEPCIÓN:** La página de login usa la animación Aurora Digital (GradientMesh.tsx de la landing)
en un layout split-screen. Es el único lugar del dashboard con esa animación.

---

## STACK CONFIRMADO (versiones verificadas abril 2026)

```
Node.js:          24.14.1
pnpm:             10.33.0
Docker:           29.4.0
Docker Compose:   5.1.1
Git:              2.53.0

NestJS:           11.1.x (instalar al crear backend)
Next.js:          16.2.x (instalar al crear frontend)
Prisma:           7.7.x  (moduleFormat = "cjs" obligatorio para NestJS)
Tailwind CSS:     4.x    (mismo que la landing)
shadcn/ui:        latest
```

---

## WORKFLOW DE DESARROLLO

```
1. Levantar servicios:  docker compose -f docker/docker-compose.dev.yml up -d
2. Backend:             cd backend && pnpm run dev     (localhost:3001)
3. Frontend:            cd frontend && pnpm run dev    (localhost:3000)
4. Landing existente:   web2v1 en localhost:3000 (conflicto de puerto → usar 3002 para frontend del dashboard)
```

> [!IMPORTANT]
> El frontend del dashboard corre en **localhost:3002** para no chocar con la landing que usa :3000.

---

## REGLAS DE COMMITS

```
feat:     nueva funcionalidad
fix:      corrección de bug
chore:    configuración, deps, scaffolding
docs:     documentación
refactor: reestructuración sin cambio de funcionalidad
test:     tests
```

---

*Actualizar este documento ante cualquier regla nueva o limitación descubierta.*
