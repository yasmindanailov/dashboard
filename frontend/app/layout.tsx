import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./lib/auth-context";
import { getServerSession } from "./lib/server-auth";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "Aelium Dashboard",
  description: "Panel de gestión de Aelium — Tu socio digital, a tu lado",
};

/* ═══════════════════════════════════════════════════════════
   Root Layout — Sprint 13 §13.AUTH Fase E (Modelo A).

   Server Component async: lee la cookie httpOnly + valida con backend
   /auth/me, y pasa el `user` hidratado al `AuthProvider` (Client).
   Si la sesión es inválida o inexistente, `user = null` — los
   componentes hijos lo manejan (pages auth-públicas no lo necesitan,
   pages autenticadas redirigen via SC propio o admin/dashboard layout).

   Doctrina: ADR-078 Amendment A1.
   ═══════════════════════════════════════════════════════════ */

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession();

  return (
    <html lang="es">
      <body className={`${dmSans.variable} antialiased`}>
        <AuthProvider initialUser={session?.user ?? null}>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
