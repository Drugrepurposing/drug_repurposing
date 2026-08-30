import React, { useState } from 'react';
import { Box, HelpCircle, ArrowRightLeft, CheckCircle2, Download, ThumbsUp, ThumbsDown, BookOpen, Sparkles } from 'lucide-react';

export default function CandidateTable({ 
  candidates, 
  diseaseInfo, 
  onSelect3D, 
  onSelectExplain, 
  onSelectCompare, 
  onExportPDF, 
  onFeedback 
}) {
  const [feedbackState, setFeedbackState] = useState({});

  const handleRating = (drugId, rating) => {
    setFeedbackState(prev => ({ ...prev, [drugId]: rating }));
    if (onFeedback) onFeedback(drugId, rating);
  };

  if (!candidates || candidates.length === 0) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Ranked Repurposing Candidates
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold border border-indigo-200">
              {candidates.length} Candidate(s) Found
            </span>
          </div>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">
            Target Indication: <strong className="text-slate-900">{diseaseInfo?.name || 'Selected Indication'}</strong> | Validated via Multi-Omics & Physics Docking
          </p>
        </div>

        <button
          onClick={() => onExportPDF(diseaseInfo?.name, diseaseInfo?.category, candidates)}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm shadow-sm flex items-center gap-2 transition-all cursor-pointer hover:scale-105 active:scale-95"
        >
          <Download className="w-4 h-4" />
          <span>Download PDF Report</span>
        </button>
      </div>

      {/* Main Table */}
      <div className="clean-card rounded-2xl overflow-hidden shadow-xs border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 font-mono text-[11px] uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 text-center">Rank</th>
                <th className="py-3 px-4">Drug Candidate</th>
                <th className="py-3 px-4">Target Gene</th>
                <th className="py-3 px-4 text-center">GNN Score</th>
                <th className="py-3 px-4 text-center">Docking ΔG</th>
                <th className="py-3 px-4 text-center">Safety</th>
                <th className="py-3 px-4 text-center">Overall</th>
                <th className="py-3 px-4 text-center">Validation</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
              {candidates.map((cand) => (
                <tr key={cand.id} className="hover:bg-slate-50/80 transition-colors">
                  {/* Rank */}
                  <td className="py-3.5 px-4 text-center">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs ${
                      cand.rank === 1 
                        ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      #{cand.rank}
                    </span>
                  </td>

                  {/* Drug Name & Indication */}
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                      <span>{cand.name}</span>
                      <span className="text-[11px] font-mono text-slate-400">({cand.drugbank_id})</span>
                    </div>
                    <div className="text-xs text-slate-500 truncate max-w-xs mt-0.5">
                      {cand.original_approval}
                    </div>

                    {/* Origin Badge */}
                    <div className="mt-1">
                      {cand.origin === 'literature_consensus' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-sky-50 text-sky-800 border border-sky-200">
                          <BookOpen className="w-3 h-3 text-sky-600" /> Literature Consensus (PubMed/Gemini)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-800 border border-indigo-200">
                          <Sparkles className="w-3 h-3 text-indigo-600" /> GNN Off-Label Discovery
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Target Gene */}
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono text-xs font-semibold">
                      {cand.target_gene}
                    </span>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[140px]">
                      {cand.target_protein_name}
                    </div>
                  </td>

                  {/* GNN Score */}
                  <td className="py-3.5 px-4 text-center font-mono font-semibold text-indigo-700">
                    {(cand.gnn_dti_score * 100).toFixed(1)}%
                  </td>

                  {/* Docking ΔG */}
                  <td className="py-3.5 px-4 text-center font-mono">
                    <span className="text-emerald-700 font-bold">
                      {cand.docking_delta_g} kcal/mol
                    </span>
                    <div className="text-[10px] text-slate-400">
                      Est. Ki: {cand.estimated_ki_nm} nM
                    </div>
                  </td>

                  {/* Safety Score */}
                  <td className="py-3.5 px-4 text-center font-mono font-medium text-slate-700">
                    {(cand.safety_score * 100).toFixed(0)}%
                  </td>

                  {/* Overall Pareto Score */}
                  <td className="py-3.5 px-4 text-center font-mono">
                    <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold text-xs">
                      {(cand.overall_score * 100).toFixed(1)}%
                    </span>
                  </td>

                  {/* Validation Badge */}
                  <td className="py-3.5 px-4 text-center">
                    {cand.validation_passed ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Validated</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        <span>Docked</span>
                      </span>
                    )}
                  </td>

                  {/* Actions Column */}
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onSelect3D(cand)}
                        title="View 3D Docked Molecule (WebGL)"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                      >
                        <Box className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => onSelectExplain(cand)}
                        title="Why Was This Candidate Picked?"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => onSelectCompare(cand)}
                        title="Compare with another candidate"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                      </button>

                      {/* Expert Feedback Thumbs */}
                      <div className="flex items-center gap-0.5 border-l border-slate-200 pl-1.5 ml-1">
                        <button
                          onClick={() => handleRating(cand.id, 'up')}
                          className={`p-1 rounded transition-colors ${
                            feedbackState[cand.id] === 'up' ? 'text-emerald-600 bg-emerald-50' : 'text-slate-300 hover:text-slate-600'
                          }`}
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleRating(cand.id, 'down')}
                          className={`p-1 rounded transition-colors ${
                            feedbackState[cand.id] === 'down' ? 'text-rose-600 bg-rose-50' : 'text-slate-300 hover:text-slate-600'
                          }`}
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
