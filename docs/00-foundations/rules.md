# Reglas — Aelium Dashboard

> **Documento canónico de reglas no-negociables del proyecto.**
> Si alguna instrucción de una sesión contradice estas reglas, prevalecen estas reglas.
> Toda nueva línea de código (Claude o humano) debe respetarlas.

> **Cómo se identifican:**
> - **R1–R16** — Reglas de arquitectura técnica (backend, infraestructura, datos, seguridad)
> - **D1–D11** — Reglas de diseño visual / UI / UX
>
> Los IDs originales se preservan: ya están referenciados en commits, ROADMAP y código.

---

## Índice rápido

### Arquitectura técnica

| ID | Tema | Una línea |
|----|------|-----------|
| [R1](#r1--comunicación-entre-módulos-solo-vía-eventos) | Eventos | Módulos no se llaman entre sí, solo emiten/escuchan eventos |
| [R2](#r2--todo-proceso-lento-va-a-la-cola-bullmq) | Colas | Todo proceso > 200ms va a BullMQ |
| [R3](#r3--el-audit-log-es-inmutable) | Auditoría | Tablas `audit` solo permiten INSERT |
| [R4](#r4--los-plugins-implementan-su-interfaz-el-core-no-los-conoce) | Plugins | Core llama a interfaz, nunca al plugin concreto |
| [R5](#r5--ninguna-lógica-de-negocio-en-el-frontend) | Separación | Frontend no calcula, solo muestra |
| [R6](#r6--la-api-es-stateless) | Estado | Estado vive en Postgres y Redis, no en memoria del servidor |
| [R7](#r7--todos-los-errores-se-registran-y-notifican) | Errores | Cada excepción → log + notificación + mensaje al usuario |
| [R8](#r8--eventos-críticos-usan-outbox-pattern) | Outbox | Eventos críticos persisten en `event_outbox` en la misma transacción |
| [R9](#r9--todo-request-lleva-correlation-id) | Trazabilidad | Cada request HTTP propaga un correlation ID UUID |
| [R10](#r10--rate-limiting-en-todos-los-endpoints) | Rate limiting | Cada endpoint con límite, restrictivo en sensibles |
| [R11](#r11--circuit-breaker-en-llamadas-a-apis-externas) | Resiliencia | APIs externas con circuit breaker |
| [R12](#r12--credenciales-encriptadas-con-aes-256-gcm) | Cifrado | Credenciales con AES-256-GCM, clave en env |
| [R13](#r13--los-jobs-fallidos-nunca-desaparecen) | Jobs | Jobs fallidos persisten + notifican al superadmin |
| [R14](#r14--error-handling-visible-en-el-frontend) | UX errores | Frontend nunca traga errores silenciosamente |
| [R15](#r15--límites-de-tamaño-y-responsabilidad-única-por-archivo) | Tamaño archivos | Service ≤300, Controller ≤200, Componente ≤200, Página ≤300 |
| [R16](#r16--toda-interfaz-usa-el-design-system) | Design System | Toda UI con `components/ui/`, no ad-hoc |

### Diseño / UI / UX

| ID | Tema | Una línea |
|----|------|-----------|
| [D1](#d1--sin-emojis-en-la-interfaz) | Sin emojis | Iconos SVG (Lucide), no caracteres unicode emoji |
| [D2](#d2--jerarquía-visual-primario--secundario--terciario) | Jerarquía | 1 acción primaria, máx 2 secundarias, resto en menú ⋯ |
| [D3](#d3--máximo-2-badges-por-item-en-una-lista) | Badges | Más de 2 badges es ruido; estado > prioridad > resto como metadata |
| [D4](#d4--sin-información-duplicada) | Duplicación | Si el contexto comunica un dato, no repetirlo |
| [D5](#d5--acciones-destructivas-en-menú-contextual) | Destructivas | Botones rojos permanentes prohibidos; van en menú ⋯ con confirmación |
| [D6](#d6--espaciado-en-escala-de-4px) | Spacing | Múltiplos de 4px exclusivamente |
| [D7](#d7--texto-no-iconos-solos) | Acciones | Toda acción tiene texto; en toolbars compactos, tooltip obligatorio |
| [D8](#d8--estados-vacíos-siempre-diseñados) | Empty states | Nunca espacio en blanco: icono + texto + acción sugerida |
| [D9](#d9--feedback-visual-inmediato) | Feedback | Toda acción produce feedback en <200ms |
| [D10](#d10--layout-estandarizado-por-tipo-de-página) | Layouts | 6 tipos de página fijos: Overview / List / Detail / Form / Workspace / Settings |
| [D11](#d11--voz-de-marca-en-mensajes-de-sistema) | Voz | Frases cortas, cercanas, sin jerga burocrática |

---

## Reglas de arquitectura

### R1 — Comunicación entre módulos solo vía eventos

Los módulos nunca se llaman directamente entre sí.
Toda comunicación es a través del bus de eventos interno (EventEmitter2 de NestJS).

```typescript
// ❌ INCORRECTO — llamada directa entre módulos
this.notificationsService.send(...)
this.provisioningService.activate(...)

// ✅ CORRECTO — emisión de evento
this.eventBus.emit('invoice.paid', { invoiceId, clientId, serviceId })
```

> **Excepciones documentadas hoy:** `Clients ↔ Billing` comparten servicios inyectados por refactorización Regla 15 (sub-servicios del mismo dominio). Ver `docs/20-modules/_matrix.md` (cuando exista) para inventario exacto.

---

### R2 — Todo proceso lento va a la cola BullMQ

Cualquier operación que tarde más de 200ms va a la cola. Nunca en el hilo principal.

```
VA A LA COLA SIEMPRE:
  provisioning de servicios
  llamadas a APIs externas (Stripe, Enhance CP, ResellerClub, Docker)
  envío de emails
  generación de PDFs
  ejecución de mantenimientos
  reintentos de cobro

RESPONDE INMEDIATO (hilo principal):
  cualquier lectura de datos
  login / logout
  navegación del dashboard
  abrir un chat
```

---

### R3 — El audit log es inmutable

Las tablas del schema `audit` (`audit_access_log`, `audit_change_log`) solo permiten INSERT.
Nunca UPDATE ni DELETE en ninguna tabla de audit.
Ni el superadmin tiene permisos de modificación sobre estas tablas.

---

### R4 — Los plugins implementan su interfaz, el core no los conoce

El core llama a la interfaz. Nunca importa un plugin directamente.

```typescript
// ❌ INCORRECTO
import { StripePlugin } from '../plugins/payment/stripe'

// ✅ CORRECTO
import { PaymentPlugin } from '../core/interfaces/payment-plugin.interface'
// El plugin activo se inyecta vía el sistema de plugins
```

---

### R5 — Ninguna lógica de negocio en el frontend

El frontend solo muestra datos y llama a la API.
Nunca calcula precios, valida reglas de negocio, ni toma decisiones.

> **Validación visual de inputs sí está permitida** (longitud mínima, formato email, fortaleza de contraseña). La regla aplica a la **lógica de negocio**: cálculo de IVA, validación de descuentos, decisiones de provisioning, etc.

---

### R6 — La API es stateless

Ningún estado de usuario o sesión se guarda en memoria del servidor.
Todo el estado vive en PostgreSQL y Redis.

Implicación: el sistema escala horizontalmente sin afinidad de sesión.

---

### R7 — Todos los errores se registran y notifican

Cualquier excepción en cualquier parte del sistema:

1. Se registra en `error_log` con todos los detalles técnicos.
2. Se notifica al superadmin vía notificación interna inmediata.
3. Al cliente se muestra un mensaje elegante sin detalles técnicos.

El cliente nunca ve un stack trace ni un error en crudo.

> Implementación actual: `GlobalExceptionFilter` (backend) + `SentryGlobalFilter` (cuando DSN configurado) + manejo en frontend descrito en R14.

---

### R8 — Eventos críticos usan Outbox Pattern

Los eventos que disparan acciones entre módulos (`invoice.paid`, `service.provisioned`, etc.)
se persisten en la tabla `event_outbox` dentro de la misma transacción de base de datos.
Un worker los despacha y los marca como procesados. Si el proceso muere, el evento se reintenta.

```typescript
// ❌ INCORRECTO — emitir evento sin persistir
await this.invoiceRepo.save(invoice);
this.eventBus.emit('invoice.paid', payload);
// Si el proceso muere entre save y emit, el evento se pierde

// ✅ CORRECTO — persistir evento en la misma transacción
await this.dataSource.transaction(async (manager) => {
  await manager.save(Invoice, invoice);
  await manager.save(EventOutbox, {
    eventName: 'invoice.paid',
    payload: { invoiceId, clientId, serviceId },
  });
});
// El outbox worker lo despacha. Si muere, se reintenta.
```

---

### R9 — Todo request lleva correlation ID

Cada request HTTP genera un `correlationId` único (UUID) que se propaga a todos los
módulos, eventos, y jobs de BullMQ que se disparen como consecuencia.
Todos los logs y registros de error incluyen el correlationId.

> Implementación: `CorrelationIdMiddleware` en `backend/src/core/common/middleware/`.

---

### R10 — Rate limiting en todos los endpoints

Cada endpoint tiene un límite de requests por unidad de tiempo.
Los endpoints sensibles (login, registro, webhooks) tienen límites más restrictivos.
El rate limiting usa Redis como storage compartido entre instancias.

> Defaults actuales: 100 req/min general, 5 logins/min. Ver `app.module.ts` ThrottlerModule.

---

### R11 — Circuit breaker en llamadas a APIs externas

Las llamadas a APIs externas (Stripe, Enhance CP, ResellerClub, Docker API) usan
circuit breaker. Si un servicio falla N veces consecutivas, el circuito se abre y
los intentos nuevos se rechazan inmediatamente hasta que el servicio se recupere.
Al abrirse un circuito, se notifica al superadmin.

---

### R12 — Credenciales encriptadas con AES-256-GCM

Toda credencial almacenada (claves API, contraseñas de servidores, secrets) se encripta
con AES-256-GCM. La clave maestra vive en variable de entorno (`ENCRYPTION_KEY`),
nunca en la base de datos ni en el código fuente.

---

### R13 — Los jobs fallidos nunca desaparecen

Cuando un job de BullMQ agota todos sus reintentos, queda en estado `failed` en Redis.
Se genera una notificación al superadmin. El admin puede reintentar manualmente desde
el dashboard. Los jobs fallidos nunca se eliminan automáticamente.

---

### R14 — Error handling visible en el frontend

El frontend NUNCA traga errores silenciosamente.
Todo `catch` muestra feedback visual al usuario:

- Errores de negocio → toast/banner con el mensaje del backend.
- Errores de red → "Error de conexión. Inténtalo de nuevo."
- HTTP 403 → Componente "Sin permisos".
- HTTP 401 → Redirect a login.

Nunca `catch {}` vacío. Nunca `console.log` como único handling.

```typescript
// ❌ INCORRECTO — error silenciado
try { await api.save(data); }
catch { /* handled */ }

// ✅ CORRECTO — feedback visible
try { await api.save(data); }
catch (err) {
  setError(err instanceof Error ? err.message : 'Error inesperado');
}
```

---

### R15 — Límites de tamaño y responsabilidad única por archivo

Ningún archivo debe crecer sin control. Los límites son estrictos:

**Backend (NestJS):**

| Tipo | Límite | Si supera |
|------|--------|-----------|
| Service | 300 líneas | Dividir por dominio (ej: `support-chat.service.ts`, `support-ticket.service.ts`). El service principal queda como fachada. |
| Controller | 200 líneas | Solo rutea y valida; lógica al service |
| Gateway (WebSocket) | 250 líneas | Handlers delegan a servicios |
| Listener / Worker | 150 líneas | Un listener = un evento o grupo cohesivo |

**Frontend (Next.js / React):**

| Tipo | Límite | Si supera |
|------|--------|-----------|
| Componente UI | 200 líneas | Extraer sub-componentes |
| Página | 300 líneas | Extraer secciones a componentes dedicados |
| Custom hook | 150 líneas | Una responsabilidad por hook |
| Archivo de API | 400 líneas | Dividir por dominio |

**Regla de oro:** si necesitas scroll para entender qué hace un archivo, es demasiado grande.

```
Ejemplo de refactorización aplicada en Sprint 7:

❌ ANTES — support.service.ts (1054 líneas con todo)
   createChat(), createGuestChat(), createTicket(), escalate(),
   findAll(), findOne(), addMessage(), markAsRead(), getStats()

✅ DESPUÉS — dividido por dominio
   support.service.ts          → 90 líneas (fachada)
   support-chat.service.ts     → createChat(), createGuestChat(), linkGuest()
   support-ticket.service.ts   → createTicket(), escalate()
   support-query.service.ts    → findAll(), findOne(), getStats()
   support-message.service.ts  → addMessage(), markAsRead()
```

---

### R16 — Toda interfaz usa el Design System

Todo componente visual del frontend se construye exclusivamente con los componentes
de `frontend/app/components/ui/`. Nunca se crean botones, badges, cards, tablas,
modales o inputs ad-hoc en las páginas.

```
❌ INCORRECTO — botón ad-hoc en una página
<button className="bg-blue-500 ..." onClick={handleSave}>Guardar</button>

✅ CORRECTO — componente del Design System
import { Button } from '@/components/ui';
<Button variant="primary" onClick={handleSave}>Guardar</Button>
```

**Regla de oro:** si una página necesita un componente visual que no existe en `components/ui/`,
el componente se crea primero en la librería, se documenta en la sección Design System
(`docs/40-design-system/`), y luego se usa.

> **Excepción documentada:** `ChatWidget` por ser embeddable también en la landing (sin tokens del dashboard). Ver `DESIGN_SYSTEM.md §EXCEPCIONES`.

---

## Reglas de diseño / UI

### D1 — Sin emojis en la interfaz

Los emojis no pertenecen a un dashboard profesional. Crean ruido visual, rompen la consistencia tipográfica y reducen la seriedad percibida.

```
❌ INCORRECTO
  ✅ Conversación resuelta.
  📝 Nota: problema solucionado
  🔒 Conversación cerrada.
  🟢 En línea

✅ CORRECTO
  Conversación resuelta.                   (con icono SVG de check)
  Nota: problema solucionado
  Conversación cerrada.                    (con icono SVG de candado)
  En línea                                 (con StatusDot verde)
```

**Alternativas permitidas:** StatusDot (●) con CSS color, iconos SVG de Lucide React, badges semánticos.

> **Aplica a:** UI del dashboard. **NO aplica a:** mensajes de commit, comentarios en código, documentación interna.

---

### D2 — Jerarquía visual: primario → secundario → terciario

Cada vista tiene exactamente **una acción primaria**, como máximo **dos secundarias**, y el resto en menú contextual (⋯).

```
Primario:    Botón sólido brand (#3B82F6). UNO por vista.
Secundario:  Botón outline o ghost. Máximo 2 visibles.
Terciario:   Dentro de menú contextual (⋯), link de texto, o icono con tooltip.

❌  [+ Nueva conversación] [Exportar] [Filtrar] [Configuración]
✅  [+ Nueva conversación]   [Exportar]   ⋯ (Filtrar, Configurar)
     primario (sólido)        secundario   terciario (menú)
```

---

### D3 — Máximo 2 badges por item en una lista

Más de 2 badges es ruido que el ojo no procesa.

```
❌  "tu web va bien"  [Esperando cliente] [URGENTE] [web] [1d]
✅  "tu web va bien"  [Esperando cliente] [Urgente]
                                                    1d · web  ← texto gris
```

**Prioridad:** **Estado** (siempre) > **Prioridad** (solo si ≠ normal) > resto como metadata gris.

---

### D4 — Sin información duplicada

Si el contexto ya comunica un dato, no repetirlo.

Ejemplo: en una página de detalle de cliente, no mostrar "Cliente: Juan García" en cada sección — el header ya lo dice.

---

### D5 — Acciones destructivas en menú contextual

Los botones rojos permanentes crean ansiedad. Las acciones destructivas van en menú ⋯ → modal de confirmación.

Ejemplos: borrar usuario, cancelar suscripción, anular factura, expulsar partner.

---

### D6 — Espaciado en escala de 4px

Todo spacing es múltiplo de 4px. Sin valores arbitrarios.

```
Escala: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64
❌  padding: 15px; margin: 22px;
✅  padding: 16px; margin: 24px;
```

> Implementación: tokens `--space-1` (4px) … `--space-16` (64px) en `tokens.css`.

---

### D7 — Texto, no iconos solos

Toda acción tiene texto visible. En toolbars compactos, el tooltip es obligatorio.

Razón: accesibilidad, descubribilidad, reducción de ambigüedad.

---

### D8 — Estados vacíos siempre diseñados

Nunca un espacio en blanco. Icono sutil + texto descriptivo + acción sugerida.

Componente del Design System: `EmptyState` en `components/ui/EmptyState/`.

---

### D9 — Feedback visual inmediato

Toda acción produce feedback en <200ms:

- Loading en botón
- Toast de confirmación o error
- Transición suave entre estados

---

### D10 — Layout estandarizado por tipo de página

El dashboard tiene **6 tipos de página** definidos en `UI_SPEC.md §2`:

| Tipo | Anatomía |
|------|----------|
| Overview | Greeting → Stats grid (StatsCards) → Content sections |
| List | PageHeader → StatusTabs (no StatsCards) → FilterBar → Table/Cards → Pagination |
| Detail | Breadcrumb → Detail header → Tabs → Content |
| Form | Breadcrumb → Header → Card sections → Actions (sticky) |
| Workspace | 3 columnas (lista, contenido, contexto) — solo chats |
| Settings | Nav vertical + sección activa — solo configuración |

**Regla derivada:** StatsCards solo en Overview. En list pages, las métricas van como contadores en StatusTabs.

> **Ver:** `UI_SPEC.md §2.1–§2.7` para anatomía completa de cada tipo.

---

### D11 — Voz de marca en mensajes de sistema

Los mensajes de sistema del dashboard siguen la voz de Aelium definida en `docs/aelium-documento-de-marca.md`:

- Frases cortas. Una idea por frase.
- Cercano pero competente.
- Sin jerga burocrática.

```
❌  "La conversación ha sido resuelta exitosamente por el agente."
✅  "Conversación resuelta."

❌  "Estimado usuario, le informamos que se ha producido un error."
✅  "No se pudo guardar. Inténtalo de nuevo."
```

> **Documento canónico de voz:** `docs/aelium-documento-de-marca.md`. Esta regla es un puntero, no una copia.

---

## Convenciones de uso

- **Citar regla en commit / PR / issue:** `feat(billing): X — cumple R8 + R14`.
- **Si necesitas saltarte una regla:** documentar la excepción en el código (comentario explicativo) Y actualizar este documento (sección "Excepciones documentadas" del módulo afectado).
- **Cambio de regla:** debe pasar por un ADR en `docs/10-decisions/` argumentando por qué la regla anterior ya no aplica. No se modifica una regla sin trail de decisión.

## Documentos relacionados

- `docs/00-foundations/glossary.md` — Términos canónicos del proyecto (chat, ticket, conversación, etc.)
- `docs/aelium-documento-de-marca.md` — Voz, identidad visual, BrandScripts (referenciado por D11)
- `docs/UI_SPEC.md` — Anatomía detallada de cada tipo de página (referenciado por D10)
- `docs/10-decisions/` — ADRs (cuando se haga el refactor F2)
- `docs/20-modules/_matrix.md` — Excepciones a R1 (acoplamientos legítimos entre módulos) — pendiente F4
