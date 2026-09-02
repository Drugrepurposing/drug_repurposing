import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { ToastContext } from './toast-context.js';

/**
 * Transient confirmations.
 *
 * This exists because of a real defect rather than for decoration: voting on a
 * candidate wrote a row to the database and told the user nothing at all. An
 * action with no visible result is indistinguishable from a broken button, and
 * people click again — which, for a vote, is exactly the wrong response.
 *
 * Accessibility notes that make this a real component rather than a floating
 * div:
 *
 *  - The container is `aria-live="polite"`, so a screen reader announces new
 *    toasts without interrupting whatever it is currently reading. Errors are
 *    marked `role="alert"` instead, which does interrupt — appropriate when
 *    something failed.
 *  - Meaning never rests on colour alone. Each variant carries an icon and its
 *    text says what happened, so the message survives greyscale, colour
 *    blindness, and a screen reader.
 *  - Auto-dismiss is paused while the pointer is over the stack, so a message
 *    cannot vanish mid-read.
 *  - `pointer-events-none` on the container and `auto` on each toast, so the
 *    empty space around them never blocks clicks on the page underneath.
 */

const DEFAULT_DURATION = 3500;
const MAX_VISIBLE = 3;

const VARIANTS = {
  success: {
    icon: CheckCircle2,
    iconClass: 'text-emerald-600',
    ring: 'border-emerald-200',
  },
  error: {
    icon: AlertCircle,
    iconClass: 'text-rose-600',
    ring: 'border-rose-200',
  },
  info: {
    icon: Info,
    iconClass: 'text-indigo-600',
    ring: 'border-indigo-200',
  },
};

let nextId = 0;

const TICK_MS = 200;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const paused = useRef(false);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((message, options = {}) => {
    const { variant = 'success', duration = DEFAULT_DURATION, detail } = options;
    nextId += 1;
    const id = nextId;
    setToasts((current) => [
      ...current.slice(-(MAX_VISIBLE - 1)),
      { id, message, detail, variant, remaining: duration },
    ]);
    return id;
  }, []);

  /**
   * One interval counts every toast down, rather than a timer per toast.
   *
   * The pause-on-hover requirement is what settles this. Per-toast timers
   * cannot pause - `setTimeout` has no such thing - so pausing would mean
   * cancelling and re-arming each one with its remaining time, tracked
   * separately. A single tick that simply stops decrementing gets the same
   * behaviour with no bookkeeping, and no timer can outlive the component.
   */
  useEffect(() => {
    if (toasts.length === 0) return undefined;
    const interval = window.setInterval(() => {
      if (paused.current) return;
      setToasts((current) => current
        .map((toast) => ({ ...toast, remaining: toast.remaining - TICK_MS }))
        .filter((toast) => toast.remaining > 0));
    }, TICK_MS);
    return () => window.clearInterval(interval);
  }, [toasts.length]);

  return (
    <ToastContext.Provider value={{ notify, dismiss }}>
      {children}

      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 z-[60] flex flex-col gap-2 w-[min(22rem,calc(100vw-2rem))] pointer-events-none"
        aria-live="polite"
        aria-atomic="false"
        onMouseEnter={() => { paused.current = true; }}
        onMouseLeave={() => { paused.current = false; }}
      >
        {toasts.map((toast) => {
          const variant = VARIANTS[toast.variant] ?? VARIANTS.info;
          const Icon = variant.icon;
          return (
            <div
              key={toast.id}
              role={toast.variant === 'error' ? 'alert' : 'status'}
              className={`anim-rise pointer-events-auto flex items-start gap-2.5 p-3 rounded-xl bg-surface border ${variant.ring} shadow-lg`}
            >
              <Icon className={`w-4 h-4 shrink-0 mt-px ${variant.iconClass}`} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-900">{toast.message}</p>
                {toast.detail && (
                  <p className="text-[11px] text-slate-500 mt-0.5">{toast.detail}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
