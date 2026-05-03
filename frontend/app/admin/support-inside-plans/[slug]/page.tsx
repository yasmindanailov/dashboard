/**
 * /admin/support-inside-plans/[slug] — Sprint 13 §13.AUTH Fase E (Modelo A).
 * Server Component. Carga el detalle server-side y delega al Client
 * `PlanEditor` (5 secciones independientes con saveSection que invoca
 * Server Action). Si el slug no existe → notFound().
 * ADR-078 Amendment A1 + ADR-075 §B.2.
 */

import { notFound } from 'next/navigation';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';
import type { SupportInsideAdminPlanDetail } from '../../../lib/api';
import PlanEditor from './_components/PlanEditor';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function SupportInsidePlanEditorPage({ params }: PageProps) {
  const { slug } = await params;

  let detail: SupportInsideAdminPlanDetail | null = null;
  try {
    detail = await serverFetch<SupportInsideAdminPlanDetail>(
      `/admin/support-inside/plans/${slug}`,
    );
  } catch (err) {
    if (err instanceof ServerFetchError && err.status === 404) {
      notFound();
    }
    if (!(err instanceof ServerFetchError)) {
      throw err;
    }
  }

  if (!detail) {
    notFound();
  }

  return <PlanEditor initialDetail={detail} />;
}
