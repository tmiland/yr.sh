#!/usr/bin/env bash
# shellcheck disable=SC2034  # PLAIN is read by the sourced helpers
#
# Offline tests for the moon phase helpers.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

# shellcheck source=../yr.sh
# shellcheck disable=SC1091
source ./yr.sh
set +e

pass=0
fail=0

check() {
    local name=$1 expected=$2 actual=$3
    if [[ $expected == "$actual" ]]; then
        pass=$((pass + 1))
    else
        fail=$((fail + 1))
        printf 'FAIL: %s\n  expected: %q\n  actual:   %q\n' \
            "$name" "$expected" "$actual"
    fi
}

# ---- phase mapping -------------------------------------------------------
check "new moon emoji" "🌑" "$(moon_phase_emoji 0)"
check "new moon name" "New moon" "$(moon_phase_name 0)"
check "waxing crescent emoji" "🌒" "$(moon_phase_emoji 45)"
check "waxing crescent name" "Waxing crescent" "$(moon_phase_name 45)"
check "first quarter emoji" "🌓" "$(moon_phase_emoji 90)"
check "first quarter name" "First quarter" "$(moon_phase_name 90)"
check "waxing gibbous emoji" "🌔" "$(moon_phase_emoji 135)"
check "waxing gibbous name" "Waxing gibbous" "$(moon_phase_name 135)"
check "full moon emoji" "🌕" "$(moon_phase_emoji 180)"
check "full moon name" "Full moon" "$(moon_phase_name 180)"
check "waning gibbous emoji" "🌖" "$(moon_phase_emoji 225)"
check "waning gibbous name" "Waning gibbous" "$(moon_phase_name 225)"
check "last quarter emoji" "🌗" "$(moon_phase_emoji 270)"
check "last quarter name" "Last quarter" "$(moon_phase_name 270)"
check "waning crescent emoji" "🌘" "$(moon_phase_emoji 315)"
check "waning crescent name" "Waning crescent" "$(moon_phase_name 315)"
check "waning crescent 321.14" "Waning crescent" "$(moon_phase_name 321.14)"
check "new moon 359" "New moon" "$(moon_phase_name 359)"

# ---- illumination --------------------------------------------------------
check "illumination new" "0" "$(moon_illumination 0)"
check "illumination first quarter" "50" "$(moon_illumination 90)"
check "illumination full" "100" "$(moon_illumination 180)"
check "illumination 321.14" "11" "$(moon_illumination 321.14)"

# ---- formatting ----------------------------------------------------------
body='{"properties":{"moonphase":321.14,"moonrise":{"time":"2026-11-06T04:16+01:00"},"moonset":{"time":"2026-11-06T14:55+01:00"}}}'

PLAIN=0
check "pretty moon lines" \
    $'🌘 Waning crescent · 11% illuminated\n🌙 Moonrise 04:16 · Moonset 14:55' \
    "$(format_moon_lines "$body")"

PLAIN=1
check "plain moon lines" \
    $'Waning crescent - 11% illuminated\nMoonrise 04:16 - Moonset 14:55' \
    "$(format_moon_lines "$body")"

body_null='{"properties":{"moonphase":180,"moonrise":null,"moonset":null}}'
PLAIN=0
check "full moon without rise/set" \
    "🌕 Full moon · 100% illuminated" \
    "$(format_moon_lines "$body_null")"

body_one='{"properties":{"moonphase":90,"moonrise":null,"moonset":{"time":"2026-11-06T14:55+01:00"}}}'
check "missing moonrise" \
    $'🌓 First quarter · 50% illuminated\n🌙 Moonrise — · Moonset 14:55' \
    "$(format_moon_lines "$body_one")"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
(( fail == 0 ))
