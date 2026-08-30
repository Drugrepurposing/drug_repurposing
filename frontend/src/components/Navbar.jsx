import React from 'react';
import { Dna, Activity, Info, Search } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, onNewSearchClick, isPipelineRunning }) {
  return (
    <header className="sticky top-0 z-40 w-full bg-white/90 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo & Title */}
        <div 
          onClick={() => setActiveTab('home')}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm group-hover:bg-indigo-700 transition-colors">
            <Dna className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-slate-900 tracking-tight">
                Autonomous Drug Repurposing
              </span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                GRIET Project
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">
              Multi-Omics • Graph Neural Networks • Closed-Loop Biological Docking
            </p>
          </div>
        </div>

        {/* Live Pipeline Status Badge */}
        {isPipelineRunning && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium animate-pulse">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            <span>Virtual Research Team Executing...</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('home')}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'home' 
                ? 'bg-slate-100 text-slate-900 font-semibold' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Activity className="w-4 h-4 text-slate-500" />
            <span>Pipeline Discovery</span>
          </button>

          <button
            onClick={() => setActiveTab('about')}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'about' 
                ? 'bg-slate-100 text-slate-900 font-semibold' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Info className="w-4 h-4 text-slate-500" />
            <span>Project & Team</span>
          </button>

          <button
            onClick={onNewSearchClick}
            className="ml-2 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs sm:text-sm shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Search className="w-3.5 h-3.5" />
            <span>New Search</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
