# Plugin ResellerClub — registrar de dominios (admin)

> **Estado:** Fase 15D.D (plugin core). Documento operativo seminal — se completa
> en la Fase 15D.G (cierre del sprint, con el smoke OT&E real). Doctrina:
> [ADR-081](../../10-decisions/adr-081-plugin-resellerclub-specifics.md) (specifics RC) ·
> [ADR-077 A10/A11/A12](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) (sub-contrato registrar) ·
> [ADR-084](../../10-decisions/adr-084-comercio-dominios-registrar.md) (comercio de dominios) ·
> [ADR-082](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) (Domain↔Hosting+DNS).

## Qué es

`resellerclub` es el primer **registrar de dominios** del proyecto (LogicBoxes
API). Registra, renueva y gestiona dominios; **no** es autoridad DNS (esa es
Enhance — ADR-082, DH-INV-7). El cliente nunca accede al panel RC: Aelium es la
puerta unificada (ADR-070, `has_sso_panel=false`).

Capabilities: `is_domain_registrar=true`, `has_dns_management=false`,
`has_sso_panel=false`, `supports_suspend=true`, `supports_reconciliation=true`,
`provision_mode='sync'`.

## Configuración (`/admin/settings/plugins/resellerclub`)

**Config** (`plugin.resellerclub.*`):

| Campo | Default | Descripción |
|-------|---------|-------------|
| `environment` | `sandbox` | `sandbox` (OT&E `test.httpapi.com`) o `production` (`httpapi.com`). |
| `markup_percent` | `25` | Margen sobre el coste mayorista al poblar `domain_tld_pricing` (cron, Fase E). |
| `tlds_offered` | `.com,.net,.org,.es,.eu` | TLDs ofertados (CSV — el manifest solo admite escalares). |
| `default_currency` | `EUR` | Moneda única v1 (coste y venta deben coincidir — ADR-084 A1.2). |

**Secrets** (vault AES-256-GCM, ADR-080 — nunca en logs, R12):

| Campo | Descripción |
|-------|-------------|
| `authUserId` | Reseller Id (`auth-userid`). |
| `apiKey` | API key (`api-key`). Principio de mínimo privilegio sobre la password. |

> **IP whitelist (P-DEPLOY):** `httpapi.com` está tras Cloudflare; la IP del
> servidor debe estar whitelisteada en el panel RC (Settings → API), o las
> llamadas reciben un challenge del WAF → `PROVIDER_AUTH_FAILED` (DC.NEW-63).

**Probar conexión:** el botón usa `testConnection()` — un probe de solo lectura
(`products/reseller-price`) que valida credenciales + atraviesa el WAF sin
registrar nada.

## Qué hace hoy (Fase 15D.D)

- **Registro** (`provision(register)`): pre-flight de disponibilidad + **DOM-INV-1**
  (exactly-once por nombre; adopta el registro existente bajo nuestra cuenta tras
  un crash, no re-registra) + alta lazy de customer + 4 contact handles WHOIS
  (1 contacto reutilizado en los 4 roles) + `domains/register` con
  NS = `provisioning.default_nameservers` y WHOIS privacy ON.
- **Estado** (`getServiceInfo`/`getStatus`): mapea `domains/details` → estado +
  `DomainInfo` (nameservers, expiración, lifecycle ICANN, privacy, lock, resumen
  de contactos sin PII).
- **Pre-venta** (`checkDomainAvailability`, `getTldPricing`) para buscador + cron
  de pricing (Fase E).
- El orquestador emite **`domain.registered`** (Outbox) tras un registro nuevo.

## Pendiente (fases siguientes)

- **15D.E:** renovación (`provision(renew)` + DOM-INV-4) + lifecycle de expiración
  + crons de reconcile/pricing/avisos.
- **15D.F:** acciones de gestión (`executeAction`: NS/contactos/privacy/lock/
  auth-code) + admin suspend/unsuspend + zona DNS post-register + frontend.
- **15D.G:** smoke OT&E real (refina los shapes `register`/`details` conservadores
  — ADR-081 A1.5) + cierre.

## Notas operativas

- **Cancelar un servicio de dominio NO borra el dominio en RC** (deprovision =
  no-op): el dominio está pagado y persiste hasta su expiración (ADR-081 A3.1).
  El borrado en período de gracia (reembolso) será una acción admin explícita
  (Fase F).
- Testing: CI usa siempre el `MockResellerClubServer`, nunca OT&E live
  (ADR-081 §11).
