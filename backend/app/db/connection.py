"""SQLite connection and the .sql query loader.

The database is one file, backend/data/tape.db (git-ignored). Set TAPE_DB to use another
file, e.g. a scratch copy for trying things out. Tests point it at a temp file.

Every query lives in backend/sql/queries/<name>.sql, so you can open it, read it, and
run it yourself in any SQLite tool. Code calls it by name: query("transactions_list").
"""

import os
import sqlite3
from collections.abc import Iterator
from functools import cache
from pathlib import Path

from app.db.migrate import migrate

BACKEND_DIR = Path(__file__).resolve().parents[2]
SQL_DIR = BACKEND_DIR / "sql"
DEFAULT_DB = BACKEND_DIR / "data" / "tape.db"

# Files already migrated by this process, so each request doesn't re-check.
_migrated: set[str] = set()


def db_path() -> Path:
    return Path(os.environ.get("TAPE_DB") or DEFAULT_DB)


def connect() -> sqlite3.Connection:
    """Open the database, creating and migrating it on first use."""
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    # FastAPI may run a dependency and its endpoint on different worker threads.
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    key = str(path.resolve())
    if key not in _migrated:
        migrate(conn, SQL_DIR / "migrations")
        _migrated.add(key)
    return conn


def get_db() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency: one connection per request, always closed."""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


@cache
def query(name: str) -> str:
    return (SQL_DIR / "queries" / f"{name}.sql").read_text()
