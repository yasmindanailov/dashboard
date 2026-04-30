-- Sprint 8 Fase B.10 (2026-04-30) — ADR-074
-- Añade el valor `support_ticket` al enum `TaskType`. Tareas creadas
-- automáticamente al asignar un ticket. SIEMPRE tienen `conversation_id`
-- poblado (la columna FK ya existe desde Sprint 8 Fase A).

ALTER TYPE "TaskType" ADD VALUE 'support_ticket';
