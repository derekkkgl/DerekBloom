"""GOAL math. Pure functions, all in pesos.

  capital needed  = target per month x 12 / assumed yield
  each month      capital = capital x (1 + yield / 12) + contribution   (income reinvested)
  months to goal  = months until capital reaches capital needed
"""

from collections.abc import Mapping
from datetime import date
from typing import Any

MAX_MONTHS = 600  # 50 years: past this, the goal counts as not reachable at these settings
CHART_MONTHS_UNREACHABLE = 360  # how far the chart still draws when the goal isn't reachable


def add_months(day: date, months: int) -> str:
    """'YYYY-MM' that many months after `day`."""
    index = day.year * 12 + day.month - 1 + months
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def months_to_goal(start: float, needed: float, yield_pct: float, contribution: float) -> int | None:
    """Whole months until capital reaches `needed`, or None if it never does within MAX_MONTHS."""
    capital, monthly = start, yield_pct / 100 / 12
    for month in range(MAX_MONTHS + 1):
        if capital >= needed:
            return month
        capital = capital * (1 + monthly) + contribution
    return None


def projection(start: float, yield_pct: float, contribution: float, months: int, today: date) -> list[dict]:
    """Month-by-month capital and the monthly income it would pay at the assumed yield."""
    capital, monthly, rows = start, yield_pct / 100 / 12, []
    for month in range(months + 1):
        rows.append({"month": month, "date": add_months(today, month), "capital": capital, "income_month": capital * monthly})
        capital = capital * (1 + monthly) + contribution
    return rows


def goal_view(settings: Mapping[str, Any], income_month_now: float, total_value: float, producing_value: float, today: date) -> dict:
    target = settings["target_monthly_php"]
    yield_pct = settings["assumed_yield_pct"]
    contribution = settings["contribution_monthly_php"]
    include_all = bool(settings["goal_include_all"])
    start = total_value if include_all else producing_value

    needed = target * 12 / (yield_pct / 100) if yield_pct > 0 else None
    months = months_to_goal(start, needed, yield_pct, contribution) if needed is not None else None
    if needed is None:
        note = "Not reachable at these settings: with a 0% assumed yield, no amount of capital pays an income."
    elif months is None:
        note = f"Not reachable at these settings within {MAX_MONTHS // 12} years. Raise the contribution or the yield."
    else:
        note = None

    chart_months = min(max(months + 12, 24), MAX_MONTHS) if months is not None else CHART_MONTHS_UNREACHABLE
    return {
        "settings": {**settings, "goal_include_all": include_all},
        "income_now_month": income_month_now,
        "income_now_year": income_month_now * 12,
        "progress_pct": income_month_now / target * 100,
        "if_converted_month": total_value * yield_pct / 100 / 12,  # hypothetical: everything at the assumed yield
        "total_value": total_value,
        "producing_value": producing_value,
        "start_capital": start,
        "capital_needed": needed,
        "capital_gap": max(needed - start, 0.0) if needed is not None else None,
        "months_to_goal": months,
        "target_date": add_months(today, months) if months is not None else None,
        "reachable": months is not None,
        "note": note,
        "projection": projection(start, yield_pct, contribution, chart_months, today),
    }
