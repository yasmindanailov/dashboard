# Sentry — Observabilidad de errores en producción

> Captura automáticamente errores no manejados (excepciones, crashes, errores de renderizado) y los envía a una plataforma centralizada con stack trace, contexto del usuario y reproducibilidad.

---

## Por qué importa

Sin observabilidad: cuando algo se rompe en producción **te enteras solo si un usuario te lo dice**. Y rara vez te lo dicen — la mayoría simplemente abandonan.

Con Sentry:
- Cualquier error genera una alerta inmediata (email, Slack, etc.)
- Stack trace exacto + sourcemap → sabes la línea de código que falló
- Contexto del usuario (rol, sesión, navegador) → reproduces sin pedir info
- Frecuencia y tendencia → priorizas según impacto real

---

## Estado actual del setup

✅ **Instalado y configurado** en backend (NestJS) y frontend (Next.js).
🟡 **Inactivo en dev local** por diseño — sin `SENTRY_DSN` no se envía nada.
⏳ **Activación pendiente:** añadir DSN al `.env.local` del frontend y `.env` del backend cuando despliegues a staging o producción.

---

## Arquitectura

### Backend — NestJS

| Archivo | Rol |
|---------|-----|
| `backend/src/instrument.ts` | Inicializa Sentry SDK. Lee `SENTRY_DSN` del entorno. Sin DSN, no-op |
| `backend/src/main.ts` | Importa `./instrument` en la **primera línea** (antes que cualquier otro módulo). Crítico para captura completa |
| `backend/src/app.module.ts` | Registra `SentryModule.forRoot()` y `SentryGlobalFilter` vía `APP_FILTER` |

**Comportamiento:**
- Cualquier excepción no manejada → reportada a Sentry → procesada por `GlobalExceptionFilter` (formatea respuesta HTTP)
- Performance traces de las peticiones HTTP (10% de muestra por defecto)
- Profiling de CPU por transacción (10% de muestra por defecto)

### Frontend — Next.js (App Router)

| Archivo | Rol |
|---------|-----|
| `frontend/sentry.client.config.ts` | Init para JS del navegador. Captura errores de React, fetch, navegación |
| `frontend/sentry.server.config.ts` | Init para runtime Node de Next.js (Server Components, Route Handlers) |
| `frontend/sentry.edge.config.ts` | Init para runtime Edge (middleware) |
| `frontend/instrumentation.ts` | Punto de entrada: carga server o edge según runtime. Hook `onRequestError` para Server Components |
| `frontend/next.config.ts` | Envuelve config con `withSentryConfig` (sourcemap upload, plugin webpack) |

---

## Variables de entorno

### Backend (`backend/.env`)

| Variable | Obligatorio | Descripción |
|----------|-------------|-------------|
| `SENTRY_DSN` | Solo si quieres activar Sentry | DSN del proyecto (URL larga) |
| `SENTRY_ENVIRONMENT` | No | `development` / `staging` / `production`. Si vacío, lee `NODE_ENV` |
| `SENTRY_RELEASE` | No | Versión / git SHA. Útil para detectar regresiones por versión |
| `SENTRY_TRACES_SAMPLE_RATE` | No | 0.0 a 1.0. Default: 0.1 (muestrea 10% de las peticiones para trace) |
| `SENTRY_PROFILES_SAMPLE_RATE` | No | 0.0 a 1.0. Default: 0.1 |

### Frontend (`frontend/.env.local`)

| Variable | Obligatorio | Descripción |
|----------|-------------|-------------|
| `NEXT_PUBLIC_SENTRY_DSN` | Solo si quieres activar Sentry | Visible en navegador. DSNs son seguros públicos |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | No | Igual que backend |
| `NEXT_PUBLIC_SENTRY_RELEASE` | No | Igual que backend |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | No | Default: 0.1 |
| `SENTRY_AUTH_TOKEN` | Solo prod build | Para subir sourcemaps. **No publicar** |
| `SENTRY_ORG` | Solo si subes sourcemaps | Slug de la organización |
| `SENTRY_PROJECT` | Solo si subes sourcemaps | Slug del proyecto |

---

## Cómo activar Sentry — guía paso a paso

### Paso 1 — Crear proyecto en Sentry (5 minutos)

