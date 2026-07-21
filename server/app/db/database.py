"""Engine factory — SQLite today, PostgreSQL-compatible URL tomorrow."""

from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from app.core.config import get_settings


def create_db_engine() -> Engine:
    settings = get_settings()
    url = settings.sqlalchemy_database_url
    connect_args: dict = {}
    if url.startswith("sqlite:"):
        # Required for SQLite + FastAPI multi-thread default
        connect_args["check_same_thread"] = False
    engine = create_engine(url, connect_args=connect_args, future=True)
    if url.startswith("sqlite:"):
        from sqlalchemy import event

        @event.listens_for(engine, "connect")
        def _enable_sqlite_fks(dbapi_connection, _connection_record) -> None:  # type: ignore[no-untyped-def]
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine
