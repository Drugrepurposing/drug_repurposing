"""
Database engine and session management.

The application is designed to run with OR without a database. If DATABASE_URL
is not set, `is_database_enabled()` returns False and every persistence call
becomes a no-op: search, docking, the 3D viewer and the PDF export all keep
working, you simply cannot log in or see history.

That matters for three reasons: teammates can run the project without
credentials, local development works offline, and a database outage degrades
the deployed site rather than breaking it.
"""

import logging
import os
import re
import time
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.env import load_env_file

logger = logging.getLogger(__name__)

# Read backend/.env if it exists, so configuration survives opening a new
# terminal. Real environment variables always win, which is what keeps
# deployment correct: Render sets DATABASE_URL in the process environment and
# no .env file exists there to override it.
load_env_file()

Base = declarative_base()


class DatabaseUnavailable(RuntimeError):
    """
    Raised when an operation that genuinely requires a database is attempted
    without one.

    Search, docking and the PDF export degrade quietly - they lose their audit
    trail but still work. Authentication cannot degrade: silently "succeeding"
    at a login with nowhere to check the password would be far worse than a
    clear error, so those calls raise this instead.
    """


DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

# Neon and most managed providers hand out a "postgres://" URL, which
# SQLAlchemy 2.x no longer recognises. Normalise it.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = None
SessionLocal = None

# How long to wait for the database before giving up. Every one of these has
# to be set explicitly, because every one of them defaults to "forever" and a
# request that waits forever is indistinguishable from a crashed server.
CONNECT_TIMEOUT_SECONDS = int(os.getenv("DB_CONNECT_TIMEOUT", "10"))
STATEMENT_TIMEOUT_MS = int(os.getenv("DB_STATEMENT_TIMEOUT_MS", "15000"))

if DATABASE_URL:
    engine = create_engine(
        DATABASE_URL,
        # Serverless Postgres closes idle connections; without this, a request
        # arriving after a quiet period gets a dead connection from the pool.
        pool_pre_ping=True,
        pool_recycle=280,
        pool_size=5,
        max_overflow=2,
        # Waiting for a free connection also has to be bounded. Without this,
        # once every connection is held by a stalled query, every subsequent
        # request queues behind them indefinitely and the whole API stops
        # responding rather than failing.
        pool_timeout=15,
        # Every option here is a CLIENT-side libpq setting, handled locally
        # rather than sent to the server. That distinction matters: a pooled
        # connection string (the "-pooler" hostname) reaches PgBouncer, not
        # Postgres directly, and PgBouncer rejects unrecognised server startup
        # parameters outright - "unsupported startup parameter: options".
        # The query timeout therefore cannot be set here; see apply_statement_timeout.
        connect_args={
            # THE important one. psycopg2 defaults to no connect timeout, so a
            # database that accepts the TCP connection but never completes the
            # handshake - a serverless instance struggling to wake, a network
            # path that silently drops - hangs the request forever, and the
            # server looks frozen rather than broken.
            "connect_timeout": CONNECT_TIMEOUT_SECONDS,
            # Keep the TCP connection probed, so a silently dropped link is
            # detected rather than waited on.
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 3,
        },
        future=True,
    )
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    logger.info("Database configured")
else:
    logger.warning("DATABASE_URL not set - running without persistence")


def apply_statement_timeout(session) -> None:
    """
    Bound how long a single query may run, without using a startup parameter.

    `SET LOCAL` is scoped to the current transaction and is reset when it ends,
    which is exactly what makes it safe through a connection pooler: PgBouncer
    in transaction mode hands a different backend connection to the next
    transaction, so a session-wide `SET` would leak into unrelated work or be
    silently lost. A transaction-scoped one cannot.

    Failure here is not worth failing the request over - the timeout is a
    safety net, and connect_timeout already covers the case that actually
    hangs. So it is logged and swallowed.
    """
    if STATEMENT_TIMEOUT_MS <= 0:
        return
    try:
        session.execute(text(f"SET LOCAL statement_timeout = {STATEMENT_TIMEOUT_MS}"))
    except Exception as exc:  # pragma: no cover - depends on the server
        logger.debug("Could not apply statement_timeout: %s", exc)


def is_database_enabled() -> bool:
    """True when a database is configured. Guard every persistence call with this."""
    return SessionLocal is not None


@contextmanager
def session_scope():
    """
    Transactional session. Commits on success, rolls back on failure, and never
    propagates a database error into an API response - persistence is a
    secondary concern and must not break the pipeline.

    Yields None when no database is configured, so callers can simply write:

        with session_scope() as session:
            if session is None:
                return
    """
    if SessionLocal is None:
        yield None
        return

    session = SessionLocal()
    try:
        apply_statement_timeout(session)
        yield session
        session.commit()
    except Exception:
        session.rollback()
        logger.exception("Database operation failed; continuing without persisting")
    finally:
        session.close()


@contextmanager
def strict_session():
    """
    Transactional session for operations whose failure the caller must know
    about. Unlike `session_scope` it raises rather than swallowing:

      - no database configured  -> DatabaseUnavailable
      - constraint violation    -> sqlalchemy.exc.IntegrityError
      - anything else           -> propagated unchanged

    Authentication uses this. A duplicate email has to surface as "that address
    is already registered", not vanish into a log line.
    """
    if SessionLocal is None:
        raise DatabaseUnavailable(
            "This feature needs a database. DATABASE_URL is not configured."
        )

    session = SessionLocal()
    try:
        apply_statement_timeout(session)
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def describe_error(exc: BaseException) -> str:
    """
    A one-line, credential-free description of a database failure, safe to put
    in an HTTP response.

    Connection strings can appear inside driver errors, so any user:password
    pair is stripped before the text goes anywhere. "Something went wrong" is
    useless when you are trying to work out whether the host is wrong, the
    password rotated, or the instance is simply asleep - but the fix for a
    useless error message must not be a leaked password.
    """
    text_form = str(exc).strip().splitlines()
    message = text_form[0] if text_form else exc.__class__.__name__
    message = re.sub(r"//[^/@\s]*:[^/@\s]*@", "//***:***@", message)
    return f"{exc.__class__.__name__}: {message[:200]}"


def check_connection() -> dict:
    """
    Used by /api/health so the health check reflects reality.

    Bounded by CONNECT_TIMEOUT_SECONDS, so an unreachable database makes this
    endpoint slow but never makes it hang. The reason is returned as well as
    logged: a health check that says only "reachable: false" tells you that
    something is wrong and nothing about what.
    """
    if engine is None:
        return {"configured": False, "reachable": False, "latency_ms": None, "error": None}

    started = time.perf_counter()
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {
            "configured": True,
            "reachable": True,
            "latency_ms": round((time.perf_counter() - started) * 1000, 1),
            "error": None,
        }
    except Exception as exc:
        detail = describe_error(exc)
        logger.warning("Database unreachable after %.0f ms - %s",
                       (time.perf_counter() - started) * 1000, detail)
        return {
            "configured": True,
            "reachable": False,
            "latency_ms": round((time.perf_counter() - started) * 1000, 1),
            "error": detail,
        }
