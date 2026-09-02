import json
import logging
import queue
import threading
import time

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from app.api.deps import get_optional_user
from app.data.dataset import DISEASES, CANDIDATE_DRUGS, MODEL_METRICS, METHOD_COMPARISON
from app.data.large_drug_bank import LARGE_DRUG_BANK
from app.data.one_lakh_drug_bank import ONE_LAKH_DRUG_BANK
from app.core.agents import MultiAgentOrchestrator
from app.core.pdf_generator import ReportGenerator
from app.core.live_api import LiveBiomedicalAPI
from app.core import assistant
from app.db import repository
from app.db.session import check_connection, is_database_enabled

logger = logging.getLogger(__name__)

router = APIRouter()
orchestrator = MultiAgentOrchestrator()
report_gen = ReportGenerator()
live_api = LiveBiomedicalAPI()

# Cache active search results in memory for instant PDB & modal lookups
ACTIVE_SEARCH_RESULTS_CACHE: Dict[str, Any] = {}

# Standard fallback PDB coordinates for 3Dmol.js WebGL viewer
FALLBACK_PDB_STRUCTURE = """HEADER    BIOPHYSICAL DOCKED POSE                 30-AUG-26   7RFS
TITLE     AUTODOCK VINA HIGH-AFFINITY LIGAND BINDING POCKET
ATOM      1  N   ASP A  64      12.110  14.220  28.100  1.00 20.00           N
ATOM      2  CA  ASP A  64      13.250  15.110  28.340  1.00 20.00           C
ATOM      3  C   ASP A  64      14.400  14.320  28.910  1.00 20.00           C
ATOM      4  O   ASP A  64      14.280  13.120  29.150  1.00 20.00           O
ATOM      5  CB  ASP A  64      13.710  15.920  27.100  1.00 20.00           C
ATOM      6  CG  ASP A  64      12.650  16.850  26.540  1.00 20.00           C
ATOM      7  OD1 ASP A  64      11.510  16.420  26.250  1.00 20.00           O
ATOM      8  OD2 ASP A  64      13.000  18.040  26.400  1.00 20.00           O
ATOM      9  N   GLU A 152      15.520  14.980  29.120  1.00 20.00           N
ATOM     10  CA  GLU A 152      16.710  14.350  29.670  1.00 20.00           C
ATOM     11  C   GLU A 152      17.850  15.340  29.890  1.00 20.00           C
ATOM     12  O   GLU A 152      18.890  15.020  30.450  1.00 20.00           O
HETATM   13  C   LIG A   1      15.120  16.890  32.140  1.00 15.00           C
HETATM   14  N   LIG A   1      16.050  17.810  32.550  1.00 15.00           N
HETATM   15  O   LIG A   1      14.100  17.200  31.500  1.00 15.00           O
HETATM   16  F   LIG A   1      17.200  17.400  33.100  1.00 15.00           F
CONECT   13   14   15
END
"""

class SearchRequest(BaseModel):
    disease_query: str

class PDFExportRequest(BaseModel):
    disease_name: str
    disease_category: str
    candidates: List[Dict[str, Any]]

class FeedbackRequest(BaseModel):
    drug_id: str
    rating: str  # 'up' or 'down'
    drug_name: Optional[str] = None
    disease_name: Optional[str] = None

class CompareRequest(BaseModel):
    drug_id_1: str
    drug_id_2: str

class ChatTurn(BaseModel):
    sender: str
    text: str


class ChatRequest(BaseModel):
    query: str
    context_drug_name: Optional[str] = None
    context_disease_name: Optional[str] = None
    # The conversation so far, so follow-ups like "and its safety?" resolve.
    history: List[ChatTurn] = []
    # The candidates currently on screen. Sent by the client rather than read
    # from the server cache so the assistant answers about the search the user
    # is actually looking at, including after a browser refresh.
    candidates: List[Dict[str, Any]] = []


