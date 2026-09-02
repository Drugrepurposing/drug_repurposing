import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Clock, CornerDownLeft, Info, LineChart, LogIn, LogOut,
  Moon, Search, Sun,
} from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../context/auth-context.js';
import { useTheme } from '../context/theme-context.js';

/**
 * Ctrl/Cmd + K — search any disease or jump anywhere without touching the mouse.
 *
 * Worth understanding why this is more than decoration: the application has
 * three tabs, eight preset diseases, a theme toggle and an account menu, all
 * reachable only by aiming at something. A palette collapses that into one
 * keystroke and a few letters, which is how people who use software all day
 * actually navigate it.
 *
 * The matching is a deliberate subsequence match, not a substring one: "alz"
 * finds "Alzheimer's Disease", and so does "azd". Results are ordered by how
 * early and how tightly the match lands, so the obvious answer surfaces first
 * rather than merely being present somewhere in the list.
 *
 * Keyboard contract, which is the whole point:
 *   Ctrl/Cmd + K   open (and close, from anywhere)
 *   ↑ ↓            move, wrapping at both ends
 *   Enter          run the highlighted item
 *   Esc            close, returning focus to whatever had it
 *
 * Accessibility follows the WAI-ARIA combobox pattern: the input keeps focus
 * throughout and owns the list via aria-controls, with aria-activedescendant
 * pointing at the highlighted option. That is what lets a screen reader
 * announce the moving selection while the user is still typing — an approach
 * that roving focus cannot achieve.
 *
 * The component is mounted only while the palette is open, rather than
 * rendering null when closed. That is what resets it: state initialisers run
 * again on each mount, so the previous query cannot survive into the next
 * visit. Rendering null instead kept the old text, and the next thing typed
 * was appended to it — turning "Alzheimer" into "azdAlzheimer" and searching
 * for a disease that does not exist.
 */

const PRESET_DISEASES = [
  "Alzheimer's Disease",
  "Parkinson's Disease",
  'ALS (Neuromuscular)',
  'COVID-19 / SARS-CoV-2',
  'Type 2 Diabetes',
  'TNBC (Oncology)',
  "Huntington's Disease",
  'Glioblastoma',
];

/**
 * Subsequence match with a quality score, or null when the query does not fit.
 * Lower is better: consecutive characters and an early first hit both reduce it.
 */
function scoreMatch(text, query) {
  if (!query) return 0;
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase().trim();

  let index = 0;
  let score = 0;
  let previous = -1;

  for (const character of needle) {
    const found = haystack.indexOf(character, index);
    if (found === -1) return null;
    // A gap since the last matched character costs; adjacency is free.
    score += previous === -1 ? found : (found - previous - 1);
    previous = found;
    index = found + 1;
  }

  // Prefer shorter labels when scores are otherwise equal.
  return score + haystack.length * 0.01;
}

