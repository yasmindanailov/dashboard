'use client';

import Link from 'next/link';
import { Card, Skeleton } from '../../../components/ui';
import styles from './conversationDetail.module.css';

/* ═══════════════════════════════════════
   ConversationSidebar — Client context panel
   DS components: Card, Skeleton
   CSS module: zero inline styles
   Ref: UI_SPEC §2.5, §4.4, ROADMAP.md D25
   ═══════════════════════════════════════ */

interface ConversationSidebarProps {
  userId: string | null;
  clientContext: any;
  clientNotes: any[];
  clientServices: any[];
  contextLoading: boolean;
  isChat: boolean;
  conversationStatus: string;
  /** For cross-module referrer links (P6.1) */
  conversationId?: string;
  conversationLabel?: string;
}

export default function ConversationSidebar({
  userId, clientContext, clientNotes, clientServices,
  contextLoading, isChat, conversationStatus,
  conversationId, conversationLabel,
}: ConversationSidebarProps) {
  // Build ?from= query string for cross-module links
  const fromParams = conversationId && conversationLabel
    ? `?from=${encodeURIComponent(`/dashboard/support/${conversationId}`)}&fromLabel=${encodeURIComponent(conversationLabel)}`
    : '';
  if (contextLoading) {
    return (
      <div className={styles.sidebarStack}>
        <Card>
          <div style={{ padding: 'var(--space-4)' }}>
            <Skeleton width="60%" height={16} />
            <div style={{ marginTop: 12 }}><Skeleton width="100%" height={14} /></div>
            <div style={{ marginTop: 8 }}><Skeleton width="80%" height={14} /></div>
            <div style={{ marginTop: 8 }}><Skeleton width="40%" height={12} /></div>
          </div>
        </Card>
        <Card>
          <div style={{ padding: 'var(--space-4)' }}>
            <Skeleton width="50%" height={14} />
            <div style={{ marginTop: 12 }}><Skeleton width="100%" height={28} /></div>
          </div>
        </Card>
      </div>
    );
  }

  if (!clientContext) {
    return (
      <Card>
        <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
          {userId ? 'Sin perfil de cliente' : 'Chat anónimo'}
        </div>
      </Card>
    );
  }

  return (
    <div className={styles.sidebarStack}>
      {/* Client info */}
      <Card>
        <div style={{ padding: 'var(--space-4)' }}>
          <h4 className={styles.sidebarTitle}>Cliente</h4>
          <div className={styles.clientName}>
            {clientContext.first_name} {clientContext.last_name}
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
          <div style={{ padding: 'var(--space-4)' }}>
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
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
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

      {/* Quick actions */}
      <Card>
        <div style={{ padding: 'var(--space-4)' }}>
          <h4 className={styles.sidebarTitle}>Acciones</h4>
          <Link href={`/dashboard/clients/${clientContext.id}${fromParams}`} className={styles.actionLink}>
            Ver perfil del cliente
          </Link>
          {isChat && conversationStatus !== 'closed' && conversationStatus !== 'resolved' && (
            <Link href="/dashboard/support/chats" className={styles.actionLink}>
              Ir al panel de chats en vivo
            </Link>
          )}
        </div>
      </Card>
    </div>
  );
}
