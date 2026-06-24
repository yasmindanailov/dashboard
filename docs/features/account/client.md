# Mi cuenta (cliente) — guía operativa

> **Audiencia:** cliente. **Ruta:** `/dashboard/profile` ("Mi cuenta").
> **Doctrina:** [ADR-085](../../10-decisions/adr-085-cuenta-cliente-self-service.md) (+ [ADR-013 Amendment A1](../../10-decisions/adr-013-2fa-email.md#amendments) para el 2FA opt-in).
> **Acceso:** menú de usuario (arriba a la derecha) → **Mi perfil**.

La página de cuenta es **self-service**: todo se deriva de tu sesión (JWT), nunca de un
identificador en la URL. Está organizada en cuatro secciones (pestañas).

## Cuenta

Tus datos de identidad: **nombre**, **apellidos**, **idioma** y **zona horaria**.
El **email es de sólo lectura** (cambiarlo es un flujo aparte, aún no disponible) y se
muestra si está verificado. Guardar aquí **no** afecta a tus dominios (eso es la
sección *Dominios*).

- Endpoint: `PATCH /account/profile`.

## Seguridad

- **Contraseña:** introduce la actual + la nueva (mín. 8, con mayúscula, minúscula y
  número). Al cambiarla se **cierran tus sesiones en los demás dispositivos**; la actual
  se mantiene. Endpoint: `POST /account/change-password`.
- **Verificación en dos pasos (2FA):** opcional para clientes. Al activarla, en el
  próximo inicio de sesión te pediremos un **código enviado a tu email**. Activar o
  desactivar pide confirmar tu contraseña. *(Las cuentas de staff tienen el 2FA exigido
  por su rol y no pueden desactivarlo.)* Endpoints: `POST /account/2fa/{enable,disable}`.
- **Sesiones activas:** lista de dispositivos con la cuenta abierta. Puedes **cerrar**
  una concreta o **cerrar todas** (esto te cerrará también la sesión actual y tendrás
  que volver a entrar). Endpoints: `DELETE /auth/sessions/:id`, `POST /account/logout-all`.

## Facturación

Gestiona tus **perfiles de facturación** — los datos fiscales que aparecen en tus
facturas (a diferencia de los datos de titular WHOIS, que son para dominios).

- Crea perfiles de tipo **Particular / Autónomo / Empresa**. El **NIF/CIF es
  obligatorio** para autónomo y empresa; la **razón social** para empresa.
- Marca uno como **predeterminado** (el que se usa por defecto al facturar).
- No puedes eliminar el perfil predeterminado: marca otro como predeterminado primero.
- Endpoints: `GET/POST/PATCH/DELETE /account/billing-profiles` (+ `/:id/default`).

## Dominios (titular / WHOIS)

Sólo aparece si tienes el dato de titular disponible. Son los datos del **titular ante
el registrador**, **compartidos por todos tus dominios** (1 por cliente). Al guardarlos
se **propagan al registrador** (puede tardar). Cambiar el **nombre del titular** puede
disparar verificación por email y un **bloqueo de transferencia de 60 días** (ICANN).

- Endpoint: `GET/PUT /domains/registrant`.

---

## Notas de implementación

- Todos los endpoints son **self-scoped por el JWT** (sin IDOR): el backend deriva el
  `userId` de la sesión, nunca de un parámetro.
- Las acciones de seguridad (contraseña, 2FA, cierre de sesiones) se **auditan** en
  `audit_access_log` (R3).
- El **staff** tiene su cuenta en `/admin/profile` (portal admin, ADR-066): mismas secciones
  **Cuenta + Seguridad** (sin Facturación ni Dominios), reutilizando los componentes de
  `_shared/account/`. El menú "Mi perfil" enruta por rol.
- Diferido v1: cambio de email; subida de avatar a MinIO.
