/**
 * /admin/products/[id] — Sprint 13 §13.AUTH Fase E (Modelo A).
 * Server Component. Carga producto server-side; si type=support_inside
 * redirige a página dedicada (ADR-075 §A.2). Acciones (toggle, delete,
 * editar) en Client island via Server Actions. ADR-078 Amendment A1.
 */

import { redirect } from 'next/navigation';
import { Badge, Card, DetailPage } from '../../../components/ui';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';
import { CYCLE_LABELS, STATUS_MAP, TYPE_LABELS } from './detail-types';
import type { ProductDetailItem } from './detail-types';
import ProductActions from './_components/ProductActions';
import styles from './productDetail.module.css';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { id } = await params;

  let product: ProductDetailItem | null = null;
  try {
    product = await serverFetch<ProductDetailItem>(`/products/${id}`);
  } catch (err) {
    if (!(err instanceof ServerFetchError)) {
      throw err;
    }
  }

  if (!product) {
    /* Backend 404 / network error → volver al listado. */
    redirect('/admin/products');
  }

  /*
   * ADR-075 §A.2: el detalle directo de Support Inside redirige a la
   * página dedicada del plan. El admin nunca edita SI desde el CRUD
   * genérico (el guard backend lo bloquea, esto evita el viaje al 400).
   */
  if (product.type === 'support_inside') {
    redirect(`/admin/support-inside-plans/${product.slug}`);
  }

  const s = STATUS_MAP[product.status] || STATUS_MAP.inactive;

  return (
    <DetailPage
      breadcrumb={[
        { label: 'Productos', href: '/admin/products' },
        { label: product.name },
      ]}
      wide
      header={
        <div className={styles.headerRow}>
          <div>
            <div className={styles.headerTitleRow}>
              <h1 className={styles.headerTitle}>{product.name}</h1>
              <Badge variant={s.variant}>{s.label}</Badge>
              {product.is_addon && <Badge variant="info">Addon</Badge>}
              {product.badge_text && <Badge variant="brand">{product.badge_text}</Badge>}
            </div>
            <p className={styles.headerSlug}>{product.slug}</p>
          </div>
          <div className={styles.headerActions}>
            <ProductActions
              productId={product.id}
              productName={product.name}
              status={product.status}
              servicesCount={product._count.services}
            />
          </div>
        </div>
      }
    >
      <div className={styles.contentGrid}>
        <div className={styles.mainColumn}>
          <Card>
            <h2 className={styles.sectionTitle}>Detalles</h2>
            <div className={styles.detailsGrid}>
              <div>
                <span className={styles.fieldLabel}>Tipo</span>
                <span className={styles.fieldValue}>{TYPE_LABELS[product.type]}</span>
              </div>
              <div>
                <span className={styles.fieldLabel}>Categoría</span>
                <span className={styles.fieldValue}>{product.category?.name || '—'}</span>
              </div>
              <div>
                <span className={styles.fieldLabel}>Provisioner</span>
                <span className={styles.fieldValue}>{product.provisioner}</span>
              </div>
              <div>
                <span className={styles.fieldLabel}>Servicios activos</span>
                <span className={styles.fieldValue}>{product._count.services}</span>
              </div>
            </div>
            {product.short_description && (
              <p className={styles.description}>{product.short_description}</p>
            )}
            {product.description && (
              <p className={styles.descriptionBody}>{product.description}</p>
            )}
          </Card>

          <Card>
            <h2 className={styles.sectionTitle}>Planes de precio</h2>
            {product.pricing.length === 0 ? (
              <p className={styles.noPricing}>Sin planes de precio configurados.</p>
            ) : (
              <div className={styles.listStack}>
                {product.pricing.map((p) => (
                  <div key={p.id} className={styles.listRow}>
                    <div>
                      <span className={styles.pricingCycle}>
                        {CYCLE_LABELS[p.billing_cycle]}
                      </span>
                      {Number(p.setup_fee) > 0 && (
                        <span className={styles.pricingSetup}>
                          + {Number(p.setup_fee).toFixed(2)} € setup
                        </span>
                      )}
                    </div>
                    <span className={styles.pricingAmount}>
                      {Number(p.price).toFixed(2)} €
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {product.extras.length > 0 && (
            <Card>
              <h2 className={styles.sectionTitle}>Extras</h2>
              <div className={styles.listStack}>
                {product.extras.map((e) => (
                  <div key={e.id} className={styles.listRow}>
                    <div className={styles.extraLabelRow}>
                      <span className={styles.extraLabel}>{e.label}</span>
                      {e.is_mandatory && <Badge variant="danger">Obligatorio</Badge>}
                    </div>
                    <Badge variant={e.active ? 'success' : 'neutral'}>
                      {e.active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className={styles.sideColumn}>
          <Card>
            <h2 className={styles.sectionTitle}>Configuración</h2>
            <div className={styles.configStack}>
              <div className={styles.configRow}>
                <span className={styles.configLabel}>Gracia</span>
                <span className={styles.configValue}>{product.grace_period_days} días</span>
              </div>
              <div className={styles.configRow}>
                <span className={styles.configLabel}>Suspensión</span>
                <span className={styles.configValue}>{product.suspension_days} días</span>
              </div>
              <div className={styles.configRow}>
                <span className={styles.configLabel}>Cancelación</span>
                <span className={styles.configValue}>
                  {product.cancellation_days} días
                </span>
              </div>
              <div className={styles.configRow}>
                <span className={styles.configLabel}>Pausar</span>
                <span className={styles.configValue}>
                  {product.client_can_pause ? 'Sí' : 'No'}
                </span>
              </div>
              {product.partner_commission_pct && (
                <div className={styles.configRow}>
                  <span className={styles.configLabel}>Comisión partner</span>
                  <span className={styles.configValue}>
                    {product.partner_commission_pct}%
                  </span>
                </div>
              )}
            </div>
          </Card>
          <Card>
            <h2 className={styles.sectionTitle}>Metadatos</h2>
            <div className={styles.configStack}>
              <div>
                <span className={styles.fieldLabel}>ID</span>
                <span className={styles.fieldValueMono}>{product.id}</span>
              </div>
              <div>
                <span className={styles.fieldLabel}>Creado</span>
                <span className={styles.fieldValue}>
                  {new Date(product.created_at).toLocaleString('es-ES')}
                </span>
              </div>
              <div>
                <span className={styles.fieldLabel}>Actualizado</span>
                <span className={styles.fieldValue}>
                  {new Date(product.updated_at).toLocaleString('es-ES')}
                </span>
              </div>
            </div>
          </Card>
          {product.checklist_items.length > 0 && (
            <Card>
              <h2 className={styles.sectionTitle}>Checklist</h2>
              <div className={styles.listStack}>
                {product.checklist_items.map((c) => (
                  <div key={c.id} className={styles.checklistItem}>
                    <span className={styles.checkboxIcon}>
                      {c.is_required && (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--brand)"
                          strokeWidth="3"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <span className={styles.checklistLabel}>{c.label}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </DetailPage>
  );
}
