/* ═══════════════════════════════════════════════════════════════
   Agrupación temporal + tiempo relativo (F3·E10).

   El mockup agrupa las notificaciones en "Hoy / Esta semana / Anteriores".
   Helpers puros (sin React) → testeables y reutilizables en cliente y admin.
   ═══════════════════════════════════════════════════════════════ */

export interface DatedItem {
  created_at: string;
}

export interface NotificationGroup<T> {
  key: 'hoy' | 'semana' | 'antes';
  label: string;
  items: T[];
}

const GROUP_LABELS: Record<NotificationGroup<unknown>['key'], string> = {
  hoy: 'Hoy',
  semana: 'Esta semana',
  antes: 'Anteriores',
};

/**
 * Agrupa por bucket temporal preservando el orden de entrada (el backend ya
 * ordena por `created_at` desc). `now` inyectable para tests deterministas.
 */
export function groupNotificationsByDate<T extends DatedItem>(
  items: T[],
  now: Date = new Date(),
): NotificationGroup<T>[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  // "Esta semana" = últimos 7 días naturales (incluye hoy).
  const weekStart = new Date(startOfToday);
  weekStart.setDate(weekStart.getDate() - 6);

  const buckets: Record<NotificationGroup<T>['key'], T[]> = {
    hoy: [],
    semana: [],
    antes: [],
  };

  for (const item of items) {
    const t = new Date(item.created_at).getTime();
    if (t >= startOfToday.getTime()) buckets.hoy.push(item);
    else if (t >= weekStart.getTime()) buckets.semana.push(item);
    else buckets.antes.push(item);
  }

  return (['hoy', 'semana', 'antes'] as const)
    .map((key) => ({ key, label: GROUP_LABELS[key], items: buckets[key] }))
    .filter((g) => g.items.length > 0);
}

/**
 * Tiempo relativo legible en es-ES ("ahora", "hace 5 min", "hace 2 h",
 * "hace 3 d"); fechas más antiguas caen a fecha corta. `now` inyectable.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  const diffMs = now - t;
  if (diffMs < 60_000) return 'ahora';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return new Date(iso).toLocaleDateString('es-ES');
}
