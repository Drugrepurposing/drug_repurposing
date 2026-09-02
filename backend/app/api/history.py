"""
Search history and dashboard endpoints.

  GET    /api/history            a page of the caller's past pipeline runs
  DELETE /api/history/{id}       remove one entry
  GET    /api/history/stats      aggregates for the research dashboard

Every route here requires authentication. That is the one place in this
application where a login is genuinely necessary: "my searches" has no meaning
without a "my". Note that the caller never supplies a user id - it comes from
the verified token, so there is no parameter to tamper with in order to read
somebody else's history.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.api.deps import get_current_user
from app.db import repository
from app.db.session import DatabaseUnavailable

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/history", tags=["history"])

UNAVAILABLE = "History is unavailable because the server has no database configured."


def _guard(operation):
    """Turn a database problem into a 503 rather than a 500 traceback."""
    try:
        return operation()
    except DatabaseUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=UNAVAILABLE
        )
    except Exception:
        logger.exception("History query failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not read your history. Please try again.",
        )


@router.get("")
def read_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    """
    Past runs, newest first.

    limit is capped at 100 by the Query constraint. Without a ceiling, one
    request for limit=1000000 could pull the whole table into memory - the
    validation is the protection, not a suggestion.
    """
    return _guard(lambda: repository.list_search_history(user["id"], limit=limit, offset=offset))


@router.get("/stats")
def read_history_stats(
    days: int = Query(14, ge=7, le=90),
    user: dict = Depends(get_current_user),
):
    """Aggregates for the dashboard: totals, daily activity, top diseases, votes."""
    return _guard(lambda: repository.history_stats(user["id"], days=days))


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_history_entry(entry_id: int, user: dict = Depends(get_current_user)):
    """
    Delete one entry.

    Returns 404 both when the entry does not exist and when it belongs to
    somebody else. Distinguishing the two would confirm which ids are real,
    which is the same enumeration problem the login endpoint avoids.
    """
    deleted = _guard(lambda: repository.delete_search_entry(user["id"], entry_id))
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
