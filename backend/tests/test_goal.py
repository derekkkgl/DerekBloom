from datetime import date

import pytest

from app.services.goal import MAX_MONTHS, add_months, goal_view, months_to_goal, projection

SETTINGS = {"target_monthly_php": 2_000.0, "contribution_monthly_php": 2_000.0, "assumed_yield_pct": 5.0,
            "withholding_pct": 25.0, "goal_include_all": 0}
TODAY = date(2026, 10, 21)


def test_add_months_rolls_over_the_year():
    assert add_months(TODAY, 0) == "2026-10"
    assert add_months(TODAY, 3) == "2027-01"
    assert add_months(TODAY, 120) == "2036-10"


def test_already_there_is_zero_months():
    assert months_to_goal(500_000, 480_000, 5, 0) == 0


def test_no_growth_and_no_contribution_never_gets_there():
    assert months_to_goal(1_000, 480_000, 5, 0) is None  # 5% on ₱1,000 takes longer than 50 years
    assert months_to_goal(0, 480_000, 5, 0) is None


def test_zero_yield_still_counts_contributions():
    assert months_to_goal(0, 24_000, 0, 2_000) == 12


def test_months_match_a_hand_check():
    # ₱1,000 a month at 12%/yr (1%/mo) from zero reaches ₱12,682.50 after 12 months, so ₱12,000 takes 12.
    assert months_to_goal(0, 12_000, 12, 1_000) == 12
    assert months_to_goal(0, 12_683, 12, 1_000) == 13


def test_projection_compounds_then_adds_contribution():
    rows = projection(1_000, 12, 100, 2, TODAY)
    assert [r["date"] for r in rows] == ["2026-10", "2026-11", "2026-12"]
    assert rows[1]["capital"] == pytest.approx(1_000 * 1.01 + 100)
    assert rows[0]["income_month"] == pytest.approx(10)


def test_goal_view_default_and_toggle():
    view = goal_view(SETTINGS, income_month_now=150, total_value=100_000, producing_value=40_000, today=TODAY)
    assert view["capital_needed"] == pytest.approx(480_000)
    assert view["start_capital"] == 40_000 and view["capital_gap"] == pytest.approx(440_000)
    assert view["progress_pct"] == pytest.approx(7.5)
    assert view["if_converted_month"] == pytest.approx(100_000 * 0.05 / 12)
    assert view["target_date"] == add_months(TODAY, view["months_to_goal"])
    assert len(view["projection"]) == max(view["months_to_goal"] + 12, 24) + 1

    everything = goal_view({**SETTINGS, "goal_include_all": 1}, 150, 100_000, 40_000, TODAY)
    assert everything["start_capital"] == 100_000
    assert everything["months_to_goal"] < view["months_to_goal"]


def test_unreachable_goal_has_a_note_and_still_a_chart():
    view = goal_view({**SETTINGS, "contribution_monthly_php": 0}, 0, 0, 0, TODAY)
    assert view["months_to_goal"] is None and view["target_date"] is None
    assert "50 years" in view["note"] and len(view["projection"]) > 1
    assert MAX_MONTHS == 600
