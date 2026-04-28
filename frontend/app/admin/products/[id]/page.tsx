'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { productsApi } from '../../../lib/api';
import { DetailPage, Badge, Button, Card, Modal, useToast } from '../../../components/ui';
import { TYPE_LABELS, STATUS_MAP, CYCLE_LABELS } from './detail-types';
import type { ProductDetailItem } from './detail-types';
import styles from './productDetail.module.css';

/* ═══════════════════════════════════════
   Product Detail Page (UI_SPEC §2.5)
   Layout: DetailPage (no tabs — single view)
   DS: Modal §4.2, Toast §4.3, CSS Module
   Ref: ROADMAP.md §7.5.D21
   ═══════════════════════════════════════ */

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';

  const [product, setProduct] = useState<ProductDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  useEffect(() => {
    if (!token || !id) return;
    productsApi.get(token, id)
      .then((data) => setProduct(data as ProductDetailItem))
      .catch(() => {
        toast('error', 'No se pudo cargar el producto.');
        router.push('/admin/products');
      })
      .finally(() => setLoading(false));
  }, [token, id, router, toast]);

  const handleToggle = async () => {
    if (!product) return;
    setToggling(true);
    try {
      const res = await productsApi.toggleStatus(token, product.id) as { status: string };
      setProduct({ ...product, status: res.status });
      toast('success', res.status === 'active' ? 'Producto activado.' : 'Producto desactivado.');
    } catch {
      toast('error', 'No se pudo cambiar el estado del producto.');
    }
    setToggling(false);
  };

  const handleDelete = async () => {
    if (!product) return;
    setDeleting(true);
    try {
      await productsApi.delete(token, product.id);
      toast('success', `"${product.name}" eliminado.`);
      router.push('/admin/products');
    } catch {
      toast('error', 'No se pudo eliminar el producto.');
      setDeleting(false);
    }
    setDeleteModalOpen(false);
  };

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <svg className={styles.spinner} viewBox="0 0 24 24">
          <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!product) return null;

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
            <Link href={`/admin/products/${product.id}/edit`}>
              <Button>Editar</Button>
            </Link>
            <Button variant="secondary" onClick={handleToggle} disabled={toggling}>
              {product.status === 'active' ? 'Desactivar' : 'Activar'}
            </Button>
            <Button
              variant="danger"
              onClick={() => setDeleteModalOpen(true)}
              disabled={deleting || product._count.services > 0}
              title={product._count.services > 0 ? 'No se puede eliminar: tiene servicios asociados' : 'Eliminar producto'}
            >
              Eliminar
            </Button>
          </div>
        </div>
      }
    >
      <div className={styles.contentGrid}>
        {/* Main info — 2 cols */}
        <div className={styles.mainColumn}>
          {/* Details */}
          <Card>
            <h2 className={styles.sectionTitle}>Detalles</h2>
            <div className={styles.detailsGrid}>
              <div><span className={styles.fieldLabel}>Tipo</span><span className={styles.fieldValue}>{TYPE_LABELS[product.type]}</span></div>
              <div><span className={styles.fieldLabel}>Categoría</span><span className={styles.fieldValue}>{product.category?.name || '—'}</span></div>
              <div><span className={styles.fieldLabel}>Provisioner</span><span className={styles.fieldValue}>{product.provisioner}</span></div>
              <div><span className={styles.fieldLabel}>Servicios activos</span><span className={styles.fieldValue}>{product._count.services}</span></div>
            </div>
            {product.short_description && <p className={styles.description}>{product.short_description}</p>}
            {product.description && <p className={styles.descriptionBody}>{product.description}</p>}
          </Card>

          {/* Pricing */}
          <Card>
            <h2 className={styles.sectionTitle}>Planes de precio</h2>
            {product.pricing.length === 0 ? (
              <p className={styles.noPricing}>Sin planes de precio configurados.</p>
            ) : (
              <div className={styles.listStack}>
                {product.pricing.map((p) => (
                  <div key={p.id} className={styles.listRow}>
                    <div>
                      <span className={styles.pricingCycle}>{CYCLE_LABELS[p.billing_cycle]}</span>
                      {Number(p.setup_fee) > 0 && <span className={styles.pricingSetup}>+ {Number(p.setup_fee).toFixed(2)} € setup</span>}
                    </div>
                    <span className={styles.pricingAmount}>{Number(p.price).toFixed(2)} €</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Extras */}
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
                    <Badge variant={e.active ? 'success' : 'neutral'}>{e.active ? 'Activo' : 'Inactivo'}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className={styles.sideColumn}>
          <Card>
            <h2 className={styles.sectionTitle}>Configuración</h2>
            <div className={styles.configStack}>
              <div className={styles.configRow}><span className={styles.configLabel}>Gracia</span><span className={styles.configValue}>{product.grace_period_days} días</span></div>
              <div className={styles.configRow}><span className={styles.configLabel}>Suspensión</span><span className={styles.configValue}>{product.suspension_days} días</span></div>
              <div className={styles.configRow}><span className={styles.configLabel}>Cancelación</span><span className={styles.configValue}>{product.cancellation_days} días</span></div>
              <div className={styles.configRow}><span className={styles.configLabel}>Pausar</span><span className={styles.configValue}>{product.client_can_pause ? 'Sí' : 'No'}</span></div>
              {product.partner_commission_pct && <div className={styles.configRow}><span className={styles.configLabel}>Comisión partner</span><span className={styles.configValue}>{product.partner_commission_pct}%</span></div>}
            </div>
          </Card>
          <Card>
            <h2 className={styles.sectionTitle}>Metadatos</h2>
            <div className={styles.configStack}>
              <div><span className={styles.fieldLabel}>ID</span><span className={styles.fieldValueMono}>{product.id}</span></div>
              <div><span className={styles.fieldLabel}>Creado</span><span className={styles.fieldValue}>{new Date(product.created_at).toLocaleString('es-ES')}</span></div>
              <div><span className={styles.fieldLabel}>Actualizado</span><span className={styles.fieldValue}>{new Date(product.updated_at).toLocaleString('es-ES')}</span></div>
            </div>
          </Card>
          {product.checklist_items.length > 0 && (
            <Card>
              <h2 className={styles.sectionTitle}>Checklist</h2>
              <div className={styles.listStack}>
                {product.checklist_items.map(c => (
                  <div key={c.id} className={styles.checklistItem}>
                    <span className={styles.checkboxIcon}>
                      {c.is_required && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                    </span>
                    <span className={styles.checklistLabel}>{c.label}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Delete confirmation modal (§4.2) */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Eliminar producto"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>Cancelar</Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>Eliminar definitivamente</Button>
          </>
        }
      >
        <p className={styles.description}>
          ¿Eliminar &quot;{product.name}&quot;? Esta acción no se puede deshacer.
        </p>
      </Modal>
    </DetailPage>
  );
}
