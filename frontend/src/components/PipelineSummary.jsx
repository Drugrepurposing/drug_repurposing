import React, { useState } from 'react';
import { Check, ChevronDown, Gauge } from 'lucide-react';

/**
 * What the pipeline just did, kept on screen after the results arrive.
 *
 * The live feed is necessarily transient — it is gone the moment there is
 * something better to look at. But the timings it showed are the most
 * interesting operational fact the application produces, and throwing them
 * away means anyone who blinked never sees them.
 *
 * Collapsed by default so it never competes with the results, and every number
 * is the measured one carried through from the stream.
 *
 * The header says "server pipeline time" rather than "completed in", because
 * the live feed paces its reveal for legibility and therefore runs longer than
 * the pipeline did. Two different numbers with the same label would read as a
 * bug; naming which one this is removes the contradiction.
 */

const STAGE_LABELS = {
  validate: 'Validating indication',
  enrich: 'Mining live literature',
  screen: 'Screening compound matrix',
  score: 'Scoring drug-target interactions',
  rank: 'Multi-objective Pareto ranking',
};

const ORDER = ['validate', 'enrich', 'screen', 'score', 'rank'];

function formatMs(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  // "0ms" reads as a missing value rather than a fast one.
  if (ms < 1) return '<1ms';
  return `${Math.round(ms)}ms`;
}

export default function PipelineSummary({ stages, totalMs }) {
  const [open, setOpen] = useState(false);

  const completed = ORDER
    .map((key) => stages[key])
    .filter((event) => event && event.status === 'completed');

  if (completed.length === 0) return null;

  // Each event carries elapsed-since-start, so a stage's own cost is the gap
  // from the previous one. Presenting cumulative numbers as per-stage timings
  // would overstate every stage after the first.
  //
  // reduce rather than a mutable accumulator in the component body: a variable
  // reassigned during render is reassigned again on every re-render, which is
  // both a lint error and a real source of stale values.
  const perStage = ORDER
    .filter((key) => stages[key]?.status === 'completed')
    .reduce((accumulated, key) => {
      const event = stages[key];
      const previous = accumulated.length
        ? stages[accumulated[accumulated.length - 1].key].elapsed_ms
        : 0;
      accumulated.push({
        key,
        label: STAGE_LABELS[key],
        own: Math.max(event.elapsed_ms - previous, 0),
        detail: event.detail,
      });
      return accumulated;
    }, []);

  const slowest = perStage.reduce(
    (worst, stage) => (stage.own > (worst?.own ?? -1) ? stage : worst),
    null,
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
      <div className="clean-card surface-veil rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="w-full px-4 py-2.5 flex items-center gap-2.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <Gauge className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="text-xs font-medium text-slate-700">
            Server pipeline time{' '}
            <span className="tabular-nums font-semibold text-slate-900">{formatMs(totalMs)}</span>
          </span>
          {slowest && (
            <span className="hidden sm:inline text-[11px] text-slate-500">
              · slowest stage: {slowest.label.toLowerCase()} ({formatMs(slowest.own)})
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 ml-auto shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <>
          <ul className="border-t border-slate-200 divide-y divide-slate-100">
            {perStage.map((stage) => (
              <li key={stage.key} className="px-4 py-2.5 flex items-start gap-2.5">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-900">{stage.label}</p>
                  {stage.detail && (
                    <p className="text-[11px] text-slate-500 mt-0.5">{stage.detail}</p>
                  )}
                </div>
                <span className="text-[11px] font-mono text-slate-500 tabular-nums shrink-0 mt-0.5">
                  {formatMs(stage.own)}
                </span>
              </li>
            ))}
          </ul>
          {/* Said plainly, because the two numbers differ and the difference
              would otherwise look like an error: the stages are revealed at a
              readable cadence, while every duration above is the server's own
              measurement. */}
          <p className="px-4 py-2 border-t border-slate-200 text-[10px] text-slate-400 leading-relaxed">
            Durations are measured server-side. The live feed reveals stages at a
            readable pace, so the animation runs longer than the pipeline itself.
          </p>
          </>
        )}
      </div>
    </div>
  );
}
