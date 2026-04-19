'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import GradientMesh from './components/ui/GradientMesh';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // TODO: implement auth in Sprint 1
    setTimeout(() => setIsLoading(false), 1500);
  };

  return (
    <div className="flex min-h-screen">
      {/* ═══ LEFT SIDE — Aurora Digital ═══ */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <GradientMesh />

        {/* Overlay content */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full px-12">
          {/* Glass card with logo */}
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

      {/* ═══ RIGHT SIDE — Login Form ═══ */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 lg:px-16" style={{ background: 'var(--surface-primary)' }}>
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full max-w-[400px]"
        >
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-10">
            <span className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              aelium
            </span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
              Bienvenido de vuelta
            </h1>
            <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
              Inicia sesión en tu panel de gestión
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full px-4 py-3 text-base rounded-lg transition-all duration-200 outline-none"
                style={{
                  border: '1px solid var(--border-hover)',
                  background: 'var(--surface-primary)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--brand)';
                  e.target.style.boxShadow = '0 0 0 3px var(--brand-subtle)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--border-hover)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label htmlFor="login-password" className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Contraseña
                </label>
                <button
                  type="button"
                  className="text-sm font-medium transition-colors duration-200"
                  style={{ color: 'var(--brand)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--brand)')}
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
                  style={{
                    border: '1px solid var(--border-hover)',
                    background: 'var(--surface-primary)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--brand)';
                    e.target.style.boxShadow = '0 0 0 3px var(--brand-subtle)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--border-hover)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors duration-200"
                  style={{ color: 'var(--text-tertiary)' }}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2">
              <input
                id="login-remember"
                type="checkbox"
                className="w-4 h-4 rounded accent-[var(--brand)] cursor-pointer"
              />
              <label htmlFor="login-remember" className="text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                Recordarme
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-6 text-base font-medium text-white rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: 'var(--brand)',
                boxShadow: 'var(--shadow-brand)',
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.background = 'var(--brand-hover)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--brand)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Iniciando sesión...
                </span>
              ) : (
                'Iniciar sesión'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>o</span>
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          </div>

          {/* Sign up link */}
          <p className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            ¿No tienes cuenta?{' '}
            <button
              className="font-medium transition-colors duration-200"
              style={{ color: 'var(--brand)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--brand)')}
            >
              Crear cuenta
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
