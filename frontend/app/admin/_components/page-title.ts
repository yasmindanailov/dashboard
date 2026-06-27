/* ═══════════════════════════════════════
   Título de página del topbar admin (F2) — derivado del pathname.
   El mockup admin/Shell.dc.html muestra un único título (no migas).
   Labels alineados con el mapa del mockup (líneas 561-566).
   ═══════════════════════════════════════ */

interface TitleRule {
  prefix: string;
  label: string;
}

/* Prefijos más específicos primero (match por longitud descendente). */
const TITLES: TitleRule[] = [
  { prefix: '/admin/support/chats', label: 'Chat en vivo' },
  { prefix: '/admin/support-inside-plans', label: 'Support Inside' },
  { prefix: '/admin/notifications/templates', label: 'Plantillas de notificaciones' },
  { prefix: '/admin/account-deletion', label: 'Solicitudes de borrado' },
  { prefix: '/admin/error-log', label: 'Error Log' },
  { prefix: '/admin/clients', label: 'Clientes' },
  { prefix: '/admin/products', label: 'Productos' },
  { prefix: '/admin/services', label: 'Servicios' },
  { prefix: '/admin/billing', label: 'Facturación' },
  { prefix: '/admin/support', label: 'Soporte' },
  { prefix: '/admin/tasks', label: 'Tareas' },
  { prefix: '/admin/settings', label: 'Configuración' },
  { prefix: '/admin/users', label: 'Equipo' },
  { prefix: '/admin/jobs', label: 'Jobs en DLQ' },
  { prefix: '/admin/notifications', label: 'Notificaciones' },
  { prefix: '/admin/profile', label: 'Mi perfil' },
];

export function getAdminTitle(pathname: string): string {
  if (pathname === '/admin') return 'Inicio';
  const rule = TITLES.find((t) => pathname === t.prefix || pathname.startsWith(t.prefix + '/'));
  return rule?.label ?? 'Panel de administración';
}
