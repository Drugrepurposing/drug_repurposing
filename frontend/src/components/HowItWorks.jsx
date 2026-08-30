import React from 'react';
import { Database, Layers, Cpu, BarChart3, RefreshCw } from 'lucide-react';

const STAGES = [
  {
    step: "01",
    title: "Multi-Source Acquisition",
    description: "Integrates DrugBank (SMILES/Targets), DisGeNET (Gene-Disease), and LINCS L1000 perturbational profiles.",
    icon: Database,
    badge: "DrugBank & DisGeNET"
  },
  {
    step: "02",
    title: "Multi-Omics Fusion",
    description: "Projects high-dimensional gene expression signatures into lower-dimensional autoencoder latent representations.",
    icon: Layers,
    badge: "Autoencoders & SMILES"
  },
  {
    step: "03",
    title: "Parallel AI Models",
    description: "Heterogeneous Graph Neural Networks (GNN) learn topological graph embeddings while SciBERT mines PubMed.",
    icon: Cpu,
    badge: "GNN & SciBERT NLP"
  },
  {
    step: "04",
    title: "Pareto Candidate Ranking",
    description: "Jointly optimizes therapeutic relevance and safety-likelihood scores, outputting a candidate shortlist.",
    icon: BarChart3,
    badge: "Multi-Objective Ranker"
  },
  {
    step: "05",
    title: "Closed-Loop Docking Check",
    description: "AutoDock Vina simulates biophysical binding energy (ΔG). Candidates failing thresholds are re-ranked via feedback.",
    icon: RefreshCw,
    badge: "Biophysical Docking"
  }
];

export default function HowItWorks() {
  return (
    <section className="py-12 bg-white border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">
            How The Pipeline Works
          </h2>
          <p className="text-slate-600 text-xs sm:text-sm">
            An end-to-end computational framework unifying AI predictive modeling with biophysical docking simulation.
          </p>
        </div>

        {/* 5-Stage Stepper Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {STAGES.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.step}
                className="clean-card clean-card-hover p-4 rounded-xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      STAGE {s.step}
                    </span>
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>

                  <h3 className="font-bold text-sm text-slate-900 mb-1.5">
                    {s.title}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed mb-3">
                    {s.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[10px] font-medium text-indigo-700">
                    {s.badge}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
