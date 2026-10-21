from fastapi import APIRouter, Query, Response

from app.core.cache import cache
from app.core.envelope import Format, csv_response, ok
from app.routers.crypto import usd_php_rate, with_php
from app.services import defillama

router = APIRouter(prefix="/api/defi", tags=["defi"])

DEFI_TTL = 3600  # DefiLlama updates hourly, and the protocol list is a 9 MB download


@router.get("/tvl")
def tvl(days: int = Query(365, ge=2, le=5000)) -> dict:
    """Total value locked across all DeFi, with 1d/7d/30d change and daily history in USD."""
    result = cache.get_or_fetch("defi:tvl", DEFI_TTL, defillama.get_tvl)
    rate = usd_php_rate()
    data = {**with_php([result.value], ("tvl_usd",), rate)[0], "usd_php": rate}
    data["history"] = data["history"][-days:]
    return ok(data, "defillama", result)


@router.get("/chains", response_model=None)
def chains(format: Format = "json") -> dict | Response:
    """Top 20 blockchains by DeFi value locked, with their share of the total."""
    result = cache.get_or_fetch("defi:chains", DEFI_TTL, defillama.get_chains)
    rate = usd_php_rate()
    body = ok({"chains": with_php(result.value, ("tvl_usd",), rate), "usd_php": rate}, "defillama", result)
    if format == "csv":
        return csv_response(body["data"]["chains"], body["meta"], "defi_chains")
    return body


@router.get("/protocols", response_model=None)
def protocols(format: Format = "json") -> dict | Response:
    """Top 25 DeFi apps by value locked (exchanges left out), with 1d and 7d change."""
    result = cache.get_or_fetch("defi:protocols", DEFI_TTL, defillama.get_protocols)
    rate = usd_php_rate()
    body = ok({"protocols": with_php(result.value, ("tvl_usd",), rate), "usd_php": rate}, "defillama", result)
    if format == "csv":
        return csv_response(body["data"]["protocols"], body["meta"], "defi_protocols")
    return body
