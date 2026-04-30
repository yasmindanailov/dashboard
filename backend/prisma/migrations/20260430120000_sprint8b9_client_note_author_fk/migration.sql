-- Sprint 8 Fase B.9 (2026-04-30) — añade la FK física que respalda la
-- relación `ClientNote.author User @relation("ClientNoteAuthor")`
-- declarada en `schema.prisma`. Hasta hoy, `author_id` era una
-- referencia lógica sin constraint a nivel BD — coherente con el
-- patrón histórico del repo, pero deja un drift latente que `prisma
-- migrate dev` detectaría en cualquier cambio futuro de schema.
--
-- ON DELETE RESTRICT: una nota debe poder rastrearse a su autor; si
-- el agente que la creó se elimina, la operación se bloquea (decisión
-- de negocio: las notas son auditoría intermedia entre staff y cliente,
-- no se pueden anonimizar silenciosamente). Si un autor debe darse de
-- baja, primero hay que reasignar/borrar sus notas explícitamente.

ALTER TABLE "client_notes"
  ADD CONSTRAINT "client_notes_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
