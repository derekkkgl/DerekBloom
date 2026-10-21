"""Migrations runner.

Each file in backend/sql/migrations is named NNN_description.sql and runs once, in number
order. The schema_migrations table remembers which ones ran, so running this again is a
no-op. To change the schema later, add a new file (002_...). Never edit one that already ran.
"""

import re
import sqlite3
from pathlib import Path

MIGRATION_RE = re.compile(r"^(\d{3})_[a-z0-9_]+\.sql$")


def pending(conn: sqlite3.Connection, folder: Path) -> list[tuple[int, Path]]:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS schema_migrations (
               version    INTEGER PRIMARY KEY,
               name       TEXT NOT NULL,
               applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
           ) STRICT"""
    )
    done = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
    files = sorted((int(m.group(1)), p) for p in folder.iterdir() if (m := MIGRATION_RE.match(p.name)))
    return [(version, path) for version, path in files if version not in done]


def migrate(conn: sqlite3.Connection, folder: Path) -> list[str]:
    """Apply every migration that hasn't run yet. Returns the file names applied."""
    applied = []
    for version, path in pending(conn, folder):
        # One transaction per file: a broken migration leaves the database as it was.
        script = path.read_text()
        record = f"INSERT INTO schema_migrations (version, name) VALUES ({version}, '{path.name}');"
        try:
            conn.executescript(f"BEGIN;\n{script}\n{record}\nCOMMIT;")
        except sqlite3.Error:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            raise
        applied.append(path.name)
    return applied