1. Ir a [sentry.io](https://sentry.io) → crear cuenta gratis si aún no tienes
2. Create Project → seleccionar plataforma:
   - Para backend: **Node.js → NestJS**
   - Para frontend: **JavaScript → Next.js**
3. Copiar el DSN que muestra Sentry (URL tipo `https://abcd1234@xxx.ingest.de.sentry.io/123456`)

> **Decisión:** puedes tener un solo proyecto que recoja errores de backend Y frontend, o dos proyectos separados. Empezar con uno único es más simple. Separar después si los volúmenes lo justifican.

### Paso 2 — Activar en local (opcional, no recomendado)

Solo si quieres probar Sentry mientras desarrollas. Suele ser ruidoso y consume cuota gratis.

Crea (o edita) `backend/.env`:
```env
SENTRY_DSN=https://TU_DSN_AQUI
```

Y `frontend/.env.local`:
```env
NEXT_PUBLIC_SENTRY_DSN=https://TU_DSN_AQUI
```

Reinicia los servicios. Para probar que funciona, puedes lanzar un error de prueba desde una ruta del backend o componente del frontend.

### Paso 3 — Activar en staging/producción

Cuando despliegues:

1. Configurar las variables `SENTRY_DSN` (backend) y `NEXT_PUBLIC_SENTRY_DSN` (frontend) en el servicio de hosting (Vercel, Railway, AWS, etc.)
2. Definir también `SENTRY_ENVIRONMENT=production`
3. Definir `SENTRY_RELEASE=<git-sha>` para tracking por release

### Paso 4 — Subir sourcemaps en cada build (opcional, mejora la experiencia)

Sin sourcemaps, los errores en producción muestran código minificado (ilegible). Con sourcemaps, ves el código fuente original.

1. En Sentry: Settings → Account → API → Auth Tokens → Create new token
2. Permisos necesarios: `project:releases` y `org:read`
3. Guardar el token como secret en GitHub (`SENTRY_AUTH_TOKEN`) o en variables del hosting
4. Configurar `SENTRY_ORG` y `SENTRY_PROJECT` con los slugs de Sentry

---

## CI — actualmente no requiere Sentry

El CI hace `pnpm build` con `NODE_ENV=production`, pero **no se sube nada a Sentry** porque `SENTRY_AUTH_TOKEN` no está configurado. El build pasa sin enviar datos.

Cuando quieras subir sourcemaps automáticamente desde CI:

1. Añadir `SENTRY_AUTH_TOKEN` como secret en GitHub: `Settings → Secrets and variables → Actions → New repository secret`
2. Editar `.github/workflows/ci.yml` para exponer el secret al step de build:
```yaml
- name: Build
  run: pnpm build
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
    SENTRY_ORG: tu-org-slug
    SENTRY_PROJECT: tu-project-slug
    NEXT_PUBLIC_SENTRY_DSN: ${{ secrets.NEXT_PUBLIC_SENTRY_DSN }}
```

---

## Probar que Sentry funciona

### Test 1 — Backend (con DSN configurado)

Crear endpoint temporal de test:

```ts
@Get('/sentry-test')
testSentry() {
  throw new Error('Test error from Aelium backend');
}
```

Llamar a ese endpoint → ir a Sentry UI → ver el error reportado en menos de 1 minuto.

Borrar el endpoint después.

### Test 2 — Frontend (con DSN configurado)

Crear botón temporal en una página:

```tsx
<button onClick={() => { throw new Error('Test from Aelium frontend'); }}>
  Test Sentry
</button>
```

Click → consola del navegador muestra el error → Sentry UI lo recibe.

---

## Coste

Plan gratis de Sentry:
- 5,000 errores/mes
- 10,000 transacciones/mes (performance)
- 1 GB de attachments
- Retención 30 días

Para un dashboard interno con tráfico moderado, el plan gratis sobra durante mucho tiempo.

---

## Buenas prácticas adoptadas

1. **Sentry desactivado en dev local por defecto** — sin DSN, no consume cuota ni introduce ruido
2. **`sendDefaultPii: false`** — no se envían IPs, headers de auth, body completos sin filtrar
3. **Sample rate bajo** (10%) — performance traces no abruman la cuota gratis
4. **Activación condicional por DSN** — el código no falla si Sentry no está configurado
5. **Replay de sesión deshabilitado en client por defecto** — alto coste en bytes, activar manualmente cuando haga falta debugging visual

---

## Privacidad y RGPD

Cuando actives Sentry en producción con clientes europeos:

- [ ] Mencionar Sentry en la política de privacidad como procesador
- [ ] Configurar región europea de Sentry (`*.ingest.de.sentry.io` ya lo es ✅)
- [ ] Revisar `Sentry.beforeSend()` para filtrar datos sensibles si los hay
- [ ] Configurar retención agresiva si manejas datos personales

---

## Próximos pasos

- [ ] Crear cuenta + proyecto en Sentry y obtener DSN
- [ ] Decidir si un proyecto único o separar backend/frontend
- [ ] Configurar variables en hosting cuando haya staging/prod
- [ ] (Opcional) Generar SENTRY_AUTH_TOKEN para subida automática de sourcemaps
- [ ] (Opcional) Conectar Sentry a Slack/Discord para alertas inmediatas
