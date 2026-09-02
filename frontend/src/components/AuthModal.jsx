import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, Check, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, User, X,
} from 'lucide-react';
import { useAuth } from '../context/auth-context.js';
import { useToast } from '../context/toast-context.js';

/**
 * Combined sign in / create account dialog.
 *
 * Details that separate a working form from a good one, all present here:
 *
 *  - Errors are shown against the form, not in an alert() the user must dismiss.
 *  - The submit button disables and shows a spinner, so a slow free-tier
 *    backend cannot be double-submitted.
 *  - Password visibility can be toggled. Forcing people to type a password
 *    blind is a well-documented cause of failed logins, not a security measure.
 *  - Escape closes, focus moves to the first field on open, and focus is
 *    returned to whatever opened the dialog on close.
 *  - The requirement (at least 8 characters) is stated before submission
 *    rather than only being revealed by a rejection.
 *  - aria-modal, a labelled heading and role="alert" on the error, so the
 *    dialog is announced correctly by a screen reader.
 *
 * The component is mounted only while the dialog is open, rather than rendering
 * null when closed. That is what resets the form: state initialisers run again
 * on each mount, so no effect has to reach in and clear the fields, and a
 * half-typed password can never survive into the next visit.
 */

const MIN_PASSWORD_LENGTH = 8;

export default function AuthModal({ onClose, initialMode = 'login' }) {
  const { login, register } = useAuth();
  const { notify } = useToast();

  const [mode, setMode] = useState(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const firstFieldRef = useRef(null);
  // Whatever had focus when the dialog opened, so it can be given back.
  // useRef keeps the value from the first render and ignores it thereafter.
  const openerRef = useRef(typeof document !== 'undefined' ? document.activeElement : null);

  const isRegister = mode === 'register';

  // Move focus into the dialog. This synchronises with the DOM rather than
  // setting state, which is exactly what an effect is for.
  useEffect(() => {
    const id = window.setTimeout(() => firstFieldRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    // Returning focus is what makes a dialog usable from the keyboard.
    const opener = openerRef.current;
    if (opener && typeof opener.focus === 'function') opener.focus();
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleClose]);

  const switchMode = (next) => {
    setMode(next);
    setError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const trimmedEmail = email.trim();
    const trimmedName = fullName.trim();

    // Check locally first. A round trip to a sleeping free-tier server just to
    // be told the password is too short is a poor experience.
    if (isRegister && trimmedName.length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (!trimmedEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (isRegister && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = isRegister
      ? await register({ fullName: trimmedName, email: trimmedEmail, password })
      : await login({ email: trimmedEmail, password });

    setSubmitting(false);

    if (result.ok) {
      handleClose();
      notify(
        isRegister ? 'Account created' : `Signed in as ${result.user?.full_name || trimmedEmail}`,
        { detail: 'Your searches are now saved to My Research' },
      );
    } else {
      setError(result.error);
      setPassword('');
    }
  };

  const passwordLongEnough = password.length >= MIN_PASSWORD_LENGTH;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs anim-rise"
      onMouseDown={(event) => {
        // Only a click that both starts and ends on the backdrop closes it, so
        // a text selection that drifts outside the panel does not dismiss it.
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="bg-surface w-full max-w-md rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id="auth-modal-title" className="font-bold text-slate-900 text-base truncate">
                {isRegister ? 'Create a researcher account' : 'Sign in to your account'}
              </h3>
              <p className="text-xs text-slate-500">
                {isRegister
                  ? 'Your searches and validations are saved to your profile'
                  : 'Resume your discovery history and expert reviews'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode switch */}
        <div className="px-4 pt-4">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100" role="tablist">
            {[
              { key: 'login', label: 'Sign in' },
              { key: 'register', label: 'Create account' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={mode === tab.key}
                onClick={() => switchMode(tab.key)}
                className={`py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                  mode === tab.key
                    ? 'bg-surface text-slate-900 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 overflow-y-auto">
          {isRegister && (
            <Field
              icon={User}
              label="Full name"
              id="auth-name"
              type="text"
              value={fullName}
              onChange={setFullName}
              placeholder="Faizuddin M"
              autoComplete="name"
              inputRef={firstFieldRef}
            />
          )}

          <Field
            icon={Mail}
            label="Email address"
            id="auth-email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@griet.ac.in"
            autoComplete="email"
            inputRef={isRegister ? undefined : firstFieldRef}
          />

          <div>
            <label htmlFor="auth-password" className="block text-xs font-semibold text-slate-700 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isRegister ? `At least ${MIN_PASSWORD_LENGTH} characters` : 'Your password'}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                className="w-full pl-9 pr-10 py-2 rounded-lg bg-surface border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-2 focus:outline-offset-0 focus:outline-brand focus:border-brand transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {isRegister && (
              <p
                className={`mt-1.5 text-[11px] flex items-center gap-1 transition-colors ${
                  passwordLongEnough ? 'text-emerald-600' : 'text-slate-500'
                }`}
              >
                {passwordLongEnough
                  ? <Check className="w-3 h-3 shrink-0" />
                  : <span className="w-3 h-3 rounded-full border border-current shrink-0" />}
                At least {MIN_PASSWORD_LENGTH} characters
              </p>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-lg bg-brand hover:bg-brand-hover disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting
              ? (isRegister ? 'Creating account...' : 'Signing in...')
              : (isRegister ? 'Create account' : 'Sign in')}
          </button>

          <p className="text-[11px] text-slate-500 text-center leading-relaxed">
            Passwords are salted and hashed with bcrypt before storage.
            <br />
            You can search and analyse without an account — signing in only adds
            history and attribution.
          </p>
        </form>
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, id, type, value, onChange, placeholder, autoComplete, inputRef }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-slate-700 mb-1">
        {label}
      </label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          id={id}
          ref={inputRef}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-2 focus:outline-offset-0 focus:outline-brand focus:border-brand transition-colors"
        />
      </div>
    </div>
  );
}
