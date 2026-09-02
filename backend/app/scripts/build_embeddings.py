"""
Compute and store a vector for every compound in the drug bank.

Run it from the backend directory:

    python -m app.scripts.build_embeddings

It reads DATABASE_URL the same way the server does (including backend/.env), so
pointing it at the deployed database seeds production from a laptop. That is
deliberate: the free hosting tier has no way to run a one-off job, and this
needs to run once per embedding-model change, not on every deploy.

Re-running is safe. Rows are upserted by drug_id, so the table converges on one
row per compound however many times this is run.
"""

import argparse
import logging
import sys
import time
from typing import Dict, List

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert

from app.core.embeddings import MODEL_VERSION, build_drug_embedding
from app.data.large_drug_bank import LARGE_DRUG_BANK
from app.data.dataset import CANDIDATE_DRUGS
from app.db.models import DrugEmbedding
from app.db.session import DatabaseUnavailable, strict_session

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("build_embeddings")

BATCH_SIZE = 200


def collect_drugs() -> List[Dict]:
    """
    Every compound the API can return, de-duplicated by id.

    CANDIDATE_DRUGS and LARGE_DRUG_BANK overlap. Without the de-duplication the
    upsert would touch the same primary key twice inside one statement, which
    Postgres rejects outright ("cannot affect row a second time") - a failure
    that only appears once the data happens to contain a duplicate.
    """
    seen: Dict[str, Dict] = {}
    for drug in list(LARGE_DRUG_BANK) + list(CANDIDATE_DRUGS):
        drug_id = drug.get("id")
        if drug_id:
            seen[drug_id] = drug
    return list(seen.values())


def main() -> int:
    parser = argparse.ArgumentParser(description="Build drug embeddings")
    parser.add_argument(
        "--prune",
        action="store_true",
        help="Delete rows left over from an older embedding model version.",
    )
    args = parser.parse_args()

    drugs = collect_drugs()
    logger.info("Embedding %d compounds with model %s...", len(drugs), MODEL_VERSION)

    started = time.perf_counter()
    rows = [
        {
            "drug_id": drug["id"][:64],
            "drug_name": (drug.get("name") or drug["id"])[:200],
            "target_gene": (drug.get("target_gene") or None) and drug["target_gene"][:120],
            "disease_key": (drug.get("disease_key") or None) and drug["disease_key"][:120],
            "embedding": build_drug_embedding(drug),
            "model_version": MODEL_VERSION,
        }
        for drug in drugs
    ]
    logger.info("  vectors computed in %.2fs", time.perf_counter() - started)

    try:
        with strict_session() as session:
            written = 0
            for start in range(0, len(rows), BATCH_SIZE):
                batch = rows[start:start + BATCH_SIZE]
                statement = insert(DrugEmbedding).values(batch)
                # ON CONFLICT DO UPDATE: re-running replaces a compound's vector
                # rather than failing on the primary key or inserting a second row.
                statement = statement.on_conflict_do_update(
                    index_elements=[DrugEmbedding.drug_id],
                    set_={
                        "drug_name": statement.excluded.drug_name,
                        "target_gene": statement.excluded.target_gene,
                        "disease_key": statement.excluded.disease_key,
                        "embedding": statement.excluded.embedding,
                        "model_version": statement.excluded.model_version,
                    },
                )
                session.execute(statement)
                written += len(batch)
                logger.info("  stored %d/%d", written, len(rows))

            if args.prune:
                deleted = session.execute(
                    text("DELETE FROM drug_embeddings WHERE model_version <> :v"),
                    {"v": MODEL_VERSION},
                ).rowcount
                if deleted:
                    logger.info("  pruned %d row(s) from older model versions", deleted)

            total = session.execute(text("SELECT COUNT(*) FROM drug_embeddings")).scalar()

    except DatabaseUnavailable:
        logger.error(
            "No database configured. Set DATABASE_URL, or create backend/.env "
            "from .env.example."
        )
        return 1
    except Exception as exc:
        logger.error("Failed: %s", exc)
        logger.error(
            "If this mentions the 'vector' type, run 'alembic upgrade head' first."
        )
        return 1

    logger.info(
        "Done in %.2fs - drug_embeddings now holds %d rows.",
        time.perf_counter() - started,
        total,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
