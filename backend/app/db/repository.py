"""
Persistence helpers.

Every function here is safe to call when no database is configured — it simply
does nothing and returns a neutral value. That keeps the guard in one place
instead of scattering `if is_database_enabled()` through the API layer.
"""

import logging
from typing import List, Optional

from sqlalchemy import select

from app.db.models import Feedback, SearchHistory
from app.db.session import session_scope

logger = logging.getLogger(__name__)


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


def list_search_history(user_id: int, limit: int = 50) -> List[dict]:
    """A user's past searches, newest first. Served by the composite index."""
    with session_scope() as session:
        if session is None:
            return []
        rows = session.scalars(
            select(SearchHistory)
            .where(SearchHistory.user_id == user_id)
            .order_by(SearchHistory.created_at.desc())
            .limit(limit)
        ).all()
        return [
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
        ]
