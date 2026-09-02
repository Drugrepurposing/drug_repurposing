import React, { useEffect, useRef, useState } from 'react';
import { LogIn, LogOut, UserRound } from 'lucide-react';
import { useAuth } from '../context/auth-context.js';

/**
 * The navbar's account control.
 *
 * Signed out: a "Sign in" button.
 * Signed in:  an initials avatar that opens a small menu with the account
 *             details and a sign-out action.
 *
 * While the stored token is still being validated it renders a placeholder of
 * the same size, so the navbar does not visibly reflow on every page load.
 *
 * Text labels collapse below `sm`, matching how the other navbar buttons
 * behave — this bar has to survive a 390px viewport.
 */

function initialsOf(name, email) {
  const source = (name || email || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export default function UserMenu({ onSignInClick }) {
  const { user, isAuthenticated, initialising, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef(null);

  // Close on an outside click or on Escape — the two ways people expect to
  // dismiss a dropdown.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  if (initialising) {
    return <div className="ml-1 w-8 h-8 rounded-full bg-slate-200 animate-pulse" aria-hidden="true" />;
  }

  if (!isAuthenticated) {
    return (
      <button
        type="button"
        onClick={onSignInClick}
        title="Sign in"
        aria-label="Sign in"
        className="ml-1 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-medium text-xs sm:text-sm transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
      >
        <LogIn className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">Sign in</span>
      </button>
    );
  }

  return (
    <div className="relative ml-1 shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={user.full_name}
        aria-label={`Account menu for ${user.full_name}`}
        className="w-8 h-8 rounded-full bg-brand hover:bg-brand-hover text-white text-[11px] font-bold flex items-center justify-center shadow-sm transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {initialsOf(user.full_name, user.email)}
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-60 rounded-xl bg-surface border border-slate-200 shadow-xl overflow-hidden anim-rise"
        >
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand text-white text-[11px] font-bold flex items-center justify-center shrink-0">
              {initialsOf(user.full_name, user.email)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{user.full_name}</p>
              <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
            </div>
          </div>

          <div className="p-2">
            <div className="px-2 py-1.5 flex items-center gap-2 text-[11px] text-slate-500">
              <UserRound className="w-3.5 h-3.5 shrink-0" />
              <span>Searches are saved to this account</span>
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                logout();
              }}
              className="w-full mt-1 px-2 py-2 rounded-lg text-left text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
