"""Absolute project paths — independent of process CWD."""

from __future__ import annotations

from pathlib import Path

# server/app/core/paths.py → SERVER_ROOT = server/
SERVER_ROOT: Path = Path(__file__).resolve().parents[2]
# repo root (parent of server/)
PROJECT_ROOT: Path = SERVER_ROOT.parent


def resolve_upload_root(upload_dir: str) -> Path:
    """Resolve UPLOAD_DIR to an absolute path under PROJECT_ROOT when relative."""
    path = Path(upload_dir)
    if not path.is_absolute():
        path = (PROJECT_ROOT / path).resolve()
    return path


def resolve_sqlite_url(database_url: str) -> str:
    """
    Make sqlite file URLs absolute so `cd server` vs repo root does not fork DBs.

    Examples:
      sqlite:///./travel_planner.db
      sqlite:////abs/path/travel_planner.db
    """
    if not database_url.startswith("sqlite:"):
        return database_url

    prefix = "sqlite:///"
    if not database_url.startswith(prefix):
        return database_url

    raw_path = database_url[len(prefix) :]
    # Absolute filesystem path already: sqlite:////tmp/x.db → raw_path starts with /
    if raw_path.startswith("/"):
        return database_url

    abs_path = (SERVER_ROOT / raw_path).resolve()
    return f"sqlite:///{abs_path}"
