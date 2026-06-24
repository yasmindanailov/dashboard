import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * ADR-029 — cuerpo del confirm de cambio de plan. Solo el plan destino: el
 * importe NUNCA viaja desde el cliente (R5: el prorrateo se recalcula server-side
 * en el momento de confirmar).
 */
export class ConfirmPlanChangeDto {
  @ApiProperty({
    description: 'ID del ProductPricing destino (mismo producto, otro ciclo).',
    format: 'uuid',
  })
  @IsUUID()
  newPricingId!: string;
}
