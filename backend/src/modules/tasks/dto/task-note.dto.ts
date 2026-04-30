/* ═══════════════════════════════════════
   TaskNote DTO — Sprint 8 Fase B.9 (2026-04-30)
   Notas internas inline durante la ejecución de la tarea.
   Persisten como `ClientNote` con `category=technical` + `task_id`.
   ═══════════════════════════════════════ */

import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Sprint 8 Fase B.9 (2026-04-30).
 *
 * Body máximo 5000 caracteres — alineado con `client_note` y
 * `internal_notes` ya validados en `task.dto.ts`. El POST es
 * inmediatamente persistente (no acumulado en estado del cliente),
 * para que el agente vea su nota en la lista en cuanto guarda.
 */
export class CreateTaskNoteDto {
  @ApiProperty({
    description:
      'Texto libre de la nota interna. Solo visible al equipo (no se notifica al cliente).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;
}
