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
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

logger = logging.getLogger(__name__)

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

if DATABASE_URL:
    engine = create_engine(
        DATABASE_URL,
        # Serverless Postgres closes idle connections; without this, a request
        # arriving after a quiet period gets a dead connection from the pool.
        pool_pre_ping=True,
        pool_recycle=280,
        pool_size=5,
        max_overflow=2,
        future=True,
    )
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    logger.info("Database configured")
else:
    logger.warning("DATABASE_URL not set - running without persistence")


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
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def check_connection() -> dict:
    """Used by /api/health so the health check reflects reality."""
    if engine is None:
        return {"configured": False, "reachable": False, "latency_ms": None}

    import time
    started = time.perf_counter()
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {
            "configured": True,
            "reachable": True,
            "latency_ms": round((time.perf_counter() - started) * 1000, 1),
        }
    except Exception as exc:
        logger.warning("Database unreachable: %s", exc)
        return {"configured": True, "reachable": False, "latency_ms": None}
