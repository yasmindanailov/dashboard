'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import GradientMesh from '../components/ui/GradientMesh';
import { authApi } from '../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await authApi.forgotPassword(email);
      setSuccess(true);
    } catch (err: any) {
      // Always show success to prevent email enumeration
      setSuccess(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* ═══ LEFT — Aurora Digital ═══ */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <GradientMesh />
        <div className="relative z-10 flex flex-col items-center justify-center w-full px-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="text-center"
          >
            <div
              className="inline-flex items-center justify-center mb-8 px-8 py-5 rounded-2xl"
              style={{
                background: 'rgba(255, 255, 255, 0.65)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.06)',
              }}
            >
              <span className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                aelium
              </span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ═══ RIGHT — Forgot Password Form ═══ */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 lg:px-16" style={{ background: 'var(--surface-primary)' }}>
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-10">
            <span className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              aelium
            </span>
          </div>

          {!success ? (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="mb-8">
                <h1 className="text-2xl font-semibold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
                  Recuperar contraseña
                </h1>
                <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
                  Introduce tu email y te enviaremos un enlace para restablecer tu contraseña
                </p>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 px-4 py-3 rounded-lg text-sm"
                  style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
                >
                  {error}
                </motion.div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="forgot-email" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                    Email
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    className="w-full px-4 py-3 text-base rounded-lg transition-all duration-200 outline-none"
                    style={{ border: '1px solid var(--border-hover)', background: 'var(--surface-primary)', color: 'var(--text-primary)' }}
                    onFocus={(e) => { e.target.style.borderColor = 'var(--brand)'; e.target.style.boxShadow = '0 0 0 3px var(--brand-subtle)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'var(--border-hover)'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-6 text-base font-medium text-white rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: 'var(--brand)', boxShadow: 'var(--shadow-brand)' }}
                  onMouseEnter={(e) => { if (!isLoading) { e.currentTarget.style.background = 'var(--brand-hover)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--brand)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Enviando...
                    </span>
                  ) : 'Enviar enlace de recuperación'}
                </button>
              </form>

              <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                <Link href="/" className="font-medium transition-colors duration-200" style={{ color: 'var(--brand)' }}>
                  ← Volver al login
                </Link>
              </p>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="text-center"
            >
              <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ background: 'var(--brand-light)' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2">
                  <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight mb-3" style={{ color: 'var(--text-primary)' }}>
                Revisa tu email
              </h1>
              <p className="text-base mb-6" style={{ color: 'var(--text-secondary)' }}>
                Si existe una cuenta con <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>, recibirás un enlace para restablecer tu contraseña.
              </p>
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-sm font-medium transition-colors duration-200"
                style={{ color: 'var(--brand)' }}
              >
                ← Volver al login
              </Link>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
