# Plugins de provisioning — Gestión admin (`/admin/settings/plugins`)

> Sprint 15A — ADR-080. Operativa diaria del superadmin para habilitar/deshabilitar plugins, configurarlos, escribir credenciales del proveedor cifradas y probar la conexión.
>
> Audiencia: **superadmin exclusivo** (Subject `Plugin` admin-puro — ADR-080 + ADR-067). El resto de staff recibe 403.

---

## 1. ¿Qué es esta página?

`/admin/settings/plugins` es el panel donde el superadmin gestiona los **plugins de provisioning** (`internal`, `manual`, y futuros `enhance_cp`, `resellerclub`, `docker_engine`, `stripe`...). Cada plugin es una pieza intercambiable que sabe hablar con un proveedor externo (o con sí mismo en el caso de los triviales).

Lo que el superadmin puede hacer aquí:

1. **Ver el catálogo** de plugins disponibles + el estado de cada uno (Activo · Deshabilitado · Caído · Recuperando).
2. **Habilitar / deshabilitar** un plugin sin redeploy.
3. **Editar la configuración** (URLs, branch IDs, flags...) — campos NO sensibles.
4. **Escribir credenciales** (api keys, webhook secrets) que el backend cifra antes de persistir.
5. **Probar la conexión** con el proveedor externo (los plugins que lo soporten).

---

## 2. ¿Por qué solo el superadmin?

Los plugins manejan **credenciales sensibles del proveedor** (api keys de Stripe, Enhance CP, ResellerClub, etc.). Un agente con acceso a la api key de Stripe podría retirar dinero del cliente; uno con acceso a la api de Enhance podría borrar el hosting de un cliente. El patrón canónico de control:

- Triple guard backend: `JwtAuthGuard` + `AdminOnlyGuard` + `PoliciesGuard` con CASL `Manage Plugin`.
- En la matriz CASL, `Subject.Plugin` solo aparece en el rol `superadmin` (ADR-080 §"Decisión" + permissions.ts inverted Plugin para agent_full).
- En el frontend, `routeRequiredModules['/admin/settings/plugins'] = 'Plugin'` y `SIDEBAR_PERMISSIONS.superadmin` lo lista.

---

## 3. Estado visual de un plugin

El badge en cada card combina dos señales:

| Combinación | Etiqueta | Variante | Significado |
|-------------|----------|----------|-------------|
| `circuit_state.getServiceInfo === 'open'` o `executeAction === 'open'` | **Caído** | danger (rojo) | El proveedor está fallando — el circuit breaker abrió el circuito y el plugin no se invoca. Se reintenta solo cada 30s (half-open). |
| `circuit_state.*` en `'half-open'` | **Recuperando** | warning (ámbar) | Probe call en curso. Si pasa → cierra circuito. Si falla → abre de nuevo. |
| `enabled === true` y todos los breakers `'closed'`/null | **Activo** | success (verde) | Operativo. |
| `enabled === false` | **Deshabilitado** | neutral (gris) | El admin lo desactivó. Servicios afectados quedan en `pending` (no se procesan provisioning ni acciones). |

Si un plugin aparece sin `manifest`, significa que el contrato falló validación al boot (rejected por `PluginRegistryService.tryValidate` — ver `_logs/`).

---

## 4. Flujos canónicos

### 4.1. Habilitar un plugin nuevo (ej. `enhance_cp`)

> Pre-requisito: el plugin está registrado vía DI en `ProvisioningModule` (lo añade el equipo de backend al desarrollar el plugin — Sprint 15C/D/E). Sin DI, NO aparece en la lista admin.

1. Entrar en `/admin/settings/plugins` → la card de `enhance_cp` aparece como **Deshabilitado**.
2. Click en la card → `/admin/settings/plugins/enhance-cp`.
3. Rellenar la sección **Configuración** (campos NO secretos del manifest, ej. `base_url`, `branch_id`).
4. Rellenar la sección **Credenciales** (campos secretos del manifest, ej. `api_key`).
5. Click en **Probar conexión** → el backend invoca `plugin.getStatus()` con un service sintético. Resultado verde si el proveedor responde OK con esas credenciales.
6. Si OK, click en **Habilitar**. Estado del plugin pasa a **Activo**.

### 4.2. Rotar una credencial

Las credenciales NUNCA se devuelven al frontend en plaintext (R12). El detalle del plugin muestra solo `'***'` (campo seteado) o `null` (campo vacío).

Para rotar una credencial:

1. Entrar en `/admin/settings/plugins/<slug>`.
2. En la sección **Credenciales**, escribir el **nuevo plaintext** en el campo (el placeholder `*** (deja vacío para mantener el valor actual)` indica que ya hay un valor cifrado).
3. Click en **Guardar cambios**.
4. El backend descifra los campos no tocados, mezcla con el nuevo plaintext, y vuelve a cifrar el conjunto. Audit registra `secrets: { api_key: '<set>' }` en `changes_after` (NUNCA el plaintext).

