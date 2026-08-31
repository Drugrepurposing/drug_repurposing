import React, { useState } from 'react';
import { Send, Bot, ChevronDown } from 'lucide-react';
import api from '../api';

export default function ResearchChatbot({ activeCandidate, activeDisease }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([
    {
      sender: 'bot',
      text: `Hello! I am your AI Drug Repurposing Research Assistant. Ask me follow-up questions about candidate binding mechanisms, safety profiles, or clinical trial evidence.`
    }
  ]);
  const [loading, setLoading] = useState(false);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    const userMsg = query.trim();
    setQuery('');
    setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const res = await api.post('/api/chat', {
        query: userMsg,
        context_drug_name: activeCandidate?.name,
        context_disease_name: activeDisease?.name
      });

      setMessages(prev => [...prev, { sender: 'bot', text: res.data.answer }]);
    } catch (err) {
      console.error("Chatbot error:", err);
      setMessages(prev => [...prev, { sender: 'bot', text: "Apologies, I encountered an issue fetching research context. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-40">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="px-4 py-2.5 rounded-full bg-brand hover:bg-brand-hover text-white font-medium text-xs sm:text-sm shadow-md flex items-center gap-2 transition-all cursor-pointer hover:scale-105 active:scale-95"
        >
          <Bot className="w-4 h-4 text-white" />
          <span>Ask AI Assistant</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        </button>
      ) : (
        <div className="bg-surface w-80 sm:w-96 rounded-xl border border-slate-300 shadow-xl overflow-hidden flex flex-col h-[450px]">
          {/* Header */}
          <div className="p-3 bg-ink text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-xs sm:text-sm">Research Q&A Assistant</h4>
                <p className="text-[10px] text-ink-soft">Context: {activeCandidate?.name || 'Top Candidate'}</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded text-ink-soft hover:text-white hover:bg-ink-2 cursor-pointer"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 p-3 overflow-y-auto space-y-3 text-xs">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex gap-2 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.sender === 'bot' && (
                  <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5 border border-indigo-200">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}
                <div
                  className={`p-2.5 rounded-lg max-w-[82%] leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-brand text-white rounded-br-none font-medium'
                      : 'bg-slate-100 border border-slate-200 text-slate-800 rounded-bl-none font-sans'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-indigo-700 text-xs font-mono">
                <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <span>Synthesizing Literature...</span>
              </div>
            )}
          </div>

          {/* Quick Scientific Action Chips */}
          <div className="px-2 pt-2 bg-slate-50 flex gap-1 overflow-x-auto text-[10px] no-scrollbar">
            <button
              type="button"
              onClick={() => {
                setQuery("What is the binding thermodynamics and docking affinity?");
              }}
              className="px-2 py-0.5 rounded bg-indigo-100/70 hover:bg-indigo-200 text-indigo-800 shrink-0 cursor-pointer font-medium"
            >
              Thermodynamics ΔG
            </button>
            <button
              type="button"
              onClick={() => {
                setQuery("What is the LINCS L1000 transcriptomic reversal score?");
              }}
              className="px-2 py-0.5 rounded bg-blue-100/70 hover:bg-blue-200 text-blue-800 shrink-0 cursor-pointer font-medium"
            >
              LINCS Reversal %
            </button>
            <button
              type="button"
              onClick={() => {
                setQuery("What is the ADMET safety likelihood profile?");
              }}
              className="px-2 py-0.5 rounded bg-purple-100/70 hover:bg-purple-200 text-purple-800 shrink-0 cursor-pointer font-medium"
            >
              ADMET Safety
            </button>
            <button
              type="button"
              onClick={() => {
                setQuery("What paper citations and benchmark accuracy support this?");
              }}
              className="px-2 py-0.5 rounded bg-emerald-100/70 hover:bg-emerald-200 text-emerald-800 shrink-0 cursor-pointer font-medium"
            >
              Paper Benchmark
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSend} className="p-2 bg-slate-50 border-t border-slate-200 flex items-center gap-1.5">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask follow-up question..."
              className="w-full bg-surface text-slate-900 placeholder-slate-400 text-xs rounded-lg px-3 py-1.5 border border-slate-300 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="p-2 rounded-lg bg-brand hover:bg-brand-hover text-white transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

