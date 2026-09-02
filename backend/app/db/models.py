"""
Database schema.

Four tables, each designed to be defended rather than merely to work:

  users            accounts, with bcrypt password hashes (never plain passwords)
  search_history   every pipeline run, attributable to a user when logged in
  feedback         expert thumbs up/down, which /api/feedback previously accepted
                   and silently discarded
  drug_embeddings  one vector per compound, indexed for nearest-neighbour search

Design notes worth knowing for a viva:

- Foreign keys use ON DELETE CASCADE, so deleting a user removes their data
  rather than leaving orphaned rows.
- user_id is nullable everywhere. Anonymous visitors can still search and vote;
  their rows simply have no owner. Gating the core feature behind a login would
  make the application worse and the demo harder.
- Composite index on (user_id, created_at DESC) because that is exactly what
  GET /api/history filters and sorts by. An index that does not match a real
  query is decoration.
- Email is stored lowercased with a unique constraint, so Alice@x.com and
  alice@x.com cannot both register.
- Every table carries created_at; users also carries updated_at.
"""

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.embeddings import EMBEDDING_DIM
from app.db.session import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    searches = relationship("SearchHistory", back_populates="user", passive_deletes=True)
    feedback = relationship("Feedback", back_populates="user", passive_deletes=True)

    def __repr__(self) -> str:
        return f"<User {self.id} {self.email}>"


class SearchHistory(Base):
    __tablename__ = "search_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    # What the visitor typed, kept verbatim - useful for spotting which spellings
    # the fuzzy matcher has to handle.
    disease_query: Mapped[str] = mapped_column(String(200), nullable=False)
    # What the pipeline resolved it to.
    disease_name: Mapped[str] = mapped_column(String(200), nullable=True)
    disease_category: Mapped[str] = mapped_column(String(120), nullable=True)
    result_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    duration_ms: Mapped[float] = mapped_column(Float, nullable=True)
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    user = relationship("User", back_populates="searches")

    __table_args__ = (
        # Matches GET /api/history: filter by user, newest first.
        Index("ix_search_history_user_created", "user_id", created_at.desc()),
    )

    def __repr__(self) -> str:
        return f"<SearchHistory {self.id} {self.disease_query!r}>"


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    drug_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    drug_name: Mapped[str] = mapped_column(String(200), nullable=True)
    disease_name: Mapped[str] = mapped_column(String(200), nullable=True)
    # 'up' or 'down'
    rating: Mapped[str] = mapped_column(String(8), nullable=False)
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    user = relationship("User", back_populates="feedback")

    __table_args__ = (
        # One vote per drug per logged-in user. In Postgres, NULLs do not
        # collide, so anonymous votes are simply not deduplicated - which is
        # the behaviour we want, since there is no identity to deduplicate on.
        UniqueConstraint("user_id", "drug_id", name="uq_feedback_user_drug"),
    )

    def __repr__(self) -> str:
        return f"<Feedback {self.id} {self.drug_id} {self.rating}>"


class DrugEmbedding(Base):
    """
    One vector per compound, for "what else is like this?".

    The rest of the pipeline ranks drugs against a disease. This table answers
    a different question - which compounds resemble a given one - and it is the
    only place in the project where a vector is actually stored and searched
    rather than merely computed and discarded.

    Design notes:

    - drug_id is the primary key, not a surrogate integer. The drug bank
      already provides a stable identifier, and re-seeding must overwrite the
      existing row rather than accumulate duplicates.
    - target_gene and disease_key are duplicated out of the drug bank on
      purpose. Denormalisation is usually a smell, but the whole point of this
      table is to return neighbours in one query; joining back to an in-memory
      Python list to label them would defeat that.
    - model_version records which embedding function produced the row. Vectors
      from different functions are not comparable, and without this there is no
      way to tell a stale row from a current one.
    """

    __tablename__ = "drug_embeddings"

    drug_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    drug_name: Mapped[str] = mapped_column(String(200), nullable=False)
    target_gene: Mapped[str] = mapped_column(String(120), nullable=True, index=True)
    disease_key: Mapped[str] = mapped_column(String(120), nullable=True, index=True)
    embedding: Mapped[list] = mapped_column(Vector(EMBEDDING_DIM), nullable=False)
    model_version: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<DrugEmbedding {self.drug_id} {self.drug_name}>"
