import React, { useState, useEffect } from 'react';
import { X, ArrowRightLeft } from 'lucide-react';
import api from '../api';

export default function DrugCompareModal({ candidate1, allCandidates, onClose }) {
  const [candidate2, setCandidate2] = useState(() => {
    return allCandidates?.find(c => c.id !== candidate1?.id) || allCandidates?.[0] || null;
  });
  const [comparisonData, setComparisonData] = useState(null);


  useEffect(() => {
    if (candidate1 && candidate2) {
      api.post('/api/compare', {
        drug_id_1: candidate1.id,
        drug_id_2: candidate2.id
      })
      .then(res => setComparisonData(res.data))
      .catch(err => console.error("Comparison error:", err));
    }
  }, [candidate1, candidate2]);

  if (!candidate1) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs">
      <div className="bg-surface w-full max-w-3xl rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <ArrowRightLeft className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Side-by-Side Candidate Comparison
              </h3>
              <p className="text-xs text-slate-500">
                Compare thermodynamic binding affinity, safety profiles, and GNN scores.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Drug Selection Pickers */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-center">
              <span className="text-[10px] font-semibold uppercase text-indigo-700 font-mono">Drug A (Rank #{candidate1.rank})</span>
              <h4 className="text-base font-bold text-slate-900 mt-0.5">{candidate1.name}</h4>
              <p className="text-xs text-slate-500">{candidate1.original_approval}</p>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-center">
              <span className="text-[10px] font-semibold uppercase text-blue-700 font-mono mb-0.5 block">Drug B</span>
              <select
                value={candidate2?.id || ''}
                onChange={(e) => {
                  const selected = allCandidates.find(c => c.id === e.target.value);
                  if (selected) setCandidate2(selected);
                }}
                className="bg-surface text-slate-900 font-bold text-sm rounded-md p-1 border border-slate-300 w-full focus:outline-none text-center"
              >
                {allCandidates.map(c => (
                  <option key={c.id} value={c.id} disabled={c.id === candidate1.id}>
                    #{c.rank} - {c.name} ({c.target_gene})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Comparison Matrix Table */}
          {candidate2 && (
            <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">Metric Dimension</th>
                    <th className="p-2.5 text-indigo-700">{candidate1.name}</th>
                    <th className="p-2.5 text-blue-700">{candidate2.name}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 font-sans text-xs">
                  <tr>
                    <td className="p-2.5 font-semibold text-slate-500">Target Gene</td>
                    <td className="p-2.5 text-slate-900 font-mono">{candidate1.target_gene}</td>
                    <td className="p-2.5 text-slate-900 font-mono">{candidate2.target_gene}</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold text-slate-500">Molecular Formula / MW</td>
                    <td className="p-2.5 text-slate-700">{candidate1.formula} ({candidate1.mw} g/mol)</td>
                    <td className="p-2.5 text-slate-700">{candidate2.formula} ({candidate2.mw} g/mol)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold text-slate-500">GNN DTI Score</td>
                    <td className="p-2.5 text-indigo-700 font-mono font-bold">{(candidate1.gnn_dti_score * 100).toFixed(1)}%</td>
                    <td className="p-2.5 text-indigo-700 font-mono font-bold">{(candidate2.gnn_dti_score * 100).toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold text-slate-500">AutoDock Vina ΔG</td>
                    <td className="p-2.5 text-emerald-700 font-mono font-bold">{candidate1.docking_delta_g} kcal/mol</td>
                    <td className="p-2.5 text-emerald-700 font-mono font-bold">{candidate2.docking_delta_g} kcal/mol</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold text-slate-500">Estimated Ki (Inhibition)</td>
                    <td className="p-2.5 text-slate-700 font-mono">{candidate1.estimated_ki_nm} nM</td>
                    <td className="p-2.5 text-slate-700 font-mono">{candidate2.estimated_ki_nm} nM</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-semibold text-slate-500">Safety Likelihood Score</td>
                    <td className="p-2.5 text-purple-700 font-mono">{(candidate1.safety_score * 100).toFixed(0)}%</td>
                    <td className="p-2.5 text-purple-700 font-mono">{(candidate2.safety_score * 100).toFixed(0)}%</td>
                  </tr>
                  <tr className="bg-slate-50 font-bold">
                    <td className="p-2.5 text-slate-900">Overall Pareto Score</td>
                    <td className="p-2.5 text-indigo-700 font-mono font-bold text-sm">{(candidate1.overall_score * 100).toFixed(1)}%</td>
                    <td className="p-2.5 text-blue-700 font-mono font-bold text-sm">{(candidate2.overall_score * 100).toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Verdict Banner */}
          {comparisonData && (
            <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
              <span className="text-[10px] font-semibold text-emerald-800 uppercase tracking-wider block mb-0.5 font-mono">
                Biophysical Affinity Verdict
              </span>
              <p className="text-xs font-semibold text-slate-800">
                <strong className="text-indigo-900">{comparisonData.higher_affinity_drug}</strong> demonstrates higher binding thermodynamics with a ΔG difference of <span className="text-emerald-700 font-mono">{comparisonData.delta_g_difference} kcal/mol</span>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
