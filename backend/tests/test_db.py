import sqlite3

import pytest

from app.db.connection import SQL_DIR, connect, query
from app.db.migrate import migrate


def tables(conn: sqlite3.Connection) -> set[str]:
    return {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


def test_first_connect_creates_the_schema(db):
    assert {"accounts", "transactions", "assets", "cash_balances", "yield_inputs", "settings", "schema_migrations"} <= tables(db)
    assert [r["name"] for r in db.execute("SELECT name FROM accounts ORDER BY id")] == ["Coins.ph", "Binance", "Gotrade", "Manual"]
    settings = dict(db.execute(query("settings_get")).fetchone())
    assert settings == {
        "target_monthly_php": 2000.0,
        "contribution_monthly_php": 2000.0,
        "assumed_yield_pct": 5.0,
        "withholding_pct": 25.0,
        "goal_include_all": 0,
    }


def test_migrating_again_is_a_no_op(db):
    assert migrate(db, SQL_DIR / "migrations") == []
    assert db.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0] == 1
    assert db.execute("SELECT COUNT(*) FROM accounts").fetchone()[0] == 4


def test_new_connection_to_same_file_keeps_data(db):
    db.execute("INSERT INTO cash_balances (account_id, currency, amount) VALUES (1, 'PHP', 1200)")
    db.commit()
    other = connect()
    assert other.execute("SELECT amount FROM cash_balances").fetchone()[0] == 1200
    other.close()


def test_broken_migration_rolls_back(tmp_path, db):
    folder = tmp_path / "migrations"
    folder.mkdir()
    (folder / "001_ok.sql").write_text("CREATE TABLE one (x INTEGER) STRICT;")
    (folder / "002_broken.sql").write_text("CREATE TABLE two (x INTEGER) STRICT; INSERT INTO nowhere VALUES (1);")
    fresh = sqlite3.connect(tmp_path / "other.db")
    with pytest.raises(sqlite3.OperationalError):
        migrate(fresh, folder)
    assert "one" in tables(fresh) and "two" not in tables(fresh)
    assert [r[0] for r in fresh.execute("SELECT version FROM schema_migrations")] == [1]


@pytest.mark.parametrize(
    "column, value",
    [("type", "GIFT"), ("units", -1.0), ("trade_date", "21/10/2026"), ("price_currency", "EUR"), ("units", "lots")],
)
def test_constraints_reject_bad_rows(db, column, value):
    row = {
        "account_id": 1, "trade_date": "2026-10-01", "type": "BUY", "asset": "BTC", "units": 0.1, "price": 100.0,
        "price_currency": "PHP", "fee": 0.0, "fee_currency": None, "php_amount": None, "note": None,
    }
    row[column] = value
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(query("transaction_insert"), row)
