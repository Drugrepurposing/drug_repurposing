# Autonomous Drug Repurposing Discovery Pipeline

An end-to-end, AI-driven computational framework and interactive web application designed to systematically identify and biologically validate novel drug-disease associations with minimal human intervention.

Developed by:
- **R. Manoj Kumar** (Roll No: 23241A12J2)
- **M. Faizuddin Uzair** (Roll No: 23241A12G4)
- **U. Abhishek** (Roll No: 23241A12J8)

**Project Guide**: Mr. K. Sandeep, Assistant Professor  
**Department**: Department of Information Technology  
**Institution**: Gokaraju Rangaraju Institute of Engineering and Technology (GRIET), Hyderabad

---

## Key Features & System Architecture

1. **Multi-Modal Data Integration**:
   - **Genomic & Transcriptomic Profiles**: LINCS L1000 perturbational gene expression signatures.
   - **Protein-Protein Interaction Networks**: DrugBank & DisGeNET heterogeneous relational graphs.
   - **Chemical Fingerprints**: SMILES chemical structure Morgan fingerprints.
   - **Biomedical Literature**: SciBERT/BioBERT NLP text mining over PubMed abstracts & clinical trials.

2. **AI & Biophysical Pipeline**:
   - **GNN-Based DTI Model**: Heterogeneous message passing graph neural network scoring drug-target interaction probabilities.
   - **Disease-Gene Classifier**: DisGeNET disease-gene relevance predictor.
   - **Closed-Loop Biological Validation**: AutoDock Vina biophysical docking simulation (\(\Delta G\) binding energy in kcal/mol and estimated \(K_i\)) + Reactome/KEGG pathway enrichment check.
   - **Multi-Agent Orchestrator**: CrewAI-style virtual research team consisting of Agent 1 (Data & GNN Miner), Agent 2 (Docking & Pathway Validator), and Agent 3 (NLP & Safety Ranker).

3. **Web Application Features**:
   - **Interactive Disease Search**: Live query execution with instant suggestion chips (Alzheimer's, Parkinson's, ALS, COVID-19, Type 2 Diabetes, TNBC, Glioblastoma, Huntington's).
   - **Real-Time Agent Progress Feed**: Step-by-step visual execution logs of active research agents.
   - **Hardware-Accelerated 3D Molecular Viewer**: WebGL protein-ligand 3D binding pocket viewer via `3Dmol.js`.
   - **Explainability View ("Why Was This Picked?")**: Plain-English AI reasoning narrative with multi-modal radar score breakdowns.
   - **Side-by-Side Drug Comparison**: Direct comparison tool analyzing thermodynamic binding affinity and safety profiles.
   - **PDF Report Generator**: On-demand publication-grade PDF report download powered by Python `ReportLab`.
   - **Interactive Research Assistant Chatbot**: Follow-up AI research assistant answering domain questions.

---

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS v4, Lucide Icons, 3Dmol.js (WebGL 3D Viewer).
- **Backend**: Python 3.13, FastAPI, Uvicorn, Pydantic v2, NumPy, ReportLab.
- **Data Engine**: DrugBank 5.0, DisGeNET v7.0, LINCS L1000 Connectivity Map, AutoDock Vina, PubMed SciBERT.

---

## Quick Start & Installation

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)

### 1. Backend Setup & Launch
```bash
cd backend

# Install Python dependencies
pip3 install -r requirements.txt

# Launch FastAPI server (Runs on http://localhost:8000)
python3 -m app.main
```

### 2. Frontend Setup & Launch
```bash
cd frontend

# Install Node dependencies
npm install

# Start Vite development server (Runs on http://localhost:5173)
npm run dev
```

---

## API Documentation

- `GET /api/health` — System status and pipeline version.
- `GET /api/diseases` — List available benchmark diseases and target gene mappings.
- `GET /api/metrics` — Model performance metrics table (Table I from paper).
- `POST /api/search` — Runs full multi-agent pipeline for a disease query.
- `GET /api/drugs/{id}` — Fetch detailed metadata for a candidate drug.
- `GET /api/drugs/{id}/pdb` — Returns PDB 3D structure for WebGL rendering.
- `POST /api/compare` — Compares two candidate drugs side-by-side.
- `POST /api/chat` — Research Q&A chatbot response.
- `POST /api/export-pdf` — Generates and downloads PDF research report.
- `POST /api/feedback` — Submits user feedback for active learning loop.

---

## License & Citation
Developed for academic major project submission at GRIET Hyderabad.
