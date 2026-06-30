/* ═══════════════════════════════════════
   Tipos — Respuestas guardadas (macros de soporte). Rediseño UI F3·E12.
   Biblioteca de equipo compartida por el staff de soporte.
   Snake_case alineado con el payload REST del backend.
   ═══════════════════════════════════════ */

export interface ResponseTemplate {
  id: string;
  title: string;
  body: string;
  category: string | null;
  created_by: string | null;
  creator_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResponseTemplateInput {
  title: string;
  body: string;
  category?: string;
}
