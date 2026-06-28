import Link from 'next/link';
import {
  requireServerSession,
  serverFetch,
  serverFetchOrNull,
  ServerFetchError,
} from '../lib/server-auth';
import { Card, EmptyState } from '../components/ui';
import { canAccess, type AppModule } from '../lib/permissions';
import { AdminStats, AgentStats } from '../dashboard/overview/StatsGrids';
import { buildAlerts, AlertList } from '../dashboard/overview/Sections';
import type {
  OverviewStats,
  AdminOverviewKpis,
  DecisionSignal,
  TeamLoad,
} from '../lib/api';
import TasksWidget from '../_shared/widgets/TasksWidget';
import { ExecutiveDashboard } from './_components/ExecutiveDashboard';
import s from './admin-home.module.css';

/* ═══════════════════════════════════════
   /admin — landing del portal STAFF: overview role-aware.

   F3·E7 (rediseño): para el rol **admin** (superadmin / agent_full) la landing
   es el **dashboard ejecutivo** del mockup `admin/Inicio.dc.html` — KPIs +
   "Requiere tu decisión" + "Carga del equipo", servido por `/admin/overview*`.
   Para el rol **agente** (agent_billing / agent_support) se conserva el overview
   operativo GL-22 (AgentStats + alertas + accesos rápidos + TasksWidget): el
   panel ejecutivo expone ingresos globales, que un agente no debe ver.

   Accesos rápidos gateados por `canAccess` (única fuente de permisos, ADR-067).
   ═══════════════════════════════════════ */

const ADMIN_ROLES = ['superadmin', 'agent_full'];

interface QuickTile {
  href: string;
  module: AppModule;
  title: string;
  desc: string;
}

const QUICK_TILES: QuickTile[] = [
  { href: '/admin/clients', module: 'Client', title: 'Clientes', desc: 'Buscar y gestionar clientes' },
  { href: '/admin/support', module: 'Conversation', title: 'Soporte', desc: 'Tickets y conversaciones' },
  { href: '/admin/support/chats', module: 'Conversation', title: 'Chats en vivo', desc: 'Panel de agente' },
  { href: '/admin/tasks', module: 'Task', title: 'Tareas', desc: 'Tu cola de trabajo' },
  { href: '/admin/billing', module: 'Invoice', title: 'Facturación', desc: 'Facturas y cobros' },
  { href: '/admin/products', module: 'Product', title: 'Productos', desc: 'Catálogo de servicios' },
  { href: '/admin/services', module: 'Service', title: 'Servicios', desc: 'Servicios contratados' },
  { href: '/admin/error-log', module: 'ErrorLog', title: 'Error Log', desc: 'Errores del sistema' },
  { href: '/admin/jobs/failed', module: 'Job', title: 'Jobs en DLQ', desc: 'Reintentar jobs fallidos' },
];

function getGreeting(name: string): { title: string; subtitle: string } {
  const hour = new Date().getHours();
  let period = 'Buenos días';
  if (hour >= 14 && hour < 21) period = 'Buenas tardes';
  else if (hour >= 21 || hour < 6) period = 'Buenas noches';
  return { title: `${period}, ${name}`, subtitle: '¿Qué tienes pendiente hoy?' };
}

export default async function AdminHomePage() {
  const session = await requireServerSession();
  const user = session.user;
  const roleSlug = user.role?.slug || '';

  // ── Admin (superadmin / agent_full): dashboard ejecutivo E7 ──
  if (ADMIN_ROLES.includes(roleSlug)) {
    const [kpis, decisions, teamLoad] = await Promise.all([
      serverFetchOrNull<AdminOverviewKpis>('/admin/overview'),
      serverFetchOrNull<DecisionSignal[]>('/admin/overview/decisions'),
      serverFetchOrNull<TeamLoad>('/admin/overview/team-load'),
    ]);
    return (
      <ExecutiveDashboard
        firstName={user.first_name}
        kpis={kpis}
        decisions={decisions}
        teamLoad={teamLoad}
      />
    );
  }

  // ── Agente / fallback: overview operativo (GL-22) ──
  let stats: OverviewStats | null = null;
  try {
    stats = await serverFetch<OverviewStats>('/dashboard/overview');
  } catch (err) {
    /* Errores de red no rompen la landing; las stats simplemente no aparecen. */
    if (!(err instanceof ServerFetchError)) throw err;
  }

  const greeting = getGreeting(user.first_name);
  const alerts = stats ? buildAlerts(stats) : [];
  const tiles = QUICK_TILES.filter((t) => canAccess(roleSlug, t.module));

  return (
    <div className={s.container}>
      <div>
        <h1 className={s.greetingTitle}>{greeting.title}</h1>
        <p className={s.greetingSubtitle}>{greeting.subtitle}</p>
      </div>

      {stats?.role === 'admin' && <AdminStats stats={stats} />}
      {stats?.role === 'agent' && <AgentStats stats={stats} />}

      <TasksWidget />

      <div className={s.sections}>
        <Card>
          <div className={s.sectionBody}>
            <h2 className={s.sectionTitle}>Alertas</h2>
            {alerts.length === 0 ? (
              <EmptyState
                title="Todo en orden"
                description="Sin alertas activas. Buen trabajo."
              />
            ) : (
              <AlertList alerts={alerts} />
            )}
          </div>
        </Card>

        <Card>
          <div className={s.sectionBody}>
            <h2 className={s.sectionTitle}>Accesos rápidos</h2>
            <div className={s.tiles}>
              {tiles.map((t) => (
                <Link key={t.href} href={t.href} className={s.tile}>
                  <div className={s.tileTitle}>{t.title}</div>
                  <div className={s.tileDesc}>{t.desc}</div>
                </Link>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
