import React, { useMemo, useState } from 'react';
import { Box, HelpCircle, ArrowRightLeft, CheckCircle2, Download, ThumbsUp, ThumbsDown, BookOpen, Sparkles, ArrowUp, ArrowDown, ChevronsUpDown, Filter, Layers, X } from 'lucide-react';
import AnimatedPercent from './AnimatedPercent.jsx';
import { MAX_COMPARE } from '../lib/compareDimensions.js';

/**
 * Sortable columns.
 *
 * `direction` is the order a first click applies, chosen per column so that
 * one click always shows "best first" - descending for scores, ASCENDING for
 * docking energy, because Delta G is negative-is-better. A single shared
 * default would quietly rank the weakest binders at the top of that column,
 * which is the kind of error nobody notices in a demo and everybody notices in
 * a viva.
 */
const SORT_COLUMNS = {
  rank:    { label: 'Rank',       accessor: (c) => c.rank,             direction: 'asc'  },
  name:    { label: 'Candidate',  accessor: (c) => c.name || '',       direction: 'asc'  },
  gnn:     { label: 'GNN Score',  accessor: (c) => c.gnn_dti_score,    direction: 'desc' },
  docking: { label: 'Docking',    accessor: (c) => c.docking_delta_g,  direction: 'asc'  },
  safety:  { label: 'Safety',     accessor: (c) => c.safety_score,     direction: 'desc' },
  overall: { label: 'Overall',    accessor: (c) => c.final_score ?? c.overall_score ?? c.gnn_dti_score, direction: 'desc' },
};

