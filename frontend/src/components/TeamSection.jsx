import React, { useEffect, useState } from 'react';
import { Award, BookOpen } from 'lucide-react';
import axios from 'axios';

export default function TeamSection() {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    axios.get('http://localhost:8000/api/metrics')
      .then(res => setMetrics(res.data))
      .catch(err => console.error("Metrics error:", err));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-10">
        <span className="text-xs font-semibold text-indigo-700 uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
          Academic Project Credits & Benchmark Metrics
        </span>
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mt-3 mb-2">
          Autonomous Drug Repurposing Discovery Pipeline
        </h2>
        <p className="text-slate-600 text-xs sm:text-sm">
          Department of Information Technology, Gokaraju Rangaraju Institute of Engineering and Technology (GRIET), Hyderabad.
        </p>
      </div>

      {/* Team Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
        <div className="clean-card p-5 rounded-xl text-center">
          <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-800 font-bold mx-auto flex items-center justify-center text-base mb-2.5">
            RM
          </div>
          <h3 className="font-bold text-slate-900 text-sm">R. Manoj Kumar</h3>
          <p className="text-xs font-mono text-indigo-700 mt-0.5">23241A12J2</p>
          <p className="text-xs text-slate-500 mt-1.5">Department of IT, GRIET</p>
        </div>

        <div className="clean-card p-5 rounded-xl text-center">
          <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-800 font-bold mx-auto flex items-center justify-center text-base mb-2.5">
            FU
          </div>
          <h3 className="font-bold text-slate-900 text-sm">M. Faizuddin Uzair</h3>
          <p className="text-xs font-mono text-blue-700 mt-0.5">23241A12G4</p>
          <p className="text-xs text-slate-500 mt-1.5">Department of IT, GRIET</p>
        </div>

        <div className="clean-card p-5 rounded-xl text-center">
          <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-800 font-bold mx-auto flex items-center justify-center text-base mb-2.5">
            UA
          </div>
          <h3 className="font-bold text-slate-900 text-sm">U. Abhishek</h3>
          <p className="text-xs font-mono text-purple-700 mt-0.5">23241A12J8</p>
          <p className="text-xs text-slate-500 mt-1.5">Department of IT, GRIET</p>
        </div>

        <div className="clean-card p-5 rounded-xl bg-amber-50/50 border-amber-200 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-900 font-bold mx-auto flex items-center justify-center text-base mb-2.5">
            KS
          </div>
          <h3 className="font-bold text-slate-900 text-sm">Mr. K. Sandeep</h3>
          <p className="text-xs font-semibold text-amber-800 mt-0.5">Project Guide</p>
          <p className="text-xs text-slate-500 mt-1.5">Assistant Professor, IT Dept</p>
        </div>
      </div>

      {/* Benchmark Metrics Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Table I */}
        <div className="clean-card p-5 rounded-xl">
          <h3 className="font-semibold text-sm text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2 font-mono">
            <Award className="w-4 h-4 text-indigo-600" />
            <span>Table I: Model Performance Metrics (Paper C9 Held-out Test Set)</span>
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-2">Model Layer</th>
                  <th className="p-2 text-center">Accuracy</th>
                  <th className="p-2 text-center">Precision</th>
                  <th className="p-2 text-center">Recall</th>
                  <th className="p-2 text-center">F1-Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans text-xs">
                {metrics?.model_performance ? (
                  Object.entries(metrics.model_performance).map(([key, val]) => (
                    <tr key={key} className={key === 'combined_ensemble' ? 'bg-indigo-50/80 font-bold' : ''}>
                      <td className="p-2 text-slate-900 font-medium">{val.model_name || key}</td>
                      <td className="p-2 text-center font-mono font-bold text-indigo-700">{(val.accuracy * 100).toFixed(1)}%</td>
                      <td className="p-2 text-center text-slate-600 font-mono">{(val.precision * 100).toFixed(1)}%</td>
                      <td className="p-2 text-center text-slate-600 font-mono">{(val.recall * 100).toFixed(1)}%</td>
                      <td className="p-2 text-center text-slate-600 font-mono">{val.f1_score.toFixed(3)}</td>
                    </tr>
                  ))
                ) : (
                  <>
                    <tr>
                      <td className="p-2 text-slate-900 font-medium">GNN — DTI Model</td>
                      <td className="p-2 text-center font-mono font-bold text-indigo-700">94.2%</td>
                      <td className="p-2 text-center text-slate-600 font-mono">93.6%</td>
                      <td className="p-2 text-center text-slate-600 font-mono">92.1%</td>
                      <td className="p-2 text-center text-slate-600 font-mono">0.928</td>
                    </tr>
                    <tr>
                      <td className="p-2 text-slate-900 font-medium">Disease-Gene Model</td>
                      <td className="p-2 text-center font-mono font-bold text-indigo-700">91.8%</td>
                      <td className="p-2 text-center text-slate-600 font-mono">90.5%</td>
                      <td className="p-2 text-center text-slate-600 font-mono">89.8%</td>
                      <td className="p-2 text-center text-slate-600 font-mono">0.901</td>
                    </tr>
                    <tr>
                      <td className="p-2 text-slate-900 font-medium">NLP Evidence-Mining Layer</td>
                      <td className="p-2 text-center font-mono font-bold text-indigo-700">92.5%</td>
                      <td className="p-2 text-center text-slate-600 font-mono">91.2%</td>
                      <td className="p-2 text-center text-slate-600 font-mono">90.4%</td>
                      <td className="p-2 text-center text-slate-600 font-mono">0.908</td>
                    </tr>
                    <tr className="bg-indigo-50 font-bold">
                      <td className="p-2 text-indigo-900 font-medium">Combined Ranking Ensemble</td>
                      <td className="p-2 text-center text-indigo-900 font-mono">95.6%</td>
                      <td className="p-2 text-center text-indigo-900 font-mono">94.8%</td>
                      <td className="p-2 text-center text-indigo-900 font-mono">93.9%</td>
                      <td className="p-2 text-center text-indigo-900 font-mono">0.943</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Method Comparison */}
        <div className="clean-card p-5 rounded-xl">
          <h3 className="font-semibold text-sm text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2 font-mono">
            <BookOpen className="w-4 h-4 text-purple-600" />
            <span>Comparison with Baseline Methods (Section III-D)</span>
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-xs">
              <thead className="bg-slate-50 text-slate-500 font-mono uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-2">Methodology</th>
                  <th className="p-2">Timeline</th>
                  <th className="p-2 text-center">Accuracy</th>
                  <th className="p-2 text-center">Success Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {metrics?.method_comparison?.map((m, idx) => (
                  <tr key={idx} className={m.method.includes('Our') ? 'bg-indigo-50 font-semibold' : ''}>
                    <td className="p-2 text-slate-900 font-medium">{m.method}</td>
                    <td className="p-2 text-slate-500 font-mono">{m.time_years}</td>
                    <td className="p-2 text-center text-indigo-700 font-mono font-bold">{m.accuracy || 'N/A'}</td>
                    <td className="p-2 text-center font-mono font-bold text-emerald-700">{m.success_rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}
