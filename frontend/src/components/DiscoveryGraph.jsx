import React, { useMemo } from 'react';
import { Network, MousePointerClick } from 'lucide-react';
import MolecularScene3D from './MolecularScene3D.jsx';

/**
 * The result of the search that just ran, drawn as the graph it came from.
 *
 * The table below this panel is the authoritative view — it has every number
 * and every action. This is the same data arranged spatially, which answers a
 * different question: not "how did compound X score" but "how do these
 * candidates group, and is the pipeline concentrating on one target or
 * spreading across several". That is visible in a second here and takes a
 * careful read of the table.
 *
 * The target list beside the graph is not decoration to fill the width. A
 * rotating sphere is good at showing shape and bad at being read precisely, so
 * the same grouping is given in text, sorted, with the best compound per target
 * named — and every row opens the same panel its node does. Neither half is a
 * second-class route to the information.
 *
 * Every element is derived from the response, so the panel cannot drift out of
 * agreement with the rows underneath it.
 */

function percent(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export default function DiscoveryGraph({ result, onSelectCandidate }) {
  const candidates = result?.candidates;

  const groups = useMemo(() => {
    if (!Array.isArray(candidates) || candidates.length === 0) return [];
    const byGene = new Map();
    candidates.forEach((candidate) => {
      const gene = candidate.target_gene || 'Unassigned';
      if (!byGene.has(gene)) byGene.set(gene, []);
      byGene.get(gene).push(candidate);
    });
    return [...byGene.entries()]
      .map(([gene, members]) => {
        const best = members.reduce(
          (top, c) => ((c.overall_score ?? 0) > (top.overall_score ?? 0) ? c : top),
          members[0],
        );
        return {
          gene,
          count: members.length,
          best,
          validated: members.filter((c) => c.validation_passed === true).length,
        };
      })
      // Strongest target first, which is the order the table uses too.
      .sort((a, b) => (b.best.overall_score ?? 0) - (a.best.overall_score ?? 0));
  }, [candidates]);

  if (groups.length === 0) return null;

  const total = candidates.length;
  const validated = candidates.filter((c) => c.validation_passed === true).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
      <div className="clean-card surface-veil rounded-2xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-2 min-w-0">
            <Network className="w-3.5 h-3.5 text-brand shrink-0" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 truncate">
              Discovery graph
            </span>
            <span className="text-[11px] text-slate-500 truncate">
              {total} candidate{total === 1 ? '' : 's'} across {groups.length}{' '}
              target{groups.length === 1 ? '' : 's'}
              {validated > 0 && ` · ${validated} validated`}
            </span>
          </div>

          <div className="flex items-center gap-3 text-[10px] font-medium text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-700" />Disease
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-700" />Target
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-600" />Compound
            </span>
            <span className="hidden sm:flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border border-slate-700" />Validated
            </span>
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="border-b lg:border-b-0 lg:border-r border-slate-200">
            <MolecularScene3D
              height={380}
              result={result}
              onSelectCandidate={onSelectCandidate}
            />
          </div>

          <div className="p-3 lg:max-h-[380px] lg:overflow-y-auto">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Targets in this result
            </p>
            <ul className="mt-2 space-y-1">
              {groups.map((group) => (
                <li key={group.gene}>
                  <button
                    type="button"
                    onClick={() => onSelectCandidate?.(group.best)}
                    className="w-full text-left rounded-lg px-2.5 py-2 border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-slate-900 font-mono">
                        {group.gene}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {group.count} compound{group.count === 1 ? '' : 's'}
                        {group.validated > 0 && ` · ${group.validated} validated`}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[11px] text-slate-600 truncate">
                        {group.best.name}
                      </span>
                      <span className="ml-auto text-[10px] font-mono tabular-nums text-slate-500 shrink-0">
                        {percent(group.best.overall_score)}%
                      </span>
                    </div>
                    {/* One hue, length carrying the value. Two colours here
                        would imply a category that does not exist, and the
                        proportion is the whole message. */}
                    <div className="mt-1.5 h-1 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${percent(group.best.overall_score)}%` }}
                      />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="px-4 py-2 border-t border-slate-200 text-[10px] text-slate-500 flex items-center justify-center gap-1.5 text-center">
          <MousePointerClick className="w-3 h-3 shrink-0" />
          <span>
            Node size and closeness to the core both track overall score. Hover to
            pause and inspect; click a compound to open its explainability panel.
          </span>
        </div>
      </div>
    </div>
  );
}
