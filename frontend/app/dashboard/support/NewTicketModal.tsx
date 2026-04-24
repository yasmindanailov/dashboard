'use client';

import { CATEGORY_CONFIG } from './types';
import { Modal, Input, Select, Textarea, Button, SearchInput, Badge } from '../../components/ui';

/* ═══════════════════════════════════════
   NewTicketModal — Create new ticket modal
   Migrated to DS: Modal, Input, Select,
   Textarea, Button, SearchInput, Badge
   Ref: DECISIONS.md §43, ROADMAP.md §7.5.D15
   ═══════════════════════════════════════ */

const CATEGORY_OPTIONS = Object.entries(CATEGORY_CONFIG)
  .filter(([key]) => key !== 'escalated_chat')
  .map(([value, conf]) => ({ value, label: conf.label }));

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Baja' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

interface NewTicketModalProps {
  isAdmin: boolean;
  subject: string;
  body: string;
  category: string;
  priority: string;
  submitting: boolean;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
  onPriorityChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  clientSearch: string;
  clientResults: any[];
  selectedClient: any;
  searchingClients: boolean;
  onClientSearchChange: (v: string) => void;
  onSelectClient: (client: any) => void;
  onClearClient: () => void;
}

export default function NewTicketModal({
  isAdmin, subject, body, category, priority, submitting,
  onSubjectChange, onBodyChange, onCategoryChange, onPriorityChange,
  onSubmit, onClose,
  clientSearch, clientResults, selectedClient, searchingClients,
  onClientSearchChange, onSelectClient, onClearClient,
}: NewTicketModalProps) {
  const canSubmit = subject.trim() && body.trim() && !submitting && (!isAdmin || selectedClient);

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={isAdmin ? 'Nuevo ticket para cliente' : 'Nuevo ticket'}
      size="md"
    >
      {/* Admin: Client selector */}
      {isAdmin && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          {selectedClient ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--brand-subtle)', border: '1px solid var(--brand-light)',
              borderRadius: 'var(--radius-sm)',
            }}>
              <div>
                <span style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--text-primary)', fontSize: 'var(--font-size-base)' }}>
                  {selectedClient.first_name} {selectedClient.last_name}
                </span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)', marginLeft: 'var(--space-2)' }}>
                  {selectedClient.email}
                </span>
              </div>
              <Button size="sm" variant="ghost" onClick={onClearClient}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </Button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <SearchInput
                label="Cliente destino"
                value={clientSearch}
                onChange={(e) => onClientSearchChange(e.target.value)}
                onClear={() => onClientSearchChange('')}
                placeholder="Buscar cliente por nombre o email..."
                loading={searchingClients}
              />
              {clientResults.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 'var(--space-1)',
                  background: 'var(--surface-primary)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)',
                  maxHeight: 180, overflowY: 'auto', zIndex: 'var(--z-dropdown)',
                }}>
                  {clientResults.map((c: any) => (
                    <div key={c.id} onClick={() => onSelectClient(c)}
                      style={{
                        padding: 'var(--space-3) var(--space-4)', cursor: 'pointer',
                        fontSize: 'var(--font-size-sm)', borderBottom: '1px solid var(--border)',
                        transition: 'background var(--transition-fast)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-secondary)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                    >
                      <span style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--text-primary)' }}>
                        {c.first_name} {c.last_name}
                      </span>
                      <span style={{ color: 'var(--text-tertiary)', marginLeft: 'var(--space-2)' }}>
                        {c.email}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Category + Priority */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div style={{ flex: 1 }}>
          <Select label="Categoría" value={category} onChange={(e) => onCategoryChange(e.target.value)} options={CATEGORY_OPTIONS} />
        </div>
        <div style={{ flex: 1 }}>
          <Select label="Prioridad" value={priority} onChange={(e) => onPriorityChange(e.target.value)} options={PRIORITY_OPTIONS} />
        </div>
      </div>

      {/* Subject */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Input label="Asunto" value={subject} onChange={(e) => onSubjectChange(e.target.value)} placeholder="Describe brevemente tu consulta" />
      </div>

      {/* Body */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <Textarea label="Mensaje" value={body} onChange={(e) => onBodyChange(e.target.value)} placeholder="Describe tu consulta con detalle..." rows={6} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={onSubmit} disabled={!canSubmit} loading={submitting}>
          {submitting ? 'Creando ticket...' : 'Crear ticket'}
        </Button>
      </div>
    </Modal>
  );
}
