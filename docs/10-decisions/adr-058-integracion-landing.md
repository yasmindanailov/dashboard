# ADR-058 — Integración del dashboard con la landing

> **Status:** Active
> **Date:** 2026-04 · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §16
> **Domain:** ui, cross-cutting

---

## Contexto

La **landing** de Aelium (página comercial pública) y el **dashboard** (aplicación operativa para clientes y agentes) son dos sistemas distintos pero **deben comunicarse** para varios casos:

- El visitante busca un dominio en la landing → la búsqueda llega a ResellerClub via el backend del dashboard.
- El visitante ve precios y catálogo en la landing → los datos vienen del dashboard.
- El visitante decide comprar en la landing → el flujo de checkout pasa por el dashboard.
- El visitante abre webchat en la landing → la conversación queda registrada en el dashboard (chat anónimo, ADR-037).
- El visitante envía formulario de contacto → genera conversación en el dashboard.

Las opciones de arquitectura eran:

- **Landing con su propia base de datos y lógica** → duplicación masiva (catálogo en dos sitios, precios desincronizados, conversaciones perdidas entre sistemas).
- **Landing acoplada al dashboard** (mismo proyecto Next.js) → mezcla concerns (SEO público vs app autenticada), despliegue compartido aunque cambien por motivos distintos.
- **Landing separada que consume la API del dashboard** → cada sistema con su propósito, una sola fuente de verdad (el backend), comunicación por API REST.

Se elige la tercera: **landing como cliente del backend**, sin lógica de negocio propia.

---

## Decisión

### Arquitectura

```
┌─────────────────┐         ┌──────────────────────────┐
│  Landing        │         │  Dashboard (frontend)    │
│  (Next.js)      │         │  (Next.js)               │
│  marketing.com  │         │  app.dominio.com         │
└────────┬────────┘         └────────────┬─────────────┘
         │                                │
         │      HTTP / REST               │
         ▼                                ▼
       ┌────────────────────────────────────┐
       │  Backend NestJS                    │
       │  api.dominio.com (interno)         │
       │  Catálogo · auth · checkout · API  │
       └────────────────────────────────────┘
```

- **Dos proyectos Next.js separados** (landing + dashboard), cada uno con su deploy independiente.
- **Un solo backend NestJS** que sirve a ambos.
- La landing **nunca tiene lógica de negocio** — solo llama a la API y renderiza.

### Funciones que conectan landing con dashboard

| Función | Endpoint usado | Notas |
|---------|----------------|-------|
| **Buscador de dominios** | `POST /api/v1/domains/search` | Backend llama a ResellerClub via plugin |
| **Catálogo de productos y precios** | `GET /api/v1/products/catalog` | Lectura pública (sin auth) |
| **Proceso de compra y checkout** | `POST /api/v1/checkout/session` | Flujo desde landing (sin cuenta) |
| **Webchat** | `WS /support/chats/guest` + `POST /api/v1/support/chats/guest` | Mismo sistema de chat (ADR-037), cliente anónimo |
| **Formulario de contacto** | `POST /api/v1/contact` | Genera conversación tipo `ticket` |

### Endpoints públicos (sin auth)

Estos endpoints son accesibles sin JWT:

- `GET /api/v1/products/catalog` — catálogo público.
- `GET /api/v1/domains/search` — búsqueda de dominios.
- `POST /api/v1/checkout/session` — inicio de checkout (ADR-032 flujo cliente sin cuenta).
- `POST /api/v1/contact` — formulario de contacto.
- `POST /api/v1/support/chats/guest` — chat anónimo (con `guest_session_token`).
- `WS /support` con auth `guest_session_token` — WebSocket del chat anónimo.

Todos están **rate-limited** por IP (ADR-016) — cualquiera puede llamar, pero no abusar.

### Identidad visual unificada

Aunque son proyectos separados, comparten:
- **Tokens de diseño** (`globals.css` de la landing y del dashboard derivan del mismo design system).
- **Logo y branding** (mismas SVGs en ambos repos).
- **Animación Aurora Digital** del fondo (canvas pesado, ADR-059) — la misma animación aparece en landing, en auth pages, y como elemento decorativo opcional en el dashboard.

Esto da **continuidad visual** al usuario que atraviesa landing → registro → dashboard.

### Tracking y atribución

