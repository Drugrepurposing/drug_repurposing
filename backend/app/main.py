"""
FastAPI Server Entry Point for Autonomous Drug Repurposing Discovery Pipeline.
"""

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Configure logging BEFORE importing anything that logs while being imported.
#
# uvicorn only installs handlers on its own loggers, so warnings raised by the
# application - "DATABASE_URL not set", "Database unreachable: ..." - were
# emitted unformatted and were easy to miss entirely. Turning them into proper
# lines with a timestamp and the module that raised them is the difference
# between diagnosing a bad connection string in seconds and guessing at it.
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s  %(levelname)-8s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

from app.api.auth import router as auth_router  # noqa: E402
from app.api.endpoints import router as api_router  # noqa: E402
from app.api.history import router as history_router  # noqa: E402

app = FastAPI(
    title="Autonomous Drug Repurposing Discovery Pipeline API",
    description="AI-driven framework integrating Graph Neural Networks, Multi-Omics Fusion, NLP Text Mining, and Molecular Docking Validation",
    version="1.0.0"
)

# Allowed frontend origins.
# Locally nothing is set, so this stays "*" and behaves as before.
# In production set ALLOWED_ORIGINS to the Vercel URL, e.g.
#   ALLOWED_ORIGINS=https://drug-repurposing.vercel.app
#
# The `or "*"` is load-bearing, not belt-and-braces. os.getenv returns the
# default only when the key is ABSENT; a key present but empty returns "",
# which parsed to an empty list and produced a CORS policy that allowed no
# origins at all - the frontend blocked from its own backend, reported in the
# browser as an unexplained network error. An empty setting means "not
# configured", so it falls back here as well as in the .env loader.
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in (os.getenv("ALLOWED_ORIGINS", "").strip() or "*").split(",")
    if origin.strip()
]

logger = logging.getLogger(__name__)
logger.info(
    "CORS allowing %s",
    "all origins" if ALLOWED_ORIGINS == ["*"] else ", ".join(ALLOWED_ORIGINS),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(history_router, prefix="/api")

@app.get("/")
def root():
    return {
        "message": "Welcome to Autonomous Drug Repurposing Discovery Pipeline API",
        "docs": "/docs",
        "institution": "GRIET Hyderabad"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
