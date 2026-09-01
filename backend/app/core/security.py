"""
Password hashing and JSON Web Token issuing.

Two decisions here are worth being able to defend in a viva.

1. PASSWORDS ARE NEVER STORED, ONLY VERIFIED.
   bcrypt is a deliberately slow, salted hash. Every password gets its own
   random salt, embedded in the resulting string, so two users with the same
   password produce different hashes and a stolen database cannot be attacked
   with a precomputed rainbow table. The work factor (rounds) can be raised
   later as hardware gets faster, and existing hashes keep working because the
   cost is recorded inside the hash itself.

2. PASSWORDS ARE SHA-256 PRE-HASHED BEFORE BCRYPT.
   bcrypt only reads the first 72 bytes of its input and modern versions raise
   an error rather than silently truncating. Feeding it a fixed-length digest
   instead of the raw password removes the limit entirely, so a 200-character
   passphrase is fully honoured rather than quietly cut short. This is the
   standard mitigation, used by Dropbox among others.

Tokens are stateless HS256 JWTs: the server signs a payload containing the user
id and an expiry, and can later verify it without a database lookup. That keeps
the auth check cheap - relevant here because the database is a free-tier
instance we would rather not hit on every request.
"""

import base64
import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"

# How long a login lasts. A week is a reasonable trade-off for an application
# people demo and revisit; shorten it with the environment variable if needed.
TOKEN_TTL_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", str(60 * 24 * 7)))

# The signing key. In production this MUST come from the environment - it is
# the only thing standing between a visitor and forging a token for any user.
# Locally, if it is missing we generate an ephemeral one so the project still
# runs with zero configuration; the cost is that restarting the server logs
# everybody out, which is fine for development and loudly warned about.
_SECRET = os.getenv("JWT_SECRET", "").strip()
if not _SECRET:
    _SECRET = secrets.token_urlsafe(48)
    logger.warning(
        "JWT_SECRET is not set - generated a temporary key. "
        "Sessions will be invalidated on every restart. "
        "Set JWT_SECRET in the environment for deployment."
    )


def _prepare(password: str) -> bytes:
    """
    Reduce a password of any length to a fixed 44-byte value bcrypt can accept
    in full. base64 is applied because the raw SHA-256 digest can contain a NUL
    byte, and bcrypt stops reading at the first one.
    """
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest)


def hash_password(password: str) -> str:
    """Return a salted bcrypt hash, safe to store."""
    return bcrypt.hashpw(_prepare(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """
    Constant-time comparison of a candidate password against a stored hash.

    Returns False rather than raising on a malformed hash, so a corrupt row
    fails one login instead of returning a 500 for it.
    """
    try:
        return bcrypt.checkpw(_prepare(password), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        logger.warning("Stored password hash could not be parsed")
        return False


def create_access_token(user_id: int, email: str) -> str:
    """
    Sign a token for this user.

      sub  the subject - who the token is about (a string, per the JWT spec)
      exp  expiry, which PyJWT enforces automatically on decode
      iat  issued-at, useful when debugging clock problems
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "email": email,
        "iat": now,
        "exp": now + timedelta(minutes=TOKEN_TTL_MINUTES),
    }
    return jwt.encode(payload, _SECRET, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[int]:
    """
    Verify a token's signature and expiry and return the user id inside it.

    Returns None for anything invalid - expired, tampered with, signed by a
    different key, or simply not a JWT. The caller decides whether that means
    "anonymous visitor" or "401", which is why this does not raise.
    """
    try:
        payload = jwt.decode(token, _SECRET, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

    subject = payload.get("sub")
    if subject is None:
        return None
    try:
        return int(subject)
    except (TypeError, ValueError):
        return None
