/**
 * /admin/support-inside-plans — Sprint 13 §13.AUTH Fase E (Modelo A).
 * Server Component nativo. Lista 3 planes seedeados (Básico/Medium/Pro)
 * cargados via serverFetch. Click → editor `/admin/support-inside-plans/<slug>`.
 * ADR-078 Amendment A1 + ADR-075 §B.2 (vista admin no comparador).
 */

import { ListPage } from '../../components/ui';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type { SupportInsideAdminPlanRow } from '../../lib/api';
import PlansListView from './_components/PlansListView';
import s from './page.module.css';

const Icon = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    className={s.introIcon}
    aria-hidden="true"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <path d="M8 9h8" />
    <path d="M8 13h5" />
  </svg>
);

export default async function SupportInsidePlansAdminPage() {
  let plans: SupportInsideAdminPlanRow[] = [];
  try {
    plans = await serverFetch<SupportInsideAdminPlanRow[]>(
      '/admin/support-inside/plans',
    );
  } catch (err) {
    if (!(err instanceof ServerFetchError)) {
      throw err;
    }
  }

  return (
    <ListPage
      title="Support Inside · Planes"
      subtitle="Gestiona los 3 planes de cuenta. Cada plan se edita por separado para evitar afectar suscripciones activas."
    >
      <div className={s.intro}>
        {Icon}
        <p className={s.introBody}>
          Los 3 planes (Básico, Medium, Pro) son fijos: se siembran como
          configuración canónica. Aquí puedes ajustar precios, canales, slots y
          SLAs sin tocar el CRUD genérico de productos. Para añadir un cuarto
          plan se requiere migración + ADR específico (ADR-075 §A.3).
        </p>
      </div>

      <PlansListView plans={plans} />
    </ListPage>
  );
}
