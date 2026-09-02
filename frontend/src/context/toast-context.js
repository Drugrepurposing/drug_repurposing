import { createContext, useContext } from 'react';

/**
 * Context and hook in their own file so ToastContext.jsx exports only a
 * component — the same Fast Refresh split used by theme-context.js and
 * auth-context.js.
 */
export const ToastContext = createContext(null);

/**
 * Returns `notify(message, options)`.
 *
 * Deliberately does NOT throw when used outside a provider. A missing toast is
 * a cosmetic loss; taking down the component tree because a confirmation
 * message had nowhere to go would be a far worse trade than the one useAuth
 * makes, where a missing provider means broken authentication.
 */
export function useToast() {
  const context = useContext(ToastContext);
  return context ?? { notify: () => {}, dismiss: () => {} };
}
