import { createContext, useContext } from 'react';

/**
 * The context object and its hook live in their own file so that
 * ThemeContext.jsx exports only a component. React Fast Refresh requires
 * that, and it keeps `npm run lint` clean.
 */
export const ThemeContext = createContext(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return context;
}
