'use client';

import Link from 'next/link';
import { Card, Badge, Skeleton } from '../../../components/ui';
import type { ConversationDetail } from './types';
import { STATUS_CONFIG, CATEGORY_LABELS, formatDate } from './types';
import styles from './conversationDetail.module.css';

/* ═══════════════════════════════════════
   ConversationSidebar — Role-aware context panel

   Admin/Agent: Client profile with link, services,
   notes, and quick actions.
   Client: Ticket metadata (status, dates, category,
   resolution note) — clients don't need their own profile.

   DS components: Card, Badge, Skeleton
   Ref: UI_SPEC §2.5, §4.4, ROADMAP.md D25
   ═══════════════════════════════════════ */

interface ConversationSidebarProps {
  isAdmin: boolean;
  conversation: ConversationDetail;
  clientContext: any;
  clientNotes: any[];
  clientServices: any[];
  contextLoading: boolean;
  isChat: boolean;
}

export default function ConversationSidebar({
  isAdmin, conversation, clientContext, clientNotes,
  clientServices, contextLoading, isChat,
}: ConversationSidebarProps) {
  const fromParams = `?from=${encodeURIComponent(`/dashboard/support/${conversation.id}`)}&fromLabel=${encodeURIComponent(conversation.subject)}`;

  /* ── Client view: show ticket metadata ── */
  if (!isAdmin) {
    const status = STATUS_CONFIG[conversation.status] || STATUS_CONFIG.open;
    const category = conversation.category
      ? CATEGORY_LABELS[conversation.category] || conversation.category
      : null;

    return (
      <div className={styles.sidebarStack}>
        <Card>
          <div className={styles.sidebarSection}>
            <h4 className={styles.sidebarTitle}>Detalles</h4>

            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Estado</span>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>

            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Agente</span>
              <span className={styles.metaValue}>
                {conversation.assigned_agent_name || 'Sin asignar'}
              </span>
            </div>

            {category && (
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Categoría</span>
                <span className={styles.metaValue}>{category}</span>
              </div>
            )}

            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Creada</span>
              <span className={styles.metaValue}>{formatDate(conversation.created_at)}</span>
            </div>

            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Actualizada</span>
              <span className={styles.metaValue}>{formatDate(conversation.updated_at)}</span>
            </div>

            {conversation.first_response_at && (
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Primera respuesta</span>
                <span className={styles.metaValue}>{formatDate(conversation.first_response_at)}</span>
              </div>
            )}

            {conversation.resolved_at && (
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Resuelta</span>
                <span className={styles.metaValue}>{formatDate(conversation.resolved_at)}</span>
              </div>
            )}
          </div>
        </Card>

        {conversation.resolution_note && (
          <Card>
            <div className={styles.sidebarSection}>
              <h4 className={styles.sidebarTitle}>Resolución</h4>
              <p className={styles.resolutionNote}>{conversation.resolution_note}</p>
              {conversation.resolved_by_name && (
                <div className={styles.metaValue}>— {conversation.resolved_by_name}</div>
              )}
            </div>
          </Card>
        )}
      </div>
    );
  }

  /* ── Admin/Agent view: client context ── */

  if (contextLoading) {
    return (
      <div className={styles.sidebarStack}>
        <Card>
          <div className={styles.sidebarSection}>
            <Skeleton width="60%" height={16} />
            <div className={styles.skeletonGap}><Skeleton width="100%" height={14} /></div>
            <div className={styles.skeletonGap}><Skeleton width="80%" height={14} /></div>
            <div className={styles.skeletonGap}><Skeleton width="40%" height={12} /></div>
          </div>
        </Card>
        <Card>
          <div className={styles.sidebarSection}>
            <Skeleton width="50%" height={14} />
            <div className={styles.skeletonGap}><Skeleton width="100%" height={28} /></div>
          </div>
        </Card>
      </div>
    );
  }

  if (!clientContext) {
    return (
      <Card>
        <div className={styles.sidebarEmpty}>
          {conversation.user_id ? 'No se pudo cargar el perfil del cliente' : 'Chat anónimo — sin cuenta vinculada'}
        </div>
      </Card>
    );
  }

  return (
    <div className={styles.sidebarStack}>
      {/* Client info */}
      <Card>
        <div className={styles.sidebarSection}>
          <h4 className={styles.sidebarTitle}>Cliente</h4>
          <div className={styles.clientName}>
            <Link href={`/dashboard/clients/${clientContext.id}${fromParams}`} className={styles.clientLink}>
              {clientContext.first_name} {clientContext.last_name}
            </Link>
          </div>
          <div className={styles.clientEmail}>{clientContext.email}</div>
          {clientContext.client_profile?.company_name && (
            <div className={styles.clientMeta}>{clientContext.client_profile.company_name}</div>
          )}
          {clientContext.client_profile?.phone && (
            <div className={styles.clientMeta}>{clientContext.client_profile.phone}</div>
          )}
          <div className={styles.clientType}>
            Tipo: {clientContext.client_profile?.client_type === 'business' ? 'Empresa' : 'Individual'}
          </div>
        </div>
      </Card>

      {/* Services */}
      {clientServices.length > 0 && (
        <Card>
          <div className={styles.sidebarSection}>
            <h4 className={styles.sidebarTitle}>Servicios ({clientServices.length})</h4>
            {clientServices.slice(0, 3).map((svc: any) => (
              <div key={svc.id} className={styles.serviceItem}>
                <span>{svc.product_name || svc.domain || 'Servicio'}</span>
                <span className={`${styles.serviceStatus} ${svc.status === 'active' ? styles.serviceStatusActive : styles.serviceStatusInactive}`}>
                  {svc.status === 'active' ? '● Activo' : svc.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Notes */}
      {clientNotes.length > 0 && (
        <div className={styles.noteCard}>
          <h4 className={styles.noteTitleYellow}>Notas ({clientNotes.length})</h4>
          <div className={styles.notesScroll}>
            {clientNotes.slice(0, 4).map((note: any) => (
              <div key={note.id} className={styles.noteItem}>
                <div className={styles.noteHeader}>
                  <span className={styles.noteAuthor}>
                    {note.is_pinned ? '▪ ' : ''}{note.author_name}
                  </span>
                  <span className={styles.noteCategory}>{note.category}</span>
                </div>
                {note.body.length > 100 ? note.body.substring(0, 100) + '...' : note.body}
              </div>
            ))}
          </div>
          <Link href={`/dashboard/clients/${clientContext.id}?tab=notas${fromParams ? '&' + fromParams.substring(1) : ''}`} className={styles.noteViewAll}>
            Ver todas las notas →
          </Link>
        </div>
      )}
    </div>
  );
}
