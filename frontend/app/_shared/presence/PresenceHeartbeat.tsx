'use client';

import { useEffect } from 'react';

import { sendHeartbeatAction } from './_actions';

/* ═══════════════════════════════════════
   PresenceHeartbeat — Rediseño UI F3·E8 (presencia del staff).

   Componente invisible que mantiene viva la presencia del staff mientras tiene
   la app abierta: hace ping al montar, cada 2 min, y al volver a la pestaña.
   El umbral "online" del backend es 5 min (`presence.helper`), así que 2 min
   da margen. No pinguea con la pestaña oculta (evita falsos "en línea").

   Se monta en el shell admin (los técnicos son staff). Su presencia alimenta:
   la card "Plan de soporte" + el picker "Reasignar técnico" del detalle de
   servicio admin, y "tu técnico" del sidebar cliente.
   ═══════════════════════════════════════ */

/** Intervalo del heartbeat (ms). 2 min < umbral online (5 min). */
const HEARTBEAT_INTERVAL_MS = 120_000;

export function PresenceHeartbeat() {
  useEffect(() => {
    const ping = () => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      ) {
        return;
      }
      void sendHeartbeatAction();
    };

    ping(); // al montar
    const intervalId = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') ping();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}
