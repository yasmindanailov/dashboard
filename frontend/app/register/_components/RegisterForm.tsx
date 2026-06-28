'use client';

import { useActionState, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { User, Briefcase, Building2, Check, Info, ShieldCheck, type LucideIcon } from 'lucide-react';
import {
  registerAction,
  type RegisterActionState,
} from '../../lib/auth-actions';
import AuthLayout from '../../AuthLayout';
import { EyeIcon, PasswordCheck } from '../../auth-components';
import styles from '../../auth.module.css';
import f from './register-fiscal.module.css';

/* ═══════════════════════════════════════════════════════════
   Register Form — F3·E11 (registro fiscal). Captura el perfil de facturación
   al alta (Personal / Autónomo / Empresa) con campos condicionales, 1:1 con
   `Registro.dc.html`. El servidor valida el shape (RegisterDto + registerAction);
   aquí la UX (fuerza de contraseña, condicionales, hint de IVA por país).
   Doctrina Modelo A (ADR-078 A1).
   ═══════════════════════════════════════════════════════════ */

type AccountType = 'personal' | 'autonomo' | 'empresa';

const TYPE_META: Record<
  AccountType,
  { label: string; Icon: LucideIcon; hint: string }
> = {
  personal: {
    label: 'Personal',
    Icon: User,
    hint: 'Factura simplificada a tu nombre. Puedes añadir un NIF más adelante.',
  },
  autonomo: {
    label: 'Autónomo',
    Icon: Briefcase,
    hint: 'Factura completa con tu NIF, deducible para tu actividad.',
  },
  empresa: {
    label: 'Empresa',
    Icon: Building2,
    hint: 'Factura completa a nombre de tu empresa, con razón social y CIF.',
  },
};

const COUNTRIES = [
  { code: 'ES', name: 'España', iva: 21 },
  { code: 'PT', name: 'Portugal', iva: 23 },
  { code: 'FR', name: 'Francia', iva: 20 },
  { code: 'DE', name: 'Alemania', iva: 19 },
  { code: 'IT', name: 'Italia', iva: 22 },
  { code: 'NL', name: 'Países Bajos', iva: 21 },
];

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState<
    RegisterActionState | null,
    FormData
  >(registerAction, null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>('personal');
  const [country, setCountry] = useState('ES');
  const [terms, setTerms] = useState(false);

  const passwordChecks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    match: password.length > 0 && password === confirmPassword,
  };
  const passwordValid =
    passwordChecks.length &&
    passwordChecks.upper &&
    passwordChecks.lower &&
    passwordChecks.number &&
    passwordChecks.match;

  const isFiscal = accountType === 'autonomo' || accountType === 'empresa';
  const isCompany = accountType === 'empresa';
  const ivaPct = COUNTRIES.find((c) => c.code === country)?.iva ?? 21;
  const countryName = COUNTRIES.find((c) => c.code === country)?.name ?? country;

  if (state?.success) {
    return (
      <AuthLayout>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className={styles.successContainer}
        >
          <svg className={styles.successIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <h1 className={styles.successTitle}>Revisa tu correo</h1>
          <p className={styles.successText}>
            Hemos enviado un enlace de verificación a <strong>{email}</strong>. En
            cuanto entres, te llamamos en 24 h para dejarlo todo a punto.
          </p>
          <Link href="/" className={styles.footerLink}>← Volver al login</Link>
        </motion.div>
      </AuthLayout>
    );
  }

  const fieldErrors = state?.fieldErrors;
  const generalError = state?.error;
  const nifLabel = isCompany ? 'CIF' : 'NIF';
  const nifPlaceholder = isCompany ? 'B-12345678' : '12345678Z';

  return (
    <AuthLayout>
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
        <div className={styles.heading}>
          <h1 className={styles.headingTitle}>Crear cuenta</h1>
          <p className={styles.headingSubtitle}>
            Regístrate y empieza a competir con tu tecnología bien gestionada.
          </p>
        </div>

        {generalError && (
          <div className={`${styles.alert} ${styles.alertDanger}`}>{generalError}</div>
        )}

        <form action={formAction} className={styles.formStack}>
          {/* Estado no-textual → hidden inputs para el FormData */}
          <input type="hidden" name="account_type" value={accountType} />
          <input type="hidden" name="terms_accepted" value={terms ? 'true' : 'false'} />

          <div className={styles.nameRow}>
            <div className={styles.fieldGroup}>
              <label htmlFor="reg-first" className={styles.fieldLabel}>Nombre</label>
              <input id="reg-first" name="first_name" type="text" autoComplete="given-name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Sara" className={styles.authInput} />
              {fieldErrors?.first_name && <p className={styles.fieldError}>{fieldErrors.first_name}</p>}
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="reg-last" className={styles.fieldLabel}>Apellidos</label>
              <input id="reg-last" name="last_name" type="text" autoComplete="family-name" required value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Gómez" className={styles.authInput} />
              {fieldErrors?.last_name && <p className={styles.fieldError}>{fieldErrors.last_name}</p>}
            </div>
          </div>

          <div className={styles.nameRow}>
            <div className={styles.fieldGroup}>
              <label htmlFor="reg-email" className={styles.fieldLabel}>Email</label>
              <input id="reg-email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" className={styles.authInput} />
              {fieldErrors?.email && <p className={styles.fieldError}>{fieldErrors.email}</p>}
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="reg-phone" className={styles.fieldLabel}>
                Teléfono <span className={f.fieldHint}>(para llamarte)</span>
              </label>
              <input id="reg-phone" name="phone" type="tel" autoComplete="tel" placeholder="+34 600 00 00 00" className={styles.authInput} />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="reg-password" className={styles.fieldLabel}>Contraseña</label>
            <div className={styles.passwordWrapper}>
              <input id="reg-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Crea una contraseña" className={styles.authInput} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className={styles.passwordToggle} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                <EyeIcon open={showPassword} />
              </button>
            </div>
            {fieldErrors?.password && <p className={styles.fieldError}>{fieldErrors.password}</p>}
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="reg-confirm" className={styles.fieldLabel}>Repite la contraseña</label>
            <input id="reg-confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repite la contraseña" className={styles.authInput} />
          </div>

          {password.length > 0 && (
            <div className={styles.passwordChecks}>
              <PasswordCheck passed={passwordChecks.length} text="Al menos 8 caracteres" />
              <PasswordCheck passed={passwordChecks.upper && passwordChecks.lower} text="Mayúsculas y minúsculas" />
              <PasswordCheck passed={passwordChecks.number} text="Al menos un número" />
              <PasswordCheck passed={passwordChecks.match} text="Las contraseñas coinciden" />
            </div>
          )}

          {/* ── Tipo de cuenta / perfil de facturación ── */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>
              ¿Cómo facturamos? <span className={f.fieldHint}>— tu perfil de facturación</span>
            </label>
            <div className={f.typeGrid} role="radiogroup" aria-label="Tipo de cuenta">
              {(Object.keys(TYPE_META) as AccountType[]).map((key) => {
                const { label, Icon } = TYPE_META[key];
                const active = accountType === key;
                return (
                  <button key={key} type="button" role="radio" aria-checked={active} onClick={() => setAccountType(key)} className={`${f.typeCard} ${active ? f.typeCardActive : ''}`}>
                    <Icon size={17} strokeWidth={1.7} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
            <div className={f.typeHint}>
              <Info size={14} strokeWidth={2} className={f.typeHintIcon} />
              <span>{TYPE_META[accountType].hint}</span>
            </div>
          </div>

          {isCompany && (
            <div className={styles.fieldGroup}>
              <label htmlFor="reg-company" className={styles.fieldLabel}>Razón social</label>
              <input id="reg-company" name="company_name" type="text" placeholder="Estudio Sara S.L." className={styles.authInput} />
              {fieldErrors?.company_name && <p className={styles.fieldError}>{fieldErrors.company_name}</p>}
            </div>
          )}

          {isFiscal && (
            <div className={styles.fieldGroup}>
              <label htmlFor="reg-nif" className={styles.fieldLabel}>{nifLabel}</label>
              <input id="reg-nif" name="nif_cif" type="text" placeholder={nifPlaceholder} className={styles.authInput} />
              {fieldErrors?.nif_cif && <p className={styles.fieldError}>{fieldErrors.nif_cif}</p>}
            </div>
          )}

          {isFiscal && (
            <>
              <div className={f.fiscalRow}>
                <div className={styles.fieldGroup}>
                  <label htmlFor="reg-country" className={styles.fieldLabel}>País</label>
                  <select id="reg-country" name="country" value={country} onChange={(e) => setCountry(e.target.value)} className={`${styles.authInput} ${f.select}`}>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor="reg-postal" className={styles.fieldLabel}>Código postal</label>
                  <input id="reg-postal" name="postal_code" type="text" placeholder="28013" className={styles.authInput} />
                  {fieldErrors?.postal_code && <p className={styles.fieldError}>{fieldErrors.postal_code}</p>}
                </div>
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="reg-addr" className={styles.fieldLabel}>Dirección fiscal</label>
                <input id="reg-addr" name="address_line1" type="text" placeholder="Calle y número" className={styles.authInput} />
                {fieldErrors?.address_line1 && <p className={styles.fieldError}>{fieldErrors.address_line1}</p>}
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="reg-city" className={styles.fieldLabel}>Ciudad</label>
                <input id="reg-city" name="city" type="text" placeholder="Madrid" className={styles.authInput} />
                {fieldErrors?.city && <p className={styles.fieldError}>{fieldErrors.city}</p>}
              </div>
              <div className={f.ivaHint}>
                <ShieldCheck size={14} strokeWidth={2} className={f.ivaHintIcon} />
                <span>IVA aplicable: {ivaPct}% ({countryName})</span>
              </div>
            </>
          )}

          {/* ── Términos ── */}
          <button type="button" onClick={() => setTerms((t) => !t)} className={f.termsRow} aria-pressed={terms}>
            <span className={`${f.termsBox} ${terms ? f.termsBoxChecked : ''}`}>
              {terms && <Check size={13} strokeWidth={3} />}
            </span>
            <span className={f.termsText}>
              Acepto los <span className={f.termsLink}>términos del servicio</span> y la{' '}
              <span className={f.termsLink}>política de privacidad</span>. Mis datos
              viven en Europa, bajo mi control.
            </span>
          </button>
          {fieldErrors?.terms && <p className={styles.fieldError}>{fieldErrors.terms}</p>}

          <button type="submit" disabled={pending || !passwordValid || !terms} className={styles.submitButton}>
            {pending ? (
              <span className={styles.submitSpinner}>
                <svg className={styles.spinnerIcon} viewBox="0 0 24 24">
                  <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creando cuenta...
              </span>
            ) : 'Crear cuenta'}
          </button>
        </form>

        <p className={styles.footerText}>
          ¿Ya tienes cuenta? <Link href="/" className={styles.footerLink}>Inicia sesión</Link>
        </p>
      </motion.div>
    </AuthLayout>
  );
}
