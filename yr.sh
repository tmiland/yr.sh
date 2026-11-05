#!/usr/bin/env bash
#
# yr.sh — weather forecast from yr.no (MET Norway) in your terminal.
#
# Usage:
#   ./yr.sh [OPTIONS] <place>
#   ./yr.sh [OPTIONS] <lat> <lon>
#
# Examples:
#   ./yr.sh Oslo
#   ./yr.sh 59.9139 10.7522
#   ./yr.sh --hours 12 Bergen

set -euo pipefail
export LC_NUMERIC=C

readonly API_BASE="https://api.met.no/weatherapi/locationforecast/2.0/complete"
readonly GEOCODE_URL="https://geocoding-api.open-meteo.com/v1/search"
readonly USER_AGENT="yr.sh/1.1 (https://github.com/tommy/yr.sh)"
readonly VERSION="1.1.0"
readonly RULE_LEN=48

HOURS=6
PLAIN=0

BOLD=""
DIM=""
RESET=""
C_BLUE=""
C_CYAN=""
C_GREEN=""
C_YELLOW=""
C_ORANGE=""
C_RED=""

# ---- helpers -------------------------------------------------------------
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
  -n, --hours N    Hours of forecast to show (default: $HOURS)
      --plain      No icons or color (script-friendly)

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
    for cmd in curl jq awk date; do
        command -v "$cmd" >/dev/null 2>&1 || die "missing dependency: $cmd"
    done
}

init_color() {
    if (( !PLAIN )) && [[ -t 1 && -z ${NO_COLOR:-} && ${TERM:-} != dumb ]]; then
        BOLD=$'\033[1m'
        DIM=$'\033[2m'
        RESET=$'\033[0m'
        C_BLUE=$'\033[38;5;45m'
        C_CYAN=$'\033[38;5;51m'
        C_GREEN=$'\033[38;5;47m'
        C_YELLOW=$'\033[38;5;226m'
        C_ORANGE=$'\033[38;5;214m'
        C_RED=$'\033[38;5;196m'
    fi
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

# ---- presentation --------------------------------------------------------
symbol_base() {
    local code=$1
    code=${code%_day}
    code=${code%_night}
    code=${code%_polartwilight}
    printf '%s' "$code"
}

symbol_suffix() {
    case $1 in
        *_day) printf 'day' ;;
        *_night) printf 'night' ;;
        *_polartwilight) printf 'twilight' ;;
        *) printf '' ;;
    esac
}

weather_icon() {
    local base suffix
    base=$(symbol_base "$1")
    suffix=$(symbol_suffix "$1")
    case $base in
        *thunder*) printf '⛈️' ;;
        clearsky)
            if [[ $suffix == night ]]; then printf '🌙'; else printf '☀️'; fi
            ;;
        fair)
            if [[ $suffix == night ]]; then printf '🌙'; else printf '🌤️'; fi
            ;;
        partlycloudy)
            if [[ $suffix == night ]]; then printf '☁️'; else printf '⛅'; fi
            ;;
        cloudy) printf '☁️' ;;
        fog) printf '🌫️' ;;
        lightrain|lightrainshowers) printf '🌦️' ;;
        *rain*) printf '🌧️' ;;
        *sleet*) printf '🌨️' ;;
        *snow*) printf '❄️' ;;
        *) printf '🌥️' ;;
    esac
}

weather_label() {
    local base
    base=$(symbol_base "$1")
    case $base in
        *thunder*) printf 'Thunderstorm' ;;
        clearsky) printf 'Clear' ;;
        fair) printf 'Fair' ;;
        partlycloudy) printf 'Partly cloudy' ;;
        cloudy) printf 'Cloudy' ;;
        fog) printf 'Fog' ;;
        lightrain) printf 'Light rain' ;;
        lightrainshowers) printf 'Light showers' ;;
        rain) printf 'Rain' ;;
        rainshowers) printf 'Rain showers' ;;
        heavyrain) printf 'Heavy rain' ;;
        heavyrainshowers) printf 'Heavy showers' ;;
        lightsleet) printf 'Light sleet' ;;
        sleet) printf 'Sleet' ;;
        sleetshowers) printf 'Sleet showers' ;;
        lightsnow) printf 'Light snow' ;;
        lightsnowshowers) printf 'Light snow showers' ;;
        snow) printf 'Snow' ;;
        snowshowers) printf 'Snow showers' ;;
        heavysnow) printf 'Heavy snow' ;;
        heavysnowshowers) printf 'Heavy snow showers' ;;
        *) printf '%s' "${base//_/ }" ;;
    esac
}

