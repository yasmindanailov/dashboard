import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Solicitud de borrado del titular (GL-5 / H3b.2). Motivo opcional. */
export class RequestAccountDeletionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** Rechazo de una solicitud por el admin: nota obligatoria. */
export class RejectAccountDeletionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  note!: string;
}
