'use client';

import { Button } from '../ui';
import styles from './SupportPanel.module.css';

/* ═══════════════════════════════════════
   PanelGuestForm — Guest chat entry form
   Collects name, optional email, and first
   message before creating a chat.
   Ref: UI_SPEC.md §3.9, ROADMAP.md 7.4.5
   ═══════════════════════════════════════ */

interface PanelGuestFormProps {
  guestName: string;
  guestEmail: string;
  message: string;
  sending: boolean;
  onGuestNameChange: (value: string) => void;
  onGuestEmailChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onSubmit: (body: string) => void;
}

export default function PanelGuestForm({
  guestName, guestEmail, message, sending,
  onGuestNameChange, onGuestEmailChange, onMessageChange, onSubmit,
}: PanelGuestFormProps) {
  const canSubmit = guestName.trim() && message.trim() && !sending;

  const handleSubmit = () => {
    if (canSubmit) {
      onSubmit(message.trim());
      onMessageChange('');
    }
  };

  return (
    <div className={styles.guestForm}>
      <div className={styles.guestTitle}>¿En qué podemos ayudarte?</div>
      <div className={styles.guestDescription}>
        Introduce tu nombre para iniciar una conversación. Un agente te responderá lo antes posible.
      </div>
      <input
        value={guestName}
        onChange={(e) => onGuestNameChange(e.target.value)}
        placeholder="Tu nombre *"
        className={styles.guestInput}
      />
      <input
        value={guestEmail}
        onChange={(e) => onGuestEmailChange(e.target.value)}
        placeholder="Email (opcional)"
        type="email"
        className={styles.guestInput}
      />
      <input
        value={message}
        onChange={(e) => onMessageChange(e.target.value)}
        placeholder="Escribe tu mensaje..."
        className={styles.guestInput}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && canSubmit) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <Button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={styles.fullWidth}
      >
        {sending ? 'Enviando...' : 'Iniciar chat'}
      </Button>
    </div>
  );
}
