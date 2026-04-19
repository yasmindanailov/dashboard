'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import GradientMesh from '../components/ui/GradientMesh';
import { authApi } from '../lib/api';

export default function RegisterPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const passwordChecks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };
  const passwordValid = Object.values(passwordChecks).every(Boolean);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValid) return;
    setError('');
    setIsLoading(true);

    try {
      await authApi.register({ first_name: firstName, last_name: lastName, email, password });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Error al registrarse');
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
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.0 }}
              className="text-lg font-medium max-w-sm mx-auto"
              style={{ color: 'var(--text-secondary)' }}
            >
              Tu socio digital, a tu lado
            </motion.p>
          </motion.div>
        </div>
      </div>

      {/* ═══ RIGHT — Register Form ═══ */}
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
                  Crear cuenta
                </h1>
                <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
                  Regístrate para acceder a tu panel de gestión
                </p>
              </div>

              {/* Error */}
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

              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <InputField id="reg-first" label="Nombre" type="text" value={firstName} onChange={setFirstName} placeholder="Juan" autoComplete="given-name" />
                  <InputField id="reg-last" label="Apellido" type="text" value={lastName} onChange={setLastName} placeholder="García" autoComplete="family-name" />
                </div>

                <InputField id="reg-email" label="Email" type="email" value={email} onChange={setEmail} placeholder="tu@email.com" autoComplete="email" />

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label htmlFor="reg-password" className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Contraseña
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      id="reg-password"
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
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      <EyeIcon open={showPassword} />
                    </button>
                  </div>

                  {/* Password strength indicator */}
                  {password.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-2 space-y-1"
                    >
                      <PasswordCheck passed={passwordChecks.length} text="Mínimo 8 caracteres" />
                      <PasswordCheck passed={passwordChecks.upper} text="Una mayúscula" />
                      <PasswordCheck passed={passwordChecks.lower} text="Una minúscula" />
                      <PasswordCheck passed={passwordChecks.number} text="Un número" />
                    </motion.div>
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
                      Creando cuenta...
                    </span>
                  ) : 'Crear cuenta'}
                </button>
              </form>

              <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                ¿Ya tienes cuenta?{' '}
                <Link href="/" className="font-medium transition-colors duration-200" style={{ color: 'var(--brand)' }}>
                  Iniciar sesión
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
              <div
                className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center"
                style={{ background: 'var(--brand-light)' }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2">
                  <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight mb-3" style={{ color: 'var(--text-primary)' }}>
                Verifica tu email
              </h1>
              <p className="text-base mb-6" style={{ color: 'var(--text-secondary)' }}>
                Hemos enviado un enlace de verificación a <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>. Revisa tu bandeja de entrada.
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

/* ── Sub-components ── */

function InputField({ id, label, type, value, onChange, placeholder, autoComplete }: {
  id: string; label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder: string; autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 text-base rounded-lg transition-all duration-200 outline-none"
        style={{ border: '1px solid var(--border-hover)', background: 'var(--surface-primary)', color: 'var(--text-primary)' }}
        onFocus={(e) => { e.target.style.borderColor = 'var(--brand)'; e.target.style.boxShadow = '0 0 0 3px var(--brand-subtle)'; }}
        onBlur={(e) => { e.target.style.borderColor = 'var(--border-hover)'; e.target.style.boxShadow = 'none'; }}
      />
    </div>
  );
}

function PasswordCheck({ passed, text }: { passed: boolean; text: string }) {
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
