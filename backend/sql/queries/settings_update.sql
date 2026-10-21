UPDATE settings
SET target_monthly_php       = :target_monthly_php,
    contribution_monthly_php = :contribution_monthly_php,
    assumed_yield_pct        = :assumed_yield_pct,
    withholding_pct          = :withholding_pct,
    goal_include_all         = :goal_include_all
WHERE id = 1;
