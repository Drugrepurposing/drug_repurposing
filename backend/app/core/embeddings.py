"""
Drug embeddings for vector similarity search.

WHAT THIS IS, PRECISELY
-----------------------
A deterministic **feature embedding**: each drug is projected into a fixed
128-dimensional vector built from its curated attributes - target gene,
enriched pathways, indication area, SMILES substructure n-grams, and the
multi-omics and docking descriptors already in the drug bank.

It is NOT the output of a trained graph neural network, and this file does not
pretend otherwise. That distinction matters, and stating it plainly is a
stronger position than the alternative: what has been built here is the
**retrieval layer** a learned model plugs into. The table, the index, the
distance metric and the query are identical whether the vectors come from
curated features or from a trained encoder - only `build_drug_embedding`
changes. Swapping in learned vectors is a one-function change, and
`MODEL_VERSION` is what records which produced the rows currently stored.

WHY A VECTOR SEARCH AT ALL
--------------------------
The rest of the pipeline can answer "which drugs score well for this disease".
It cannot answer "which drugs resemble THIS one" without comparing every drug
to every other. An approximate-nearest-neighbour index answers that in
sub-linear time, which is the difference between a feature that works on 840
rows and one that still works on 100,000.

HOW THE VECTOR IS BUILT
-----------------------
Three blocks, each L2-normalised on its own before being weighted and
concatenated, so that no single block dominates purely because it has more
dimensions or a larger natural scale:

  0-63    biological context - target gene, pathway terms, indication area
  64-95   structure - character 3-grams over the SMILES string
  96-127  quantitative descriptors - multi-omics, docking, safety, mass

The categorical blocks use the **hashing trick**: each token is hashed to a
bucket rather than looked up in a vocabulary table. That keeps the width fixed
as new targets and pathways appear, with no vocabulary to store, migrate or
keep in sync. Collisions are the accepted cost and are rare at this ratio of
tokens to buckets.

Hashing uses blake2b, not Python's built-in `hash()`. That is not a stylistic
choice: `hash()` on strings is randomly salted per process, so vectors written
by one run would not match vectors written by the next, and the stored index
would silently become meaningless.

The final vector is L2-normalised, which makes cosine distance and inner
product equivalent and puts every similarity on the same 0-1 scale.
"""

import hashlib
import math
import re
from typing import Dict, Iterable, List, Optional

# Bumping this marks stored vectors as stale. Any change to the blocks, the
# weights, or the dimension below MUST bump it - otherwise old and new vectors
# sit in the same table and are compared as if they meant the same thing.
MODEL_VERSION = "feature-v1"

BIO_DIMS = 64
STRUCT_DIMS = 32
NUMERIC_DIMS = 32
EMBEDDING_DIM = BIO_DIMS + STRUCT_DIMS + NUMERIC_DIMS  # 128

# Relative influence of each block on the final distance. Biology leads
# because two drugs hitting the same target through the same pathway are
# similar in the sense this application cares about; structure and scores
# refine that rather than driving it.
BIO_WEIGHT = 0.60
STRUCT_WEIGHT = 0.25
NUMERIC_WEIGHT = 0.15

_TOKEN_SPLIT = re.compile(r"[^a-z0-9]+")


def _bucket(token: str, dims: int, salt: str) -> int:
    """Stable hash of a token into [0, dims). blake2b, so it never varies by process."""
    digest = hashlib.blake2b(f"{salt}:{token}".encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "big") % dims


def _sign(token: str, salt: str) -> float:
    """
    Signed hashing: half the tokens contribute negatively.

    This is the standard companion to the hashing trick. Without it, two tokens
    colliding in the same bucket always reinforce each other and collisions
    only ever inflate similarity. With random signs, collisions cancel on
    average instead, so the error is unbiased.
    """
    digest = hashlib.blake2b(f"sign:{salt}:{token}".encode("utf-8"), digest_size=1).digest()
    return 1.0 if digest[0] & 1 else -1.0


