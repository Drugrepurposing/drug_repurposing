import React from 'react';
import { Check, Loader2, Radio } from 'lucide-react';

/**
 * The pipeline reporting itself while it runs.
 *
 * Every line here is a real event from the backend, fired at an actual stage
 * boundary, with a measured elapsed time. Nothing is on a timer. That
 * distinction is the whole value: a progress animation that always takes the
 * same three seconds tells the viewer nothing, while this shows where the time
 * genuinely went — and when the literature lookup is slow because an external
 * API is struggling, the number says so.
 *
 * Stages are listed up front in the order they occur, so the reader can see
 * what is still to come rather than watching lines appear from nowhere.
 * Unreached stages are dimmed, the running one has a spinner, completed ones
 * carry their duration.
 *
 * `aria-live="polite"` on the list announces each completion to a screen
 * reader without interrupting, which is the appropriate register for progress.
 */

const STAGE_ORDER = [
  { key: 'validate', label: 'Validating indication' },
  { key: 'enrich', label: 'Mining live literature' },
  { key: 'screen', label: 'Screening compound matrix' },
  { key: 'score', label: 'Scoring drug-target interactions' },
  { key: 'rank', label: 'Multi-objective Pareto ranking' },
];

function formatElapsed(ms) {
  if (ms === null || ms === undefined) return '';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  // "0ms" reads as a missing value rather than a fast one, and these stages
  // genuinely can finish in under a millisecond on a warm cache.
  if (ms < 1) return '<1ms';
  return `${Math.round(ms)}ms`;
}

export default function LivePipelineFeed({ stages }) {
  // `stages` is a map of stage key -> latest event for that stage.
  const activeIndex = STAGE_ORDER.findIndex(
    (stage) => stages[stage.key] && stages[stage.key].status === 'running',
  );

  return (
    <div id="live-pipeline" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 scroll-mt-24">
      <div className="clean-card surface-veil rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-brand animate-pulse" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Virtual research team executing
            </span>
          </div>
          {/* This component only ever renders once a stage event has arrived,
              which can only happen over the stream - so the label needs no
              flag to guard it. The earlier version passed one, set after the
              stream finished, by which point the feed was already gone. */}
          <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
            live server-sent events
          </span>
        </div>

        <ul className="divide-y divide-slate-100" aria-live="polite" aria-busy="true">
          {STAGE_ORDER.map((stage, index) => {
            const event = stages[stage.key];
            const status = event?.status ?? (index === activeIndex ? 'running' : 'pending');
            const isDone = status === 'completed';
            const isRunning = status === 'running';
            const isFailed = status === 'failed';

            return (
              <li
                key={stage.key}
                className={`px-4 py-3 flex items-start gap-3 transition-opacity duration-300 ${
                  event ? 'opacity-100' : 'opacity-40'
                }`}
              >
                <span className="mt-0.5 shrink-0">
                  {isDone && <Check className="w-4 h-4 text-emerald-600" />}
                  {isRunning && <Loader2 className="w-4 h-4 text-brand animate-spin" />}
                  {isFailed && <span className="block w-4 h-4 rounded-full border-2 border-rose-400" />}
                  {!event && <span className="block w-4 h-4 rounded-full border-2 border-slate-200" />}
                </span>

                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${isDone || isRunning ? 'text-slate-900 font-medium' : 'text-slate-500'}`}>
                    {stage.label}
                  </p>
                  {event?.detail && (
                    <p className="text-xs text-slate-500 mt-0.5">{event.detail}</p>
                  )}
                </div>

                {event?.elapsed_ms !== undefined && (
                  <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0 mt-0.5">
                    {formatElapsed(event.elapsed_ms)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
