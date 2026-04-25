# ADR-018 — Catálogo dinámico de productos

> **Status:** Active
> **Date:** 2026-04 (origen) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §6
> **Domain:** products

---

## Contexto

Aelium vende varios tipos de productos (hosting web, dominios, contenedores Docker, addons de soporte, servicios manuales como desarrollo web). Cada uno con su propio provisioner, su pricing, sus reglas de negocio.

Dos opciones extremas:

- **Hardcoded:** "Aelium tiene 3 planes de hosting más 2 de Docker más Support Inside". Cualquier cambio = redeploy.
- **Totalmente dinámico:** el superadmin crea cualquier producto desde el dashboard, sin tocar código.

Hardcoded es rápido inicialmente pero rígido. Dinámico es trabajo extra inicial pero libera al equipo de redeploy por cada cambio de catálogo.

---

## Opciones consideradas

1. **Catálogo hardcoded** en seed o constantes.
   - Pros: simple. Tests más fáciles (data conocida).
   - Contras: cada producto nuevo = código + deploy. Decisiones de marketing dependen de releases.

2. **Catálogo semi-dinámico** (productos hardcoded, precios y descripciones editables).
   - Pros: balance.
   - Contras: ambigüedad. ¿Cuándo "es producto nuevo" vs "es variante editable"?

3. **(Elegida)** **Catálogo 100% dinámico.** Ningún producto hardcodeado. El superadmin crea productos desde el dashboard, define tipo, precio, ciclos, extras, configuración del provisioner.
   - Pros: máxima flexibilidad. El equipo de marketing/operaciones cambia el catálogo sin involucrar al equipo técnico.
   - Contras: requiere construir UI completa de gestión de productos. El sistema asume cualquier configuración válida.

---

## Decisión

### Principio fundamental

**Ningún producto hardcodeado.** Todo se crea y configura desde el dashboard por el `superadmin`.

### Tipos de producto soportados

Definidos como enum `ProductType`:

| Tipo | Provisioner | Descripción |
|------|-------------|-------------|
| `hosting_web` | `enhance_cp` | Hosting compartido B2C / B2B |
| `domain` | `resellerclub` | Registro de dominios |
| `docker_service` | `docker_engine` | Contenedores Docker (Cloud Office, OpenClaw, etc.) |
| `support_inside` | `internal` | Addon global de cuenta — soporte gestionado |
| `manual_service` | `manual` | Servicios sin provisioning automático (dev web, etc.) |
| `support_addon` | `internal` | Addons de soporte (slots de mantenimiento) |
| `we_do_it` | (deprecado por §44 — proyectos) | Addon vinculable a hosting/docker — superseded |

### Configuración por producto (3 bloques)

Cada producto tiene 3 bloques de configuración al crearse:

**1. Presentación**
Nombre · descripción · precio base · ciclos de facturación · imagen · características visibles · badge · orden en catálogo.

**2. Provisioning**
Driver asignado · parámetros del driver · tiempo máximo · acción si falla (reintentar / alerta admin) · plantilla `.yaml` (si Docker).

**3. Reglas de negocio**
Requiere dominio al contratar · es addon de otro producto · límite de cantidad · período de prueba · qué pasa al cancelar · checklist base de mantenimiento · eventos de audit log del servicio · bloques custom de API para métricas.

### Ciclos de facturación

- **Mensual** y **anual** como base. Otros ciclos posibles (`quarterly`, `semiannual`, `one_time`).
- Descuento por pago anual configurable por producto (porcentaje o precio fijo).
- **Renovación en aniversario** del servicio — nunca en fecha fija global.

### Catálogo actual (ejemplos, no hardcoded)

```
HOSTING WEB B2C: Web Inicio · Web Pro · Web Business
HOSTING B2B agency: planes de hosting con descuento partner (ADR-024)
DOMINIOS: producto independiente
CLOUD OFFICE: Nextcloud sobre Docker
DOCKER SERVICE: OpenClaw y futuros
SUPPORT INSIDE: addon global (ADR-034)
DESARROLLO WEB: manual sin provisioning automático
```

---

## Consecuencias

- ✅ **Ganamos:**
  - El catálogo evoluciona sin redeploy.
  - El superadmin puede experimentar con nuevos productos sin involucrar al equipo técnico.
  - Cada producto puede definir sus propios eventos de audit log → `audit_service_log` ya documenta cualquier producto nuevo.
- ⚠️ **Aceptamos:**
  - Construir UI de gestión de productos es trabajo de Sprint 5.
  - El sistema debe asumir cualquier configuración válida → tests deben cubrir varias configuraciones.
  - Algunas decisiones de UI dependen del tipo (ej: el detalle de hosting muestra dominio, el de Docker muestra recursos) → switch por `type` en frontend.
- 🚪 **Cierra:**
  - **No productos hardcoded** en `seed.ts` o constantes. Solo categorías y settings globales.
  - **No mezclar tipo de producto en runtime.** Una vez creado, `type` es inmutable (PROD-INV-2 / EC-2).

---

## Cuándo revisar

- Si surge un tipo de producto que no encaja en los provisioners existentes (ej: licencias SaaS de terceros, hardware físico) → añadir tipo + provisioner.
- Si el catálogo crece tanto que la UI de gestión se vuelve tortuosa → mejorar UI o paginar.

---

## Referencias

- **Módulos afectados:** products, billing (consume catálogo), provisioning (futuro).
- **Reglas relacionadas:** R4 (plugins).
- **ADRs relacionados:** ADR-019 (configuración detallada), ADR-020 (categorías y extras), ADR-021 (provisioners), ADR-022 (WDIFY → proyectos), ADR-024 (hosting agency eliminado), ADR-034 (Support Inside).
- **Glosario:** [Producto](../00-foundations/glossary.md), [Servicio](../00-foundations/glossary.md), [Plan / Pricing](../00-foundations/glossary.md), [Provisioner](../00-foundations/glossary.md).
- **Implementación:** `backend/src/modules/products/`, schema Prisma `Product` + `ProductPricing` + `ProductExtra`.
