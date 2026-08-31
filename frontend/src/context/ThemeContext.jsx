import React, { useCallback, useEffect, useState } from 'react';
import { ThemeContext } from './theme-context.js';

/**
 * Application-wide theme state.
 *
 * Three states are supported, which is what users actually expect:
 *   'light'   always light
 *   'dark'    always dark
 *   'system'  follow the operating system, and keep following it if it changes
 *
 * The resolved theme is written to <html> as a `light` or `dark` class.
 * Tailwind's dark variant and the palette overrides in index.css both key off
 * that class, so one class swap re-themes the entire application.
 */

const STORAGE_KEY = 'drug-repurposing-theme';

function getSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredPreference() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage throws in some privacy modes — fall through to the default.
  }
  return 'system';
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readStoredPreference);
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

  const resolvedTheme = preference === 'system' ? systemTheme : preference;

  // Keep following the OS while the preference is 'system'.
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event) => setSystemTheme(event.matches ? 'dark' : 'light');
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  // Apply the resolved theme to <html> and remember the preference.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
    root.style.colorScheme = resolvedTheme;

    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Not being able to remember the choice is not worth breaking the page.
    }
  }, [preference, resolvedTheme]);

  const toggleTheme = useCallback(() => {
    setPreference(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme]);

  return (
    <ThemeContext.Provider value={{ preference, setPreference, resolvedTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

