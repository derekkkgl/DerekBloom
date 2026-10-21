import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.cache import cache
from app.core.envelope import ok, ok_local
from app.core.errors import ApiError, BadRequest
from app.core.tickers import ALIASES
from app.db.connection import get_db, query
from app.services import yahoo

router = APIRouter(prefix="/api", tags=["search"])

Db = Annotated[sqlite3.Connection, Depends(get_db)]

SEARCH_TTL = 24 * 3600  # what a search returns barely changes; this keeps Yahoo calls rare
CLASS_TYPES = {"crypto": "CRYPTOCURRENCY", "stock": "EQUITY", "etf": "ETF", "fund": "MUTUALFUND"}


def _like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def local_matches(conn: sqlite3.Connection, text: str) -> list[dict]:
    """Aliases and assets you've used that match, before asking Yahoo: typing B finds BTC at once."""
    lower = text.lower()
    out = [
        {"ticker": name, "symbol": a.symbol, "name": a.label or None,
         "type": "CURRENCY" if a.coingecko_id is None else "CRYPTOCURRENCY", "exchange": None, "source": "alias"}
        for name, a in ALIASES.items()
        if name.startswith(text) or (a.label and lower in a.label.lower())
    ]
    rows = conn.execute(query("assets_search"), {"prefix": f"{_like(text)}%", "contains": f"%{_like(text)}%"})
    out += [
        {"ticker": r["asset"], "symbol": r["yahoo_symbol"], "name": r["name"], "type": CLASS_TYPES.get(r["class"]),
         "exchange": None, "source": "yours"}
        for r in rows
    ]
    return out


def rank(text: str, local: list[dict], remote: list[dict], limit: int) -> list[dict]:
    """Yours and aliases first (so "b" leads with BTC, not Barrick), exact and prefix matches
    before name matches, then Yahoo's own order. One row per ticker."""
    def score(i: int, item: dict) -> tuple:
        exact = item["ticker"] == text
        prefix = item["ticker"].startswith(text)
        return (item["source"] == "yahoo", not exact, not prefix, i)

    candidates = local + [{**r, "source": "yahoo"} for r in remote]
    seen: dict[str, dict] = {}
    for i, item in sorted(enumerate(candidates), key=lambda pair: score(*pair)):
        existing = seen.get(item["ticker"])
        if existing is None:
            seen[item["ticker"]] = {**item}
        elif not existing.get("name") and item.get("name"):
            existing["name"] = item["name"]
    return list(seen.values())[:limit]


@router.get("/search")
def search(
    conn: Db,
    q: str = Query(..., min_length=1, max_length=40),
    limit: int = Query(8, ge=1, le=20),
    yahoo_search: bool = Query(True, alias="yahoo"),
) -> dict:
    """Tickers matching what you typed: your aliases and assets first, then Yahoo's search.

    `yahoo=false` answers from aliases and your assets only, instantly, for the first keystroke.
    If Yahoo fails, the local matches still come back, with the reason in `error`.
    """
    text = q.strip().upper()
    if not text:
        raise BadRequest("Type at least one letter or digit.")
    local = local_matches(conn, text)
    if not yahoo_search:
        return ok_local({"query": text, "results": rank(text, local, [], limit), "error": None})
    try:
        result = cache.get_or_fetch(f"search:{text}", SEARCH_TTL, lambda: yahoo.get_search(text))
    except ApiError as exc:
        return ok_local({"query": text, "results": rank(text, local, [], limit), "error": exc.message})
    return ok({"query": text, "results": rank(text, local, result.value, limit), "error": None}, "yahoo", result)
