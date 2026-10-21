import sqlite3
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field

from app.core.envelope import Format, csv_response, ok, ok_local
from app.core.errors import NotFound
from app.db.connection import get_db, query
from app.services.goal import goal_view
from app.services.portfolio import YEAR, Snapshot, build_snapshot, yield_view
from app.services import transactions as txn

router = APIRouter(prefix="/api", tags=["goal"])

Db = Annotated[sqlite3.Connection, Depends(get_db)]


def _settings(conn: sqlite3.Connection) -> dict:
    return dict(conn.execute(query("settings_get")).fetchone())


def _yield(conn: sqlite3.Connection, snap: Snapshot, settings: dict) -> dict:
    rewards = [dict(r) for r in conn.execute(query("rewards_since"), {"since": (snap.today - YEAR).isoformat()})]
    inputs = {r["asset"]: dict(r) for r in conn.execute(query("yield_inputs_list"))}
    return yield_view(snap, rewards, inputs, settings["withholding_pct"])


@router.get("/yield", response_model=None)
def get_yield(conn: Db, format: Format = "json") -> dict | Response:
    """Expected yearly income per holding in pesos: dividends after withholding, rewards, or a rate you set."""
    snap = build_snapshot(conn, txn.manila_today())
    body = ok(_yield(conn, snap, _settings(conn)), "yahoo", snap.result)
    if format == "csv":
        return csv_response(body["data"]["rows"], body["meta"], "yield")
    return body


@router.get("/goal", response_model=None)
def get_goal(conn: Db, format: Format = "json") -> dict | Response:
    """Income now, capital needed, months to the monthly income target, and the projected path."""
    snap = build_snapshot(conn, txn.manila_today())
    settings = _settings(conn)
    totals = _yield(conn, snap, settings)["totals"]
    data = goal_view(settings, totals["income_month"], totals["total_value"], totals["producing_value"], snap.today)
    body = ok(data, "yahoo", snap.result)
    if format == "csv":
        return csv_response(body["data"]["projection"], body["meta"], "goal_projection")
    return body


class SettingsIn(BaseModel):
    """Any subset of the settings; fields left out keep their value."""

    model_config = ConfigDict(allow_inf_nan=False)

    target_monthly_php: float | None = Field(default=None, gt=0)
    contribution_monthly_php: float | None = Field(default=None, ge=0)
    assumed_yield_pct: float | None = Field(default=None, ge=0, le=100)
    withholding_pct: float | None = Field(default=None, ge=0, le=100)
    goal_include_all: bool | None = None


@router.get("/settings")
def get_settings(conn: Db) -> dict:
    return ok_local(_settings(conn))


@router.put("/settings")
def update_settings(body: SettingsIn, conn: Db) -> dict:
    merged = {**_settings(conn), **body.model_dump(exclude_none=True)}
    merged["goal_include_all"] = int(bool(merged["goal_include_all"]))
    with conn:
        conn.execute(query("settings_update"), merged)
    return ok_local(_settings(conn))


class YieldInputIn(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    kind: Literal["staking", "interest"]
    rate_pct: float = Field(ge=0, le=100)


@router.put("/yield/{asset}")
def set_yield_input(asset: str, body: YieldInputIn, conn: Db) -> dict:
    """A staking or interest rate for a holding with no dividends or rewards."""
    key = asset.strip().upper()
    if not conn.execute(query("asset_get"), {"asset": key}).fetchone():
        raise NotFound(f"{key} isn't in your portfolio yet.")
    with conn:
        conn.execute(query("yield_input_upsert"), {"asset": key, **body.model_dump()})
    return ok_local({"asset": key, **body.model_dump()})


@router.delete("/yield/{asset}")
def delete_yield_input(asset: str, conn: Db) -> dict:
    key = asset.strip().upper()
    with conn:
        conn.execute(query("yield_input_delete"), {"asset": key})
    return ok_local({"asset": key, "deleted": True})
