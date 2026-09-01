"""
Shared FastAPI dependencies.

Two flavours of "who is calling", because this application has two kinds of
endpoint:

  get_current_user   for endpoints that make no sense without an account
                     (your search history). No token means 401.

  get_optional_user  for endpoints that must keep working for anonymous
                     visitors (search, feedback). A token is used if present
                     and valid, and ignored otherwise.

The second one is the important design choice. Gating the discovery pipeline
behind a login would make the site worse and the demo harder: an examiner
should be able to type a disease and see results immediately. Logging in adds
attribution and history on top, it does not unlock the core feature.
"""

import logging
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_access_token
from app.db import repository
from app.db.session import DatabaseUnavailable, is_database_enabled

logger = logging.getLogger(__name__)

# auto_error=False so a missing Authorization header yields None instead of
# FastAPI raising a 403 before our own code gets to decide what that means.
bearer_scheme = HTTPBearer(auto_error=False)


def _user_from_credentials(
    credentials: Optional[HTTPAuthorizationCredentials],
) -> Optional[dict]:
    if credentials is None or not credentials.credentials:
        return None
    if not is_database_enabled():
        return None

    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        return None

    try:
        user = repository.get_user_by_id(user_id)
    except DatabaseUnavailable:
        return None
    except Exception:
        # A database hiccup must not turn a search into a 500. The request
        # simply proceeds as anonymous.
        logger.exception("Could not load the user behind a valid token")
        return None

    # A token stays cryptographically valid until it expires, so an account
    # deleted or deactivated in the meantime has to be rejected here.
    if user is None or not user.get("is_active", True):
        return None
    return user


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Optional[dict]:
    """Returns the signed-in user, or None. Never raises."""
    return _user_from_credentials(credentials)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    """Returns the signed-in user, or raises 401."""
    user = _user_from_credentials(credentials)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            # Tells a well-behaved client exactly what kind of credential is
            # expected, which is what the 401 status is specified to require.
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
