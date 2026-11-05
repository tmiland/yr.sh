#!/usr/bin/env bash
#
# yr.sh — weather forecast from yr.no (MET Norway) in your terminal.
#
# Usage:
#   ./weather.sh [OPTIONS] <place>
#   ./weather.sh [OPTIONS] <lat> <lon>
#
# Examples:
#   ./weather.sh Oslo
#   ./weather.sh 59.9139 10.7522
#   ./weather.sh --hours 12 Bergen

set -euo pipefail

readonly API_BASE="https://api.met.no/weatherapi/locationforecast/2.0/compact"
readonly GEOCODE_URL="https://geocoding-api.open-meteo.com/v1/search"
readonly USER_AGENT="yr.sh/1.0 (https://github.com/tommy/yr.sh)"
readonly VERSION="1.0.0"

HOURS=6

usage() {
    local prog
    prog=$(basename "$0")
    cat <<EOF
Usage:
  $prog [OPTIONS] <place>
  $prog [OPTIONS] <lat> <lon>

Options:
  -h, --help       Show this help and exit
  -v, --version    Show version and exit
  -n, --hours N    Hours of forecast to show (default: 6)

Examples:
  $prog Oslo
  $prog 59.9139 10.7522
  $prog --hours 12 Bergen
EOF
}

die() {
    echo "error: $*" >&2
    exit 1
}

require_deps() {
    local cmd
    for cmd in curl jq awk; do
        command -v "$cmd" >/dev/null 2>&1 || die "missing dependency: $cmd"
    done
}

urlencode() {
    jq -rn --arg v "$1" '$v | @uri'
}

is_number() {
    [[ $1 =~ ^-?[0-9]+([.][0-9]+)?$ ]]
}

validate_coords() {
    local lat=$1 lon=$2
    is_number "$lat" || die "latitude is not a number: $lat"
    is_number "$lon" || die "longitude is not a number: $lon"
    if ! awk -v lat="$lat" -v lon="$lon" \
        'BEGIN { exit !(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) }'; then
        die "coordinates out of range: $lat $lon"
    fi
}

# Fetch a URL and fail loudly on network or JSON errors.
fetch_json() {
    local url=$1 body
    if ! body=$(curl -fsS --max-time 20 -A "$USER_AGENT" "$url"); then
        die "request failed: $url"
    fi
    if ! jq -e . >/dev/null 2>&1 <<<"$body"; then
        die "invalid JSON from: $url"
    fi
    printf '%s' "$body"
}

# Print "lat<TAB>lon<TAB>name" for a place name.
geocode() {
    local query=$1 body lat lon name
    body=$(fetch_json "${GEOCODE_URL}?name=$(urlencode "$query")&count=1&language=en")
    lat=$(jq -r '.results[0].latitude // empty' <<<"$body")
    lon=$(jq -r '.results[0].longitude // empty' <<<"$body")
    [[ -n $lat && -n $lon ]] || die "location not found: $query"
    name=$(jq -r '.results[0] | if .country then "\(.name), \(.country)" else .name end' <<<"$body")
    printf '%s\t%s\t%s\n' "$lat" "$lon" "$name"
}

print_forecast() {
    local lat=$1 lon=$2 name=$3 body updated
    body=$(fetch_json "${API_BASE}?lat=${lat}&lon=${lon}")

    jq -e '.properties.timeseries | length > 0' >/dev/null <<<"$body" \
        || die "no forecast data returned"

    updated=$(jq -r '.properties.meta.updated_at' <<<"$body")

    if [[ -n $name ]]; then
        echo "Weather for ${name} (${lat}, ${lon})"
    else
        echo "Weather for ${lat}, ${lon}"
    fi
    echo "Updated: ${updated}"
    echo

    jq -r '
        .properties.timeseries[0].data.instant.details
        | "Now: \(.air_temperature) °C, wind \(.wind_speed) m/s from \(.wind_from_direction)°, humidity \(.relative_humidity)%, pressure \(.air_pressure_at_sea_level) hPa"
    ' <<<"$body"

    echo
    echo "Forecast (UTC):"
    jq -r --argjson hours "$HOURS" '
        .properties.timeseries[:$hours][]
        | [ .time[11:16],
            ( .data.next_1_hours.summary.symbol_code
              // .data.next_6_hours.summary.symbol_code
              // "unknown" ),
            ( .data.instant.details.air_temperature | tostring ),
            ( .data.next_1_hours.details.precipitation_amount // "–" | tostring )
          ] | @tsv
    ' <<<"$body" | while IFS=$'\t' read -r time symbol temp precip; do
        printf '  %s  %-18s %6s °C  %5s mm\n' "$time" "$symbol" "$temp" "$precip"
    done
}

main() {
    local -a args=()
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            -v|--version)
                echo "yr.sh ${VERSION}"
                exit 0
                ;;
            -n|--hours)
                [[ $# -ge 2 ]] || die "option $1 requires an argument"
                HOURS=$2
                shift 2
                ;;
            --hours=*)
                HOURS=${1#*=}
                shift
                ;;
            --)
                shift
                args+=("$@")
                break
                ;;
            -*)
                die "unknown option: $1 (try --help)"
                ;;
            *)
                args+=("$1")
                shift
                ;;
        esac
    done

    [[ $HOURS =~ ^[0-9]+$ ]] || die "--hours must be a positive integer"
    HOURS=$((10#$HOURS))
    (( HOURS > 0 )) || die "--hours must be a positive integer"

    case ${#args[@]} in
        1)
            local geo lat lon name
            geo=$(geocode "${args[0]}")
            IFS=$'\t' read -r lat lon name <<<"$geo"
            validate_coords "$lat" "$lon"
            print_forecast "$lat" "$lon" "$name"
            ;;
        2)
            validate_coords "${args[0]}" "${args[1]}"
            print_forecast "${args[0]}" "${args[1]}" ""
            ;;
        *)
            usage >&2
            exit 1
            ;;
    esac
}

require_deps
main "$@"