temp_color() {
    awk -v t="$1" -v blue="$C_BLUE" -v cyan="$C_CYAN" -v green="$C_GREEN" \
        -v yellow="$C_YELLOW" -v orange="$C_ORANGE" -v red="$C_RED" 'BEGIN {
            if (t < 0) print blue
            else if (t < 10) print cyan
            else if (t < 20) print green
            else if (t < 25) print yellow
            else if (t < 30) print orange
            else print red
        }'
}

wind_compass() {
    local deg=${1:-0}
    deg=${deg%.*}
    [[ $deg =~ ^-?[0-9]+$ ]] || deg=0
    (( deg = ((deg % 360) + 360) % 360 ))
    if (( deg < 23 || deg >= 338 )); then printf 'N'
    elif (( deg < 68 )); then printf 'NE'
    elif (( deg < 113 )); then printf 'E'
    elif (( deg < 158 )); then printf 'SE'
    elif (( deg < 203 )); then printf 'S'
    elif (( deg < 248 )); then printf 'SW'
    elif (( deg < 293 )); then printf 'W'
    else printf 'NW'
    fi
}

day_label() {
    local d=$1 today tomorrow
    today=$(date +%F)
    tomorrow=$(date -d tomorrow +%F)
    if [[ $d == "$today" ]]; then
        printf 'Today'
    elif [[ $d == "$tomorrow" ]]; then
        printf 'Tomorrow'
    else
        date -d "$d" +'%A %d %b'
    fi
}

