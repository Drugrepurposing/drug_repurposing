import React from 'react';
import { Compass, X } from 'lucide-react';

/**
 * The invitation to take the tour, shown once to a first-time visitor.
 *
 * The tour used to launch itself on arrival. That was wrong twice over: it
 * seizes the page from someone who may have come to do one specific thing, and
 * because the tour runs a search of its own, it starts work nobody asked for
 * before the visitor has read a word. It also broke every automated test in
 * the project, which is the kind of evidence worth listening to - if a script
 * cannot get past your welcome, neither can a person in a hurry.
 *
 * So this asks instead. It is small, it sits out of the way at the bottom
 * left, it never covers the search box or the results, and it takes no clicks
 * away from the page behind it. Either button settles the question for good.
 */
export default function TourPrompt({ onStart, onDismiss }) {
  return (
    <div
      data-testid="tour-prompt"
      className="fixed bottom-4 left-4 z-40 w-72 clean-card surface-veil rounded-xl shadow-lg p-3.5 anim-rise"
      role="complementary"
      aria-label="Guided tour invitation"
    >
      <div className="flex items-start gap-2.5">
        <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
          <Compass className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-900">First time here?</p>
          <p className="text-[11px] text-slate-600 leading-relaxed mt-0.5">
            A one-minute tour runs a real search and shows you what the pipeline
            produces.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss the tour invitation"
          className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={onStart}
          className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
        >
          Take the tour
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[11px] text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
        >
          No thanks
        </button>
      </div>
    </div>
  );
}
