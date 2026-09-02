import React, { useEffect, useRef, useState } from 'react';
import { Search, Sparkles, ArrowRight, Network, Clock, Command } from 'lucide-react';
import MolecularScene3D from './MolecularScene3D.jsx';
import api from '../api.js';
import { useAuth } from '../context/auth-context.js';

const PRESET_DISEASES = [
  { key: "alzheimers", label: "Alzheimer's Disease", icon: "🧠" },
  { key: "parkinsons", label: "Parkinson's Disease", icon: "⚡" },
  { key: "als", label: "ALS (Neuromuscular)", icon: "🔬" },
  { key: "covid19", label: "COVID-19 / SARS-CoV-2", icon: "🦠" },
  { key: "type2_diabetes", label: "Type 2 Diabetes", icon: "🩸" },
  { key: "triple_negative_breast_cancer", label: "TNBC (Oncology)", icon: "🧬" },
  { key: "huntingtons", label: "Huntington's Disease", icon: "🧬" },
  { key: "glioblastoma", label: "Glioblastoma", icon: "🧠" },
];

export default function HeroSection({ onSearch, isSearching, onOpenPalette }) {
  const { isAuthenticated } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [recent, setRecent] = useState([]);
  const [showRecent, setShowRecent] = useState(false);
  const searchWrapRef = useRef(null);

  // The user's own past searches, fetched once per sign-in rather than on every
  // focus - the list barely changes and a request per keystroke-adjacent event
  // would be wasteful against a free-tier database.
  useEffect(() => {
    if (!isAuthenticated) {
      // Signing out must clear the previous account's searches immediately.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecent([]);
      return undefined;
    }
    let cancelled = false;
    api.get('/api/history', { params: { limit: 5 } })
      .then((res) => {
        if (cancelled) return;
        const seen = new Set();
        setRecent(
          (res.data.items || [])
            .map((item) => item.disease_query)
            .filter((q) => q && !seen.has(q.toLowerCase()) && seen.add(q.toLowerCase()))
            .slice(0, 4),
        );
      })
      .catch(() => { /* the search box works perfectly well without history */ });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // Close the dropdown on an outside click. Not on blur: blur fires before the
  // click lands on a suggestion, so the list would disappear out from under
  // the pointer and the click would hit whatever ended up in its place.
  useEffect(() => {
    if (!showRecent) return undefined;
    const onPointerDown = (event) => {
      if (!searchWrapRef.current?.contains(event.target)) setShowRecent(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showRecent]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setShowRecent(false);
      onSearch(searchQuery.trim());
    }
  };

  const handleChipClick = (label) => {
    setSearchQuery(label);
    onSearch(label);
  };

  const suggestions = recent.filter(
    (item) => !searchQuery.trim() || item.toLowerCase().includes(searchQuery.trim().toLowerCase()),
  );

  // No veil on this section. The hero is where the background is meant to be
  // seen, and laying a translucent panel across the full width flattens it to
  // near-white. Panels further down keep their veil, because they carry data
  // that has to be read.
  return (
    <section className="relative overflow-hidden pt-14 pb-12 px-4 border-b border-slate-200/60">
      <div className="relative z-10 max-w-4xl mx-auto text-center">
        {/* Subtle Pill */}
        <div className="hero-sub inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium mb-7">
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          <span>AI-Driven Closed-Loop Biological Discovery Pipeline</span>
        </div>

        {/* Main Title.

            The second line used to read "Discovery & Biological Validation",
            which restated the first: repurposing IS discovery, so the largest
            type on the page was spending its weight saying the same thing
            twice. It now names the two halves of the pipeline instead - the
            evidence that ranks a candidate, and the structure that confirms
            it - which is both more specific and shorter.

            Line one is unchanged on purpose: it is the project's name, and it
            is what anyone arriving here is looking for. The full official
            title still appears in the navbar, the pill above, and the footer. */}
        <h1 className="hero-title text-4xl sm:text-5xl md:text-6xl font-medium text-slate-900 mb-5 leading-[1.08]">
          Autonomous Drug Repurposing
          {/* A size step down, and its own block. At the same size as line one
              this phrase wrapped onto three lines and left "pose" stranded by
              itself, which is worse than the redundancy it replaced. Smaller
              also states the relationship correctly: line one is the name,
              this is the clause that qualifies it. */}
          <span className="hero-line-2 block mt-2 text-2xl sm:text-3xl md:text-4xl italic font-normal text-indigo-600">
            Ranked by evidence, confirmed by structure
          </span>
        </h1>

        {/* Subtitle */}
        <p className="hero-sub text-slate-600 text-sm sm:text-base max-w-2xl mx-auto mb-8 leading-relaxed">
          Systematically integrates multi-omics gene expression signatures, heterogeneous graph networks, SMILES chemical structures, and PubMed literature with <span className="font-semibold text-slate-900">AutoDock Vina biophysical docking validation</span>.
        </p>

        {/* Search Bar */}
        <form onSubmit={handleSubmit} data-tour="search" className="hero-search max-w-xl mx-auto mb-6 relative" ref={searchWrapRef}>
          <div className="bg-slate-50 rounded-xl p-1.5 flex items-center gap-2 border border-slate-300 shadow-sm focus-within:bg-surface focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
            <div className="pl-3 text-slate-400">
              <Search className="w-5 h-5 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowRecent(true); }}
              onFocus={() => setShowRecent(true)}
              onKeyDown={(e) => { if (e.key === 'Escape') setShowRecent(false); }}
              placeholder="Enter a disease name (e.g. Alzheimer's, Parkinson's, ALS)..."
              autoComplete="off"
              aria-autocomplete="list"
              className="w-full bg-transparent text-slate-900 placeholder-slate-400 text-sm focus:outline-none py-2 px-1 font-medium"
            />

            {/* Discoverability for the palette. A shortcut nobody knows about
                may as well not exist, so the key hint lives where people
                already look when they intend to search. */}
            <button
              type="button"
              onClick={onOpenPalette}
              data-tour="palette"
              title="Open command palette"
              aria-label="Open command palette"
              className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 bg-surface text-[10px] font-mono text-slate-500 hover:text-slate-800 hover:border-slate-400 transition-colors cursor-pointer shrink-0"
            >
              <Command className="w-3 h-3" />K
            </button>
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="px-5 py-2.5 rounded-lg bg-brand hover:bg-brand-hover text-white font-medium text-xs sm:text-sm shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer whitespace-nowrap active:scale-95"
            >
              {isSearching ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <span>Run Pipeline</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {showRecent && suggestions.length > 0 && (
            <ul
              className="absolute z-20 left-0 right-0 mt-1.5 rounded-xl bg-surface border border-slate-200 shadow-lg overflow-hidden text-left anim-rise"
              aria-label="Recent searches"
            >
              <li className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Your recent searches
              </li>
              {suggestions.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setSearchQuery(item);
                      setShowRecent(false);
                      onSearch(item);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{item}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>

        {/* Preset Chips */}
        <div className="mb-8">
          <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-2.5">
            Or select a target indication:
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {PRESET_DISEASES.map((dis) => (
              <button
                key={dis.key}
                onClick={() => handleChipClick(dis.label)}
                className="px-3 py-1.5 rounded-lg bg-surface hover:bg-slate-50 text-slate-700 text-xs font-medium border border-slate-200 hover:border-indigo-300 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <span>{dis.icon}</span>
                <span>{dis.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Live 3D Heterogeneous Graph */}
        <div className="max-w-3xl mx-auto mb-8">
          <div className="clean-card rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Network className="w-3.5 h-3.5 text-indigo-600" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                  Heterogeneous Drug-Target-Disease Graph
                </span>
              </div>
              <div className="hidden sm:flex items-center gap-3 text-[10px] font-medium text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-700" />Disease</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-700" />Target</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-600" />Drug</span>
              </div>
            </div>
            <MolecularScene3D height={250} />
            <div className="px-4 py-2 border-t border-slate-200 text-[10px] text-slate-500 text-center">
              Travelling pulses represent GNN message passing between neighbouring nodes
            </div>
          </div>
        </div>

        {/* Simple Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto pt-6 border-t border-slate-200">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80 text-center">
            <div className="text-xl font-bold text-slate-900">92.8%</div>
            <div className="text-[11px] text-slate-500 font-medium">Test Set Validation Acc.</div>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80 text-center">
            <div className="text-xl font-bold text-indigo-600">20,000+</div>
            <div className="text-[11px] text-slate-500 font-medium">Drug-Target Graph Edges</div>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80 text-center">
            <div className="text-xl font-bold text-emerald-700">&lt; -8.0</div>
            <div className="text-[11px] text-slate-500 font-medium">Avg Docking ΔG (kcal/mol)</div>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80 text-center">
            <div className="text-xl font-bold text-slate-800">Closed-Loop</div>
            <div className="text-[11px] text-slate-500 font-medium">Biophysical Re-ranking</div>
          </div>
        </div>
      </div>
    </section>
  );
}
