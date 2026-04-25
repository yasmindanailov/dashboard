# ADR-009 — Estrategia de plugins (interface en core, implementación intercambiable)

> **Status:** Active
> **Date:** 2026-04 (origen) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §28 (parcial) + Regla R4
> **Domain:** foundation, architecture

---

## Contexto

Aelium integra con varias APIs externas que pueden cambiar:

- **Pagos:** Stripe hoy, mañana posiblemente Redsys (cumplimiento bancario español), Gocardless (SEPA), o un agregador local.
- **Provisioners:** Enhance CP para hosting, ResellerClub para dominios, Docker Engine para contenedores. Cada uno puede ser sustituido si cambia el proveedor.
- **Notificaciones:** email (nodemailer + SMTP) hoy, WhatsApp y SMS futuros.
- **IA:** Claude API hoy, otros LLMs futuros.

Si el core importa directamente `import { Stripe } from 'stripe'`, cambiar de proveedor implica refactor cross-módulo. La migración se vuelve cara y arriesgada.

---

## Opciones consideradas

1. **Acoplamiento directo** (importar el SDK del proveedor en el código de negocio).
   - Pros: simple inicialmente.
   - Contras: cambiar proveedor = tocar todos los servicios. Tests requieren mockear el SDK externo.

2. **Adapter pattern ad hoc** (cada integración con su propio adapter, sin estándar).
   - Pros: poco planning inicial.
   - Contras: inconsistencia entre adapters; cada uno hace las cosas a su manera.

3. **(Elegida)** **Plugin pattern formal**: el core define una **interface** por dominio (PaymentProvider, ProvisionerPlugin, NotificationChannel, AIProvider), las implementaciones viven en `backend/src/plugins/<dominio>/<proveedor>/`, el core las inyecta vía configuración.
   - Pros: cambiar proveedor = cambiar config (sin tocar core). Testabilidad alta. Patrón consistente.
   - Contras: requiere disciplina para mantener la interface estable.

---

## Decisión

### Estructura de plugins

```
backend/src/plugins/
├── payment/
│   ├── manual/         ← activo (admin marca como pagada)
│   ├── stripe/         ← futuro
│   └── redsys/         ← futuro
├── provisioners/
│   ├── enhance-cp/     ← hosting web
│   ├── resellerclub/   ← dominios
│   ├── docker-engine/  ← contenedores
│   └── manual/         ← activación manual del admin
├── notification-channels/
│   ├── email/          ← activo (nodemailer + SMTP)
│   ├── whatsapp/       ← futuro
│   └── sms/            ← futuro
└── ai-providers/
    └── claude/         ← activo (Claude API de Anthropic)
```

### Reglas (Regla R4)

1. **El core define la interface**, no el plugin. La interface vive en `backend/src/modules/<dominio>/interfaces/<dominio>-plugin.interface.ts` (ej: `payment-provider.interface.ts`).
2. **Los plugins implementan la interface.** Cada plugin tiene su propio módulo NestJS y sus dependencias propias (`stripe` en `package.json` solo si Stripe está activo).
3. **El core nunca importa directamente** un plugin concreto. La inyección se hace vía configuración:
   ```typescript
   // ✅ CORRECTO en código del core
   import { PaymentProviderInterface } from '../core/interfaces/payment-provider.interface';
   constructor(@Inject('ACTIVE_PAYMENT_PROVIDER') private payment: PaymentProviderInterface) {}

   // ❌ INCORRECTO
   import { StripePlugin } from '../plugins/payment/stripe';
   ```
4. **El plugin activo se elige en config** (variable de entorno o setting de DB). Cambiar proveedor = cambiar config + reiniciar.
5. **Solo un plugin activo por dominio a la vez** (una payment provider, un provisioner por tipo de producto). El sistema de plugins NO soporta múltiples activos simultáneos en la misma categoría.
6. **Manifest mínimo del plugin:** cada carpeta de plugin tiene un `manifest.ts` o equivalente que declara: nombre, label visible, configuración requerida (env vars, settings), capacidades. Permite UI futura de "marketplace de plugins".

### Implementación actual

| Dominio | Activos hoy | Pendientes |
|---------|-------------|------------|
| payment | `manual` (admin marca pagada) | Stripe (sprint dedicado post-Sprint 14) |
| provisioner | (ninguno todavía — checkout deja servicio en estado `pending` y admin lo activa manualmente) | enhance-cp, resellerclub, docker-engine |
| notification-channel | `email` | whatsapp, sms |
| ai-provider | (no activo — listeners de IA no implementados) | claude (Sprint 15) |

---

## Consecuencias

- ✅ **Ganamos:**
  - Cambiar Stripe → Redsys = cambiar config, sin tocar `BillingService`.
  - Tests del core con stub plugin (`manual`) sin necesidad de mockear el SDK del proveedor.
  - Cada plugin tiene sus dependencias en su carpeta, sin inflar `package.json` del core.
  - Patrón consistente facilita IA copilots (Claude) entender qué hacer al añadir un plugin nuevo.
- ⚠️ **Aceptamos:**
  - Disciplina: cualquiera puede romper el patrón importando un SDK directo. CI debe vigilar (futuro: lint rule "no import from /plugins en /modules").
  - Interfaces deben ser estables: cambiarlas obliga a actualizar todos los plugins existentes.
- 🚪 **Cierra:**
  - **No `import { Stripe } from 'stripe'`** en código de negocio. Solo dentro de `plugins/payment/stripe/`.

---

## Cuándo revisar

- Si el patrón se vuelve burocrático para una integración trivial: evaluar si la integración merece plugin formal o puede ser un servicio inyectado simple.
- Si surgen dominios nuevos donde el plugin pattern sea útil (ej: storage providers, analytics providers): añadir carpeta y interface.

---

## Referencias

- **Módulos afectados:** billing (payment), provisioning (provisioners — futuro), notifications (channels), modules con IA.
- **Reglas relacionadas:** R4 (plugins), R1 (módulos por eventos).
- **ADRs relacionados:** ADR-002 (stack), ADR-021 (provisioners), ADR-031 (payment provider Stripe), ADR-057 (agentes IA).
- **Glosario:** [Plugin](../00-foundations/glossary.md), [Provisioner](../00-foundations/glossary.md), [Payment provider](../00-foundations/glossary.md).
- **Interface ejemplo:** `backend/src/modules/billing/interfaces/payment-provider.interface.ts`.
