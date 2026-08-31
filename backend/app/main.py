"""
FastAPI Server Entry Point for Autonomous Drug Repurposing Discovery Pipeline.
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.endpoints import router as api_router

app = FastAPI(
    title="Autonomous Drug Repurposing Discovery Pipeline API",
    description="AI-driven framework integrating Graph Neural Networks, Multi-Omics Fusion, NLP Text Mining, and Molecular Docking Validation",
    version="1.0.0"
)

# Allowed frontend origins.
# Locally nothing is set, so this stays "*" and behaves as before.
# In production set ALLOWED_ORIGINS to the Vercel URL, e.g.
#   ALLOWED_ORIGINS=https://drug-repurposing.vercel.app
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "*").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

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
