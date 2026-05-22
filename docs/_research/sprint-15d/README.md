# Sprint 15D.B0 — Research + verificación OT&E de la API ResellerClub

> **Tipo:** Research empírico de pre-implementación. Materializa la sub-fase **15D.B0** del [plan de sprint](../../60-roadmap/current.md) y la estrategia de testing de [ADR-081 §11](../../10-decisions/adr-081-plugin-resellerclub-specifics.md).
> **Objetivo:** capturar los **shapes reales** (request params + response + códigos de error) de los endpoints del scope v1 de ResellerClub, para alimentar el cliente HTTP y el `MockResellerClubServer` de alta fidelidad **antes** de escribir el código de la fundación (15D.B/C).

---

## Por qué este research (y por qué empírico)

A diferencia de Enhance (que publica un **OpenAPI 3 literal**, capturado en `docs/_research/sprint-15c/orchd-oas3-api.yaml`), ResellerClub **no** expone un spec descargable: su KB bloquea fetches automáticos con Cloudflare (HTTP 403 confirmado en `manage.resellerclub.com/kb` y `resellerclub.webpropanel.com/kb`). El [catálogo del dossier §4](../../60-roadmap/sprint-15d-resellerclub-dossier.md) es **~95 %** por cross-referencia.

Por tanto, la robustez aquí **no** viene de un documento, sino de **verificar contra la API en vivo**. Lección **L20** (15C.II): *profundidad sobre superficie* — un mock que solo modela el happy path da verde mientras producción falla. Capturamos la verdad de la API y construimos el mock sobre ella.

## Fuentes (en orden de autoridad)

1. **Verificación empírica contra OT&E** (sandbox `test.httpapi.com`) — **la verdad**. Script `backend/scripts/research-resellerclub-ote.ts`.
2. **Wrappers open-source en producción** — [`phillipsdata/logicboxes`](https://github.com/phillipsdata/logicboxes) (PHP, mapean 1:1 endpoint→método). Módulos: `logicboxes_domains.php`, `logicboxes_customers.php`, `logicboxes_contacts.php`, `logicboxes_orders.php`. Dan los **endpoints + nombres de parámetros**.
3. **Catálogo del dossier §4** (~95 %) — punto de partida del scope.
4. **Doc oficial (KB)** — solo si (1)+(2) dejan una ambigüedad concreta; se consulta el artículo puntual (Yasmin puede abrirlo en su navegador; el agente no, por Cloudflare).

## Entorno y seguridad

- **Solo OT&E (sandbox)**: el script apunta **exclusivamente** a `https://test.httpapi.com/api/`. Nunca a producción (`httpapi.com`).
- Credenciales en `backend/.env` (`RESELLERCLUB_OTE_USERID` + `RESELLERCLUB_OTE_APIKEY`) — leídas en runtime, **nunca impresas** en logs ni en los findings (R12).
- **IP whitelisteada** en el panel demo (Settings → API). Tarda 30–60 min en activarse.
- El demo **se resetea cada 24 h** (todas las órdenes se borran) — suficiente para capturar shapes; sin persistencia entre días.
- `register`/`renew`/`transfer` en OT&E son **sandbox**: sin coste ni dominios reales.

## Scope de la verificación (v1 core — register + renew + gestión)

| Bloque | Endpoints a capturar |
|---|---|
| Pre-venta | `domains/available`, `domains/suggest-names` (opc.), pricing por TLD (`products/*-price` — endpoint a confirmar) |
| Customer/contact | `customers/signup` (v2), `customers/search`, `contacts/add`, `contacts/details` |
| Provisioning | `domains/register`, `domains/renew`, `domains/details` / `details-by-name` |
| Gestión | `domains/modify-ns`, `domains/modify-contact`, `domains/modify-privacy-protection`, `domains/modify-auth-code`, `domains/enable`/`disable-theft-protection` |
| Admin | `orders/suspend`, `orders/unsuspend` |

(Transfer-in, child-NS, forwarding, premium → Sprint 15D.II; no se verifican aquí salvo `validate-transfer` informativo.)

## Salida

- `resellerclub-ote-findings.md` — por endpoint: request real (sin credenciales), response real (shape + ejemplo), códigos de error observados, mapeo a `ProvisionerErrorCode` ([ADR-077 A10](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md)), y notas para el cliente/mock.
- Divergencias respecto al catálogo ~95 % → ajuste de [ADR-081](../../10-decisions/adr-081-plugin-resellerclub-specifics.md) / dossier (L18: amendment, no desvío silencioso).
