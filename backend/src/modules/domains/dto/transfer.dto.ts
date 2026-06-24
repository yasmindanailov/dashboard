import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * DTOs de transfer-in — Sprint 15D.II.T2c.3 (carrito único + auth-code post-checkout).
 *
 * El **auth-code EPP** se aporta DESPUÉS del checkout (nunca en el carrito): es
 * secreto (R12, redactado en logs/audit) y no debe bloquear el checkout en la API
 * del registrar. El precio del transfer se resuelve SIEMPRE server-side (R5).
 */

/** `POST /domains/:id/transfer/submit-auth` — el cliente aporta el EPP auth-code. */
export class SubmitTransferAuthDto {
  /**
   * EPP / auth-code del dominio en el registrar de origen. Secreto (R12): NUNCA
   * se loguea ni se persiste en claro — viaja en memoria hasta `initiateTransferIn`.
   * Sin `@Matches` (los códigos EPP admiten caracteres heterogéneos por registrar).
   */
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  authCode: string;
}

/** `POST /domains/transfer-quote` — precio de transferencia de un FQDN (pre-carrito). */
export class TransferQuoteDto {
  /** FQDN completo que el cliente ya posee y quiere transferir (sld.tld). */
  @IsString()
  @MaxLength(255)
  @Matches(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/,
    {
      message:
        'fqdn inválido: debe ser un dominio completo (p.ej. midominio.com).',
    },
  )
  fqdn: string;
}
