# Módulos — Aelium Dashboard

> **Documentación técnica de cada módulo del backend** y de cómo se conectan entre ellos.
> Es el doc que un agente IA (o un dev nuevo) necesita para entender qué cambia cuando toca un módulo, qué emite, qué consume, qué invariantes respeta.

---

## Cómo está organizada esta carpeta

```
docs/20-modules/
├── README.md                  ← este archivo (índice + cómo usar)
├── _matrix.md                 ← matriz de dependencias entre módulos
├── _events.md                 ← catálogo único de eventos del sistema
├── _template-contract.md      ← plantilla canónica para nuevos contracts
│
├── auth/
│   ├── contract.md            ← API pública, eventos, dependencias, invariantes
│   └── admin.md               ← (cuando se migre desde docs/features/auth/)
├── billing/
│   ├── contract.md
│   ├── admin.md
│   └── client.md
├── clients/
│   ├── contract.md
│   └── admin.md
├── support/
│   ├── contract.md
│   └── admin.md
├── products/
│   ├── contract.md
│   └── admin.md
├── tasks/
│   └── contract.md
├── dashboard/
│   └── contract.md
└── partner/
    └── contract.md            ← (futuro, módulo en plan)
```

---

## Qué contiene cada `contract.md`

Plantilla canónica en [`_template-contract.md`](./_template-contract.md). Cada contract responde a las mismas preguntas:

| Sección | Pregunta que responde |
|---------|----------------------|
| **Propósito** | ¿Qué hace este módulo en el sistema? |
| **Estado** | ¿Implementado / parcial / stub? |
| **Modelos Prisma propios** | ¿De qué tablas es dueño? |
| **Modelos foráneos accedidos** | ¿A qué tablas ajenas accede y por qué? (legítimo o pendiente refactor) |
| **API REST expuesta** | ¿Qué endpoints HTTP ofrece? |
| **WebSocket gateway** (si aplica) | ¿Qué eventos cliente↔servidor? |
| **Eventos emitidos** | ¿Qué eventos publica al bus? |
| **Eventos consumidos** | ¿Qué eventos escucha? |
| **Servicios consumidos** | ¿Qué servicios ajenos invoca? (debería ser ninguno por R1) |
| **CASL (permisos)** | ¿Qué Subjects gestiona? ¿Qué pueden hacer los roles? |
| **Settings consumidos** | ¿Qué configuraciones lee? |
| **Emails enviados** | ¿Qué notificaciones envía? |
| **Jobs / cron** | ¿Qué procesos programados ejecuta? |
| **Invariantes** | ¿Qué reglas NUNCA pueden romperse? (ej: "factura nunca se elimina") |
| **Decisiones relacionadas** | Referencias a ADRs o secciones de DECISIONS.md |
| **Excepciones documentadas** | ¿Hay desviaciones legítimas de las reglas R1-R16? |

---

## Cómo se usa en el día a día

### Para Claude (agente IA)
- **Antes de tocar un módulo:** leer su `contract.md` completo
- **Antes de añadir un evento nuevo:** comprobar que no existe en `_events.md` y añadirlo allí + en `contract.md` del emisor
- **Antes de cambiar el contrato:** documentar el cambio (commit y, si es decisión arquitectónica, ADR)
- **Si encuentras una violación de R1:** flagged en `_matrix.md` o reportarla

### Para Yasmin (operador del proyecto)
- **Para entender qué cambia cuando se toca un módulo:** leer el `contract.md` del módulo
- **Para identificar impacto de un cambio:** mirar `_matrix.md` y ver quién depende de él
- **Para auditar el sistema:** `_events.md` es el "mapa" del sistema completo

---

## Convenciones

### Naming de archivos
- `contract.md` — siempre así. Una sola plantilla en todos los módulos.
- `admin.md` — guía operativa para administradores (la que ya existe en `docs/features/<mod>/admin.md`, a migrar).
- `client.md` — solo si hay funcionalidad expuesta a cliente final con flujos diferenciados (hoy: solo billing).
- `internals.md` — opcional, detalles técnicos profundos. No obligatorio.

### Cuándo crear un contract nuevo
- Cuando se crea un módulo nuevo (con su `*.module.ts` en backend/src/modules/)
- ANTES de empezar la implementación, no después. El contract es el plan.

### Cuándo actualizar un contract existente
- Cada vez que cambias la API pública (endpoints, eventos, servicios públicos)
- Cuando añades un settings consumido nuevo
- Cuando cambias una invariante (esto requiere ADR adicional)

### Cuándo NO actualizar un contract
- Refactorización interna que no cambia la API pública (división en sub-services, optimización de queries)
- Renombrado de variables internas

---

## Validación automática (futuro — no implementado todavía)

Cuando F4 esté maduro, podemos añadir gates de CI que verifiquen:

- Cada `contract.md` cita eventos que SÍ existen en `_events.md`
- Cada evento de `_events.md` tiene al menos un emisor real en código
- Endpoints declarados en `contract.md` existen como `@Get/@Post/...` en código
- Servicios declarados como dependencias existen en `*.module.ts`

Esto evita que la doc mienta a medida que el código evoluciona. Pendiente para sprint dedicado.

---

## Documentos relacionados

- [`docs/00-foundations/rules.md`](../00-foundations/rules.md) — Reglas R1–R16 que estos contracts deben respetar
- [`docs/00-foundations/glossary.md`](../00-foundations/glossary.md) — Términos canónicos que se usan en los contracts
- [`docs/10-decisions/`](../10-decisions/) — ADRs (cuando se ejecute F2)
- [`docs/30-data/`](../30-data/) — Schema partido por dominio (cuando se ejecute F3)
- [`docs/DECISIONS.md`](../DECISIONS.md) — Decisiones de producto actuales (a migrar a ADRs en F2)