export default function CandidateTable({
  candidates,
  diseaseInfo,
  onSelect3D,
  onSelectExplain,
  onSelectCompare,
  onCompareSelection,
  onExportPDF,
  onFeedback
}) {
  const [feedbackState, setFeedbackState] = useState({});
  const [sortKey, setSortKey] = useState('rank');
  const [sortDirection, setSortDirection] = useState('asc');
  const [validatedOnly, setValidatedOnly] = useState(false);

  /**
   * Comparison selection, held as FIXED SLOTS rather than a list.
   *
   * Colour in the comparison identifies the compound, so slot 2 must stay slot
   * 2 when slot 1 is unticked. A plain array would shift everything down and
   * silently repaint a reader's mental "Donepezil is blue" - the classic
   * recolour-on-filter mistake. Nulling the slot in place avoids it entirely.
   */
  const [slots, setSlots] = useState([null, null, null]);
  const selectedIds = slots.filter(Boolean);

  const toggleCompare = (id) => {
    setSlots((current) => {
      const at = current.indexOf(id);
      if (at !== -1) {
        const next = [...current];
        next[at] = null;
        return next;
      }
      const free = current.indexOf(null);
      if (free === -1) return current; // already at the cap
      const next = [...current];
      next[free] = id;
      return next;
    });
  };

  const clearCompare = () => setSlots([null, null, null]);

  const handleRating = (drugId, rating, drugName) => {
    setFeedbackState(prev => ({ ...prev, [drugId]: rating }));
    if (onFeedback) onFeedback(drugId, rating, drugName);
  };

  const toggleSort = (key) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(SORT_COLUMNS[key].direction);
    }
  };

  const visible = useMemo(() => {
    const source = validatedOnly
      ? (candidates || []).filter((c) => c.validation_passed)
      : (candidates || []);

    const { accessor } = SORT_COLUMNS[sortKey] ?? SORT_COLUMNS.rank;
    const factor = sortDirection === 'asc' ? 1 : -1;

    // Copy before sorting: Array.prototype.sort mutates, and reordering the
    // caller's array would silently change what the PDF export receives.
    return [...source].sort((left, right) => {
      const a = accessor(left);
      const b = accessor(right);
      // Missing values sort last in either direction rather than pretending
      // to be zero, which would rank an absent score above a genuinely poor one.
      if (a === null || a === undefined) return 1;
      if (b === null || b === undefined) return -1;
      if (typeof a === 'string' || typeof b === 'string') {
        return String(a).localeCompare(String(b)) * factor;
      }
      return (a - b) * factor;
    });
  }, [candidates, sortKey, sortDirection, validatedOnly]);

  if (!candidates || candidates.length === 0) return null;

  const validatedCount = candidates.filter((c) => c.validation_passed).length;

  // Each entry carries the SLOT it was assigned, not just the compound. The
  // slot is the colour, and filtering the empty slots out of an array would
  // collapse the indices - so unticking the first of three would silently
  // repaint the other two, which is the exact mistake the slot scheme exists
  // to prevent. Caught by a browser test rather than by reading.
  const compareSet = slots
    .map((id, slot) => {
      const candidate = id ? candidates.find((c) => c.id === id) : null;
      return candidate ? { candidate, slot } : null;
    })
    .filter(Boolean);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Ranked Repurposing Candidates
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold border border-indigo-200">
              {visible.length === candidates.length
                ? `${candidates.length} Candidate(s) Found`
                : `Showing ${visible.length} of ${candidates.length}`}
            </span>
          </div>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">
            Target Indication: <strong className="text-slate-900">{diseaseInfo?.name || 'Selected Indication'}</strong> | Validated via Multi-Omics & Physics Docking
          </p>
        </div>

        <div className="flex items-center gap-2.5">
        {/* Filtering to validated candidates only. Disabled rather than hidden
            when every candidate already passed: a control that vanishes is
            more confusing than one that is visibly unavailable, and its label
            still communicates how many passed. */}
        <button
          type="button"
          onClick={() => setValidatedOnly((value) => !value)}
          disabled={validatedCount === candidates.length}
          aria-pressed={validatedOnly}
          title={validatedCount === candidates.length
            ? 'Every candidate passed biophysical validation'
            : 'Show only candidates that passed biophysical validation'}
          className={`px-3 py-2.5 rounded-xl border text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
            validatedOnly
              ? 'bg-slate-900 border-slate-900 text-white'
              : 'bg-surface border-slate-300 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Filter className="w-3.5 h-3.5 shrink-0" />
          <span className="whitespace-nowrap">Validated only</span>
          <span className={`tabular-nums ${validatedOnly ? 'text-slate-300' : 'text-slate-400'}`}>
            {validatedCount}
          </span>
        </button>

        <button
          onClick={() => onExportPDF(diseaseInfo?.name, diseaseInfo?.category, visible)}
          className="px-4 py-2.5 rounded-xl bg-ok hover:bg-ok-hover text-white font-semibold text-xs sm:text-sm shadow-sm flex items-center gap-2 transition-all cursor-pointer hover:scale-105 active:scale-95"
        >
          <Download className="w-4 h-4" />
          <span>Download PDF Report</span>
        </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="clean-card rounded-2xl overflow-hidden shadow-xs border border-slate-200 bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 font-mono text-[11px] uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 pl-4 pr-1 w-9">
                  <span className="sr-only">Select for comparison</span>
                </th>
                <SortableHeader label="Rank" columnKey="rank" sortKey={sortKey} sortDirection={sortDirection} onSort={toggleSort} />
                <SortableHeader label="Drug Candidate" columnKey="name" sortKey={sortKey} sortDirection={sortDirection} onSort={toggleSort} align="left" />
                <th className="py-3 px-4">Target Gene</th>
                <SortableHeader label="GNN Score" columnKey="gnn" sortKey={sortKey} sortDirection={sortDirection} onSort={toggleSort} />
                <SortableHeader label="Docking ΔG" columnKey="docking" sortKey={sortKey} sortDirection={sortDirection} onSort={toggleSort} />
                <SortableHeader label="Safety" columnKey="safety" sortKey={sortKey} sortDirection={sortDirection} onSort={toggleSort} />
                <SortableHeader label="Overall" columnKey="overall" sortKey={sortKey} sortDirection={sortDirection} onSort={toggleSort} />
                <th className="py-3 px-4 text-center">Validation</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
              {visible.map((cand, rowIndex) => (
                <tr
                  key={cand.id}
                  className="anim-rise hover:bg-slate-50/80 transition-colors"
                  style={{ animationDelay: `${rowIndex * 70}ms` }}
                >
                  {/* Compare selection. A real checkbox, so it is reachable by
                      keyboard, announced as checked, and togglable with space
                      without any handler of ours. */}
                  <td className="py-3.5 pl-4 pr-1">
                    <input
                      type="checkbox"
                      checked={slots.includes(cand.id)}
                      disabled={!slots.includes(cand.id) && selectedIds.length >= MAX_COMPARE}
                      onChange={() => toggleCompare(cand.id)}
                      aria-label={`Compare ${cand.name}`}
                      title={!slots.includes(cand.id) && selectedIds.length >= MAX_COMPARE
                        ? `Comparison holds ${MAX_COMPARE} candidates - untick one first`
                        : `Compare ${cand.name}`}
                      className="w-4 h-4 rounded border-slate-300 text-brand accent-indigo-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </td>

                  {/* Rank */}
                  <td className="py-3.5 px-4 text-center">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs ${
                      cand.rank === 1 
                        ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      #{cand.rank}
                    </span>
                  </td>

                  {/* Drug Name & Indication */}
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                      <span>{cand.name}</span>
                      <span className="text-[11px] font-mono text-slate-400">({cand.drugbank_id})</span>
                    </div>
                    <div className="text-xs text-slate-500 truncate max-w-xs mt-0.5">
                      {cand.original_approval}
                    </div>

                    {/* Origin Badge */}
                    <div className="mt-1">
                      {cand.origin === 'literature_consensus' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-sky-50 text-sky-800 border border-sky-200">
                          <BookOpen className="w-3 h-3 text-sky-600" /> Literature Consensus (PubMed/Gemini)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-800 border border-indigo-200">
                          <Sparkles className="w-3 h-3 text-indigo-600" /> GNN Off-Label Discovery
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Target Gene */}
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono text-xs font-semibold">
                      {cand.target_gene}
                    </span>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[140px]">
                      {cand.target_protein_name}
                    </div>
                  </td>

                  {/* GNN Score */}
                  <td className="py-3.5 px-4 text-center font-mono font-semibold text-indigo-700">
                    <AnimatedPercent value={cand.gnn_dti_score} delay={rowIndex * 70} />
                  </td>

                  {/* Docking ΔG */}
                  <td className="py-3.5 px-4 text-center font-mono">
                    <span className="text-emerald-700 font-bold">
                      {cand.docking_delta_g} kcal/mol
                    </span>
                    <div className="text-[10px] text-slate-400">
                      Est. Ki: {cand.estimated_ki_nm} nM
                    </div>
                  </td>

                  {/* Safety Score */}
                  <td className="py-3.5 px-4 text-center font-mono font-medium text-slate-700">
                    {(cand.safety_score * 100).toFixed(0)}%
                  </td>

                  {/* Overall Pareto Score */}
                  <td className="py-3.5 px-4 text-center font-mono">
                    <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold text-xs">
                      <AnimatedPercent value={cand.overall_score} delay={rowIndex * 70} />
                    </span>
                  </td>

                  {/* Validation Badge */}
                  <td className="py-3.5 px-4 text-center">
                    {cand.validation_passed ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Validated</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        <span>Docked</span>
                      </span>
                    )}
                  </td>

                  {/* Actions Column */}
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onSelect3D(cand)}
                        title="View 3D Docked Molecule (WebGL)"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                      >
                        <Box className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => onSelectExplain(cand)}
                        title="Why Was This Candidate Picked?"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => onSelectCompare(cand)}
                        title="Compare with another candidate"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                      </button>

                      {/* Expert Feedback Thumbs */}
                      <div className="flex items-center gap-0.5 border-l border-slate-200 pl-1.5 ml-1">
                        <button
                          onClick={() => handleRating(cand.id, 'up', cand.name)}
                          /* An icon-only control with no accessible name is
                             announced as just "button". These two also carry
                             aria-pressed, so the current vote is conveyed by
                             state rather than only by colour. */
                          title={`Support ${cand.name} as a candidate`}
                          aria-label={`Support ${cand.name} as a candidate`}
                          aria-pressed={feedbackState[cand.id] === 'up'}
                          className={`p-1 rounded transition-colors cursor-pointer ${
                            feedbackState[cand.id] === 'up' ? 'text-emerald-600 bg-emerald-50' : 'text-slate-300 hover:text-slate-600'
                          }`}
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleRating(cand.id, 'down', cand.name)}
                          title={`Reject ${cand.name} as a candidate`}
                          aria-label={`Reject ${cand.name} as a candidate`}
                          aria-pressed={feedbackState[cand.id] === 'down'}
                          className={`p-1 rounded transition-colors cursor-pointer ${
                            feedbackState[cand.id] === 'down' ? 'text-rose-600 bg-rose-50' : 'text-slate-300 hover:text-slate-600'
                          }`}
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* The selection bar. Appears only once there is something to compare,
          and sits fixed at the bottom of the viewport rather than under the
          table: the tick that completes a selection is often several rows up,
          and a button that scrolls away the moment you use it is no button. */}
      {selectedIds.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-30 px-4 pointer-events-none">
          <div
            className="clean-card surface-veil mx-auto max-w-lg rounded-full shadow-lg px-3 py-2 flex items-center gap-3 pointer-events-auto anim-rise"
            role="status"
          >
            <div className="flex items-center gap-1.5 pl-1 min-w-0">
              {compareSet.map(({ candidate, slot }) => (
                <span
                  key={candidate.id}
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: `var(--cmp-series-${slot + 1})` }}
                  title={candidate.name}
                />
              ))}
              <span className="text-xs text-slate-700 truncate ml-1">
                {selectedIds.length === 1
                  ? '1 selected — pick one more'
                  : `${selectedIds.length} selected`}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onCompareSelection?.(compareSet)}
              disabled={selectedIds.length < 2}
              className="ml-auto px-3.5 py-1.5 rounded-full bg-brand hover:bg-brand-hover text-white text-xs font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
            >
              <Layers className="w-3.5 h-3.5" />
              Compare
            </button>

            <button
              type="button"
              onClick={clearCompare}
              aria-label="Clear comparison selection"
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A column header that sorts.
 *
 * Rendered as a real <button> inside the <th>, not a click handler on the cell:
 * that is what makes it reachable by keyboard and announced as actionable.
 * `aria-sort` on the <th> tells a screen reader which column is ordering the
 * table and in which direction - the piece that is almost always omitted, and
 * without which the sort is invisible to anyone not looking at the arrow.
 */
function SortableHeader({ label, columnKey, sortKey, sortDirection, onSort, align = 'center' }) {
  const active = sortKey === columnKey;
  const ariaSort = active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none';
  const Icon = active ? (sortDirection === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;

  return (
    <th className={`py-3 px-4 ${align === 'center' ? 'text-center' : 'text-left'}`} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        title={`Sort by ${label}`}
        /* The visible text is just the column name, which does not announce
           that the control sorts. The accessible name says so, and still
           CONTAINS the visible text - required by WCAG 2.5.3, so that someone
           using voice control can say "Safety" and be understood. */
        aria-label={`Sort by ${label}`}
        className={`inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider transition-colors cursor-pointer rounded px-1 -mx-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
          active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <span>{label}</span>
        <Icon className={`w-3 h-3 shrink-0 ${active ? 'text-brand' : 'text-slate-400'}`} />
      </button>
    </th>
  );
}
