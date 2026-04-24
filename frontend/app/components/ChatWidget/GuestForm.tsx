'use client';

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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary, #111827)' }}>
        ¿En qué podemos ayudarte?
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #6b7280)', lineHeight: 1.5 }}>
        Introduce tu nombre para iniciar una conversación. Un agente te responderá lo antes posible.
      </div>
      <input
        value={guestName}
        onChange={(e) => onGuestNameChange(e.target.value)}
        placeholder="Tu nombre *"
        style={{
          padding: '10px 14px', border: '1px solid var(--color-border, #e5e7eb)',
          borderRadius: 10, fontSize: 13, outline: 'none',
        }}
      />
      <input
        value={guestEmail}
        onChange={(e) => onGuestEmailChange(e.target.value)}
        placeholder="Email (opcional)"
        type="email"
        style={{
          padding: '10px 14px', border: '1px solid var(--color-border, #e5e7eb)',
          borderRadius: 10, fontSize: 13, outline: 'none',
        }}
      />
      <input
        value={message}
        onChange={(e) => onMessageChange(e.target.value)}
        placeholder="Escribe tu mensaje..."
        style={{
          padding: '10px 14px', border: '1px solid var(--color-border, #e5e7eb)',
          borderRadius: 10, fontSize: 13, outline: 'none',
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && canSubmit) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{
          padding: '12px 16px',
          background: !canSubmit ? '#d1d5db' : 'linear-gradient(135deg, var(--color-brand, #3B82F6) 0%, #60A5FA 100%)',
          border: 'none', borderRadius: 12, color: '#fff',
          fontSize: 14, fontWeight: 600,
          cursor: !canSubmit ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
        }}
      >
        {sending ? 'Enviando...' : 'Iniciar chat'}
      </button>
    </div>
  );
}
