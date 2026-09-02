import React, { useEffect, useRef } from 'react';
import { X, Layers } from 'lucide-react';
import CompareRadar from './CompareRadar.jsx';
import { DIMENSIONS, PROPERTIES, leaderIndex } from '../lib/compareDimensions.js';

/**
 * Two or three candidates compared across every dimension the ranker used.
 *
 * Three views of the same numbers, in the order they should be read:
 *
 *   radar   the shape of each profile, at a glance
 *   bars    every dimension on one common 0-100 scale, where lengths can
 *           actually be compared against each other
 *   table   the exact values, in their real units
 *
 * The radar is first because it is the fastest to take in, and last in
 * authority because it distorts (see CompareRadar.jsx). The bars are the
 * honest visual comparison; the table is the twin that makes every value
 * readable without relying on colour, which is also what discharges the
 * light-mode contrast warning on the third series colour.
 *
 * COLOUR FOLLOWS THE COMPOUND, NOT ITS POSITION. The slot a compound occupies
 * is decided when it is ticked and held until it is unticked, so removing the
 * first of three does not repaint the other two. That assignment lives in the
 * table's selection state; this component only renders the slots it is given.
 */

const SERIES_VARS = ['var(--cmp-series-1)', 'var(--cmp-series-2)', 'var(--cmp-series-3)'];

export default function MultiCompareModal({ selection, diseaseName, onClose }) {
  const closeRef = useRef(null);

  // Escape closes, and focus starts on the close button rather than nowhere -
  // without this a keyboard user lands at the top of the page behind the modal.
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!selection || selection.length < 2) return null;

  // The slot travels with the compound from the table, so a compound keeps the
  // colour it was given when it was ticked - even after another is removed.
  const candidates = selection.map((entry) => entry.candidate);
  const colours = selection.map((entry) => SERIES_VARS[entry.slot]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={`Comparing ${candidates.map((c) => c.name).join(', ')}`}
    >
      <div className="bg-surface w-full max-w-4xl rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-base">
                Comparing {candidates.length} candidates
              </h3>
              <p className="text-xs text-slate-500 truncate">
                {diseaseName ? `${diseaseName} · ` : ''}
                every dimension the multi-objective ranker scored
              </p>
            </div>
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close comparison"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* The legend. Present because there are two or more series, and it is
            the only place the colour-to-compound mapping is stated - so it
            comes before anything that uses colour. */}
        <div className="px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {candidates.map((candidate, index) => (
            <span key={candidate.id} className="inline-flex items-center gap-1.5 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: colours[index] }}
              />
              <span className="font-semibold text-slate-900">{candidate.name}</span>
              <span className="text-slate-400 font-mono text-[10px]">#{candidate.rank}</span>
            </span>
          ))}
        </div>

        <div className="p-5 overflow-y-auto space-y-6">
          <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-6 items-start">
            <div>
              <CompareRadar candidates={candidates} colours={colours} />
              <p className="text-[10px] text-slate-400 text-center mt-1 leading-relaxed">
                Shape only. Radar area grows with the square of the value, so read
                the bars for the comparison.
              </p>
            </div>

            <div className="space-y-3.5">
              {DIMENSIONS.map((dimension) => {
                const leader = leaderIndex(dimension, candidates);
                return (
                  <div key={dimension.key}>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-slate-700">
                        {dimension.label}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate">
                        {dimension.detail}
                      </span>
                    </div>

                    <div className="space-y-[3px]">
                      {candidates.map((candidate, index) => {
                        const fraction = dimension.normalised(candidate);
                        return (
                          <div
                            key={candidate.id}
                            className="flex items-center gap-2"
                            title={`${candidate.name} · ${dimension.label}: ${dimension.display(candidate)}`}
                          >
                            <div
                              className="h-[7px] flex-1 rounded-[4px] overflow-hidden"
                              style={{ background: 'var(--viz-track)' }}
                            >
                              <div
                                className="h-full rounded-[4px]"
                                style={{
                                  width: `${Math.max(fraction * 100, 1.5)}%`,
                                  background: colours[index],
                                }}
                              />
                            </div>
                            {/* Only the strongest bar in each row is labelled.
                                Eighteen numbers beside eighteen bars is noise;
                                the table below carries every value. */}
                            <span
                              className={`text-[10px] font-mono tabular-nums w-24 shrink-0 text-right ${
                                index === leader ? 'text-slate-700 font-semibold' : 'text-transparent'
                              }`}
                              aria-hidden={index !== leader}
                            >
                              {dimension.display(candidate)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* The table view. Every value, in its own units, readable without
              reference to any colour. */}
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">
                Exact values for every compared candidate across all scoring
                dimensions and molecular properties
              </caption>
              <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px]">
                <tr>
                  <th scope="col" className="p-2.5">Dimension</th>
                  {candidates.map((candidate, index) => (
                    <th scope="col" key={candidate.id} className="p-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: colours[index] }}
                        />
                        {candidate.name}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {DIMENSIONS.map((dimension) => {
                  const leader = leaderIndex(dimension, candidates);
                  return (
                    <tr key={dimension.key}>
                      <th scope="row" className="p-2.5 font-medium text-slate-500 text-left">
                        {dimension.label}
                      </th>
                      {candidates.map((candidate, index) => (
                        <td
                          key={candidate.id}
                          className={`p-2.5 font-mono tabular-nums ${
                            index === leader ? 'text-slate-900 font-semibold' : 'text-slate-600'
                          }`}
                        >
                          {dimension.display(candidate)}
                          {index === leader && (
                            <span className="ml-1.5 text-[9px] font-sans font-medium text-emerald-700">
                              best
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}

                {PROPERTIES.map((property) => (
                  <tr key={property.label} className="bg-slate-50/50">
                    <th scope="row" className="p-2.5 font-medium text-slate-500 text-left">
                      {property.label}
                    </th>
                    {candidates.map((candidate) => (
                      <td key={candidate.id} className="p-2.5 text-slate-700">
                        {property.value(candidate)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
