import React, { useState } from 'react';
import { Search, Sparkles, ArrowRight } from 'lucide-react';

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

export default function HeroSection({ onSearch, isSearching }) {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onSearch(searchQuery.trim());
    }
  };

  const handleChipClick = (label) => {
    setSearchQuery(label);
    onSearch(label);
  };

  return (
    <section className="pt-10 pb-12 px-4 border-b border-slate-200/80 bg-white">
      <div className="max-w-4xl mx-auto text-center">
        {/* Subtle Pill */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium mb-6">
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          <span>AI-Driven Closed-Loop Biological Discovery Pipeline</span>
        </div>

        {/* Main Title */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 mb-4 leading-tight">
          Autonomous Drug Repurposing <br className="hidden sm:block" />
          <span className="text-indigo-600">Discovery & Biological Validation</span>
        </h1>

        {/* Subtitle */}
        <p className="text-slate-600 text-sm sm:text-base max-w-2xl mx-auto mb-8 leading-relaxed">
          Systematically integrates multi-omics gene expression signatures, heterogeneous graph networks, SMILES chemical structures, and PubMed literature with <span className="font-semibold text-slate-900">AutoDock Vina biophysical docking validation</span>.
        </p>

        {/* Search Bar */}
        <form onSubmit={handleSubmit} className="max-w-xl mx-auto mb-6">
          <div className="bg-slate-50 rounded-xl p-1.5 flex items-center gap-2 border border-slate-300 shadow-sm focus-within:bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
            <div className="pl-3 text-slate-400">
              <Search className="w-5 h-5 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter a disease name (e.g. Alzheimer's, Parkinson's, ALS)..."
              className="w-full bg-transparent text-slate-900 placeholder-slate-400 text-sm focus:outline-none py-2 px-1 font-medium"
            />
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs sm:text-sm shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer whitespace-nowrap active:scale-95"
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
        </form>

        {/* Preset Chips */}
        <div className="mb-8">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
            Or select a target indication:
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {PRESET_DISEASES.map((dis) => (
              <button
                key={dis.key}
                onClick={() => handleChipClick(dis.label)}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium border border-slate-200 hover:border-indigo-300 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <span>{dis.icon}</span>
                <span>{dis.label}</span>
              </button>
            ))}
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