@router.get("/health")
def health_check():
    """
    Reports what is actually true rather than a fixed string. The database
    section runs SELECT 1 and times it, so an unreachable database shows up
    here instead of only surfacing when a user tries to log in.
    """
    database = check_connection()
    healthy = (not database["configured"]) or database["reachable"]
    # Whether the assistant will use the model or its fallback, reported
    # without spending a request to find out - so a key missing from the
    # hosting environment shows up before a demo rather than during one.
    assistant_status = assistant.status()

    return {
        "status": "online" if healthy else "degraded",
        "pipeline_version": "1.0.0",
        "engine": "Autonomous GNN + Docking + Multi-Agent Pipeline",
        "institution": "GRIET Hyderabad",
        "database": database,
        "persistence": "enabled" if is_database_enabled() else "disabled",
        "vector_search": repository.embeddings_ready(),
        "assistant": assistant_status,
    }

@router.get("/diseases")
def get_diseases():
    return {"diseases": list(DISEASES.values())}

@router.get("/metrics")
def get_metrics():
    return {
        "model_performance": MODEL_METRICS,
        "method_comparison": METHOD_COMPARISON
    }

def _finalise_search(result: Dict[str, Any], disease_query: str,
                     duration_ms: float, user: Optional[dict]) -> None:
    """
    Side effects shared by the streaming and non-streaming search endpoints:
    cache the candidates for later 3D lookups, and record the run.

    Factored out rather than duplicated so the two endpoints cannot drift -
    a streaming search that quietly failed to appear in history would be a
    confusing bug to track down.
    """
    if result.get("valid") is not False and "candidates" in result:
        for candidate in result["candidates"]:
            ACTIVE_SEARCH_RESULTS_CACHE[candidate["id"]] = candidate

    disease = result.get("disease") or {}
    repository.record_search(
        disease_query=disease_query.strip(),
        disease_name=disease.get("name"),
        disease_category=disease.get("category"),
        result_count=len(result.get("candidates") or []),
        duration_ms=duration_ms,
        user_id=user["id"] if user else None,
    )


@router.post("/search/stream")
def run_search_pipeline_streaming(
    req: SearchRequest,
    user: Optional[dict] = Depends(get_optional_user),
):
    """
    The same pipeline, reported stage by stage while it runs.

    Why this exists: a search takes seconds, and returning everything at the
    end leaves the user watching nothing. Streaming turns the wait into
    visible work - and the events are real, fired at actual stage boundaries
    with measured elapsed times, not a timed animation played over a request.

    Shape: Server-Sent Events. The pipeline is synchronous, so it runs on a
    worker thread and pushes events onto a queue that this generator drains.
    Doing it the other way round - yielding from inside the pipeline - would
    mean rewriting it as a generator and would couple its structure to the
    transport.

    Two details that matter in deployment rather than on a laptop:

    - A comment frame is emitted every second while the pipeline is busy.
      Proxies commonly buffer or drop a response that produces nothing for a
      while, which would make streaming appear to work locally and silently
      fail in production.
    - X-Accel-Buffering: no asks nginx-style proxies not to buffer at all.

    The client falls back to POST /api/search if any of this misbehaves, so
    streaming is an enhancement rather than a dependency.
    """
    if not req.disease_query or not req.disease_query.strip():
        raise HTTPException(status_code=400, detail="Disease query cannot be empty")

    disease_query = req.disease_query.strip()

    def event_stream():
        events: "queue.Queue" = queue.Queue()
        outcome: Dict[str, Any] = {}
        started = time.perf_counter()

        def worker():
            try:
                outcome["result"] = orchestrator.run_pipeline(disease_query, progress=events.put)
            except Exception as exc:                      # pragma: no cover - defensive
                logger.exception("Streaming pipeline failed")
                outcome["error"] = str(exc)
            finally:
                events.put(None)

        # Daemon, so a wedged pipeline can never hold the process open.
        threading.Thread(target=worker, name="search-pipeline", daemon=True).start()

        while True:
            try:
                event = events.get(timeout=1.0)
            except queue.Empty:
                yield ": keep-alive\n\n"
                continue
            if event is None:
                break
            yield f"data: {json.dumps(event)}\n\n"

        duration_ms = round((time.perf_counter() - started) * 1000, 2)

        if "error" in outcome:
            yield f"data: {json.dumps({'type': 'error', 'message': 'The pipeline failed. Please try again.'})}\n\n"
            return

        result = outcome.get("result") or {}
        try:
            _finalise_search(result, disease_query, duration_ms, user)
        except Exception:                                  # pragma: no cover
            logger.exception("Could not record the streamed search")

        result["duration_ms"] = duration_ms
        yield f"data: {json.dumps({'type': 'result', 'result': result})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/search")
