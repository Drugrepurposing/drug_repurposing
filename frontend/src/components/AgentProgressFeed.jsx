import React from 'react';
import { Terminal, CheckCircle2 } from 'lucide-react';

export default function AgentProgressFeed({ logs, isRunning }) {
  if (!logs || logs.length === 0) return null;

  return (
    <div className="max-w-4xl mx-auto mb-8 clean-card rounded-xl p-5 border border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-indigo-600" />
          <h3 className="font-mono font-bold text-xs text-slate-800 uppercase tracking-wider">
            Multi-Agent Pipeline Execution Log
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span className="text-emerald-700 font-semibold text-[11px]">
            {isRunning ? 'EXECUTING PIPELINE' : 'COMPLETE'}
          </span>
        </div>
      </div>

      {/* Log Feed */}
      <div className="space-y-2.5 font-mono text-xs max-h-56 overflow-y-auto pr-1">
        {logs.map((log, idx) => (
          <div
            key={idx}
            className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 flex items-start gap-2.5"
          >
            <div className="mt-0.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-bold text-indigo-900 text-xs">
                  {log.agent}
                </span>
                <span className="text-[10px] text-slate-400">{log.timestamp}</span>
              </div>
              <p className="text-slate-700 text-xs leading-relaxed font-sans">
                {log.message}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
