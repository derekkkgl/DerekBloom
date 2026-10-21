import json
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from app.core.clean import clean


def test_nan_and_infinity_become_none():
    assert clean(float("nan")) is None
    assert clean(float("inf")) is None
    assert clean(-np.inf) is None
    assert clean(np.float64("nan")) is None
    assert clean(pd.NA) is None
    assert clean(pd.NaT) is None


def test_numpy_types_become_python():
    assert clean(np.int64(7)) == 7 and type(clean(np.int64(7))) is int
    assert clean(np.float32(1.5)) == 1.5 and type(clean(np.float32(1.5))) is float
    assert clean(np.bool_(True)) is True


def test_timestamps_become_utc_iso():
    assert clean(pd.Timestamp("2026-10-21 08:30")) == "2026-10-21T08:30:00Z"
    tokyo = pd.Timestamp("2026-10-21 09:00", tz="Asia/Tokyo")
    assert clean(tokyo) == "2026-10-21T00:00:00Z"
    assert clean(datetime(2026, 1, 2, tzinfo=timezone.utc)) == "2026-01-02T00:00:00Z"
    assert clean(np.datetime64("2026-10-21T00:00")) == "2026-10-21T00:00:00Z"


def test_nested_structures_and_series():
    payload = {
        "rows": [{"close": np.float64("nan"), "volume": np.int64(10)}, (1, float("inf"))],
        "series": pd.Series([1.0, np.nan]),
        1: "int key",
    }
    out = clean(payload)
    assert out == {"rows": [{"close": None, "volume": 10}, [1, None]], "series": [1.0, None], "1": "int key"}
    json.dumps(out, allow_nan=False)  # must be strict-JSON safe


def test_plain_values_pass_through():
    assert clean("NVDA") == "NVDA"
    assert clean(3) == 3
    assert clean(None) is None
