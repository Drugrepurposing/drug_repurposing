"""
Authentication endpoints.

  POST /api/auth/register   create an account, return a token
  POST /api/auth/login      exchange email + password for a token
  GET  /api/auth/me         who the bearer token belongs to

Notes on the security-relevant choices:

- The password never leaves this module in readable form and is never logged.
  It is hashed on arrival and the plaintext is discarded.
- Login returns the same "Incorrect email or password" for an unknown email and
  a wrong password. Distinguishing them would let anyone enumerate which email
  addresses have accounts.
- Registration returns 409 on a duplicate email, driven by the database's
  unique constraint rather than a prior SELECT, so two simultaneous signups
  cannot both succeed.
- Uniform 503 when no database is configured, so the frontend can say
  "accounts are unavailable" instead of showing a generic failure.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.exc import IntegrityError

from app.api.deps import get_current_user
from app.core.security import (
    TOKEN_TTL_MINUTES,
    create_access_token,
    hash_password,
    verify_password,
)
from app.db import repository
from app.db.session import DatabaseUnavailable

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["authentication"])

ACCOUNTS_UNAVAILABLE = (
    "Accounts are unavailable because the server has no database configured. "
    "Search and analysis still work without signing in."
)


class RegisterRequest(BaseModel):
    # EmailStr is validated by Pydantic, so a malformed address is rejected
    # with a 422 before any of this code runs.
    email: EmailStr
    # 8 characters is the floor recommended by NIST SP 800-63B. There is no
    # complexity rule: forcing symbols pushes people towards "Password1!",
    # which is weaker than a long ordinary phrase.
    password: str = Field(min_length=8, max_length=200)
    full_name: str = Field(min_length=2, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    user: UserResponse


def _token_response(user: dict) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user_id=user["id"], email=user["email"]),
        expires_in_minutes=TOKEN_TTL_MINUTES,
        user=UserResponse(id=user["id"], email=user["email"], full_name=user["full_name"]),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest):
    """Create an account and sign the new user straight in."""
    try:
        user = repository.create_user(
            email=req.email,
            password_hash=hash_password(req.password),
            full_name=req.full_name,
        )
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email address already exists.",
        )
    except DatabaseUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=ACCOUNTS_UNAVAILABLE,
        )
    except Exception:
        logger.exception("Registration failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not create the account. Please try again.",
        )

    return _token_response(user)


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest):
    """Verify credentials and issue a token."""
    try:
        user = repository.get_user_by_email(req.email)
    except DatabaseUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=ACCOUNTS_UNAVAILABLE,
        )
    except Exception:
        logger.exception("Login lookup failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not reach the account database. Please try again.",
        )

    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if user is None:
        # Hash a throwaway value anyway so a request for an unknown email takes
        # roughly as long as one for a known email. Without this, response time
        # alone reveals which addresses are registered.
        verify_password(req.password, "$2b$12$" + "." * 53)
        raise invalid

    if not verify_password(req.password, user["password_hash"]):
        raise invalid

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    return _token_response(user)


@router.get("/me", response_model=UserResponse)
def read_current_user(user: dict = Depends(get_current_user)):
    """
    Used by the frontend on page load: a token in localStorage is only trusted
    once the server confirms it still resolves to a live account.
    """
    return UserResponse(id=user["id"], email=user["email"], full_name=user["full_name"])
