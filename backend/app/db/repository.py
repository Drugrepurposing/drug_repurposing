"""
Persistence helpers.

Every function here is safe to call when no database is configured — it simply
does nothing and returns a neutral value. That keeps the guard in one place
instead of scattering `if is_database_enabled()` through the API layer.
"""

import logging
from typing import List, Optional

from sqlalchemy import delete, func, select, text

from app.core.embeddings import MODEL_VERSION
from app.db.models import Feedback, SearchHistory, User
from app.db.session import session_scope, strict_session

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Accounts
#
# These use `strict_session`, not `session_scope`: an authentication failure
# must reach the caller. They also return plain dictionaries rather than ORM
# objects, because a SQLAlchemy instance is detached once its session closes
# and touching its attributes afterwards raises. Copying the few fields we
# need out while the session is open avoids that whole class of bug.
# ---------------------------------------------------------------------------

def _user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def create_user(*, email: str, password_hash: str, full_name: str) -> dict:
    """
    Insert a new account. Raises IntegrityError if the email is taken - the
    unique constraint on the column is what actually guarantees uniqueness,
    because a "check then insert" in Python loses the race between two
    simultaneous registrations.
    """
    with strict_session() as session:
        user = User(
            email=email.strip().lower(),
            password_hash=password_hash,
            full_name=full_name.strip(),
        )
        session.add(user)
        # flush sends the INSERT now, so the database-generated id and
        # timestamps are populated before we read them.
        session.flush()
        return _user_to_dict(user)


def get_user_by_email(email: str) -> Optional[dict]:
    """Login lookup. Includes the password hash, so it is never returned to a client."""
    with strict_session() as session:
        user = session.scalar(select(User).where(User.email == email.strip().lower()))
        if user is None:
            return None
        record = _user_to_dict(user)
        record["password_hash"] = user.password_hash
        return record


def get_user_by_id(user_id: int) -> Optional[dict]:
    """Used to turn the id inside a JWT back into an account."""
    with strict_session() as session:
        user = session.get(User, user_id)
        return _user_to_dict(user) if user is not None else None


def record_search(
    *,
    disease_query: str,
    disease_name: Optional[str] = None,
    disease_category: Optional[str] = None,
    result_count: int = 0,
    duration_ms: Optional[float] = None,
    user_id: Optional[int] = None,
) -> None:
    """Log one pipeline run. Anonymous runs are recorded with user_id NULL."""
    with session_scope() as session:
        if session is None:
            return
        session.add(
            SearchHistory(
                user_id=user_id,
                disease_query=disease_query[:200],
                disease_name=(disease_name or None) and disease_name[:200],
                disease_category=(disease_category or None) and disease_category[:120],
                result_count=result_count,
                duration_ms=duration_ms,
            )
        )


def record_feedback(
    *,
    drug_id: str,
    rating: str,
    drug_name: Optional[str] = None,
    disease_name: Optional[str] = None,
    user_id: Optional[int] = None,
) -> bool:
    """
    Store an expert thumbs up/down. A logged-in user changing their mind
    updates their existing vote rather than adding a second row.

    Returns True when the vote was persisted.
    """
    with session_scope() as session:
        if session is None:
            return False

        existing = None
        if user_id is not None:
            existing = session.scalar(
                select(Feedback).where(
                    Feedback.user_id == user_id,
                    Feedback.drug_id == drug_id,
                )
            )

        if existing is not None:
            existing.rating = rating
            existing.drug_name = drug_name
            existing.disease_name = disease_name
        else:
            session.add(
                Feedback(
                    user_id=user_id,
                    drug_id=drug_id[:64],
                    drug_name=(drug_name or None) and drug_name[:200],
                    disease_name=(disease_name or None) and disease_name[:200],
                    rating=rating,
                )
            )
        return True


