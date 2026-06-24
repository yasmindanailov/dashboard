# ADR-016 — Rate limiting por endpoint con Redis

> **Status:** Active
> **Date:** 2026-04 (origen) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §31 (parcial) + Regla R10
> **Domain:** foundation, security

---

## Contexto

Sin rate limiting, cualquier endpoint público es vulnerable a:

- **Fuerza bruta** sobre login (mitigado parcialmente por bloqueo por intentos en ADR-014, pero ese ataca cuentas concretas; rate limit IP ataca el origen).
- **DoS** al backend con peticiones masivas.
- **Abuse** de endpoints como envío de email (forgot-password, resend-verification) para spam.
- **Webhook abuse** si los endpoints de webhooks no validan origen + frecuencia.

Hace falta rate limiting:

1. **Por endpoint** — distintos límites según sensibilidad.
2. **Compartido entre instancias** — si Aelium escala horizontalmente, todas las instancias respetan el mismo contador.
3. **Configurable** — los límites pueden ajustarse sin redeploy.

---

## Opciones consideradas

1. **Rate limit en memoria** (in-process, single-instance).
   - Pros: cero infraestructura adicional.
   - Contras: no funciona con múltiples instancias. Cada réplica tiene su propio contador → atacante distribuye carga entre réplicas.

2. **Rate limit en Cloudflare / proveedor edge.**
   - Pros: filtra antes de llegar a la app.
   - Contras: dependencia de proveedor + Aelium quiere self-hosted.

3. **(Elegida)** **`@nestjs/throttler` con storage Redis.**
   - Pros: compartido entre instancias vía Redis. Configuración declarativa per-endpoint con decoradores. Maduro en ecosistema NestJS.
   - Contras: depende de Redis disponible (ya está en stack — ADR-002).

---

## Decisión

### Stack

- **`@nestjs/throttler`** con `redis` storage adapter.
- **Configuración declarativa** en `AppModule.imports` con throttlers nombrados:

```typescript
ThrottlerModule.forRoot({
  throttlers: [
    { name: 'short', ttl: 60_000, limit: 100 },   // 100 req/min general
    { name: 'login', ttl: 60_000, limit: 5 },     // 5 logins/min
  ],
})
```

- **Por endpoint** se aplican `@Throttle()` decorators con el nombre del throttler.

### Throttlers definidos

| Nombre | TTL | Límite | Aplicado a |
|--------|-----|--------|-----------|
| `short` (default) | 60 s | 100 req | Endpoints generales (lectura, navegación) |
| `login` | 60 s | 5 req | `/auth/login`, `/auth/verify-2fa` |
| `register` | 60 s | 3 req | `/auth/register` |
| `forgot` | 60 s | 3 req | `/auth/forgot-password`, `/auth/resend-verification` |
| `webhook` (futuro) | 60 s | 100 req | Endpoints de webhooks (Stripe, etc.) — validan firma además |
| `chat:guest` | 3600 s | 3 chats / hora por IP | `POST /support/chats/guest` (chat anónimo desde landing) |
| `chat:guest:msg` | 60 s | 10 mensajes / min por sesión | mensajes en chats guest |

### Identificación

- **Por defecto:** IP del cliente (`X-Forwarded-For` si está detrás de proxy/Traefik).
- **Endpoints autenticados con cuenta:** opcionalmente combinar IP + userId para evitar que un usuario legítimo bloquee a otros tras NAT compartido.
- **Endpoints sensibles a usuario** (login): IP + email del intento, para evitar que múltiples intentos a misma cuenta desde IPs distintas eludan el bloqueo. **Estado actual:** rate limit es solo por IP. Combinar con email = mejora futura.

### Comportamiento al exceder

- HTTP **429 Too Many Requests** con header `Retry-After`.
- Frontend muestra "Demasiados intentos. Espera unos segundos e inténtalo de nuevo." (R14).

### Configuración

Hoy los throttlers están **hardcoded** en código por simplicidad. Migración futura a settings configurables: posible cuando se priorice (y tenga sentido — la mayoría de los límites no necesitan cambiar a menudo).

---

## Consecuencias

- ✅ **Ganamos:**
  - Protección automática contra fuerza bruta y DoS de bajo coste.
  - Compartido entre instancias vía Redis.
  - Configuración declarativa, fácil de auditar.
- ⚠️ **Aceptamos:**
  - Dependencia de Redis. Si Redis se cae, el throttler tiene fallback a in-memory que rompe el contador compartido. Mitigación: Redis es ya crítico para BullMQ (cola de jobs); su disponibilidad ya es prioridad.
  - Los límites son globales por endpoint — endpoints públicos generosos pueden ser usados como vector si el atacante comparte IP con muchos usuarios legítimos (NAT). Caso edge poco probable a nuestra escala.
  - **Combinación IP + userId / IP + email** pendiente para mayor protección — mejora futura.
- 🚪 **Cierra:**
  - **No rate limit en memoria** sin storage compartido.
  - **No depender de Cloudflare** o equivalente como única defensa.

---

## Cuándo revisar

- Si surgen ataques que el rate limit por IP no detiene (credential stuffing distribuido) → añadir combinación IP + email.
- Si la app supera ~10 instancias y Redis se vuelve cuello de botella del throttling: evaluar storage alternativo o sharding de Redis.
- Si los límites resultan inadecuados en uso real (legítimos bloqueados o atacantes pasando): ajustar.

---

## Referencias

- **Módulos afectados:** todos los con endpoints HTTP (especialmente `auth`, `support` con `/chats/guest`).
- **Reglas relacionadas:** R10 (rate limiting en endpoints), R7 (errores notificados).
- **ADRs relacionados:** ADR-002 (Redis en stack), ADR-014 (bloqueo intentos fallidos a nivel cuenta).
- **Implementación (2026-06-24, cierra HIGH-1 de la auditoría 2026-06-21):** `ThrottlerModule.forRootAsync()` en `app.module.ts` (un throttler `default` 100/min/IP) + `ThrottlerGuard` como `APP_GUARD` global (R10: todas las rutas) + storage Redis `core/security/redis-throttler.storage.ts` (db 3, Lua atómico, R6 multi-instancia; fail-open si Redis cae) + `@Throttle({ default: {...} })` en `auth.controller.ts` (login/verify-2fa 5/min, register/forgot/resend 3/min) y `support-guest.controller.ts` (3/h). `errorMessage` de marca (R14) + `Retry-After` (guard). `app.set('trust proxy', 1)` en `main.ts` (X-Forwarded-For tras Traefik). `skipIf` por `THROTTLER_DISABLED` (E2E). Test: `backend/test/integration/rate-limiting.e2e-spec.ts`. **Pendiente (consciente):** IP + email para login (§Identificación, mejora futura).
- **Glosario:** [Worker](../00-foundations/glossary.md) (no relacionado pero relevante a uso de Redis).
