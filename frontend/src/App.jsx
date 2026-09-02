import React, { useEffect, useState } from 'react';
import api from './api';
// Photographic / video background. To go back to the generated molecular
// field instead, import AmbientBackdrop.jsx here and swap the tag below.
import MediaBackdrop from './components/MediaBackdrop.jsx';
import ScrollReveal from './components/ScrollReveal.jsx';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import HowItWorks from './components/HowItWorks';
import AgentProgressFeed from './components/AgentProgressFeed';
import CandidateTable from './components/CandidateTable';
import MoleculeViewer3D from './components/MoleculeViewer3D';
import ExplainabilityModal from './components/ExplainabilityModal';
import DrugCompareModal from './components/DrugCompareModal';
import ResearchChatbot from './components/ResearchChatbot';
import TeamSection from './components/TeamSection';
import AuthModal from './components/AuthModal.jsx';
import ResearchDashboard from './components/ResearchDashboard.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import ResultsSkeleton from './components/ResultsSkeleton.jsx';
import { useAuth } from './context/auth-context.js';
import { useToast } from './context/toast-context.js';
import { AlertCircle, Lightbulb } from 'lucide-react';

export default function App() {
  const { isAuthenticated } = useAuth();
  const { notify } = useToast();
  const [activeTab, setActiveTab] = useState('home');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [pipelineResult, setPipelineResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [querySuggestions, setQuerySuggestions] = useState([]);

  // Active Modals state
  const [selected3DCandidate, setSelected3DCandidate] = useState(null);
  const [selectedExplainCandidate, setSelectedExplainCandidate] = useState(null);
  const [selectedCompareCandidate, setSelectedCompareCandidate] = useState(null);

  // Signing out while on "My Research" would otherwise leave the page showing a
  // tab that no longer exists in the navbar. Deriving the visible tab during
  // render, rather than correcting it afterwards in an effect, means there is
  // never a frame where the two disagree.
  const visibleTab = activeTab === 'research' && !isAuthenticated ? 'home' : activeTab;

  // Ctrl/Cmd + K from anywhere. Registered once on the document rather than on
  // a focusable element, because the whole point is that it works without the
  // user having first clicked something. preventDefault stops Firefox
  // hijacking the combination for its own search bar.
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSearch = async (diseaseQuery) => {
    // Reached from the search box and from the "run again" button in the
    // research dashboard, so make sure the results are actually on screen.
    setActiveTab('home');
    setIsSearching(true);
    setErrorMessage(null);
    setQuerySuggestions([]);
    setPipelineResult(null);

    try {
      const res = await api.post('/api/search', {
        disease_query: diseaseQuery
      });

      if (res.data.valid === false) {
        setErrorMessage(res.data.error_message);
        setQuerySuggestions(res.data.suggestions || []);
        setPipelineResult(null);
      } else {
        setPipelineResult(res.data);
        setTimeout(() => {
          document.getElementById('pipeline-results')?.scrollIntoView({ behavior: 'smooth' });
        }, 300);
      }
    } catch (err) {
      console.error("Search pipeline error:", err);
      // A cold start on the free tier is indistinguishable from a crash unless
      // the message says so.
      setErrorMessage(
        err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT'
          ? "The analysis server took too long to respond. It may be waking from sleep — please try again."
          : "Failed to run discovery pipeline. Please ensure the backend server is running."
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleExportPDF = async (diseaseName, diseaseCategory, candidates) => {
    try {
      const response = await api.post('/api/export-pdf', {
        disease_name: diseaseName,
        disease_category: diseaseCategory,
        candidates: candidates
      }, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Repurposing_Report_${diseaseName.replace(/\s+/g, '_')}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      notify('Report downloaded', { detail: `Repurposing_Report_${diseaseName}.pdf` });
    } catch (err) {
      console.error("PDF generation failed:", err);
      notify('Could not generate the PDF report', {
        variant: 'error',
        detail: 'The analysis server may still be waking up.',
      });
    }
  };

  const handleFeedback = async (drugId, rating, drugName) => {
    try {
      const res = await api.post('/api/feedback', {
        drug_id: drugId,
        rating: rating,
        drug_name: drugName,
        disease_name: pipelineResult?.disease?.name,
      });
      // Reporting whether it was PERSISTED, not merely accepted. The endpoint
      // returns `stored`, and telling someone their expert judgement was
      // recorded when it went nowhere would be worse than saying nothing.
      notify(
        rating === 'up' ? 'Marked as supported' : 'Marked as rejected',
        res.data?.stored
          ? { variant: 'success', detail: `${drugName || drugId} · saved to your validation record` }
          : { variant: 'info', detail: 'Recorded for this session only — no database configured' },
      );
    } catch (err) {
      console.error("Feedback submission error:", err);
      notify('Could not record your assessment', {
        variant: 'error',
        detail: 'Please try again in a moment.',
      });
    }
  };

  return (
    <>
    <MediaBackdrop />
    <div className="app-shell min-h-screen text-slate-900 flex flex-col font-sans antialiased selection:bg-brand selection:text-white">
      {/* Top Navbar */}
      <Navbar 
        activeTab={visibleTab} 
        setActiveTab={setActiveTab} 
        onNewSearchClick={() => {
          setActiveTab('home');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onSignInClick={() => setAuthModalOpen(true)}
        isPipelineRunning={isSearching}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {visibleTab === 'home' && (
          <>
            {/* Hero Section */}
            <HeroSection
              onSearch={handleSearch}
              isSearching={isSearching}
              onOpenPalette={() => setPaletteOpen(true)}
            />

            {/* Error & Suggestion Banner */}
            {errorMessage && (
              <div className="max-w-4xl mx-auto px-4 mb-6">
                <div className="p-4 rounded-xl bg-rose-50/90 border border-rose-200 text-rose-900 shadow-sm flex flex-col gap-3">
                  <div className="flex items-center gap-2.5">
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                    <span className="font-semibold text-sm">{errorMessage}</span>
                  </div>

                  {querySuggestions.length > 0 && (
                    <div className="pl-7 pt-1 border-t border-rose-200/60 flex flex-col sm:flex-row items-start sm:items-center gap-2 text-xs">
                      <span className="font-semibold text-rose-800 flex items-center gap-1">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
                        Did you mean:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {querySuggestions.map((sug, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSearch(sug)}
                            className="px-3 py-1 rounded-full bg-surface hover:bg-rose-100 text-rose-900 font-medium text-xs border border-rose-300 shadow-2xs transition-all cursor-pointer hover:scale-105"
                          >
                            {sug}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* While the pipeline runs, a shaped placeholder holds the page
                height steady so results appear in place rather than shoving
                the layout down as the user starts reading. */}
            {isSearching && !pipelineResult && <ResultsSkeleton />}

            {/* Results Section */}
            {pipelineResult && (
              <div id="pipeline-results" className="pt-6">
                <AgentProgressFeed 
                  logs={pipelineResult.pipeline_logs} 
                  isRunning={isSearching} 
                />

                <CandidateTable
                  candidates={pipelineResult.candidates}
                  diseaseInfo={pipelineResult.disease}
                  onSelect3D={(cand) => setSelected3DCandidate(cand)}
                  onSelectExplain={(cand) => setSelectedExplainCandidate(cand)}
                  onSelectCompare={(cand) => setSelectedCompareCandidate(cand)}
                  onExportPDF={handleExportPDF}
                  onFeedback={handleFeedback}
                />
              </div>
            )}

            {/* How It Works Section */}
            <ScrollReveal>
              <HowItWorks />
            </ScrollReveal>
          </>
        )}

        {visibleTab === 'research' && (
          <ResearchDashboard onRerunSearch={handleSearch} />
        )}

        {visibleTab === 'about' && (
          <ScrollReveal>
            <TeamSection />
          </ScrollReveal>
        )}
      </main>

      {/* Modals */}
      {authModalOpen && <AuthModal onClose={() => setAuthModalOpen(false)} />}

      {paletteOpen && <CommandPalette
        onClose={() => setPaletteOpen(false)}
        onSearch={handleSearch}
        onNavigate={setActiveTab}
        onSignInClick={() => setAuthModalOpen(true)}
      />}

      {selected3DCandidate && (
        <MoleculeViewer3D 
          candidate={selected3DCandidate} 
          onClose={() => setSelected3DCandidate(null)} 
        />
      )}

      {selectedExplainCandidate && (
        <ExplainabilityModal
          candidate={selectedExplainCandidate}
          diseaseName={pipelineResult?.disease?.name || 'Target Indication'}
          onClose={() => setSelectedExplainCandidate(null)}
        />
      )}

      {selectedCompareCandidate && (
        <DrugCompareModal
          candidate1={selectedCompareCandidate}
          allCandidates={pipelineResult?.candidates || []}
          onClose={() => setSelectedCompareCandidate(null)}
        />
      )}

      {/* Floating AI Chatbot */}
      <ResearchChatbot
        activeCandidate={pipelineResult?.candidates?.[0]}
        activeDisease={pipelineResult?.disease}
      />

      {/* Footer */}
      <footer className="surface-veil py-6 border-t border-slate-200 text-slate-500 text-xs text-center">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-800">Autonomous Drug Repurposing Discovery Pipeline</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Department of Information Technology, GRIET Hyderabad</p>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
            <span>DrugBank 5.0</span>
            <span>•</span>
            <span>DisGeNET</span>
            <span>•</span>
            <span>LINCS L1000</span>
            <span>•</span>
            <span>AutoDock Vina</span>
          </div>
        </div>
      </footer>
    </div>
    </>
  );
}
