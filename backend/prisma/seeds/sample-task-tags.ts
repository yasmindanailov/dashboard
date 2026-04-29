import { PrismaClient } from '@prisma/client';

/**
 * Sprint 8 Fase B.7 (2026-04-29) — ADR-073.
 *
 * Seed inicial de etiquetas canónicas para `task_tags`. Sirven como
 * semilla operativa mínima para que el `NewTaskModal` tenga lista no
 * vacía desde el primer día y para que listeners futuros (Sprint 11
 * `ContactClientTaskListener`) puedan asignar el slug `bienvenida`
 * automáticamente al crear tareas WOW.
 *
 * Salvaguardas:
 *  - Idempotente vía upsert por slug.
 *  - Ejecutable en cualquier entorno (dev/test/prod) — los tags son
 *    catálogo operativo, no datos demo. Si en el futuro queremos que
 *    sólo se siembren en dev, añadir guard NODE_ENV.
 *  - Colores opcionales con paleta del Design System (--brand,
 *    --warning, --danger, --success, --text-secondary).
 */

interface SeedTaskTag {
  slug: string;
  label: string;
  color?: string;
}

const CANONICAL_TAGS: SeedTaskTag[] = [
  { slug: 'bienvenida', label: 'Bienvenida', color: '#635BFF' },
  { slug: 'renovacion', label: 'Renovación', color: '#0EA5E9' },
  { slug: 'incidencia', label: 'Incidencia', color: '#EF4444' },
  { slug: 'migracion', label: 'Migración', color: '#F59E0B' },
  { slug: 'cortesia', label: 'Cortesía', color: '#10B981' },
];

export async function seedSampleTaskTags(
  prisma: PrismaClient,
): Promise<void> {
  for (const tag of CANONICAL_TAGS) {
    await prisma.taskTag.upsert({
      where: { slug: tag.slug },
      update: { label: tag.label, color: tag.color },
      create: { slug: tag.slug, label: tag.label, color: tag.color },
    });
  }
  // eslint-disable-next-line no-console
  console.log(
    `  ✓ ${CANONICAL_TAGS.length} task_tags canónicos upserted (ADR-073)`,
  );
}
