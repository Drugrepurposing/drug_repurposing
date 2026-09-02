import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, Clock, FlaskConical, Loader2, RotateCw, Search, ThumbsDown,
  ThumbsUp, Trash2, TrendingUp,
} from 'lucide-react';
import api from '../api.js';
import { useToast } from '../context/toast-context.js';
import ActivityChart from './ActivityChart.jsx';

/**
 * "My Research" — the signed-in user's history and the aggregates over it.
 *
 * Everything here is computed by PostgreSQL, not in the browser: counts,
 * grouping and the median all happen in SQL, so the page stays the same speed
 * whether the table holds ten rows or ten thousand.
 *
 * The median deserves a note. It is PERCENTILE_CONT, not an average, because
 * one run that happened while an external API was timing out would drag a mean
 * upwards and misrepresent typical performance.
 */

const PAGE_SIZE = 10;

function StatTile({ icon: Icon, label, value, suffix, hint }) {
  return (
    <div className="clean-card surface-veil rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900 leading-none">
        {value}
        {suffix && <span className="text-sm font-medium text-slate-500 ml-1">{suffix}</span>}
      </p>
      {hint && <p className="mt-1.5 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * Top diseases as horizontal bars.
 *
 * Horizontal because the labels are disease names — rotated or truncated
 * column labels would be unreadable. Single hue, because the bars encode
 * magnitude rather than identity. Five bars, so every value is directly
 * labelled at the tip and no axis is needed.
 */
function TopDiseases({ items }) {
  if (!items || items.length === 0) return null;
  const max = Math.max(...items.map((item) => item.runs), 1);

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900 mb-3">Most investigated</h3>
      <ul className="space-y-2.5">
        {items.map((item) => (
          <li key={item.disease_name}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-xs text-slate-700 truncate">{item.disease_name}</span>
              <span className="text-xs font-semibold text-slate-900 tabular-nums shrink-0">
                {item.runs}
              </span>
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--viz-track)' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(item.runs / max) * 100}%`,
                  backgroundColor: 'var(--viz-series)',
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Supported vs rejected, as one proportion meter rather than two coloured bars.
 *
 * Green-versus-red is the instinctive choice and the wrong one: measured
 * against these surfaces the pair separates by roughly DeltaE 5 under
 * deuteranopia, far below the threshold at which two colours can be told
 * apart. Here the split is a single filled track — magnitude, one hue — and
 * the two counts are stated in words beside their icons, so nothing depends on
 * distinguishing colours at all.
 */
function ValidationMeter({ supported, rejected }) {
  const total = supported + rejected;
  const share = total > 0 ? Math.round((supported / total) * 100) : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-slate-900">Your expert validation</h3>
        <span className="text-[11px] text-slate-500 tabular-nums">
          {total} {total === 1 ? 'vote' : 'votes'}
        </span>
      </div>

      {total === 0 ? (
        <p className="text-xs text-slate-500">
          No votes yet. Use the thumbs up or down on any candidate to record your
          assessment — it feeds the active-learning loop.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-slate-900 leading-none tabular-nums">
              {share}%
            </span>
            <span className="text-xs text-slate-500">supported</span>
          </div>

          <div
            className="mt-3 h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--viz-track)' }}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${share}%`, backgroundColor: 'var(--viz-series)' }}
            />
          </div>

          <div className="mt-2.5 flex items-center gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <ThumbsUp className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="tabular-nums font-medium">{supported}</span> supported
            </span>
            <span className="flex items-center gap-1.5">
              <ThumbsDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="tabular-nums font-medium">{rejected}</span> rejected
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function formatTimestamp(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function ResearchDashboard({ onRerunSearch }) {
  const { notify } = useToast();
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState({ total: 0, items: [] });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async (pageIndex) => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, historyRes] = await Promise.all([
        api.get('/api/history/stats'),
        api.get('/api/history', { params: { limit: PAGE_SIZE, offset: pageIndex * PAGE_SIZE } }),
      ]);
      setStats(statsRes.data);
      setHistory(historyRes.data);
    } catch (err) {
      setError(
        err?.response?.data?.detail
        || 'Could not load your research history. Check that the backend is running.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetching from the API on mount and on page change is what an effect is
  // for - synchronising with an external system. The linter's set-state-in-
  // effect rule cannot see that the setState calls happen inside an async
  // request rather than during the render pass, so it is suppressed here
  // deliberately rather than worked around with code that reads worse.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(page); }, [load, page]);

  const handleDelete = async (entryId) => {
    setDeletingId(entryId);
    try {
      await api.delete(`/api/history/${entryId}`);
      // Reload rather than splicing locally: the totals, the activity chart and
      // the "most investigated" list all change, and recomputing them in the
      // browser would risk them disagreeing with the database.
      const nextPage = history.items.length === 1 && page > 0 ? page - 1 : page;
      if (nextPage !== page) setPage(nextPage);
      else await load(page);
      notify('History entry deleted');
    } catch {
      setError('Could not delete that entry. Please try again.');
      notify('Could not delete that entry', { variant: 'error' });
    } finally {
      setDeletingId(null);
    }
  };

  const totalPages = Math.max(Math.ceil(history.total / PAGE_SIZE), 1);

  if (loading && !stats) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 flex items-center justify-center gap-2 text-slate-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading your research history...
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  const isEmpty = stats && stats.total_runs === 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h2 className="text-2xl text-slate-900">My Research</h2>
        <p className="text-sm text-slate-500 mt-1">
          Every pipeline run recorded against your account, with aggregates computed in PostgreSQL.
        </p>
      </div>

      {isEmpty ? (
        <div className="clean-card surface-veil rounded-xl p-10 text-center">
          <FlaskConical className="w-8 h-8 text-slate-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-900">No searches recorded yet</p>
          <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto">
            Run a discovery pipeline from the home page and it will appear here,
            with its runtime and candidate count.
          </p>
        </div>
      ) : (
        <>
          {/* Headline numbers. These are figures, not charts — a bar chart of
              four unrelated totals would be harder to read than the numbers. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatTile
              icon={Search}
              label="Pipeline runs"
              value={stats.total_runs.toLocaleString()}
            />
            <StatTile
              icon={FlaskConical}
              label="Diseases explored"
              value={stats.distinct_diseases.toLocaleString()}
            />
            <StatTile
              icon={TrendingUp}
              label="Candidates ranked"
              value={stats.total_candidates.toLocaleString()}
            />
            <StatTile
              icon={Clock}
              label="Median runtime"
              value={stats.median_ms !== null ? Math.round(stats.median_ms).toLocaleString() : '—'}
              suffix={stats.median_ms !== null ? 'ms' : ''}
              hint="Median, not mean — one slow run cannot skew it"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="clean-card surface-veil rounded-xl p-4 lg:col-span-2">
              <ActivityChart data={stats.activity} />
            </div>
            <div className="clean-card surface-veil rounded-xl p-4">
              <TopDiseases items={stats.top_diseases} />
            </div>
          </div>

          <div className="clean-card surface-veil rounded-xl p-4">
            <ValidationMeter
              supported={stats.feedback.supported}
              rejected={stats.feedback.rejected}
            />
          </div>
        </>
      )}

      {/* History table. Also the accessible fallback for the charts above:
          every number they plot is readable here as text. */}
      {history.items.length > 0 && (
        <div className="clean-card surface-veil rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">Search history</h3>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {history.total} recorded
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th scope="col" className="px-4 py-2.5 font-medium">Query</th>
                  <th scope="col" className="px-4 py-2.5 font-medium hidden sm:table-cell">Resolved to</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-right">Hits</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-right hidden md:table-cell">Runtime</th>
                  <th scope="col" className="px-4 py-2.5 font-medium hidden lg:table-cell">When</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.items.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-900 max-w-[10rem] truncate">
                      {entry.disease_query}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 hidden sm:table-cell max-w-[12rem] truncate">
                      {entry.disease_name || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700 tabular-nums">
                      {entry.result_count}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums hidden md:table-cell">
                      {entry.duration_ms ? `${Math.round(entry.duration_ms)} ms` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs hidden lg:table-cell whitespace-nowrap">
                      {formatTimestamp(entry.created_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onRerunSearch(entry.disease_query)}
                          title={`Run ${entry.disease_query} again`}
                          aria-label={`Run ${entry.disease_query} again`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-brand hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(entry.id)}
                          disabled={deletingId === entry.id}
                          title={`Delete the ${entry.disease_query} entry`}
                          aria-label={`Delete the ${entry.disease_query} entry`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          {deletingId === entry.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="p-3 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(value - 1, 0))}
                disabled={page === 0 || loading}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Previous
              </button>
              <span className="text-[11px] text-slate-500 tabular-nums">
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(value + 1, totalPages - 1))}
                disabled={page >= totalPages - 1 || loading}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {error && stats && (
        <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
