import React, { useState } from 'react';

/**
 * Daily pipeline runs over the last N days.
 *
 * A single series, so there is no legend — the heading already says what is
 * plotted, and a one-swatch legend box would only restate it.
 *
 * Design decisions, each of which has a reason:
 *
 *  - Columns are capped at 24px and never fill their slot. The leftover space
 *    is air, not a wider bar.
 *  - The data-end is rounded 4px and the baseline stays square, so every
 *    column reads as growing from the same zero line.
 *  - Days with no activity come back from the API as zero rather than being
 *    absent. A chart drawn only from days that exist silently closes its gaps
 *    and overstates how continuous the work was; the zero column is honest.
 *    Those columns render as a faint stub so the day is still clickable and
 *    visibly present.
 *  - Values are not printed on every column — that is unreadable at 14 bars.
 *    A single gridline at the maximum carries the scale, hover gives any
 *    individual day, and the history table below the chart carries every number
 *    for anyone who cannot hover at all. Note that a direct label on the tallest
 *    column would always restate the gridline number, since the peak IS the
 *    maximum, so it is left off rather than printed twice.
 */

function formatDay(iso) {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function ActivityChart({ data }) {
  const [hovered, setHovered] = useState(null);

  if (!data || data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.runs), 1);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-slate-900">Pipeline runs per day</h3>
        <span className="text-[11px] text-slate-500 tabular-nums">
          last {data.length} days
        </span>
      </div>

      <div className="relative">
        {/* A single gridline at the maximum. Direct labels before gridlines,
            gridlines before a second axis — one line is enough to give scale. */}
        <div
          className="absolute inset-x-0 top-0 border-t"
          style={{ borderColor: 'var(--viz-grid)' }}
          aria-hidden="true"
        />
        <span className="absolute right-0 -top-0.5 text-[10px] text-slate-400 tabular-nums bg-surface pl-1">
          {max}
        </span>

        <div className="flex items-end gap-[2px] h-28 pt-3">
          {data.map((point, index) => {
            const isEmpty = point.runs === 0;
            const heightPct = isEmpty ? 0 : Math.max((point.runs / max) * 100, 6);

            return (
              <div
                key={point.day}
                className="relative flex-1 h-full flex flex-col justify-end items-center min-w-0 cursor-default"
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
                tabIndex={0}
                role="img"
                aria-label={`${formatDay(point.day)}: ${point.runs} ${point.runs === 1 ? 'run' : 'runs'}`}
              >
                <div
                  className="w-full max-w-6 rounded-t transition-opacity duration-150"
                  style={{
                    height: isEmpty ? '2px' : `${heightPct}%`,
                    backgroundColor: isEmpty ? 'var(--viz-track)' : 'var(--viz-series)',
                    opacity: hovered === null || hovered === index ? 1 : 0.45,
                  }}
                />

                {hovered === index && (
                  <div className="absolute bottom-full mb-2 z-10 px-2 py-1 rounded-md bg-ink text-white text-[11px] whitespace-nowrap shadow-lg pointer-events-none">
                    <span className="font-semibold tabular-nums">{point.runs}</span>
                    {point.runs === 1 ? ' run' : ' runs'}
                    <span className="text-ink-soft"> · {formatDay(point.day)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Baseline, drawn once for the whole series */}
        <div className="border-t border-slate-200" aria-hidden="true" />

        <div className="flex justify-between mt-1.5 text-[10px] text-slate-400 tabular-nums">
          <span>{formatDay(data[0].day)}</span>
          <span>{formatDay(data[data.length - 1].day)}</span>
        </div>
      </div>
    </div>
  );
}