def run_search_pipeline(req: SearchRequest, user: Optional[dict] = Depends(get_optional_user)):
    if not req.disease_query or not req.disease_query.strip():
        raise HTTPException(status_code=400, detail="Disease query cannot be empty")

    started = time.perf_counter()
    result = orchestrator.run_pipeline(req.disease_query)
    duration_ms = round((time.perf_counter() - started) * 1000, 2)

    _finalise_search(result, req.disease_query, duration_ms, user)
    return result

@router.get("/drugs/{drug_id}")
def get_drug_by_id(drug_id: str):
    # Search active search cache, candidate drugs, large drug bank, and 1 lakh drug bank
    drug = (
        ACTIVE_SEARCH_RESULTS_CACHE.get(drug_id) or
        next((d for d in CANDIDATE_DRUGS if d["id"] == drug_id), None) or
        next((d for d in LARGE_DRUG_BANK if d["id"] == drug_id), None)
    )
    if not drug:
        raise HTTPException(status_code=404, detail="Drug not found")
    return drug

@router.get("/drugs/{drug_id}/similar")
def get_similar_drugs(drug_id: str, limit: int = Query(5, ge=1, le=25)):
    """
    Compounds nearest to this one in embedding space.

    Answers a question the rest of the pipeline cannot: not "which drugs score
    well for this disease" but "which drugs resemble THIS one". That comparison
    is a vector distance, resolved by an approximate-nearest-neighbour index in
    PostgreSQL rather than by comparing every pair in Python.

    Three distinct outcomes, deliberately not collapsed into one error:
      503  similarity search is unavailable (no database, or not yet seeded)
      404  this compound has no stored vector
      200  neighbours, each with the reason it is close
    """
    status_info = repository.embeddings_ready()
    if not status_info["available"]:
        raise HTTPException(
            status_code=503,
            detail=(
                "Similarity search is unavailable. Run "
                "'python -m app.scripts.build_embeddings' to populate the vector index."
            ),
        )

    try:
        result = repository.find_similar_drugs(drug_id, limit=limit)
    except Exception:
        logger.exception("Similarity lookup failed for %s", drug_id)
        raise HTTPException(status_code=503, detail="Similarity search is temporarily unavailable.")

    if result is None:
        raise HTTPException(status_code=404, detail="No embedding stored for that compound")

    result["indexed_compounds"] = status_info["indexed_compounds"]
    return result


@router.get("/drugs/{drug_id}/pdb")
def get_drug_pdb_structure(drug_id: str):
    """
    Returns 3D PDB protein + ligand docked coordinates for WebGL rendering in 3Dmol.js.
    """
    drug = (
        ACTIVE_SEARCH_RESULTS_CACHE.get(drug_id) or
        next((d for d in CANDIDATE_DRUGS if d["id"] == drug_id), None) or
        next((d for d in LARGE_DRUG_BANK if d["id"] == drug_id), None)
    )

    pdb_id = drug.get("pdb_id", "7RFS") if drug else "7RFS"

    # Attempt to fetch live RCSB PDB structure
    pdb_content = live_api.fetch_live_rcsb_pdb(pdb_id)
    if not pdb_content:
        pdb_content = FALLBACK_PDB_STRUCTURE

    return Response(content=pdb_content, media_type="text/plain")

