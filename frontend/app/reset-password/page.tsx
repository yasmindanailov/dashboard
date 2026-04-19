'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { authApi } from '../lib/api';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const passwordChecks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    match: password.length > 0 && password === confirmPassword,
  };
  const passwordValid = Object.values(passwordChecks).every(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValid || !token) return;
    setError('');
    setIsLoading(true);

    try {
      await authApi.resetPassword(token, password);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Error al restablecer la contraseña');
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--surface-secondary)' }}>
        <div className="w-full max-w-[420px] rounded-2xl p-8 text-center" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)', boxShadow: '0 4px 24px rgba(0, 0, 0, 0.04)' }}>
          <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ background: '#FEF2F2' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Enlace inválido</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>Este enlace de recuperación no es válido o ha expirado.</p>
          <Link href="/forgot-password" className="text-sm font-medium" style={{ color: 'var(--brand)' }}>Solicitar nuevo enlace</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--surface-secondary)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[420px] rounded-2xl p-8"
        style={{ background: 'var(--surface-primary)', border: '1px solid var(--border)', boxShadow: '0 4px 24px rgba(0, 0, 0, 0.04)' }}
      >
        {!success ? (
          <>
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ background: 'var(--brand-light)' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
                Nueva contraseña
              </h1>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Elige una nueva contraseña segura
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

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  Nueva contraseña
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 pr-12 text-base rounded-lg transition-all duration-200 outline-none"
                    style={{ border: '1px solid var(--border-hover)', background: 'var(--surface-primary)', color: 'var(--text-primary)' }}
                    onFocus={(e) => { e.target.style.borderColor = 'var(--brand)'; e.target.style.boxShadow = '0 0 0 3px var(--brand-subtle)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'var(--border-hover)'; e.target.style.boxShadow = 'none'; }}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1" style={{ color: 'var(--text-tertiary)' }}>
                    <EyeIcon open={showPassword} />
                  </button>
                </div>

                {password.length > 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-2 space-y-1">
                    <Check passed={passwordChecks.length} text="Mínimo 8 caracteres" />
                    <Check passed={passwordChecks.upper} text="Una mayúscula" />
                    <Check passed={passwordChecks.lower} text="Una minúscula" />
                    <Check passed={passwordChecks.number} text="Un número" />
                  </motion.div>
                )}
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  Confirmar contraseña
                </label>
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 text-base rounded-lg transition-all duration-200 outline-none"
                  style={{ border: '1px solid var(--border-hover)', background: 'var(--surface-primary)', color: 'var(--text-primary)' }}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--brand)'; e.target.style.boxShadow = '0 0 0 3px var(--brand-subtle)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border-hover)'; e.target.style.boxShadow = 'none'; }}
                />
                {confirmPassword.length > 0 && (
                  <div className="mt-2">
                    <Check passed={passwordChecks.match} text={passwordChecks.match ? 'Las contraseñas coinciden' : 'Las contraseñas no coinciden'} />
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading || !passwordValid}
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
                    Restableciendo...
                  </span>
                ) : 'Restablecer contraseña'}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ background: '#DCFCE7' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
            </div>
            <h1 className="text-xl font-semibold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
              Contraseña actualizada
            </h1>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              Tu contraseña se ha restablecido correctamente. Ya puedes iniciar sesión.
            </p>
            <Link
              href="/"
              className="inline-flex items-center justify-center w-full py-3 px-6 text-base font-medium text-white rounded-lg transition-all duration-200"
              style={{ background: 'var(--brand)' }}
            >
              Iniciar sesión
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface-secondary)' }}>
        <div className="animate-spin h-8 w-8 border-2 border-current border-t-transparent rounded-full" style={{ color: 'var(--brand)' }} />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}

/* ── Sub-components ── */

function Check({ passed, text }: { passed: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: passed ? '#16A34A' : 'var(--text-tertiary)' }}>
      {passed ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /></svg>
      )}
      {text}
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