export default function CommandPalette({ onClose, onSearch, onNavigate, onSignInClick }) {
  const { isAuthenticated, user, logout } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();

  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [recent, setRecent] = useState([]);

  const inputRef = useRef(null);
  const listRef = useRef(null);
  const openerRef = useRef(typeof document !== 'undefined' ? document.activeElement : null);

  // Pull the signed-in user's last few searches, so the palette offers what
  // they actually looked at rather than only the canned presets.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let cancelled = false;
    api.get('/api/history', { params: { limit: 5 } })
      .then((res) => {
        if (cancelled) return;
        const seen = new Set();
        setRecent(
          (res.data.items || [])
            .map((item) => item.disease_query)
            .filter((q) => q && !seen.has(q.toLowerCase()) && seen.add(q.toLowerCase()))
            .slice(0, 5),
        );
      })
      .catch(() => { /* the palette is useful without history */ });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const handleClose = useCallback(() => {
    onClose();
    const opener = openerRef.current;
    if (opener && typeof opener.focus === 'function') opener.focus();
  }, [onClose]);

  const commands = useMemo(() => {
    const items = [];

    recent.forEach((disease) => {
      items.push({
        id: `recent:${disease}`,
        label: disease,
        hint: 'Recent search',
        group: 'Recent',
        icon: Clock,
        run: () => onSearch(disease),
      });
    });

    PRESET_DISEASES.forEach((disease) => {
      if (recent.some((r) => r.toLowerCase() === disease.toLowerCase())) return;
      items.push({
        id: `disease:${disease}`,
        label: disease,
        hint: 'Run pipeline',
        group: 'Diseases',
        icon: Search,
        run: () => onSearch(disease),
      });
    });

    items.push({
      id: 'nav:home',
      label: 'Pipeline Discovery',
      hint: 'Go to',
      group: 'Navigate',
      icon: Activity,
      run: () => onNavigate('home'),
    });

    if (isAuthenticated) {
      items.push({
        id: 'nav:research',
        label: 'My Research',
        hint: 'Go to',
        group: 'Navigate',
        icon: LineChart,
        run: () => onNavigate('research'),
      });
    }

    items.push({
      id: 'nav:about',
      label: 'Project & Team',
      hint: 'Go to',
      group: 'Navigate',
      icon: Info,
      run: () => onNavigate('about'),
    });

    items.push({
      id: 'action:theme',
      label: resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
      hint: 'Appearance',
      group: 'Actions',
      icon: resolvedTheme === 'dark' ? Sun : Moon,
      run: toggleTheme,
    });

    if (isAuthenticated) {
      items.push({
        id: 'action:signout',
        label: `Sign out of ${user?.full_name || 'your account'}`,
        hint: 'Account',
        group: 'Actions',
        icon: LogOut,
        run: logout,
      });
    } else {
      items.push({
        id: 'action:signin',
        label: 'Sign in or create an account',
        hint: 'Account',
        group: 'Actions',
        icon: LogIn,
        run: onSignInClick,
      });
    }

    return items;
  }, [recent, isAuthenticated, user, resolvedTheme, toggleTheme, logout, onSearch, onNavigate, onSignInClick]);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return commands;

    const scored = [];
    commands.forEach((command) => {
      const score = scoreMatch(command.label, trimmed);
      if (score !== null) scored.push({ command, score });
    });
    scored.sort((a, b) => a.score - b.score);

    const matches = scored.map((entry) => entry.command);

    // Anything typed is a runnable query, even with no match - the pipeline
    // accepts diseases far beyond the preset list, and a palette that refuses
    // unknown input would be narrower than the search box it replaces.
    matches.push({
      id: `freeform:${trimmed}`,
      label: `Run pipeline for "${trimmed}"`,
      hint: 'Search',
      group: 'Search',
      icon: Search,
      run: () => onSearch(trimmed),
    });

    return matches;
  }, [commands, query, onSearch]);

  // Keep the highlight in range as the result list shrinks under typing.
  const safeIndex = results.length === 0 ? 0 : Math.min(highlighted, results.length - 1);

  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, []);

  // Scroll the highlighted row into view when the keyboard moves past the fold.
  useEffect(() => {
    const node = listRef.current?.querySelector('[data-highlighted="true"]');
    node?.scrollIntoView({ block: 'nearest' });
  }, [safeIndex]);

  const runCommand = useCallback((command) => {
    if (!command) return;
    handleClose();
    // Let the dialog unmount before the action changes the page underneath.
    window.setTimeout(() => command.run(), 0);
  }, [handleClose]);

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((value) => (results.length ? (value + 1) % results.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((value) => (results.length ? (value - 1 + results.length) % results.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runCommand(results[safeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleClose();
    } else if (event.key === 'Home') {
      event.preventDefault();
      setHighlighted(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setHighlighted(Math.max(results.length - 1, 0));
    }
  };

  let lastGroup = null;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-start justify-center pt-[12vh] px-4 bg-ink/60 backdrop-blur-xs"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg rounded-xl bg-surface border border-slate-200 shadow-xl overflow-hidden anim-rise"
      >
        <div className="flex items-center gap-2.5 px-3.5 border-b border-slate-200">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={results[safeIndex] ? `cmd-${results[safeIndex].id}` : undefined}
            aria-autocomplete="list"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setHighlighted(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search diseases, or jump to a page..."
            className="w-full bg-transparent py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 text-[10px] font-mono text-slate-500 shrink-0">
            Esc
          </kbd>
        </div>

        <ul
          id="command-palette-list"
          role="listbox"
          aria-label="Commands"
          ref={listRef}
          className="max-h-[45vh] overflow-y-auto p-1.5"
        >
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-slate-500">No matches.</li>
          )}

          {results.map((command, index) => {
            const Icon = command.icon;
            const isHighlighted = index === safeIndex;
            const showGroup = command.group !== lastGroup;
            lastGroup = command.group;

            return (
              <React.Fragment key={command.id}>
                {showGroup && (
                  <li
                    aria-hidden="true"
                    className="px-2.5 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400"
                  >
                    {command.group}
                  </li>
                )}
                <li
                  id={`cmd-${command.id}`}
                  role="option"
                  aria-selected={isHighlighted}
                  data-highlighted={isHighlighted}
                  onMouseEnter={() => setHighlighted(index)}
                  onMouseDown={(event) => { event.preventDefault(); runCommand(command); }}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                    isHighlighted ? 'bg-slate-100' : ''
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isHighlighted ? 'text-brand' : 'text-slate-400'}`} />
                  <span className="flex-1 text-sm text-slate-900 truncate">{command.label}</span>
                  <span className="text-[10px] text-slate-400 shrink-0 hidden sm:inline">{command.hint}</span>
                  {isHighlighted && (
                    <CornerDownLeft className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  )}
                </li>
              </React.Fragment>
            );
          })}
        </ul>

        <div className="px-3.5 py-2 border-t border-slate-200 bg-slate-50 flex items-center gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded border border-slate-300 bg-surface font-mono">↑</kbd>
            <kbd className="px-1 py-0.5 rounded border border-slate-300 bg-surface font-mono">↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded border border-slate-300 bg-surface font-mono">↵</kbd>
            select
          </span>
          <span className="ml-auto hidden sm:inline">{results.length} result{results.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
}
