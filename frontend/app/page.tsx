'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GradientMesh from './components/ui/GradientMesh';
import { authApi } from './lib/api';

type LoginStep = 'credentials' | '2fa' | 'success';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // 2FA state
  const [step, setStep] = useState<LoginStep>('credentials');
  const [tempToken, setTempToken] = useState('');
  const [code2fa, setCode2fa] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await authApi.login(email, password);

      if (res.requires_2fa && res.temp_token) {
        setTempToken(res.temp_token);
        setStep('2fa');
      } else if (res.access_token) {
        // Store tokens (httpOnly cookie for refresh would be better in production)
        localStorage.setItem('access_token', res.access_token);
        if (res.refresh_token) {
          localStorage.setItem('refresh_token', res.refresh_token);
        }
        setStep('success');
        // TODO: redirect to dashboard
        window.location.href = '/dashboard';
      }
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setIsLoading(false);
    }
  };

  const handle2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await authApi.verify2fa(code2fa, tempToken);

      if (res.access_token) {
        localStorage.setItem('access_token', res.access_token);
        if (res.refresh_token) {
          localStorage.setItem('refresh_token', res.refresh_token);
        }
        setStep('success');
        window.location.href = '/dashboard';
      }
    } catch (err: any) {
      setError(err.message || 'Código incorrecto');
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

      {/* ═══ RIGHT — Login Form ═══ */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 lg:px-16" style={{ background: 'var(--surface-primary)' }}>
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-10">
            <span className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              aelium
            </span>
          </div>

          <AnimatePresence mode="wait">
            {step === 'credentials' && (
              <motion.div
                key="credentials"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="mb-8">
                  <h1 className="text-2xl font-semibold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
                    Bienvenido de vuelta
                  </h1>
                  <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
                    Inicia sesión en tu panel de gestión
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

                <form onSubmit={handleLogin} className="space-y-5">
                  <InputField
                    id="login-email"
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="tu@email.com"
                    autoComplete="email"
                  />

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label htmlFor="login-password" className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        Contraseña
                      </label>
                      <button
                        type="button"
                        className="text-sm font-medium transition-colors duration-200"
                        style={{ color: 'var(--brand)' }}
                      >
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
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
                  </div>

                  <SubmitButton loading={isLoading} text="Iniciar sesión" loadingText="Iniciando sesión..." />
                </form>
              </motion.div>
            )}

            {step === '2fa' && (
              <motion.div
                key="2fa"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="mb-8">
                  <h1 className="text-2xl font-semibold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
                    Verificación de seguridad
                  </h1>
                  <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
                    Hemos enviado un código de 6 dígitos a tu email
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

                <form onSubmit={handle2fa} className="space-y-5">
                  <InputField
                    id="login-2fa"
                    label="Código de verificación"
                    type="text"
                    value={code2fa}
                    onChange={setCode2fa}
                    placeholder="000000"
                    autoComplete="one-time-code"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    inputMode="numeric"
                  />

                  <SubmitButton loading={isLoading} text="Verificar" loadingText="Verificando..." />

                  <button
                    type="button"
                    onClick={() => { setStep('credentials'); setError(''); setCode2fa(''); }}
                    className="w-full text-center text-sm font-medium transition-colors duration-200 mt-2"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    ← Volver al login
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ── Reusable sub-components ── */

function InputField({ id, label, type, value, onChange, placeholder, autoComplete, maxLength, pattern, inputMode }: {
  id: string; label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder: string; autoComplete?: string;
  maxLength?: number; pattern?: string; inputMode?: 'numeric' | 'text';
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
        maxLength={maxLength}
        pattern={pattern}
        inputMode={inputMode}
        className="w-full px-4 py-3 text-base rounded-lg transition-all duration-200 outline-none"
        style={{ border: '1px solid var(--border-hover)', background: 'var(--surface-primary)', color: 'var(--text-primary)' }}
        onFocus={(e) => { e.target.style.borderColor = 'var(--brand)'; e.target.style.boxShadow = '0 0 0 3px var(--brand-subtle)'; }}
        onBlur={(e) => { e.target.style.borderColor = 'var(--border-hover)'; e.target.style.boxShadow = 'none'; }}
      />
    </div>
  );
}

function SubmitButton({ loading, text, loadingText }: { loading: boolean; text: string; loadingText: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full py-3 px-6 text-base font-medium text-white rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
      style={{ background: 'var(--brand)', boxShadow: 'var(--shadow-brand)' }}
      onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = 'var(--brand-hover)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--brand)'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {loadingText}
        </span>
      ) : text}
    </button>
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
