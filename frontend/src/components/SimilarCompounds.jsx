import React, { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Network } from 'lucide-react';
import api from '../api.js';

/**
 * Nearest neighbours of a compound in embedding space.
 *
 * The score bar is single-hue and proportional to similarity, so the ranking
 * is readable at a glance without the reader having to compare four-decimal
 * numbers. The numbers are printed too, because "0.94" and "0.91" are visually
 * almost identical as bars and the difference can matter.
 *
 * Every neighbour carries a reason. A bare similarity score asks the reader to
 * trust an opaque number; "0.94 — shares target GSK3B" is something they can
 * check and argue with, which is the whole point of putting it in front of a
 * domain expert.
 */

export default function SimilarCompounds({ drugId }) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  // Fetching on mount and when the compound changes is what an effect is for -
  // synchronising with an external system.
  useEffect(() => {
    if (!drugId) return undefined;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: 'loading', data: null, error: null });

    api.get(`/api/drugs/${encodeURIComponent(drugId)}/similar`, { params: { limit: 5 } })
      .then((res) => {
        if (!cancelled) setState({ status: 'ready', data: res.data, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        // 503 means the vector index is not populated — worth saying plainly
        // rather than showing a generic failure, because the fix is a command.
        const status = err?.response?.status;
        setState({
          status: 'error',
          data: null,
          error: status === 503
            ? 'Vector index not yet built on this server.'
            : status === 404
              ? 'No embedding stored for this compound.'
              : 'Could not load similar compounds.',
        });
      });

    return () => { cancelled = true; };
  }, [drugId]);

  if (state.status === 'loading') {
    return (
      <Frame>
        <div className="flex items-center gap-2 text-xs text-slate-500 py-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Searching vector index...
        </div>
      </Frame>
    );
  }

  if (state.status === 'error') {
    return (
      <Frame>
        <div className="flex items-start gap-2 text-xs text-slate-500 py-1">
          <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-px" />
          <span>{state.error}</span>
        </div>
      </Frame>
    );
  }

  const { neighbours = [], indexed_compounds: indexed } = state.data || {};

  // Bars are scaled against the closest neighbour, not against an absolute
  // 0-1 range. Absolute scaling looked reasonable in one test and produced
  // four nearly-empty bars in another, because how tightly a compound's
  // neighbours cluster varies enormously between targets. Relative scaling
  // always uses the full width and always shows the shape of the drop-off;
  // the printed numbers carry the absolute value.
  const topScore = neighbours.length ? Math.max(...neighbours.map((n) => n.similarity)) : 1;

  if (neighbours.length === 0) {
    return (
      <Frame>
        <p className="text-xs text-slate-500 py-1">
          No comparable compounds found in the index.
        </p>
      </Frame>
    );
  }

  return (
    <Frame indexed={indexed}>
      <ul className="space-y-2.5">
        {neighbours.map((item) => (
          <li key={item.drug_id}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-xs font-medium text-slate-900 truncate">
                {item.drug_name}
              </span>
              <span className="text-[11px] font-semibold text-slate-700 tabular-nums shrink-0">
                {item.similarity.toFixed(3)}
              </span>
            </div>

            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--viz-track)' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max((item.similarity / topScore) * 100, 6)}%`,
                  backgroundColor: 'var(--viz-series)',
                }}
              />
            </div>

            <p className="mt-1 text-[11px] text-slate-500">
              {item.reasons.join(' · ')}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-3 pt-2.5 border-t border-slate-200 text-[10px] text-slate-400 leading-relaxed">
        Cosine distance over {indexed?.toLocaleString() ?? '—'} indexed compounds,
        resolved by an HNSW approximate-nearest-neighbour index in PostgreSQL.
        Vectors combine target and pathway context, SMILES substructure and
        multi-omics descriptors.
      </p>
    </Frame>
  );
}

function Frame({ children, indexed }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2.5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Network className="w-3.5 h-3.5 text-indigo-600" />
          Nearest Compounds In Vector Space
        </h4>
        {indexed ? (
          <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
            {indexed.toLocaleString()} indexed
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
