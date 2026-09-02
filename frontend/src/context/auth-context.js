import { createContext, useContext } from 'react';

/**
 * The context object and its hook live in their own file so that
 * AuthContext.jsx exports only a component. React Fast Refresh requires that,
 * and it keeps `npm run lint` clean - the same split used by theme-context.js.
 */
export const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}
