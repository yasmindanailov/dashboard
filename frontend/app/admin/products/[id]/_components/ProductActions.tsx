'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Button,
  Dropdown,
  Modal,
  useToast,
  type DropdownItem,
} from '../../../../components/ui';
import {
  CopyIcon,
  EditIcon,
  EyeIcon,
  EyeOffIcon,
  MoreVerticalIcon,
  TrashIcon,
} from '../../icons';
import {
  deleteProductAction,
  duplicateProductAction,
  toggleProductStatusAction,
} from '../../_actions';

/* ═══════════════════════════════════════
   Cliente island con las acciones del detalle de producto admin (F4·U26).
   1:1 con el mockup: "Editar" (secundario) + kebab (Desactivar/Duplicar/
   Eliminar). Conserva el guard "no eliminar con servicios" y el modal de
   confirmación de borrado.
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

  function handleDuplicate() {
    startTransition(async () => {
      const result = await duplicateProductAction(productId);
      if (result.ok) {
        toast(
          'success',
          `"${productName}" duplicado. Revisa la copia (nace inactiva).`,
        );
        router.push(`/admin/products/${result.id}/edit`);
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

  const menuItems: DropdownItem[] = [
    {
      label: status === 'active' ? 'Desactivar' : 'Activar',
      icon: status === 'active' ? <EyeOffIcon /> : <EyeIcon />,
      onClick: handleToggle,
    },
    {
      label: 'Duplicar',
      icon: <CopyIcon />,
      onClick: handleDuplicate,
    },
    { divider: true },
    {
      label: 'Eliminar producto',
      icon: <TrashIcon />,
      danger: true,
      disabled: cantDelete,
      description: cantDelete ? 'Tiene servicios asociados' : undefined,
      onClick: () => setDeleteModalOpen(true),
    },
  ];

  return (
    <>
      <Link href={`/admin/products/${productId}/edit`}>
        <Button variant="secondary" leftIcon={<EditIcon />}>
          Editar
        </Button>
      </Link>
      <Dropdown
        align="right"
        triggerAsChild
        trigger={
          <Button
            variant="secondary"
            iconOnly
            disabled={pending}
            aria-label="Más acciones"
          >
            <MoreVerticalIcon />
          </Button>
        }
        items={menuItems}
      />

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