- La landing puede generar **referidos** (`?ref=<code>`, ADR-054) en URLs.
- Al completar registro: el `referral_code` viaja en el body del `POST /api/v1/auth/register` y queda asociado al usuario.
- Igual para `partner_code` (ADR-049): `?partner=<code>` → registro con vinculación a partner.

### Webchat anónimo desde la landing

Detalle en ADR-037. Resumen:
- El visitante abre el widget en la landing.
- El backend genera un `guest_session_token` (UUID hashado).
- WebSocket auth con ese token (sin JWT).
- La conversación queda en la DB con `client_id=null` y `guest_session_token`.
- Si el visitante se registra después: el `guest_session_token` puede asociarse a la cuenta nueva (futuro: link manual o automático).

### Despliegue separado

- Landing y dashboard se despliegan **independientemente** — un cambio en la landing no necesita rebuild del dashboard.
- Ambos viven en el mismo servidor (Docker Compose, ADR-043) en contenedores distintos.
- Traefik enruta:
  - `marketing.com` → contenedor landing.
  - `app.dominio.com` → contenedor dashboard frontend.
  - `api.dominio.com` → contenedor backend NestJS.

---

## Consecuencias

- ✅ **Ganamos:**
  - **Una sola fuente de verdad** (backend) — sin desincronización catálogo / landing.
  - **Despliegues independientes** — la landing puede iterarse rápidamente sin afectar la app.
  - **SEO de la landing** sin contaminación del bundle del dashboard (Next.js separado, optimizado para SEO).
  - **Webchat unificado** — la conversación que empieza anónima en la landing es la misma que se lleva al dashboard cuando el visitante se registra.
  - **Branding consistente** — Aurora Digital y tokens compartidos.
- ⚠️ **Aceptamos:**
  - **Mantener dos proyectos Next.js** — duplicación moderada de código (componentes UI compartidos via paquete propio o copia manual). Mitigación: librería UI propia cuando aplique.
  - **Endpoints públicos** son superficie de ataque — necesitan rate limiting riguroso (ADR-016) y validación.
  - **Versionado de API** crítico — un cambio que rompa `/api/v1/products/catalog` rompe la landing inmediatamente. Mitigación: contracts estables en `/api/v1`, breaking changes a `/api/v2` sin romper v1.
  - **Webchat anónimo** introduce riesgo de spam/abuso — necesita filtro IA (ADR-057) o rate limiting agresivo.
- 🚪 **Cierra:**
  - **No lógica de negocio en la landing.** Si algo calcula precios, factura, valida → al backend.
  - **No catálogo duplicado en la landing.** Siempre desde la API.
  - **No autenticación propia en la landing** (no hay login en marketing.com — el login es app.dominio.com).

---

## Cuándo revisar

- Si la duplicación de componentes UI entre landing y dashboard se vuelve insostenible → extraer **librería UI compartida** (monorepo o paquete npm interno).
- Si la landing crece a una app compleja (no solo marketing) → reconsiderar fusión, o split en más proyectos según función.
- Si surge **dominio internacional** (otra landing en inglés) → multilingüe en la landing existente o landing por idioma.
- Si el chat anónimo tiene problemas de abuso → reforzar (CAPTCHA, validación de email antes de iniciar chat).

---

## Referencias

- **Módulos afectados:** ui (landing + dashboard), backend (productor de la API), products (catálogo público), support (chat anónimo), checkout (compra desde landing).
- **Reglas relacionadas:** R5 (cálculos en backend — landing nunca calcula precios), R10 (rate limiting — endpoints públicos), R14 (no tragar errores en frontend).
- **ADRs relacionados:** ADR-005 (stack frontend Next.js — usado en ambos), ADR-016 (rate limiting Redis), ADR-032 (flujo de compra — desde landing), ADR-037 (chat dual — anónimo desde landing), ADR-049 (partner — `referral_code` desde landing), ADR-054 (referidos — `?ref=` desde landing), ADR-057 (IA — filtro aplica al webchat anónimo), ADR-059 (auth layout — Aurora Digital compartida).
- **Glosario:** [Landing](../00-foundations/glossary.md), [Webchat](../00-foundations/glossary.md), [Catálogo público](../00-foundations/glossary.md), [Endpoint público](../00-foundations/glossary.md).
- **Implementación:** landing en repo separado (futuro), dashboard frontend en `frontend/`.
