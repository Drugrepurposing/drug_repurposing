import React, { useEffect, useRef, useState } from 'react';
import { Send, Bot, ChevronDown, Sparkles, Database } from 'lucide-react';
import api from '../api';

/**
 * The research assistant panel.
 *
 * It used to look conversational and not be. You could type anything, but the
 * backend keyword-matched five branches, so almost every question landed on the
 * same generic paragraph - which is worse than an obviously limited interface,
 * because it invites a question it cannot answer and then pretends it did.
 *
 * Now the whole conversation is sent with each question, so follow-ups work
 * ("and its safety?"), and the answer is grounded in the candidates currently
 * on screen rather than in whatever the server handled last.
 *
 * WHICH ANSWERER REPLIED IS SHOWN. When a language model is configured the
 * answers are open-ended; without one they come from the result data by rule.
 * Both are useful and only one is AI, so the panel says which - a badge on the
 * message rather than a claim in the header.
 */

/** How much history to send. Matched to the backend's own cap. */
const HISTORY_LIMIT = 8;

const OPENERS = [
  'Why is the top candidate ranked first?',
  'How strong is the docking for the best compound?',
  'What does expression reversal actually measure?',
];

/**
 * Minimal markdown: bold and inline code, nothing else.
 *
 * Written out rather than pulled in as a library, and returning React nodes
 * rather than HTML - the text comes from a language model, and there is no
 * version of this worth doing that involves dangerouslySetInnerHTML.
 */
function renderRich(text) {
  const nodes = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let cursor = 0;
  let match = pattern.exec(text);
  let key = 0;

  while (match) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={`b${key}`}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(
        <code key={`c${key}`} className="px-1 py-0.5 rounded bg-slate-200/70 font-mono text-[11px]">
          {token.slice(1, -1)}
        </code>,
      );
    }
    key += 1;
    cursor = match.index + token.length;
    match = pattern.exec(text);
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export default function ResearchChatbot({ activeCandidate, activeDisease, candidates }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([
    {
      sender: 'bot',
      text: 'Ask me anything about these results — how a compound scored, what it binds to, why the ranking came out the way it did, or how any part of the pipeline works.',
    },
  ]);
  const [loading, setLoading] = useState(false);
  const streamRef = useRef(null);
  const inputRef = useRef(null);

  // Follow the conversation as it grows, and only then - scrolling the panel
  // on every render would fight anyone reading back through it.
  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => { if (isOpen) inputRef.current?.focus(); }, [isOpen]);

  const send = async (text) => {
    const question = (text ?? query).trim();
    if (!question || loading) return;

    setQuery('');
    // Captured before the state update, so the history sent is the
    // conversation as it stood when the question was asked.
    const history = messages.slice(-HISTORY_LIMIT);
    setMessages((prev) => [...prev, { sender: 'user', text: question }]);
    setLoading(true);

    try {
      const res = await api.post('/api/chat', {
        query: question,
        history,
        // The candidates on screen, trimmed: the assistant needs the scores,
        // not the SMILES strings or the docked pose coordinates.
        candidates: (candidates || []).slice(0, 8),
        context_drug_name: activeCandidate?.name,
        context_disease_name: activeDisease?.name,
      });
      setMessages((prev) => [...prev, {
        sender: 'bot',
        text: res.data.answer,
        source: res.data.source,
      }]);
    } catch (err) {
      console.error('Chatbot error:', err);
      setMessages((prev) => [...prev, {
        sender: 'bot',
        text: 'I could not reach the analysis server. It may be waking from sleep — try again in a moment.',
        source: 'error',
      }]);
    } finally {
      setLoading(false);
    }
  };

  const conversationStarted = messages.length > 1;

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
        <div className="bg-surface w-80 sm:w-96 rounded-xl border border-slate-300 shadow-xl overflow-hidden flex flex-col h-[480px]">
          <div className="p-3 bg-ink text-white flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-xs sm:text-sm">Research assistant</h4>
                <p className="text-[10px] text-ink-soft truncate">
                  {activeDisease?.name
                    ? `Grounded in your ${activeDisease.name} results`
                    : 'Run a search to ground the answers'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Minimise the assistant"
              className="p-1 rounded text-ink-soft hover:text-white hover:bg-ink-2 cursor-pointer shrink-0"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          <div ref={streamRef} className="flex-1 p-3 overflow-y-auto space-y-3 text-xs">
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
                <div className="max-w-[82%]">
                  <div
                    className={`p-2.5 rounded-lg leading-relaxed whitespace-pre-wrap ${
                      m.sender === 'user'
                        ? 'bg-brand text-white rounded-br-none font-medium'
                        : 'bg-slate-100 border border-slate-200 text-slate-800 rounded-bl-none font-sans'
                    }`}
                  >
                    {m.sender === 'bot' ? renderRich(m.text) : m.text}
                  </div>

                  {/* Which answerer replied. Presenting a rule-based answer as
                      a model's would be the easiest lie here to tell. */}
                  {m.source === 'grounded' && (
                    <p className="mt-1 text-[9px] text-slate-400 flex items-center gap-1">
                      <Database className="w-2.5 h-2.5" />
                      Answered from your results — no language model configured
                    </p>
                  )}
                  {m.source === 'gemini' && (
                    <p className="mt-1 text-[9px] text-slate-400 flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5" />
                      Gemini, grounded in your results
                    </p>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-slate-500 text-xs">
                <div className="w-3 h-3 border-2 border-slate-300 border-t-brand rounded-full animate-spin" />
                <span>Thinking…</span>
              </div>
            )}

            {/* Openers, only until the conversation has started. Examples of
                what can be asked, not a menu of the only things it answers -
                which is what the old fixed chips implied. */}
            {!conversationStarted && !loading && (
              <div className="space-y-1.5 pt-1">
                {OPENERS.map((opener) => (
                  <button
                    key={opener}
                    type="button"
                    onClick={() => send(opener)}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer"
                  >
                    {opener}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={(event) => { event.preventDefault(); send(); }}
            className="p-2 bg-slate-50 border-t border-slate-200"
          >
            <div className="flex items-center gap-1.5">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask anything about these results…"
                aria-label="Ask the research assistant"
                className="w-full bg-surface text-slate-900 placeholder-slate-400 text-xs rounded-lg px-3 py-1.5 border border-slate-300 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                aria-label="Send question"
                className="p-2 rounded-lg bg-brand hover:bg-brand-hover text-white transition-colors disabled:opacity-50 cursor-pointer shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Said every time the panel is open, not buried in a tooltip.
                This is a student pipeline's predictions, and the panel is the
                one part of the interface that sounds like it knows things. */}
            <p className="text-[9px] text-slate-400 mt-1.5 text-center">
              Research tool. Not medical advice.
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
