#!/usr/bin/env bash
#
# yr.sh — Yr.no weather shell script
# Fetches weather from yr.no and prints a nice summary.
#
# Usage:
#   ./weather.sh [location]
#
# Examples:
#   ./weather.sh Oslo
#   ./weather.sh 59.9139 10.7522
#

set -euo pipefail

# ---- constants ----------------------------------------------------------
API_BASE="https://api.met.no"
API_KEY="${YR_API_KEY:-}"
USER_AGENT="yr.sh/1.0"

# ---- helper functions ----------------------------------------------------
usage() {
    echo "Usage: $0 [OPTIONS] [lat.lon]" >&2
    echo "" >&2
    echo "Options:" >&2
    echo "  -h, --help       Show this help" >&2
    echo "  -v, --version    Print version" >&2
    echo "" >&2
    echo "Examples:" >&2
    echo "  $0 Oslo          Fetch weather for Oslo" >&2
    echo "  $0 59.9139 10.7522  Fetch weather for coordinates" >&2
    exit 1
}

version() {
    echo "yr.sh v1.0.0"
}

# Check if a string looks like a coordinate (numeric with optional decimal)
is_coordinate() {
    local val="$1"
    [[ "$val" =~ ^-?[0-9]+\.?[0-9]*$ ]]
}

# ---- main ---------------------------------------------------------------
main() {
    local location=""
    local lat="" lon=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help)
                usage
                ;;
            -v|--version)
                version
                exit 0
                ;;
            *)
                if [[ -z "$location" && -z "$lat" ]]; then
                    location="$1"
                elif [[ -z "$lat" ]]; then
                    lat="$1"
                else
                    lon="$1"
                fi
                shift
                ;;
        esac
    done

    if is_coordinate "$location" && is_coordinate "$lat"; then
        fetch_weather "$location" "$lat"
    elif [[ -n "$lat" && -n "$lon" ]]; then
        fetch_weather "$lat" "$lon"
    elif [[ -n "$location" ]]; then
        geocode_and_fetch "$location"
    else
        usage
    fi
}

# ---- weather fetch ------------------------------------------------------
fetch_weather() {
    local lat="$1"
    local lon="$2"

    echo "Fetching weather for ${lat}, ${lon}..."

    local response
    response=$(curl -s -A "${USER_AGENT}" \
        "${API_BASE}/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}" | \
        python3 -c "import sys, json; data = json.load(sys.stdin); print(json.dumps(data, indent=2))") || true

    if [[ -n "$response" ]]; then
        echo "$response"
    else
        echo "Error: Failed to fetch weather data." >&2
        exit 1
    fi
}

# ---- geocoding ----------------------------------------------------------
geocode_and_fetch() {
    local query="$1"

    echo "Resolving '${query}'..."

    local geo_response
    geo_response=$(curl -s -A "yr.sh/1.0" \
        "https://geocoding-api.open-meteo.com/v1/search?name=${query}&count=1&language=en" | \
        python3 -c "
import sys, json
data = json.load(sys.stdin)
results = data.get('results', [])
if results:
    r = results[0]
    lat = r.get('latitude', '')
    lon = r.get('longitude', '')
    if lat and lon:
        print(f'{lat} {lon}')
    else:
        print('ERROR:No coordinates found')
else:
    print('ERROR:No results found')
" ) || true

    if echo "$geo_response" | grep -q '^ERROR:'; then
        echo "Error: Could not find '${query}'. Check the spelling." >&2
        exit 1
    fi

    local coords="$geo_response"
    local lat="${coords%% *}"
    local lon="${coords##* }"

    echo "Fetching weather for ${lat}, ${lon}..."
    fetch_weather "$lat" "$lon"
}

# Keep geocode_location for backwards compatibility (just geocode, don't fetch)
geocode_location() {
    local query="$1"

    echo "Resolving '${query}'..."

    local geo_response
    geo_response=$(curl -s -A "yr.sh/1.0" \
        "https://geocoding-api.open-meteo.com/v1/search?name=${query}&count=1&language=en" | \
        python3 -c "import sys, json; data = json.load(sys.stdin); print(json.dumps(data, indent=2))") || true

    if [[ -n "$geo_response" ]]; then
        echo "$geo_response"
    else
        echo "Error: Could not find '${query}'. Check the spelling." >&2
        exit 1
    fi
}

main "$@"
