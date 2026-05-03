'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Modal, useToast } from '../../../../components/ui';
import {
  deleteProductAction,
  toggleProductStatusAction,
} from '../../_actions';

/* ═══════════════════════════════════════
   Cliente island con las acciones del detalle de producto admin.
   - Toggle status: Server Action + revalidatePath.
   - Eliminar: Modal de confirmación + Server Action + redirect a lista.
   ═══════════════════════════════════════ */

interface Props {
  productId: string;
  productName: string;
  status: string;
  servicesCount: number;
}

export default function ProductActions({
  productId,
  productName,
  status,
  servicesCount,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  function handleToggle() {
    startTransition(async () => {
      const result = await toggleProductStatusAction(productId);
      if (result.ok) {
        toast(
          'success',
          status === 'active' ? 'Producto desactivado.' : 'Producto activado.',
        );
      } else {
        toast('error', result.error);
      }
    });
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteProductAction(productId);
    if (!result.ok) {
      toast('error', result.error);
      setDeleting(false);
      return;
    }
    toast('success', `"${productName}" eliminado.`);
    setDeleteModalOpen(false);
    router.push('/admin/products');
  }

  const cantDelete = servicesCount > 0;

  return (
    <>
      <Link href={`/admin/products/${productId}/edit`}>
        <Button>Editar</Button>
      </Link>
      <Button variant="secondary" onClick={handleToggle} disabled={pending}>
        {status === 'active' ? 'Desactivar' : 'Activar'}
      </Button>
      <Button
        variant="danger"
        onClick={() => setDeleteModalOpen(true)}
        disabled={deleting || cantDelete}
        title={
          cantDelete
            ? 'No se puede eliminar: tiene servicios asociados'
            : 'Eliminar producto'
        }
      >
        Eliminar
      </Button>

      <Modal
        open={deleteModalOpen}
        onClose={() => (deleting ? undefined : setDeleteModalOpen(false))}
        title="Eliminar producto"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setDeleteModalOpen(false)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              Eliminar definitivamente
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
          ¿Eliminar &quot;{productName}&quot;? Esta acción no se puede deshacer.
        </p>
      </Modal>
    </>
  );
}
