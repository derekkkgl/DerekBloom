#!/usr/bin/env bash
# Hit every Phase 1 endpoint on a running backend with real data.
# Usage: ./scripts/smoke_test.sh            (default http://localhost:8000)
#        BASE_URL=http://127.0.0.1:9000 ./scripts/smoke_test.sh
# Exits non-zero if any check fails.

set -u
BASE_URL="${BASE_URL:-http://localhost:8000}"
TICKERS=(AAPL NVDA VOO 7203.T BTC ETH "PHP=X")
PASS=0
FAIL=0

# check <expected status> <path> [json|csv]
check() {
  local expected="$1" path="$2" kind="${3:-json}"
  local body status seconds note=""
  body="$(mktemp)"
  read -r status seconds < <(curl -s -o "$body" -w "%{http_code} %{time_total}" --max-time 60 "$BASE_URL$path")

  if [[ "$status" != "$expected" ]]; then
    note="expected $expected"
  elif [[ "$expected" == "200" && "$kind" == "json" ]]; then
    # A 200 must carry a non-empty "data" object, and lists inside it must not be empty.
    note="$(python3 -c '
import json, sys
d = json.load(open(sys.argv[1])).get("data")
if not d: print("empty data"); sys.exit()
for k, v in d.items():
    if isinstance(v, list) and not v: print(f"empty {k}")
' "$body" 2>&1)"
  elif [[ "$expected" == "200" && "$kind" == "csv" ]]; then
    [[ "$(wc -l < "$body")" -ge 2 ]] || note="csv has no rows"
  fi
  rm -f "$body"

  if [[ -z "$note" ]]; then
    PASS=$((PASS + 1))
    printf "PASS  %s  %6.2fs  %s\n" "$status" "$seconds" "$path"
  else
    FAIL=$((FAIL + 1))
    printf "FAIL  %s  %6.2fs  %s  (%s)\n" "$status" "$seconds" "$path" "$note"
  fi
}

echo "Smoke test against $BASE_URL"
echo

check 200 /api/health
check 200 /api/wei
check 200 "/api/wei?format=csv" csv
check 200 /api/news
check 200 "/api/news?category=crypto&limit=10"
check 200 /api/crypto/markets
check 200 "/api/crypto/markets?format=csv" csv

for t in "${TICKERS[@]}"; do
  check 200 "/api/quote/$t"
  check 200 "/api/chart/$t"
done
check 200 "/api/chart/BTC?range=5d&interval=15m"
check 200 "/api/chart/NVDA?range=6mo&format=csv" csv

# These must fail cleanly.
check 400 "/api/quote/BAD%24"
check 404 /api/quote/ZZZZNOTREAL
check 400 "/api/chart/NVDA?range=1y&interval=1m"

echo
echo "$PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
