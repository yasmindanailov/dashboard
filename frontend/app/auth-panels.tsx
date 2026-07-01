import { Mail, Phone, ShieldCheck, User } from 'lucide-react';
import type { AuthValueProp } from './AuthLayout';

/* Configuración del panel Aurora (titular + value props) por página de auth
   — 1:1 con los mockups Login/Registro/RecuperarContrasena (F4·W3). */

export interface AuthPanel {
  headline: string;
  valueProps: AuthValueProp[];
}

const person: AuthValueProp = {
  icon: <User size={16} strokeWidth={2.2} />,
  text: 'Siempre una persona real, nunca un bot',
};
const phone: AuthValueProp = {
  icon: <Phone size={16} strokeWidth={2.2} />,
  text: 'Te llamamos en 24 h para conocerte',
};
const shield: AuthValueProp = {
  icon: <ShieldCheck size={16} strokeWidth={2.2} />,
  text: 'Tus datos en Europa, bajo tu control',
};

export const LOGIN_PANEL: AuthPanel = {
  headline: 'La tecnología de tu negocio, gestionada por alguien real.',
  valueProps: [person, phone, shield],
};

export const REGISTER_PANEL: AuthPanel = {
  headline: 'Empieza hoy. En 24 h te llamamos para conocerte.',
  valueProps: [person, phone, shield],
};

export const RECOVER_PANEL: AuthPanel = {
  headline: 'Recuperar el acceso es sencillo. Y si te atascas, hay alguien real.',
  valueProps: [
    {
      icon: <Mail size={16} strokeWidth={2.2} />,
      text: 'Un enlace seguro a tu correo, válido 1 hora',
    },
    shield,
    person,
  ],
};
