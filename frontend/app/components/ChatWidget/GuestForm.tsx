'use client';

import styles from './chatWidget.module.css';

/* ═══════════════════════════════════════
   GuestForm — Guest chat entry form
   Collects name, optional email, and
   first message before creating a chat.
   Ref: ROADMAP.md 7.4.5
   ═══════════════════════════════════════ */

interface GuestFormProps {
  guestName: string;
  guestEmail: string;
  message: string;
  sending: boolean;
  onGuestNameChange: (value: string) => void;
  onGuestEmailChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onSubmit: (body: string) => void;
}

export default function GuestForm({
  guestName, guestEmail, message, sending,
  onGuestNameChange, onGuestEmailChange, onMessageChange, onSubmit,
}: GuestFormProps) {
  const canSubmit = guestName.trim() && message.trim() && !sending;

  const handleSubmit = () => {
    if (canSubmit) {
      onSubmit(message.trim());
      onMessageChange('');
    }
  };

  return (
    <div className={styles.guestForm}>
      <div className={styles.guestTitle}>
        ¿En qué podemos ayudarte?
      </div>
      <div className={styles.guestSubtitle}>
        Introduce tu nombre para iniciar una conversación. Un agente te responderá lo antes posible.
      </div>
      <input
        className={styles.guestInput}
        value={guestName}
        onChange={(e) => onGuestNameChange(e.target.value)}
        placeholder="Tu nombre *"
      />
      <input
        className={styles.guestInput}
        value={guestEmail}
        onChange={(e) => onGuestEmailChange(e.target.value)}
        placeholder="Email (opcional)"
        type="email"
      />
      <input
        className={styles.guestInput}
        value={message}
        onChange={(e) => onMessageChange(e.target.value)}
        placeholder="Escribe tu mensaje..."
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && canSubmit) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <button
        className={styles.guestSubmit}
        onClick={handleSubmit}
        disabled={!canSubmit}
      >
        {sending ? 'Enviando...' : 'Iniciar chat'}
      </button>
    </div>
  );
}
