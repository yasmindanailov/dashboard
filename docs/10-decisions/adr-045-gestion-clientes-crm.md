# ADR-045 — Gestión de clientes (CRM ligero)

> **Status:** Active
> **Date:** 2026-04 · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §15
> **Domain:** clients

---

## Contexto

Aelium maneja relaciones a largo plazo con sus clientes — un cliente típico tiene varios servicios activos durante años, mantenimientos mensuales, conversaciones de soporte, llamadas, emails, facturas. El agente que atiende debe ver **todo el contexto en una pantalla** para no preguntar lo mismo dos veces ni perderse información.

Las opciones de partida:

- **CRM externo (HubSpot, Pipedrive)** → potente pero desconectado de los datos operativos del dashboard. Sincronizar es trabajo continuo.
- **Sin CRM, fichas dispersas** → el agente salta entre módulos sin tener visión global → mala experiencia para todos.
- **CRM ligero integrado (ficha del cliente como vista agregadora)** → reaprovecha los datos del dashboard, sin sincronización, con bloques editables específicos del CRM (notas internas, contexto de negocio, etiquetas).

---

## Decisión

### Ficha del cliente — estructura canónica

```
Cabecera:
  Nombre · Email · Plan · Badge Support Inside (si tiene) · Badge partner (si aplica, ADR-048)

Datos básicos + facturación:
  NIF/CIF · dirección · tipo (particular/autónomo/empresa) · perfiles fiscales (ADR-060)

Contexto del negocio (campo libre editable por el equipo):
  "Qué hace su negocio" · notas internas · etiquetas

Servicios activos:
  Cada servicio con su estado · badge de slot activo si aplica

Historial completo de interacciones:
  Chats · tickets · llamadas (registro manual) · emails · notas estructuradas (ADR-038)

Estado de onboarding:
  Tarea WOW completada o pendiente

Alertas proactivas (generadas automáticamente):
  Dominio expira en X días
  Factura próxima a vencer
  Lleva X días sin usar su Nextcloud (heurística por audit log del servicio)
```

### Bloques agregados, no duplicados

La ficha **no tiene tablas propias** para servicios, facturas, tickets — los lee de los módulos correspondientes. Solo tiene tablas propias para:

- `client_profiles` — campos del CRM (contexto, notas, etiquetas, perfiles fiscales).
- `client_notes_structured` — notas categorizadas (ADR-038).
- `client_tags` — etiquetas (relación N:N).

Todo lo demás es **vista agregada** sobre `services`, `invoices`, `conversations`, etc.

### Organización de servicios por el cliente

- Los servicios se ven **siempre individualmente, nunca agrupados por defecto**.
- El cliente puede crear **carpetas y etiquetas opcionales** para organizar sus servicios (vista personalizada, no afecta a billing).
- Los agentes ven los servicios sin la organización del cliente — siempre lista plana con filtros.

### Onboarding del cliente

1. **Al registrarse:** ve su dashboard completo desde el primer acceso (no hay flujo bloqueante).
2. **Tarea WOW automática:** se genera tarea para el agente (`type = 'wow_call'`, plazo 24h, ADR-041).
3. **Al contratar producto con slot de mantenimiento:** se le pide seleccionar o crear el servicio a asignar.

### Alertas proactivas

Generadas por jobs cron que ejecutan reglas heurísticas:
- Dominio expira en X días → alerta amarilla (X configurable).
- Factura vence en Y días → alerta amarilla (Y configurable).
- Sin uso en Z días (último audit en `audit_service_log`) → alerta gris (cliente posiblemente inactivo).

Las alertas son **informativas para el agente** — no disparan acciones automáticas (no se cancela el servicio porque no se use).

### Portal de transparencia del cliente (RGPD)

Ver ADR-010. La ficha del cliente lo expone:
- Historial de accesos a su ficha.
- Historial de cambios en sus datos.
- Integraciones externas activas.
- Exportación de todos sus datos (RGPD).
- Solicitud de eliminación (genera tarea interna → anonimización, no borrado).
- Audit log de cada servicio.

---

## Consecuencias

- ✅ **Ganamos:**
  - Vista 360° del cliente sin sincronización con sistema externo.
  - Cero coste extra (no pagamos CRM SaaS).
  - Notas, etiquetas y contexto vivo donde el agente trabaja, no en otra app.
  - Alertas proactivas sin afectar billing — el agente decide qué hacer.
- ⚠️ **Aceptamos:**
  - Funcionalidad **limitada respecto a un CRM completo** (no hay pipelines de venta, no hay scoring, no hay automatización avanzada de workflows). Aceptable: Aelium opera mayormente reactivo (responde a clientes), no comercial outbound.
  - Las alertas heurísticas pueden generar ruido (cliente que no usa Nextcloud porque está de vacaciones). Mitigación: el agente decide; no se actúa automáticamente.
  - **Organización de servicios por cliente** vive solo en la vista del cliente — el agente no la ve. Si esto resulta confuso, exponerla como referencia (no decisión) en la ficha del agente.
- 🚪 **Cierra:**
  - **No CRM externo a sincronizar.** Decisión arquitectónica: la ficha del cliente vive en el dashboard.
  - **No agrupar servicios automáticamente.** Cliente decide; agente ve plano.
  - **No usar el CRM para outbound comercial** — Aelium no es una herramienta de ventas masivas.

---

## Cuándo revisar

- Si Aelium pivota a estrategia comercial outbound activa → considerar integración con un CRM dedicado (HubSpot, Pipedrive) o ampliar este módulo con pipelines.
- Si se introduce módulo Partner (ADR-048..054) → la ficha del cliente del partner reutiliza esta estructura con vista filtrada (solo lectura).
- Si los agentes piden vistas personalizadas de cliente (filtros guardados, columnas custom) → considerar feature de "vistas personalizadas".

---

## Referencias

- **Módulos afectados:** clients (productor de la ficha), services/billing/support/tasks (consumidores agregados), audit (transparencia).
- **Reglas relacionadas:** R1 (módulos por eventos), R3 (audit log), R5 (cálculos en backend).
- **ADRs relacionados:** ADR-010 (RGPD — portal de transparencia), ADR-017 (audit log inmutable), ADR-038 (notas estructuradas), ADR-041 (tasks — WOW call), ADR-048 (partner — usa esta ficha), ADR-060 (perfiles fiscales).
- **Glosario:** [Cliente](../00-foundations/glossary.md), [Ficha](../00-foundations/glossary.md), [Slot](../00-foundations/glossary.md).
- **Implementación:** `backend/src/modules/clients/`, `docs/20-modules/clients/contract.md`.
