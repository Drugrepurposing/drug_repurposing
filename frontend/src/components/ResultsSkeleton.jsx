import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Shown while the pipeline runs.
 *
 * A skeleton rather than a spinner, for a specific reason: this search takes
 * several seconds, and a spinner conveys only "wait". A shaped placeholder
 * tells the user what is coming and roughly how much of it, which makes the
 * same wait feel shorter and deliberate rather than stalled.
 *
 * It also holds the page height steady, so results appear in place instead of
 * shoving the layout down at the moment the user starts reading.
 *
 * The stage list is honest: those are the real pipeline stages, and the
 * progress language is deliberately vague ("running") rather than claiming a
 * stage has completed. Faking per-stage completion on a timer would be a lie
 * the user could catch by running a slow search.
 */

const STAGES = [
  'Screening 100,000+ compound matrix',
  'Graph neural network scoring',
  'Multi-omics signature reversal',
  'Biophysical docking validation',
];

export default function ResultsSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" aria-hidden="true">
      <div className="flex items-center gap-2.5 mb-6">
        <Loader2 className="w-4 h-4 text-brand animate-spin" />
        <div>
          <p className="text-sm font-semibold text-slate-900">Running discovery pipeline</p>
          <p className="text-xs text-slate-500">
            {STAGES.join(' · ')}
          </p>
        </div>
      </div>

      <div className="clean-card rounded-2xl overflow-hidden border border-slate-200 bg-surface">
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex gap-4">
          {['3rem', '12rem', '6rem', '5rem', '5rem', '4rem'].map((width, index) => (
            <Bar key={index} width={width} height="0.55rem" />
          ))}
        </div>

        {[0, 1, 2, 3, 4].map((row) => (
          <div
            key={row}
            className="px-4 py-4 border-b border-slate-100 last:border-0 flex items-center gap-4"
            style={{ opacity: 1 - row * 0.14 }}
          >
            <Bar width="1.5rem" height="1.5rem" rounded="rounded-full" />
            <div className="flex-1 min-w-0 space-y-2">
              <Bar width="45%" height="0.7rem" />
              <Bar width="28%" height="0.55rem" />
            </div>
            <Bar width="4rem" height="0.7rem" className="hidden sm:block" />
            <Bar width="3.5rem" height="0.7rem" className="hidden md:block" />
            <Bar width="3.5rem" height="0.7rem" className="hidden lg:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({ width, height, rounded = 'rounded', className = '' }) {
  return (
    <div
      className={`skeleton-bar ${rounded} ${className}`}
      style={{ width, height }}
    />
  );
}
