import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field

from app.core.envelope import Format, csv_response, ok, ok_local
from app.core.errors import BadRequest, NotFound
from app.db.connection import get_db, query
from app.services import transactions as txn
from app.services.portfolio import Currency, build_snapshot, portfolio_view
from app.services.transactions import CashCurrency, TransactionIn

router = APIRouter(prefix="/api", tags=["portfolio"])

Db = Annotated[sqlite3.Connection, Depends(get_db)]


# --- Transactions (TXN) -----------------------------------------------------


@router.get("/transactions", response_model=None)
def list_transactions(conn: Db, format: Format = "json") -> dict | Response:
    """Every transaction, newest first, with its peso amount where the database alone can tell."""
    rows = [txn.list_view(row) for row in conn.execute(query("transactions_list"))]
    body = ok_local({"transactions": rows})
    if format == "csv":
        return csv_response(rows, body["meta"], "transactions")
    return body


def _saved(conn: sqlite3.Connection, tx_id: int) -> dict:
    row = next((r for r in conn.execute(query("transactions_list")) if r["id"] == tx_id), None)
    if row is None:
        raise NotFound(f"No transaction {tx_id}")
    return ok_local({"transaction": txn.list_view(row)})


@router.post("/transactions", status_code=201)
def create_transaction(body: TransactionIn, conn: Db) -> dict:
    with conn:  # one database transaction: a failed check undoes the insert
        row = txn.normalize(conn, body, txn.manila_today())
        new_id = conn.execute(query("transaction_insert"), row).fetchone()["id"]
        txn.check_units(conn, txn.affected_assets(row))
    return _saved(conn, new_id)


@router.put("/transactions/{tx_id}")
def update_transaction(tx_id: int, body: TransactionIn, conn: Db) -> dict:
    with conn:
        old = conn.execute(query("transaction_get"), {"id": tx_id}).fetchone()
        if old is None:
            raise NotFound(f"No transaction {tx_id}")
        row = txn.normalize(conn, body, txn.manila_today())
        conn.execute(query("transaction_update"), {**row, "id": tx_id})
        txn.check_units(conn, txn.affected_assets(old, row))
    return _saved(conn, tx_id)


@router.delete("/transactions/{tx_id}")
def delete_transaction(tx_id: int, conn: Db) -> dict:
    with conn:
        old = conn.execute(query("transaction_get"), {"id": tx_id}).fetchone()
        if old is None:
            raise NotFound(f"No transaction {tx_id}")
        conn.execute(query("transaction_delete"), {"id": tx_id})
        txn.check_units(conn, txn.affected_assets(old))
    return ok_local({"deleted": tx_id})


# --- Accounts and cash -------------------------------------------------------


@router.get("/accounts", response_model=None)
def list_accounts(conn: Db, format: Format = "json") -> dict | Response:
    """Each account with the cash you typed in."""
    cash = [dict(r) for r in conn.execute(query("cash_list"))]
    accounts = [
        {**dict(r), "cash": [{"currency": c["currency"], "amount": c["amount"]} for c in cash if c["account_id"] == r["id"]]}
        for r in conn.execute(query("accounts_list"))
    ]
    body = ok_local({"accounts": accounts})
    if format == "csv":
        flat = [{k: v for k, v in a.items() if k != "cash"} for a in accounts]
        for a, row in zip(accounts, flat):
            for c in a["cash"]:
                row[f"cash_{c['currency'].lower()}"] = c["amount"]
        return csv_response(flat, body["meta"], "accounts")
    return body


class CashIn(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    currency: CashCurrency
    amount: float = Field(ge=0)


@router.put("/accounts/{account_id}/cash")
def set_cash(account_id: int, body: CashIn, conn: Db) -> dict:
    """Set the cash balance of one currency in one account (0 clears it)."""
    if not conn.execute("SELECT 1 FROM accounts WHERE id = ?", (account_id,)).fetchone():
        raise BadRequest(f"Unknown account {account_id}.")
    with conn:
        conn.execute(query("cash_upsert"), {"account_id": account_id, **body.model_dump()})
    return ok_local({"account_id": account_id, **body.model_dump()})


# --- Holdings (PORT) -----------------------------------------------------------


@router.get("/portfolio", response_model=None)
def get_portfolio(conn: Db, currency: Currency = "PHP", format: Format = "json") -> dict | Response:
    """Holdings at average cost, valued with Yahoo prices, plus cash and allocation.

    PHP values use today's USD/PHP; costs use USD/PHP on each trade date (see costbasis.py).
    """
    snap = build_snapshot(conn, txn.manila_today())
    body = ok(portfolio_view(snap, currency), "yahoo", snap.result)
    if format == "csv":
        return csv_response(body["data"]["holdings"], body["meta"], f"portfolio_{currency}")
    return body