### 4.3. Apagar urgentemente un plugin caído

Caso típico: un proveedor sufre incidente prolongado y el circuit breaker se reabre cada 30s sin éxito. Para que los servicios queden definitivamente en `pending` mientras se restaura:

1. Click en **Deshabilitar** en la sección **Estado del plugin**.
2. El registry recarga `activePlugins` vía `plugin.config_changed` event (sin redeploy).
3. Las llamadas posteriores a `getOrThrow(<slug>)` lanzan con mensaje `"validated but not enabled in plugin_installs"`.
4. Cuando el proveedor se recupere, click en **Habilitar** de nuevo.

### 4.4. Deshabilitar `internal` o `manual` por error

Los plugins triviales `internal` (Support Inside, productos digitales) y `manual` (hosting-pro hoy, productos con setup manual) son **bootstrap canónico** del seed y NUNCA deberían estar `enabled=false` en producción. Si se deshabilitan por error:

- Los servicios correspondientes quedan inmediatamente en `pending` y no se procesan.
- Los crons de reconciliación log error "plugin not active".
- Restablecer: re-habilitar desde la UI o `pnpm seed` (preserva `enabled=true` para los bootstrap; los plugins reales conservan el flag manual del admin).

---

## 5. Auditoría y trazabilidad

Cada PATCH genera una fila en `audit_change_log` con:

```json
{
  "entity_type": "Plugin",
  "entity_id": "<slug>",
  "action": "plugin.config_changed",
  "user_id": "<superadmin_id>",
  "changes_before": {
    "enabled": false,
    "config": { "base_url": "https://old.api.example.com" },
    "secrets": { "api_key": "<set>" }
  },
  "changes_after": {
    "enabled": true,
    "config": { "base_url": "https://new.api.example.com" },
    "secrets": { "api_key": "<set>" }
  }
}
```

Los plaintexts de los secretos NUNCA aparecen en audit (R3 + R12 + ADR-080 §3). Solo se distingue `<set>` (campo seteado) vs `<cleared>` (campo vacío).

---

## 6. Eventos canónicos del lifecycle

Cada acción del admin emite un evento canónico documentado en [`docs/20-modules/_events.md` §🔌 plugin.*](../../20-modules/_events.md):

| Acción admin | Evento | Consumidor |
|--------------|--------|-----------|
| Primer enable de un plugin | `plugin.installed` | (audit cubierto vía logChange) |
| Cualquier PATCH (enabled/config/secrets) | `plugin.config_changed` | `PluginRegistryService.handleConfigChanged` recarga `activePlugins` |
| (Futuro) Desinstalar plugin del DI | `plugin.uninstalled` | Reservado, no emitido en Sprint 15A |
| Circuit abre (5 fallos en 60s) | `plugin.circuit_opened` | `NotificationsPluginCircuitListener` → notif `internal` + `email` superadmin |
| Circuit cierra | `plugin.circuit_closed` | `NotificationsPluginCircuitListener` → notif `internal` informativa (sin email) |

---

## 7. Errores comunes

### `INVALID_PLUGIN_CONFIG` / `INVALID_PLUGIN_SECRETS`

El payload no cumple el JSON-Schema declarado en el manifest del plugin. El form muestra el error inline. Causas típicas: campo requerido omitido, formato `uri`/`email` mal formado, longitud `minLength` insuficiente, valor fuera del `enum`.

**Acción**: corregir el campo señalado y reintentar guardar.

### `Plugin not registered`

El slug no está disponible vía DI. Causa: el plugin fue eliminado del `ProvisioningModule` o falló contract validation al boot.

**Acción**: revisar logs de boot del backend. Buscar `Plugin "<slug>" rejected:` en stderr para ver la razón exacta.

### Circuito cerrado pero el proveedor sigue caído

Ocurre cuando el breaker entra en half-open, hace una probe call que pasa por casualidad (ej. cache local del proveedor responde 200), pero las siguientes llamadas vuelven a fallar. El breaker re-abre de inmediato. Si el patrón se repite, deshabilitar el plugin temporalmente desde la UI.

---

## 8. Referencias

- [ADR-080 — Plugin Framework](../../10-decisions/adr-080-plugin-framework.md) — fuente de verdad arquitectónica.
- [ADR-077 — Contrato `ProvisionerPlugin` v2](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) — congelación del slug.
- [`docs/30-data/plugin-installs.md`](../../30-data/plugin-installs.md) — schema canónico.
- [`docs/20-modules/_events.md` §🔌 plugin.*](../../20-modules/_events.md) — 5 eventos canónicos.
- [`docs/features/provisioning/admin.md`](./admin.md) — operativa del orquestador (qué hace cuando un plugin se invoca).
