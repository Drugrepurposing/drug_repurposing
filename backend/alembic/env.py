"""
Alembic environment.

The database URL comes from the DATABASE_URL environment variable, never from
alembic.ini, so credentials are not committed to the repository.

Usage:
    alembic upgrade head                      apply all migrations
    alembic revision --autogenerate -m "..."  create a new migration
    alembic downgrade -1                      roll back one
"""

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make the `app` package importable when alembic runs from backend/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import Base  # noqa: E402
from app.db import models  # noqa: F401,E402  (imported for its side effect: registering tables)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

database_url = os.getenv("DATABASE_URL", "").strip()
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)
if not database_url:
    raise RuntimeError(
        "DATABASE_URL is not set. Export it before running alembic, e.g.\n"
        "  export DATABASE_URL=postgresql://user:pass@host/dbname"
    )
config.set_main_option("sqlalchemy.url", database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
