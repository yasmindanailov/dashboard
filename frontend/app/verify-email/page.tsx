'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { authApi } from '../lib/api';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Token de verificación no proporcionado');
      return;
    }

    authApi.verifyEmail(token)
      .then((res) => {
        setStatus('success');
        setMessage(res.message || 'Email verificado correctamente');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.message || 'Error al verificar el email');
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--surface-secondary)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[420px] rounded-2xl p-8 text-center"
        style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border)',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.04)',
        }}
      >
        {status === 'verifying' && (
          <>
            <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ background: 'var(--brand-light)' }}>
              <svg className="animate-spin h-8 w-8" style={{ color: 'var(--brand)' }} viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
              Verificando tu email...
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Espera un momento
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ background: '#DCFCE7' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
              ¡Email verificado!
            </h1>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              {message}
            </p>
            <Link
              href="/"
              className="inline-flex items-center justify-center w-full py-3 px-6 text-base font-medium text-white rounded-lg transition-all duration-200"
              style={{ background: 'var(--brand)' }}
            >
              Iniciar sesión
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ background: '#FEF2F2' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
              Error de verificación
            </h1>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              {message}
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-medium transition-colors duration-200"
              style={{ color: 'var(--brand)' }}
            >
              ← Volver al login
            </Link>
          </>
        )}
      </motion.div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface-secondary)' }}>
        <div className="animate-spin h-8 w-8 border-2 border-current border-t-transparent rounded-full" style={{ color: 'var(--brand)' }} />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