print_forecast() {
    local lat=$1 lon=$2 name=$3 body updated_local lat_disp lon_disp
    local sep rule rule_char header_meta
    body=$(fetch_json "${API_BASE}?lat=${lat}&lon=${lon}")

    jq -e '.properties.timeseries | length > 0' >/dev/null <<<"$body" \
        || die "no forecast data returned"

    local -a now=()
    mapfile -t now < <(jq -r '
        .properties as $p
        | $p.timeseries[0] as $t
        | [ ($p.meta.updated_at // "unknown"),
            ($t.data.next_1_hours.summary.symbol_code
             // $t.data.next_6_hours.summary.symbol_code
             // "unknown"),
            $t.data.instant.details.air_temperature,
            ($t.data.instant.details.apparent_air_temperature // ""),
            $t.data.instant.details.wind_speed,
            ($t.data.instant.details.wind_speed_of_gust // ""),
            ($t.data.instant.details.wind_from_direction // ""),
            $t.data.instant.details.relative_humidity,
            $t.data.instant.details.air_pressure_at_sea_level,
            ($t.data.instant.details.ultraviolet_index_clear_sky // "")
          ][]
    ' <<<"$body")
    (( ${#now[@]} >= 10 )) || die "unexpected API response"

    local updated=${now[0]} symbol=${now[1]} temp=${now[2]} feels=${now[3]}
    local wind=${now[4]} gust=${now[5]} dir=${now[6]} humidity=${now[7]}
    local pressure=${now[8]} uv=${now[9]}

    updated_local=$(date -d "$updated" +"%H:%M" 2>/dev/null || printf '%s' "$updated")
    printf -v lat_disp '%.2f' "$lat"
    printf -v lon_disp '%.2f' "$lon"

    sep="·"
    rule_char="─"
    if (( PLAIN )); then
        sep="-"
        rule_char="-"
    fi

    header_meta="$lat_disp, $lon_disp $sep updated $updated_local"
    echo
    if [[ -n $name ]]; then
        printf '  %s%s%s %s%s %s%s\n' \
            "$BOLD" "$name" "$RESET" "$DIM" "$sep" "$header_meta" "$RESET"
    else
        printf '  %s%s%s\n' "$DIM" "$header_meta" "$RESET"
    fi

    printf -v rule '%*s' "$RULE_LEN" ''
    rule=${rule// /$rule_char}
    printf '  %s%s%s\n' "$DIM" "$rule" "$RESET"

    local ico_temp="" ico_wind="" ico_hum=""
    if (( !PLAIN )); then
        ico_temp="🌡  "
        ico_wind="💨  "
        ico_hum="💧  "
    fi

    local tcol
    tcol=$(temp_color "$temp")
    printf '  %s%s%s °C%s' "$ico_temp" "$tcol" "$temp" "$RESET"
    if [[ -n $feels ]]; then
        printf '  %s(feels like %s °C)%s' "$DIM" "$feels" "$RESET"
    fi
    printf '\n'

    printf '  %s%s m/s from %s' "$ico_wind" "$wind" "$(wind_compass "$dir")"
    if [[ -n $gust ]]; then
        printf '  %s%s gust %s m/s%s' "$DIM" "$sep" "$gust" "$RESET"
    fi
    printf '\n'

    printf '  %s%s%% %shumidity%s %s%s %s hPa%s\n' \
        "$ico_hum" "$humidity" "$DIM" "$RESET" "$DIM" "$sep" "$pressure" "$RESET"

    local cond_icon cond_label
    cond_icon=$(weather_icon "$symbol")
    cond_label=$(weather_label "$symbol")
    if (( PLAIN )); then
        if [[ -n $uv ]]; then
            printf '  %s %s UV %s\n' "$cond_label" "$sep" "$uv"
        else
            printf '  %s\n' "$cond_label"
        fi
    else
        if [[ -n $uv ]]; then
            printf '  %s  %s %s UV %s\n' "$cond_icon" "$cond_label" "$sep" "$uv"
        else
            printf '  %s  %s\n' "$cond_icon" "$cond_label"
        fi
    fi

    local current_day="" row_iso row_symbol row_temp row_precip row_prob
    local row_day row_time row_icon row_label row_col
    while IFS=$'\t' read -r row_iso row_symbol row_temp row_precip row_prob; do
        read -r row_day row_time <<<"$(date -d "$row_iso" +'%F %H:%M' 2>/dev/null \
            || printf '%s %s' "${row_iso%%T*}" "${row_iso:11:5}")"
        if [[ $row_day != "$current_day" ]]; then
            current_day=$row_day
            echo
            printf '  %s%s%s\n' "$BOLD" "$(day_label "$row_day")" "$RESET"
        fi
        row_icon=$(weather_icon "$row_symbol")
        row_label=$(weather_label "$row_symbol")
        row_col=$(temp_color "$row_temp")
        if (( PLAIN )); then
            printf '  %s  %-18s %6s °C  %6s mm  %6s\n' \
                "$row_time" "$row_label" "$row_temp" "$row_precip" "$row_prob"
        else
            printf '  %s  %s  %-18s %s%6s °C%s  %6s mm  %6s\n' \
                "$row_time" "$row_icon" "$row_label" "$row_col" "$row_temp" \
                "$RESET" "$row_precip" "$row_prob"
        fi
    done < <(jq -r --argjson hours "$HOURS" '
        .properties.timeseries[:$hours][]
        | [ .time,
            ( .data.next_1_hours.summary.symbol_code
              // .data.next_6_hours.summary.symbol_code
              // "unknown" ),
            ( .data.instant.details.air_temperature | tostring ),
            ( .data.next_1_hours.details.precipitation_amount // "–" | tostring ),
            ( .data.next_1_hours.details.probability_of_precipitation
              | if . == null then "–" else "\(round)%" end )
          ] | @tsv
    ' <<<"$body")
}

# ---- main ----------------------------------------------------------------
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
            --plain)
                PLAIN=1
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

    init_color

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