def _normalise(vector: List[float]) -> List[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0.0:
        return vector
    return [value / norm for value in vector]


def _tokenise(text: Optional[str]) -> List[str]:
    if not text:
        return []
    return [token for token in _TOKEN_SPLIT.split(text.lower()) if len(token) > 1]


def _hash_block(tokens: Iterable[str], dims: int, salt: str) -> List[float]:
    block = [0.0] * dims
    for token in tokens:
        block[_bucket(token, dims, salt)] += _sign(token, salt)
    return _normalise(block)


def _biological_block(drug: Dict) -> List[float]:
    """
    Target, pathways and indication area.

    The target gene is repeated so it carries more weight than any single
    pathway term: sharing a target is a much stronger statement about two
    drugs than sharing one word of a pathway name.
    """
    tokens: List[str] = []

    target = (drug.get("target_gene") or "").strip().lower()
    if target:
        tokens.extend([f"target:{target}"] * 3)

    disease_key = (drug.get("disease_key") or "").strip().lower()
    if disease_key:
        tokens.extend([f"disease:{disease_key}"] * 2)

    for pathway in drug.get("pathway_enrichment") or []:
        tokens.append(f"pathway:{str(pathway).strip().lower()}")
        tokens.extend(f"pw:{part}" for part in _tokenise(str(pathway)))

    tokens.extend(f"ind:{part}" for part in _tokenise(drug.get("indication")))
    tokens.extend(f"prot:{part}" for part in _tokenise(drug.get("target_protein_name")))

    return _hash_block(tokens, BIO_DIMS, "bio")


def _structural_block(drug: Dict) -> List[float]:
    """
    A cheap substructure fingerprint: overlapping character 3-grams of the
    SMILES string, plus element counts from the molecular formula.

    This is a simplification of what a circular fingerprint (ECFP/Morgan) does
    properly with a chemistry toolkit. It captures that two molecules share
    fragments and functional-group vocabulary; it does not understand rings or
    stereochemistry. Adequate for "these look related", and honest about not
    being more than that.
    """
    smiles = (drug.get("smiles") or "").strip()
    tokens: List[str] = []

    for size in (3, 4):
        for index in range(max(len(smiles) - size + 1, 0)):
            tokens.append(f"smi{size}:{smiles[index:index + size]}")

    for element, count in re.findall(r"([A-Z][a-z]?)(\d*)", drug.get("formula") or ""):
        if element:
            tokens.extend([f"el:{element}"] * min(int(count or 1), 8))

    return _hash_block(tokens, STRUCT_DIMS, "struct")


def _scale(value: Optional[float], low: float, high: float) -> float:
    """Map a descriptor onto 0-1, clamped. Missing values sit at the midpoint."""
    if value is None:
        return 0.5
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.5
    if high == low:
        return 0.5
    return max(0.0, min(1.0, (numeric - low) / (high - low)))


def _numeric_block(drug: Dict) -> List[float]:
    """
    The quantitative evidence, each descriptor scaled onto a comparable range
    first. Raw values would let molecular weight (hundreds) and literature
    count (thousands) drown out scores that live between 0 and 1.

    Docking free energy is negated because it is negative-is-better; leaving it
    signed the other way would place strong binders far from each other.
    """
    features = [
        _scale(drug.get("gnn_dti_score"), 0.0, 1.0),
        _scale(drug.get("disgenet_gene_score"), 0.0, 1.0),
        _scale(drug.get("lincs_reversal_score"), 0.0, 1.0),
        _scale(drug.get("safety_score"), 0.0, 1.0),
        _scale(-(drug.get("docking_delta_g") or 0.0), 0.0, 14.0),
        _scale(drug.get("mw"), 100.0, 900.0),
        _scale(math.log10((drug.get("literature_count") or 0) + 1), 0.0, 4.0),
        1.0 if drug.get("validation_passed") else 0.0,
    ]

    block = [0.0] * NUMERIC_DIMS
    # Repeat the descriptor set across the block so it is not a handful of
    # active dimensions beside thirty empty ones, which would make the block's
    # norm depend on how many descriptors happened to be present.
    for index in range(NUMERIC_DIMS):
        block[index] = features[index % len(features)]

    # Centre on zero before normalising: without this every drug points into
    # the same positive orthant and cosine similarity is compressed into a
    # narrow band near 1, where differences stop being legible.
    mean = sum(block) / len(block)
    return _normalise([value - mean for value in block])


def build_drug_embedding(drug: Dict) -> List[float]:
    """
    Project one drug into the shared vector space.

    Deterministic: the same input always produces the same vector, in any
    process, on any machine. That is what makes a stored index trustworthy.
    """
    vector = (
        [value * BIO_WEIGHT for value in _biological_block(drug)]
        + [value * STRUCT_WEIGHT for value in _structural_block(drug)]
        + [value * NUMERIC_WEIGHT for value in _numeric_block(drug)]
    )
    return _normalise(vector)


def cosine_similarity(left: List[float], right: List[float]) -> float:
    """Both vectors are unit length, so the dot product IS the cosine."""
    return sum(a * b for a, b in zip(left, right))
