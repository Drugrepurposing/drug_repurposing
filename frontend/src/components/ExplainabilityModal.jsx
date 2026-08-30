import React from 'react';
import { X, Sparkles, Cpu, ShieldCheck } from 'lucide-react';

export default function ExplainabilityModal({ candidate, diseaseName, onClose }) {
  if (!candidate) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-xl rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Why Was {candidate.name} Picked?
              </h3>
              <p className="text-xs text-slate-500">
                Explainability Breakdown • Target: {diseaseName} ({candidate.target_gene})
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

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-sm text-slate-700">
          {/* AI Narrative Box */}
          <div className="p-3.5 rounded-lg bg-indigo-50/60 border border-indigo-100">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 uppercase tracking-wider mb-1.5">
              <Cpu className="w-3.5 h-3.5 text-indigo-600" />
              <span>AI Research Reasoning Narrative</span>
            </div>
            <p className="text-slate-800 text-xs sm:text-sm leading-relaxed">
              "{candidate.explainability_narrative}"
            </p>
          </div>

          {/* Feature Breakdown Bars */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
              Predictive Feature Contributions
            </h4>
            <div className="space-y-2.5 font-mono text-xs">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-600 font-sans">GNN Graph Topology Score</span>
                  <span className="text-indigo-700 font-bold">{(candidate.gnn_dti_score * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${candidate.gnn_dti_score * 100}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-600 font-sans">DisGeNET Disease-Gene Score</span>
                  <span className="text-blue-700 font-bold">{(candidate.disgenet_gene_score * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: `${candidate.disgenet_gene_score * 100}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-600 font-sans">LINCS L1000 Expression Signature Reversal</span>
                  <span className="text-emerald-700 font-bold">{(candidate.lincs_reversal_score * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${candidate.lincs_reversal_score * 100}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-600 font-sans">AutoDock Vina Biophysical Binding Energy</span>
                  <span className="text-purple-700 font-bold">{candidate.docking_delta_g} kcal/mol</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-600 rounded-full" style={{ width: `${Math.min(100, Math.abs(candidate.docking_delta_g) * 8)}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* SMILES */}
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1">
              SMILES Chemical Fingerprint:
            </div>
            <code className="text-xs font-mono text-slate-800 break-all select-all">
              {candidate.smiles}
            </code>
          </div>

          {/* Safety */}
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-slate-900 mb-0.5">Safety & ADMET Likelihood Profile</div>
              <p className="text-xs text-slate-600 leading-relaxed font-sans">
                {candidate.safety_profile}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-medium text-xs transition-colors cursor-pointer"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}
