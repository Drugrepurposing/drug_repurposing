import React, { useEffect, useRef, useState } from 'react';
import { X, Box, Layers } from 'lucide-react';
import api from '../api';

export default function MoleculeViewer3D({ candidate, onClose }) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('cartoon_stick');
  const [pdbContent, setPdbContent] = useState('');

  useEffect(() => {
    if (!candidate) return;

    let isMounted = true;
    api.get(`/api/drugs/${candidate.id}/pdb`)
      .then(res => {
        if (isMounted) {
          setPdbContent(res.data);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error("Failed to load PDB:", err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [candidate]);


  useEffect(() => {
    if (!containerRef.current || !pdbContent || typeof window.$3Dmol === 'undefined') return;

    containerRef.current.innerHTML = '';
    const element = containerRef.current;
    const config = { backgroundColor: '#0f172a' };
    const viewer = window.$3Dmol.createViewer(element, config);

    viewer.addModel(pdbContent, "pdb");

    if (viewMode === 'cartoon_stick') {
      viewer.setStyle({ hetflag: false }, { cartoon: { color: 'spectrum' } });
      viewer.setStyle({ hetflag: true }, { stick: { colorscheme: 'cyanCarbon', radius: 0.3 } });
    } else if (viewMode === 'surface') {
      viewer.setStyle({ hetflag: false }, { cartoon: { color: 'slate' } });
      viewer.setStyle({ hetflag: true }, { sphere: { colorscheme: 'element', scale: 0.8 } });
      viewer.addSurface(window.$3Dmol.SurfaceType.VDW, { opacity: 0.55, color: 'cyan' });
    } else if (viewMode === 'ball_stick') {
      viewer.setStyle({ hetflag: false }, { line: { color: 'gray' } });
      viewer.setStyle({ hetflag: true }, { stick: { radius: 0.2 }, sphere: { scale: 0.3 } });
    }

    viewer.zoomTo();
    viewer.render();
  }, [pdbContent, viewMode]);

  if (!candidate) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-4xl rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Box className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <span>3D Docked Pose: {candidate.name}</span>
                <span className="text-xs font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  {candidate.target_gene} ({candidate.pdb_id})
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                AutoDock Vina Binding Energy ΔG = <strong className="text-emerald-700">{candidate.docking_delta_g} kcal/mol</strong> | Est. Ki: {candidate.estimated_ki_nm} nM
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

        {/* View Mode Toolbar */}
        <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-2 text-xs font-medium">
          <div className="flex items-center gap-1.5 text-slate-600">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span>Visualization Mode:</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setViewMode('cartoon_stick')}
              className={`px-3 py-1 rounded-md border text-xs transition-colors cursor-pointer ${
                viewMode === 'cartoon_stick'
                  ? 'bg-white text-indigo-900 font-semibold border-indigo-300 shadow-2xs'
                  : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900'
              }`}
            >
              Cartoon + Ligand Stick
            </button>
            <button
              onClick={() => setViewMode('surface')}
              className={`px-3 py-1 rounded-md border text-xs transition-colors cursor-pointer ${
                viewMode === 'surface'
                  ? 'bg-white text-indigo-900 font-semibold border-indigo-300 shadow-2xs'
                  : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900'
              }`}
            >
              Binding Pocket Surface
            </button>
            <button
              onClick={() => setViewMode('ball_stick')}
              className={`px-3 py-1 rounded-md border text-xs transition-colors cursor-pointer ${
                viewMode === 'ball_stick'
                  ? 'bg-white text-indigo-900 font-semibold border-indigo-300 shadow-2xs'
                  : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900'
              }`}
            >
              Ball & Stick
            </button>
          </div>
        </div>

        {/* 3D WebGL Canvas */}
        <div className="relative flex-1 min-h-[400px] bg-slate-900">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/90 z-10">
              <div className="w-7 h-7 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-mono text-slate-300">Loading 3D PDB Coordinates...</span>
            </div>
          )}
          <div ref={containerRef} className="w-full h-full min-h-[420px]" />
        </div>

        {/* Footer Metadata */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-4 text-slate-600">
            <div>Key Residues: <strong className="text-slate-900">{candidate.docked_pose_coords?.key_residues?.join(', ')}</strong></div>
            <div>H-Bonds: <strong className="text-indigo-700">{candidate.docked_pose_coords?.h_bonds} Networked</strong></div>
          </div>
          <div className="text-slate-400 font-mono text-[11px]">
            Hardware Accelerated WebGL Renderer (3Dmol.js)
          </div>
        </div>
      </div>
    </div>
  );
}
