"""Add drug_embeddings with pgvector

Revision ID: a4f1c9d2e7b3
Revises: bc7838d0f26d
Create Date: 2026-09-02 09:20:00.000000

Adds the vector store used by GET /api/drugs/{id}/similar.

Two parts of this migration are deliberately defensive:

1. CREATE EXTENSION vector may fail on a Postgres that does not have pgvector
   installed. Rather than making the whole schema unmigratable there, the
   failure is caught and the table is skipped, leaving the rest of the
   application working with similarity search simply unavailable.

2. The index type is chosen at runtime. HNSW needs pgvector >= 0.5.0; older
   installations get IVFFlat instead. Both answer the same query - HNSW just
   gives better recall for the same speed. Hardcoding HNSW would break the
   migration on an older server for no benefit.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "a4f1c9d2e7b3"
down_revision: Union[str, Sequence[str], None] = "bc7838d0f26d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMBEDDING_DIM = 128


def _vector_version(connection) -> str:
    return connection.execute(
        sa.text("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
    ).scalar() or ""


def _supports_hnsw(version: str) -> bool:
    """HNSW landed in pgvector 0.5.0."""
    try:
        major, minor, *_ = (int(part) for part in version.split("."))
    except ValueError:
        return False
    return (major, minor) >= (0, 5)


def upgrade() -> None:
    connection = op.get_bind()

    try:
        connection.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))
    except Exception as exc:  # pragma: no cover - depends on the server
        print(
            "\n  pgvector is not available on this database, so drug_embeddings "
            f"was not created.\n  Everything else still works; similarity search "
            f"will report itself unavailable.\n  Reason: {exc}\n"
        )
        return

    op.create_table(
        "drug_embeddings",
        sa.Column("drug_id", sa.String(length=64), primary_key=True),
        sa.Column("drug_name", sa.String(length=200), nullable=False),
        sa.Column("target_gene", sa.String(length=120), nullable=True),
        sa.Column("disease_key", sa.String(length=120), nullable=True),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=False),
        sa.Column("model_version", sa.String(length=40), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_index("ix_drug_embeddings_target_gene", "drug_embeddings", ["target_gene"])
    op.create_index("ix_drug_embeddings_disease_key", "drug_embeddings", ["disease_key"])
    op.create_index("ix_drug_embeddings_model_version", "drug_embeddings", ["model_version"])

    # The approximate-nearest-neighbour index. vector_cosine_ops must match the
    # distance operator the query uses (<=>); an index built for a different
    # metric is simply ignored by the planner, which is the quiet way to end up
    # with a sequential scan and wonder why nothing got faster.
    version = _vector_version(connection)
    if _supports_hnsw(version):
        op.execute(
            "CREATE INDEX ix_drug_embeddings_hnsw ON drug_embeddings "
            "USING hnsw (embedding vector_cosine_ops) "
            "WITH (m = 16, ef_construction = 64)"
        )
    else:
        # lists ~= sqrt(rows) is the usual starting point for IVFFlat.
        op.execute(
            "CREATE INDEX ix_drug_embeddings_ivfflat ON drug_embeddings "
            "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 30)"
        )


def downgrade() -> None:
    op.drop_table("drug_embeddings")
    # The extension is deliberately left in place: other things may depend on
    # it, and dropping a shared extension to reverse one table is overreach.