@router.post("/export-pdf")
def export_pdf_report(req: PDFExportRequest):
    try:
        pdf_bytes = report_gen.generate_repurposing_report(
            disease_name=req.disease_name,
            disease_category=req.disease_category,
            candidates=req.candidates
        )
        filename = f"Repurposing_Report_{req.disease_name.replace(' ', '_')}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF Generation failed: {str(e)}")

@router.post("/feedback")
def submit_expert_feedback(
    req: FeedbackRequest,
    user: Optional[dict] = Depends(get_optional_user),
):
    """
    Stores the expert thumbs up/down. Until this change the endpoint returned
    success and discarded the data, which made the "active learning loop"
    described in the README untrue.

    A signed-in reviewer changing their mind updates their existing vote; an
    anonymous vote is simply added, since there is no identity to update.
    """
    if req.rating not in ("up", "down"):
        raise HTTPException(status_code=400, detail="rating must be 'up' or 'down'")

    stored = repository.record_feedback(
        drug_id=req.drug_id,
        rating=req.rating,
        drug_name=req.drug_name,
        disease_name=req.disease_name,
        user_id=user["id"] if user else None,
    )

    return {
        "status": "success",
        "stored": stored,
        "message": (
            f"Feedback '{req.rating}' recorded for candidate {req.drug_id}."
            if stored
            else f"Feedback '{req.rating}' received for {req.drug_id} "
                 "(not persisted: no database configured)."
        ),
    }

@router.post("/compare")
def compare_candidate_drugs(req: CompareRequest):
    drug1 = (
        ACTIVE_SEARCH_RESULTS_CACHE.get(req.drug_id_1) or
        next((d for d in CANDIDATE_DRUGS if d["id"] == req.drug_id_1), None) or
        next((d for d in LARGE_DRUG_BANK if d["id"] == req.drug_id_1), None)
    )
    drug2 = (
        ACTIVE_SEARCH_RESULTS_CACHE.get(req.drug_id_2) or
        next((d for d in CANDIDATE_DRUGS if d["id"] == req.drug_id_2), None) or
        next((d for d in LARGE_DRUG_BANK if d["id"] == req.drug_id_2), None)
    )

    if not drug1 or not drug2:
        raise HTTPException(status_code=404, detail="One or both candidates not found for comparison")

    d1_g = float(drug1.get("docking_delta_g", -10.0))
    d2_g = float(drug2.get("docking_delta_g", -10.0))

    higher_affinity = drug1.get("name", "Drug 1") if d1_g <= d2_g else drug2.get("name", "Drug 2")
    delta_g_diff = round(abs(d1_g - d2_g), 2)

    return {
        "drug_1": drug1,
        "drug_2": drug2,
        "higher_affinity_drug": higher_affinity,
        "delta_g_difference": delta_g_diff
    }


@router.post("/chat")
def research_chat_assistant(req: ChatRequest):
    """
    The research assistant.

    Answers with Gemini when GEMINI_API_KEY is set, and from the result data
    itself otherwise - see app/core/assistant.py. The response says which,
    because presenting a rule-based answer as a language model's would be a
    straightforward lie and the interface shows the difference.

    Candidates come from the request rather than from ACTIVE_SEARCH_RESULTS_CACHE
    so the assistant is grounded in what this user is looking at, not in
    whatever search the server handled most recently.
    """
    candidates = req.candidates
    if not candidates:
        # Nothing sent: fall back to the server's most recent run, which is
        # better than nothing for a fresh tab.
        candidates = list(ACTIVE_SEARCH_RESULTS_CACHE.values())[:8]

    result = assistant.answer(
        query=req.query,
        history=[turn.model_dump() for turn in req.history],
        disease_name=req.context_disease_name,
        candidates=candidates,
        context_drug_name=req.context_drug_name,
    )

    return {
        "query": req.query,
        "answer": result["answer"],
        "source": result["source"],
        "disclaimer": "Research tool. Not medical advice.",
    }

