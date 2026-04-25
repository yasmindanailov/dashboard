# Tests E2E — Playwright

> Tests end-to-end que verifican el sistema completo (backend + frontend) como lo experimenta un usuario real.

---

## Por qué importa

Sin tests E2E, cada cambio puede romper silenciosamente un flujo crítico (login, factura, chat). Te enteras solo cuando un cliente lo reporta. Los tests E2E corren en **cada PR** en CI: si rompen un flujo crítico, el merge se bloquea automáticamente.

**Cobertura actual (v1):**
- ✅ Auth flow completo: registro → email verification → login
- ✅ Smoke test billing admin: lista de facturas + checkout admin accessible
- ✅ Smoke test soporte: bandeja de tickets + panel de chats + modal nuevo ticket

**No cubierto todavía** (iteración futura):
- Flujo 2FA con código por email (superadmin)
- Crear factura completa via checkout
- Escalación real chat → ticket con WebSocket
- Pago marcado como completado y descarga de PDF

---

## Stack y arquitectura

| Pieza | Elección | Motivo |
|-------|----------|--------|
| Framework | **Playwright** | Mejor soporte Next.js 16 + React 19 + WebSockets, auto-wait built-in, multi-navegador, tracing nativo |
| Navegador | Chromium only (por ahora) | Cubre 70% del tráfico real; añadir Firefox/WebKit cuando Chromium sea estable |
| DB en tests | **Postgres efímero real** | Mocks rompen el contrato real con Prisma; un service container Docker tarda ~10s y captura bugs reales |
| Email | MailPit (SMTP local + API HTTP) | Permite leer emails reales en tests (códigos 2FA, links de verificación) |
| Auth en tests | UI helper para flow real + API helper para skip | El flow de login se prueba una vez; el resto skip vía API para velocidad |

---

## Estructura de archivos

```
dashboard/
├── playwright.config.ts               Config global, webServer, navegadores
├── package.json                       Scripts: test:e2e, test:e2e:ui, test:e2e:debug
└── tests/
    └── e2e/
        ├── fixtures/
        │   ├── test-config.ts         URLs y credenciales
        │   ├── mailpit.ts             Helper API MailPit (leer emails, extraer 2FA)
        │   ├── db.ts                  Cliente Prisma + cleanup
        │   └── auth.ts                Login UI / login API / inject token
        ├── auth.spec.ts               Test 1: registro + verify + login
        ├── checkout-admin.spec.ts     Test 2: smoke billing admin
        └── support-escalation.spec.ts Test 3: smoke soporte
```

---

## Cómo correr los tests

### Localmente

**Prerequisito:** tener Postgres + Redis + MailPit corriendo (probablemente desde tu `docker-compose.yml`):
```bash
docker compose up -d postgres redis mailpit
```

**Comandos disponibles:**

| Comando | Qué hace |
|---------|----------|
| `pnpm test:e2e` | Corre todos los tests en headless (modo CI) |
| `pnpm test:e2e:ui` | Abre Playwright UI — modo interactivo, recomendado para escribir tests |
| `pnpm test:e2e:debug` | Modo step-by-step con DevTools abierto |
| `pnpm test:e2e:report` | Abre el último report HTML |

**Notas:**
- Playwright arranca backend (3001) y frontend (3002) automáticamente vía `webServer`. Si ya los tienes corriendo, los reutiliza.
- En local usamos `next dev` para el frontend (respeta `NEXT_PUBLIC_API_URL` en runtime).
- En CI usamos `next start` con build previo (más estable).

### En CI

Cada push y PR ejecuta el job **E2E** en `.github/workflows/ci.yml` con services efímeros:
- Postgres 16
- Redis 7
- MailPit (latest)

El job:
1. Instala dependencias (3 proyectos pnpm)
2. Cachea browsers de Playwright entre runs
3. Genera Prisma client + migra + seedea
4. Construye backend y frontend
5. Corre los tests E2E
6. Si falla: sube `playwright-report/` y `test-results/` como artifacts (descargables 14 días)

---

## Cómo escribir un test nuevo

1. Crear `tests/e2e/<nombre>.spec.ts`
2. Importar fixtures necesarios (`auth`, `mailpit`, `db`)
3. Estructura típica:

