'use client';

import Link from 'next/link';
import type { Chat, ClientProfile } from './types';
import type { Client, ClientNote, Service } from '../../../lib/types';
import { Avatar, Card, Skeleton } from '../../../components/ui';
import GuestLinkingPanel from './GuestLinkingPanel';
import styles from './chats.module.css';

/* ═══════════════════════════════════════
   ChatClientContext — Right column
   Displays client profile (name links to
   client detail page), services, structured
   notes, and guest linking UI.
   Ref: DECISIONS.md §43, 7.H16, 7.5.2
   ═══════════════════════════════════════ */

interface ChatClientContextProps {
  activeChat: Chat | null;
  clientContext: ClientProfile | null;
  clientServices: Service[];
  clientNotes: ClientNote[];
  contextError: string | null;
  // Guest linking
  linkSearch: string;
  linkResults: Client[];
  linkLoading: boolean;
  showLinkPanel: boolean;
  onLinkSearchChange: (value: string) => void;
  onSearchClients: () => void;
  onLinkClient: (clientId: string, clientName: string) => void;
}

export default function ChatClientContext({
  activeChat, clientContext, clientServices, clientNotes, contextError,
  linkSearch, linkResults, linkLoading, showLinkPanel,
  onLinkSearchChange, onSearchClients, onLinkClient,
}: ChatClientContextProps) {
  if (!activeChat) {
    return (
      <div className={styles.contextColumn}>
        <div className={styles.contextEmpty}>Contexto del cliente</div>
      </div>
    );
  }

  if (contextError) {
    return (
      <div className={styles.contextColumn}>
        <div className={styles.contextBody}>
          <div className={styles.contextErrorCenter}>
            <div className={styles.contextErrorTitle}>Sin contexto</div>
            <div className={styles.contextErrorMessage}>{contextError}</div>
          </div>

          {/* 7.5.2: Guest linking UI */}
          {!activeChat.user_id && (
            <GuestLinkingPanel
              linkSearch={linkSearch}
              linkResults={linkResults}
              linkLoading={linkLoading}
              showLinkPanel={showLinkPanel}
              onSearchChange={onLinkSearchChange}
              onSearch={onSearchClients}
              onSelect={onLinkClient}
            />
          )}
        </div>
      </div>
    );
  }

  if (!clientContext) {
    return (
      <div className={styles.contextColumn}>
        <div className={styles.contextBody}>
          <Card>
            <Skeleton circle width={48} height={48} />
            <Skeleton width="60%" height={16} />
            <Skeleton width="80%" height={14} />
          </Card>
        </div>
      </div>
    );
  }

  const clientName = `${clientContext.first_name} ${clientContext.last_name}`;

  return (
    <div className={styles.contextColumn}>
      <div className={styles.contextBody}>
        {/* Client card */}
        <Card>
          <div className={styles.clientAvatar}>
            <Avatar name={clientName} size="lg" />
          </div>
          <div className={styles.clientName}>
            <Link href={`/admin/clients/${clientContext.id}`} className={styles.clientLink}>
              {clientName}
            </Link>
          </div>
          <div className={styles.clientEmail}>{clientContext.email}</div>
          {clientContext.client_profile?.company_name && (
            <div className={styles.clientMeta}>{clientContext.client_profile.company_name}</div>
          )}
          {clientContext.client_profile?.phone && (
            <div className={styles.clientMeta}>{clientContext.client_profile.phone}</div>
          )}
        </Card>

        {/* Services */}
        <Card>
          <h4 className={styles.sectionTitle}>Servicios activos</h4>
          {clientServices.length === 0 ? (
            <div className={styles.contextErrorMessage}>Sin servicios</div>
          ) : (
            clientServices.map((svc) => (
              <div key={svc.id} className={styles.serviceItem}>
                <div className={styles.serviceName}>{svc.label || svc.product?.name || svc.id}</div>
                <div className={styles.serviceStatus}>{svc.status}</div>
              </div>
            ))
          )}
        </Card>

        {/* 7.H19: Structured client notes */}
        {clientNotes.length > 0 && (
          <div className={styles.notesPanel}>
            <h4 className={styles.notesPanelTitle}>
              Notas del cliente ({clientNotes.length})
            </h4>
            <div className={styles.notesList}>
              {clientNotes.slice(0, 4).map((note) => (
                <div key={note.id} className={styles.noteItem}>
                  <div className={styles.noteHeader}>
                    <span className={styles.noteAuthor}>
                      {note.is_pinned ? '● ' : ''}{note.author_name}
                    </span>
                    <span className={styles.noteCategory}>{note.category}</span>
                  </div>
                  {note.body.length > 100 ? note.body.substring(0, 100) + '...' : note.body}
                </div>
              ))}
            </div>
            <a
              href={`/admin/clients/${clientContext.id}?tab=notas`}
              className={styles.notesLink}
            >
              Ver todas las notas →
            </a>
          </div>
        )}


      </div>
    </div>
  );
}