def list_search_history(user_id: int, limit: int = 20, offset: int = 0) -> dict:
    """
    A page of a user's past searches, newest first.

    The ORDER BY and WHERE here are exactly what the composite index
    ix_search_history_user_created was built for: (user_id, created_at DESC).
    Postgres can walk that index in order and stop after `limit` rows instead
    of sorting the whole table.

    Returns the total alongside the page so the interface can say "showing 20
    of 137" rather than only knowing whether another page exists.
    """
    with strict_session() as session:
        total = session.scalar(
            select(func.count())
            .select_from(SearchHistory)
            .where(SearchHistory.user_id == user_id)
        ) or 0

        rows = session.scalars(
            select(SearchHistory)
            .where(SearchHistory.user_id == user_id)
            .order_by(SearchHistory.created_at.desc(), SearchHistory.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()

        return {
            "total": total,
            "items": [
                {
                    "id": row.id,
                    "disease_query": row.disease_query,
                    "disease_name": row.disease_name,
                    "disease_category": row.disease_category,
                    "result_count": row.result_count,
                    "duration_ms": row.duration_ms,
                    "created_at": row.created_at.isoformat() if row.created_at else None,
                }
                for row in rows
            ],
        }


def delete_search_entry(user_id: int, entry_id: int) -> bool:
    """
    Remove one history entry.

    The user_id is part of the WHERE clause, not checked separately afterwards.
    That is the difference between a filter and an authorisation check: there is
    no window in which the row is loaded and could be returned or deleted before
    ownership is confirmed, and no way to delete someone else's row by guessing
    its id. Returns False when nothing matched, which the endpoint turns into a
    404 - deliberately the same response for "does not exist" and "not yours",
    so ids cannot be probed.
    """
    with strict_session() as session:
        result = session.execute(
            delete(SearchHistory).where(
                SearchHistory.id == entry_id,
                SearchHistory.user_id == user_id,
            )
        )
        return result.rowcount > 0


# ---------------------------------------------------------------------------
# Dashboard aggregates
#
# Written as SQL rather than assembled in Python on purpose. Counting,
# grouping and taking a median are what a database is for; pulling every row
# across the network to loop over it in the application would be slower and
# would get worse as the table grows.
# ---------------------------------------------------------------------------

_ACTIVITY_SQL = text("""
    SELECT day::date AS day, COUNT(s.id) AS runs
    FROM generate_series(
        CURRENT_DATE - MAKE_INTERVAL(days => :days - 1),
        CURRENT_DATE,
        INTERVAL '1 day'
    ) AS day
    LEFT JOIN search_history s
        ON s.user_id = :user_id
       AND s.created_at >= day
       AND s.created_at <  day + INTERVAL '1 day'
    GROUP BY day
    ORDER BY day
""")

_TOP_DISEASES_SQL = text("""
    SELECT disease_name, COUNT(*) AS runs
    FROM search_history
    WHERE user_id = :user_id AND disease_name IS NOT NULL
    GROUP BY disease_name
    ORDER BY runs DESC, disease_name ASC
    LIMIT :limit
""")

_TOTALS_SQL = text("""
    SELECT
        COUNT(*)                                                    AS total_runs,
        COUNT(DISTINCT disease_name)                                AS distinct_diseases,
        COALESCE(SUM(result_count), 0)                              AS total_candidates,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms)    AS median_ms
    FROM search_history
    WHERE user_id = :user_id
""")

_FEEDBACK_SQL = text("""
    SELECT rating, COUNT(*) AS votes
    FROM feedback
    WHERE user_id = :user_id
    GROUP BY rating
""")


def history_stats(user_id: int, days: int = 14) -> dict:
    """
    Everything the research dashboard needs, in four queries.

    Two details worth knowing:

    - The activity series is built from generate_series LEFT JOINed to the
      table, so days with no searches come back as zero instead of being
      missing. A chart drawn from rows that simply are not there silently
      closes the gaps and misrepresents the data.
    - The median uses PERCENTILE_CONT rather than AVG. One search that ran
      while an external API was timing out would drag a mean upwards and
      misrepresent typical performance; a median ignores it.
    """
    with strict_session() as session:
        totals = session.execute(_TOTALS_SQL, {"user_id": user_id}).mappings().one()

        activity = [
            {"day": row["day"].isoformat(), "runs": int(row["runs"])}
            for row in session.execute(
                _ACTIVITY_SQL, {"user_id": user_id, "days": days}
            ).mappings()
        ]

        top_diseases = [
            {"disease_name": row["disease_name"], "runs": int(row["runs"])}
            for row in session.execute(
                _TOP_DISEASES_SQL, {"user_id": user_id, "limit": 5}
            ).mappings()
        ]

        votes = {
            row["rating"]: int(row["votes"])
            for row in session.execute(_FEEDBACK_SQL, {"user_id": user_id}).mappings()
        }

        median_ms = totals["median_ms"]

        return {
            "total_runs": int(totals["total_runs"] or 0),
            "distinct_diseases": int(totals["distinct_diseases"] or 0),
            "total_candidates": int(totals["total_candidates"] or 0),
            "median_ms": round(float(median_ms), 1) if median_ms is not None else None,
            "activity": activity,
            "top_diseases": top_diseases,
            "feedback": {
                "supported": votes.get("up", 0),
                "rejected": votes.get("down", 0),
            },
        }


# ---------------------------------------------------------------------------
# Vector similarity
#
# The only place in the project where a vector is actually stored and searched
# rather than computed and thrown away.
# ---------------------------------------------------------------------------

# Two statements rather than one with a subquery, deliberately.
#
# pgvector's HNSW index is used when the ORDER BY compares the indexed column
# against a CONSTANT. Written as `ORDER BY embedding <=> (SELECT embedding ...)`
# the planner can fall back to a sequential scan and sort every row - which
# still returns correct answers, so the mistake is invisible until the table is
# large. Fetching the query vector first and passing it as a parameter keeps
# the index in play.
_FETCH_VECTOR_SQL = text("""
    SELECT embedding, drug_name, target_gene, disease_key
    FROM drug_embeddings
    WHERE drug_id = :drug_id
""")

# `<=>` is cosine DISTANCE (0 = identical). Vectors are stored unit-length, so
# similarity is simply 1 - distance and lands on a readable 0-1 scale.
_NEIGHBOURS_SQL = text("""
    SELECT
        drug_id,
        drug_name,
        target_gene,
        disease_key,
        1 - (embedding <=> CAST(:query_vector AS vector)) AS similarity
    FROM drug_embeddings
    WHERE drug_id <> :drug_id
      AND model_version = :model_version
    ORDER BY embedding <=> CAST(:query_vector AS vector)
    LIMIT :limit
""")


def _as_vector_literal(value) -> str:
    """
    pgvector's wire format: "[0.1,0.2,...]".

    Raw SQL returns a vector column as whatever the driver makes of it - a
    string on a plain psycopg2 connection, a list once pgvector's adapter is
    registered. Both shapes appear depending on how the process was started, so
    normalise here rather than assuming. Getting this wrong is quiet and ugly:
    a string fed to list() is split into single characters, and the resulting
    "vector" is 5,000 one-character entries.
    """
    if isinstance(value, str):
        return value
    return "[" + ",".join(repr(float(component)) for component in value) + "]"


def embeddings_ready() -> dict:
    """Whether similarity search can answer at all, and for how many compounds."""
    try:
        with strict_session() as session:
            count = session.execute(
                text("SELECT COUNT(*) FROM drug_embeddings WHERE model_version = :v"),
                {"v": MODEL_VERSION},
            ).scalar() or 0
            return {"available": count > 0, "indexed_compounds": int(count),
                    "model_version": MODEL_VERSION}
    except Exception:
        # The table may not exist (pgvector unavailable at migration time), or
        # the database may be down. Neither should break /api/health.
        return {"available": False, "indexed_compounds": 0, "model_version": MODEL_VERSION}


def find_similar_drugs(drug_id: str, limit: int = 5) -> Optional[dict]:
    """
    Nearest neighbours of one compound in embedding space.

    Returns None when the compound has no stored vector, which the endpoint
    turns into a 404 - distinguishable from "similarity search is switched off
    entirely", which is a different answer and a different fix.

    Each neighbour carries the reasons it is close, taken from the columns
    denormalised into this table. A bare similarity score is a number the
    reader has to take on trust; "0.94, same target gene" is an explanation.
    """
    with strict_session() as session:
        anchor = session.execute(_FETCH_VECTOR_SQL, {"drug_id": drug_id}).mappings().first()
        if anchor is None:
            return None

        rows = session.execute(
            _NEIGHBOURS_SQL,
            {
                "drug_id": drug_id,
                "query_vector": _as_vector_literal(anchor["embedding"]),
                "model_version": MODEL_VERSION,
                "limit": max(1, min(limit, 25)),
            },
        ).mappings().all()

        neighbours = []
        for row in rows:
            reasons = []
            if anchor["target_gene"] and row["target_gene"] == anchor["target_gene"]:
                reasons.append(f"Shares target {row['target_gene']}")
            if anchor["disease_key"] and row["disease_key"] == anchor["disease_key"]:
                reasons.append("Same indication area")
            if not reasons:
                reasons.append("Similar structure and omics profile")

            neighbours.append({
                "drug_id": row["drug_id"],
                "drug_name": row["drug_name"],
                "target_gene": row["target_gene"],
                "disease_key": row["disease_key"],
                "similarity": round(float(row["similarity"]), 4),
                "reasons": reasons,
            })

        return {
            "drug_id": drug_id,
            "drug_name": anchor["drug_name"],
            "target_gene": anchor["target_gene"],
            "model_version": MODEL_VERSION,
            "neighbours": neighbours,
        }
