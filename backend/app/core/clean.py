"""Make any payload safe for JSON.

pandas marks missing values as NaN, and numpy has its own number types.
Standard JSON supports neither, so every response passes through clean():

    NaN, inf, -inf, pd.NA, NaT      -> None (null in JSON)
    numpy int / float / bool        -> plain Python int / float / bool
    pd.Timestamp, datetime          -> ISO string in UTC, e.g. "2026-10-21T08:30:00Z"
    dict / list / tuple / Series    -> cleaned recursively
"""

import math
from datetime import date, datetime
from typing import Any

import numpy as np
import pandas as pd


def to_iso(value: datetime | pd.Timestamp | np.datetime64) -> str:
    ts = pd.Timestamp(value)
    ts = ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")


def clean(value: Any) -> Any:
    if value is None or value is pd.NA or value is pd.NaT:
        return None
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, (pd.Series, np.ndarray)):
        return [clean(v) for v in value.tolist()]
    if isinstance(value, (bool, np.bool_)):
        return bool(value)
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, (float, np.floating)):
        number = float(value)
        return number if math.isfinite(number) else None
    if isinstance(value, (pd.Timestamp, datetime, np.datetime64)):
        return None if pd.isna(value) else to_iso(value)
    if isinstance(value, date):
        return value.isoformat()
    return value
