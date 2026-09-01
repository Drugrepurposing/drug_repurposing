"""
Persistence helpers.

Every function here is safe to call when no database is configured — it simply
does nothing and returns a neutral value. That keeps the guard in one place
instead of scattering `if is_database_enabled()` through the API layer.
"""

import logging
from typing import List, Optional

from sqlalchemy import select

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
