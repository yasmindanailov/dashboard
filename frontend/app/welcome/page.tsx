import { redirect } from 'next/navigation';

import { getServerSession } from '../lib/server-auth';
import { landingForRole } from '../lib/auth-routing';
import WelcomeScreen from './_components/WelcomeScreen';

/* ═══════════════════════════════════════════════════════════
   Welcome Page — bienvenida post-login (F4·W3). SC wrapper:
   - `loginAction`/`verify2faAction` fijan cookies y redirigen aquí.
   - Lee el nombre de la sesión (sin exponer tokens al cliente, R17) y delega
     al Client `WelcomeScreen` (saludo + auto-navegación al panel del rol).
   - Sin sesión (acceso directo/expirada) → login.
   ═══════════════════════════════════════════════════════════ */

export default async function WelcomePage() {
  const session = await getServerSession();
  if (!session) {
    redirect('/');
  }
  return (
    <WelcomeScreen
      firstName={session.user.first_name}
      redirectTo={landingForRole(session.user.role.slug)}
    />
  );
}
