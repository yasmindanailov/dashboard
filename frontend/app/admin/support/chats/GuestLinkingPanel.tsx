'use client';

import { Card, Button, SearchInput } from '../../../components/ui';
import type { Client } from '../../../lib/types';
import styles from './chats.module.css';

/* ═══════════════════════════════════════
   GuestLinkingPanel — Guest chat linking
   Allows agents to link anonymous/guest
   chats to existing client accounts.
   Ref: 7.5.2
   ═══════════════════════════════════════ */

interface GuestLinkingPanelProps {
  linkSearch: string;
  linkResults: Client[];
  linkLoading: boolean;
  showLinkPanel: boolean;
  onSearchChange: (v: string) => void;
  onSearch: () => void;
  onSelect: (clientId: string, clientName: string) => void;
}

export default function GuestLinkingPanel({
  linkSearch, linkResults, linkLoading, showLinkPanel,
  onSearchChange, onSearch, onSelect,
}: GuestLinkingPanelProps) {
  return (
    <Card>
      <h4 className={styles.sectionTitle}>Vincular a cliente</h4>
      <SearchInput
        value={linkSearch}
        onChange={(e) => onSearchChange(e.target.value)}
        onClear={() => onSearchChange('')}
        placeholder="Buscar por nombre o email..."
        size="sm"
      />
      <div className={styles.linkSearchAction}>
        <Button
          variant="primary"
          size="sm"
          fullWidth
          onClick={onSearch}
          disabled={!linkSearch.trim()}
          loading={linkLoading}
        >
          Buscar cliente
        </Button>
      </div>

      {showLinkPanel && (
        <div className={styles.linkResultsArea}>
          {linkResults.length === 0 ? (
            <div className={styles.linkNoResults}>
              No se encontraron clientes
            </div>
          ) : (
            linkResults.map((client) => (
              <div
                key={client.id}
                onClick={() => onSelect(client.id, `${client.first_name} ${client.last_name} (${client.email})`)}
                className={styles.linkResultItem}
              >
                <div className={styles.linkResultName}>
                  {client.first_name} {client.last_name}
                </div>
                <div className={styles.linkResultEmail}>{client.email}</div>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}