```ts
import { test, expect } from '@playwright/test';
import { loginSuperadminUI } from './fixtures/auth';
import { resetTestData, disconnectPrisma } from './fixtures/db';

test.describe('Mi feature', () => {
  test.beforeAll(async () => {
    await resetTestData();
  });

  test.afterAll(async () => {
    await disconnectPrisma();
  });

  test('hace X cuando Y', async ({ page }) => {
    await loginSuperadminUI(page);
    await page.goto('/dashboard/foo');
    await expect(page.getByRole('heading', { name: /foo/i })).toBeVisible();
  });
});
```

### Buenas prácticas

- **Selectores:** preferir `getByRole`, `getByLabel`, `getByText`. Usar `data-testid` solo si las opciones semánticas fallan.
- **Esperas:** evitar `waitForTimeout`. Playwright tiene auto-wait; usar `toBeVisible()`, `waitForURL()`, `waitForResponse()`.
- **Datos:** generar emails/datos únicos por test (`Date.now()`) para evitar colisiones.
- **Cleanup:** `resetTestData()` en `beforeAll`, no en cada test (más rápido).
- **No dependencias entre tests:** cada test debe poder correr aislado.

---

## Cuando un test falla en CI

1. Abre la pestaña **E2E** del run en GitHub Actions
2. Sección **Annotations** muestra qué test falló
3. Descarga **Artifacts:**
   - `playwright-report/` — HTML interactivo con screenshots/videos
   - `playwright-traces/` — `trace.zip` para usar con `npx playwright show-trace`
4. El trace permite ver paso a paso qué hizo el navegador, network requests, console logs

---

## Troubleshooting

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| `Timeout esperando email` | MailPit no corre o backend no envía emails | Verificar `docker compose ps`, revisar logs backend |
| `Login falló: 500` | Backend no terminó de arrancar | Aumentar timeout en `webServer` config |
| `connection refused 5432` | Postgres no listo | El healthcheck del service container debería esperar; aumentar `health-retries` |
| Test pasa local, falla en CI | Diferencia de entorno (NODE_ENV, build vs dev) | Reproducir con `CI=true pnpm test:e2e` |
| `Browser not found` | Playwright no instaló Chromium | `pnpm exec playwright install chromium` |
| Selector no encuentra elemento | UI cambió, copy nuevo | Actualizar el selector — usar `--ui` para inspeccionar |

---

## Decisiones de arquitectura

### ¿Por qué `next dev` en local y `next start` en CI?

`next dev` recoge env vars en runtime. `next start` solo en build-time. En local, queremos poder cambiar `NEXT_PUBLIC_API_URL` sin re-buildear. En CI, la build ya tiene la URL correcta del workflow, y `next start` es más estable.

### ¿Por qué Postgres real en lugar de mocks?

Nuestro stack usa Prisma 7 con queries complejas (joins, transacciones, prorrateo). Un mock de DB no captura:
- Errores de SQL
- Constraints de FK
- Comportamiento de transacciones
- Impacto de migraciones

10 segundos de startup de Postgres son baratos comparados con un bug de Hacienda (numeración de facturas) llegando a producción.

### ¿Por qué solo Chromium?

Cubre el 70%+ del tráfico web real. Firefox y WebKit añaden ~3x al tiempo de CI. Activarlos cuando los tests sean estables y haya razón concreta (por ejemplo, un bug específico de WebKit reportado).

### ¿Por qué tests serializados en CI (workers: 1)?

Comparten una sola DB Postgres. Paralelismo requeriría aislar datos por worker (DBs separadas o schemas distintos). Coste vs beneficio: con 3 tests rápidos, no merece la complejidad. Si la suite crece >20 tests, considerar.

---

## Próximos pasos

- [ ] Cubrir flujo 2FA completo (superadmin login con código por email)
- [ ] Test creación de factura completa via checkout
- [ ] Test de escalación chat→ticket con WebSocket real
- [ ] Test de descarga de PDF
- [ ] Activar Firefox + WebKit cuando los tests Chromium sean estables 2 semanas
- [ ] Añadir tests de regresión visual con Playwright snapshots (selectivo)
