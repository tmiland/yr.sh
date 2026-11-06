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
readonly ALERTS_URL="https://api.met.no/weatherapi/metalerts/2.0/current.json"
readonly GEOCODE_URL="https://geocoding-api.open-meteo.com/v1/search"
readonly USER_AGENT="yr.sh/1.4 (https://github.com/tmiland/yr.sh)"
readonly VERSION="1.4.0"
readonly RULE_LEN=48
readonly CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/yr.sh"
readonly CONFIG_FILE="${CONFIG_DIR}/config"
SCRIPT_DIR=$(cd -- "$(dirname -- "$(readlink -f "$0")")" && pwd)
readonly SCRIPT_DIR
readonly ICON_DIR="${SCRIPT_DIR}/assets/warning-icons"

HOURS=6
PLAIN=0
NO_CACHE=0
CACHE_KEY=""
WARN=0
NOTIFY=0
AUTO_RUN=0
INTERVAL=600
INTERVAL_SET=0
DO_CONFIG=0
DO_INSTALL=0
DO_UNINSTALL=0
CONFIG_LOCATION=""
CONFIG_INTERVAL=""

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
      --no-cache   Bypass the local cache
  -w, --warnings   Show active weather warnings and exit
      --notify     Desktop-notify active warnings and exit
  -ar, --auto-run  Poll for new warnings and desktop-notify
      --interval N Poll interval in seconds (default: $INTERVAL)
  -c, --config     Configure location and poll interval
  -i, --install    Install command and systemd user service
  -u, --uninstall  Remove command, service and config

With no place given, the configured location is used (see --config).

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

require_notify() {
    command -v notify-send >/dev/null 2>&1 \
        || die "missing dependency: notify-send (install libnotify-bin)"
}

# ---- config --------------------------------------------------------------
load_config() {
    CONFIG_LOCATION=""
    CONFIG_INTERVAL=""
    [[ -f $CONFIG_FILE ]] || return 0
    local line key value
    while IFS= read -r line || [[ -n $line ]]; do
        if [[ -z $line || $line == '#'* ]]; then
            continue
        fi
        key=${line%%=*}
        value=${line#*=}
        case $key in
            location) CONFIG_LOCATION=$value ;;
            interval) CONFIG_INTERVAL=$value ;;
        esac
    done < "$CONFIG_FILE"
}

write_config() {
    local location=$1 interval=$2
    mkdir -p "$CONFIG_DIR" || die "cannot create $CONFIG_DIR"
    {
        printf '# yr.sh configuration\n'
        printf 'location=%s\n' "$location"
        printf 'interval=%s\n' "$interval"
    } > "$CONFIG_FILE" || die "cannot write $CONFIG_FILE"
    echo "saved: $CONFIG_FILE"
}

config_dialog() {
    local location interval input_location input_interval output
    load_config
    location=$CONFIG_LOCATION
    interval=${CONFIG_INTERVAL:-$INTERVAL}

    if command -v zenity >/dev/null 2>&1 && [[ -n ${DISPLAY:-} ]]; then
        if ! output=$(zenity --forms --title="yr.sh Configuration" \
            --text="Weather location and warning poll interval" \
            --add-entry="Location (place or lat,lon) : (${location})" \
            --add-entry="Poll interval in seconds : (${interval})"); then
            echo "configuration cancelled" >&2
            return 0
        fi
        IFS='|' read -r input_location input_interval <<<"$output"
        if [[ -n $input_location ]]; then location=$input_location; fi
        if [[ -n $input_interval ]]; then interval=$input_interval; fi
    else
        read -rp "Location (place or lat,lon) [${location}]: " input_location
        if [[ -n $input_location ]]; then location=$input_location; fi
        read -rp "Poll interval in seconds [${interval}]: " input_interval
        if [[ -n $input_interval ]]; then interval=$input_interval; fi
    fi

    [[ -n $location ]] || die "location is required"
    [[ $interval =~ ^[0-9]+$ ]] || die "interval must be a positive integer"
    interval=$((10#$interval))
    (( interval > 0 )) || die "interval must be a positive integer"
    write_config "$location" "$interval"
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

# Fetch a URL and fail loudly on network, HTTP or JSON errors.
fetch_json() {
    local url=$1 body tmp status
    tmp=$(mktemp) || die "cannot create temp file"
    if ! status=$(curl -sS --compressed --max-time 20 -A "$USER_AGENT" \
        -o "$tmp" -w '%{http_code}' "$url"); then
        rm -f "$tmp"
        die "request failed: $url"
    fi
    case $status in
        200) ;;
        203) echo "warning: server reports this product as deprecated (HTTP 203)" >&2 ;;
        403) rm -f "$tmp"; die "HTTP 403 forbidden: $url" ;;
        429) rm -f "$tmp"; die "HTTP 429 rate limited: $url" ;;
        *) rm -f "$tmp"; die "HTTP $status from: $url" ;;
    esac
    body=$(cat "$tmp")
    rm -f "$tmp"
    if ! jq -e . >/dev/null 2>&1 <<<"$body"; then
        die "invalid JSON from: $url"
    fi
    printf '%s' "$body"
}

# Fetch a URL, honoring the server's Expires header via a local cache.
fetch_cached() {
    local url=$1 key=$2 body tmp hdr status exp exp_epoch now
    local cache file exp_file
    cache="${XDG_CACHE_HOME:-$HOME/.cache}/yr.sh"
    file="$cache/${key}.json"
    exp_file="$file.expires"

    if (( !NO_CACHE )) && [[ -s $file && -r $exp_file ]]; then
        now=$(date +%s)
        if exp_epoch=$(cat "$exp_file" 2>/dev/null) \
            && [[ $exp_epoch =~ ^[0-9]+$ ]] \
            && (( exp_epoch > now )); then
            cat "$file"
            return 0
        fi
    fi

    tmp=$(mktemp) || die "cannot create temp file"
    hdr=$(mktemp) || {
        rm -f "$tmp"
        die "cannot create temp file"
    }
    if ! status=$(curl -sS --compressed --max-time 20 -A "$USER_AGENT" \
        -D "$hdr" -o "$tmp" -w '%{http_code}' "$url"); then
        rm -f "$tmp" "$hdr"
        die "request failed: $url"
    fi
    case $status in
        200) ;;
        203) echo "warning: server reports this product as deprecated (HTTP 203)" >&2 ;;
        403) rm -f "$tmp" "$hdr"; die "HTTP 403 forbidden: $url" ;;
        429) rm -f "$tmp" "$hdr"; die "HTTP 429 rate limited: $url" ;;
        *) rm -f "$tmp" "$hdr"; die "HTTP $status from: $url" ;;
    esac
    body=$(cat "$tmp")
    if ! jq -e . >/dev/null 2>&1 <<<"$body"; then
        rm -f "$tmp" "$hdr"
        die "invalid JSON from: $url"
    fi

    if mkdir -p "$cache" 2>/dev/null; then
        exp=$(awk 'BEGIN { IGNORECASE = 1 }
            /^expires:/ { sub(/^expires:[[:space:]]*/, ""); sub(/\r$/, ""); print; exit }' "$hdr")
        if [[ -n $exp ]] && exp_epoch=$(date -d "$exp" +%s 2>/dev/null); then
            :
        else
            exp_epoch=$(( $(date +%s) + 1800 ))
        fi
        printf '%s' "$body" > "$file.tmp.$$" && mv -f "$file.tmp.$$" "$file"
        printf '%s\n' "$exp_epoch" > "$exp_file.tmp.$$" && mv -f "$exp_file.tmp.$$" "$exp_file"
    fi
    rm -f "$tmp" "$hdr"
    printf '%s' "$body"
}

# ---- warnings ------------------------------------------------------------
fetch_alerts() {
    local lat=$1 lon=$2 lat_req lon_req
    printf -v lat_req '%.4f' "$lat"
    printf -v lon_req '%.4f' "$lon"
    CACHE_KEY="${lat_req}_${lon_req}"
    fetch_cached "${ALERTS_URL}?lat=${lat_req}&lon=${lon_req}&lang=en" "alerts_${CACHE_KEY}"
}

# Map an alert to a Yr warning icon (type + risk color).
warning_icon() {
    local line=$1 type color base file
    type=$(jq -r '.properties.awareness_type // ""' <<<"$line")
    type=${type#*; }
    type=${type,,}
    color=$(jq -r '.properties.riskMatrixColor // "yellow"' <<<"$line")
    color=${color,,}
    case $type in
        avalanche*) base=avalanches ;;
        driving*conditions*) base=drivingconditions ;;
        flood) base=flood ;;
        forest*fire*) base=forestfire ;;
        gale|wind*) base=wind ;;
        ice|snow-ice) base=ice ;;
        landslide) base=landslide ;;
        lightning|thunder*) base=lightning ;;
        polar*low*) base=polarlow ;;
        rainflood|rain*flood*) base=rainflood ;;
        rain) base=rain ;;
        sleet|snow) base=snow ;;
        storm*surge*) base=stormsurge ;;
        *) base=generic ;;
    esac
    case $color in
        yellow|orange|red) ;;
        *) color=yellow ;;
    esac
    file="${ICON_DIR}/icon-warning-${base}-${color}.svg"
    if [[ -f $file ]]; then
        printf '%s' "$file"
    else
        printf '%s' "${ICON_DIR}/icon-warning-generic-yellow.svg"
    fi
}

# Convert to PNG once (if rsvg-convert exists) so notification daemons can show it.
warning_icon_png() {
    local svg=$1 name png
    name=$(basename "${svg%.svg}")
    png="${XDG_CACHE_HOME:-$HOME/.cache}/yr.sh/icons/${name}.png"
    if [[ -f $png ]]; then
        printf '%s' "$png"
        return 0
    fi
    if command -v rsvg-convert >/dev/null 2>&1; then
        if mkdir -p "$(dirname "$png")" 2>/dev/null \
            && rsvg-convert -w 96 -h 96 "$svg" -o "$png" 2>/dev/null; then
            printf '%s' "$png"
            return 0
        fi
    fi
    printf '%s' "$svg"
}

notify_alert() {
    local line=$1 name=$2 event area title desc severity urgency summary body icon
    event=$(jq -r '.properties.event // "weather warning"' <<<"$line")
    area=$(jq -r '.properties.area // ""' <<<"$line")
    title=$(jq -r '.properties.title // ""' <<<"$line")
    desc=$(jq -r '.properties.description // ""' <<<"$line")
    severity=$(jq -r '.properties.severity // ""' <<<"$line")

    urgency="normal"
    case $severity in
        Severe|Extreme) urgency="critical" ;;
    esac

    summary="Weather warning: ${event^}"
    [[ -n $area ]] && summary+=" — ${area}"
    body="$title"
    [[ -n $desc ]] && body+=$'\n\n'"$desc"

    icon=$(warning_icon "$line")
    if [[ -f $icon ]]; then
        icon=$(warning_icon_png "$icon")
    else
        icon="dialog-warning"
    fi

    if ! notify-send \
        --hint=string:sound-name:dialog-warning \
        --app-name="yr.sh" \
        --app-icon=dialog-warning-symbolic \
        --icon="$icon" \
        --urgency="$urgency" \
        "$summary" "$body"; then
        echo "warning: desktop notification failed" >&2
    fi
}

show_warnings() {
    local lat=$1 lon=$2 name=$3 mode=$4 body count line label lat_disp lon_disp
    label="$name"
    if [[ -z $label ]]; then
        printf -v lat_disp '%.2f' "$lat"
        printf -v lon_disp '%.2f' "$lon"
        label="$lat_disp, $lon_disp"
    fi
    body=$(fetch_alerts "$lat" "$lon")
    count=$(jq '.features | length' <<<"$body")

    if (( count == 0 )); then
        echo "No active weather warnings for ${label}."
        return 0
    fi

    echo "Weather warnings for ${label}:"
    local prefix="⚠"
    (( PLAIN )) && prefix="-"
    jq -r --arg prefix "$prefix" '
        .features[]
        | "  \($prefix)  \(.properties.title // .properties.event // "Weather warning")",
          (if (.properties.description // "") != ""
           then "     \(.properties.description | gsub("\n"; "\n     "))"
           else empty end),
          ""
    ' <<<"$body"

    if [[ $mode == notify ]]; then
        while IFS= read -r line; do
            [[ -n $line ]] || continue
            notify_alert "$line" "$name"
        done < <(jq -c '.features[]?' <<<"$body")
    fi
}

auto_run() {
    local lat=$1 lon=$2 name=$3
    local lat_req lon_req state_dir state_file body count line id new_count label
    label="$name"
    if [[ -z $label ]]; then
        local lat_disp lon_disp
        printf -v lat_disp '%.2f' "$lat"
        printf -v lon_disp '%.2f' "$lon"
        label="$lat_disp, $lon_disp"
    fi
    printf -v lat_req '%.4f' "$lat"
    printf -v lon_req '%.4f' "$lon"
    CACHE_KEY="${lat_req}_${lon_req}"
    state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/yr.sh"
    mkdir -p "$state_dir" || die "cannot create $state_dir"
    state_file="$state_dir/warnings_${CACHE_KEY}.seen"

    while true; do
        if ! body=$(fetch_alerts "$lat" "$lon"); then
            echo "warning: could not fetch weather warnings; retrying in ${INTERVAL}s" >&2
            sleep "$INTERVAL"
            continue
        fi
        count=$(jq '.features | length' <<<"$body")
        new_count=0

        if (( count > 0 )); then
            while IFS= read -r line; do
                [[ -n $line ]] || continue
                id=$(jq -r '.properties.id // empty' <<<"$line")
                [[ -n $id ]] || continue
                if ! grep -qxF "$id" "$state_file" 2>/dev/null; then
                    echo "New warning: $(jq -r '.properties.title // .properties.event // "weather warning"' <<<"$line")"
                    notify_alert "$line" "$name"
                    new_count=$((new_count + 1))
                fi
            done < <(jq -c '.features[]?' <<<"$body")
            jq -r '.features[].properties.id // empty' <<<"$body" > "$state_file.tmp.$$"
            mv -f "$state_file.tmp.$$" "$state_file"
        else
            : > "$state_file"
        fi

        if (( new_count > 0 )); then
            echo "Notified ${new_count} new warning(s) for ${label}. Waiting ${INTERVAL}s..."
        elif (( count > 0 )); then
            echo "No new warnings for ${label}. Waiting ${INTERVAL}s..."
        else
            echo "No active warnings for ${label}. Waiting ${INTERVAL}s..."
        fi
        sleep "$INTERVAL"
    done
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
    local lat_req lon_req sep rule rule_char header_meta
    printf -v lat_req '%.4f' "$lat"
    printf -v lon_req '%.4f' "$lon"
    CACHE_KEY="${lat_req}_${lon_req}"
    body=$(fetch_cached "${API_BASE}?lat=${lat_req}&lon=${lon_req}" "forecast_${CACHE_KEY}")

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

# ---- install -------------------------------------------------------------
install_self() {
    local src bin_dir dest unit_dir unit
    src=$(readlink -f "$0") || die "cannot resolve script path"
    bin_dir="${HOME}/.local/bin"
    dest="${bin_dir}/yr"
    unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
    unit="${unit_dir}/yr.service"

    load_config
    [[ -n $CONFIG_LOCATION ]] || die "no location configured; run $(basename "$0") --config"

    if [[ -e $dest && ! -L $dest ]]; then
        die "$dest exists and is not a symlink; refusing to overwrite"
    fi
    mkdir -p "$bin_dir" || die "cannot create $bin_dir"
    ln -sfn "$src" "$dest" || die "failed to create $dest"
    echo "installed: $dest -> $src"

    mkdir -p "$unit_dir" || die "cannot create $unit_dir"
    cat > "$unit" <<EOF || die "cannot write $unit"
[Unit]
Description=yr.sh weather warnings
PartOf=graphical-session.target
After=graphical-session.target

[Service]
Type=simple
Environment="DISPLAY=:0"
ExecStart=${dest} --auto-run
Restart=on-failure

[Install]
WantedBy=default.target
EOF

    if ! command -v notify-send >/dev/null 2>&1; then
        echo "warning: notify-send not found; install libnotify-bin" >&2
    fi

    systemctl --user daemon-reload || die "systemctl --user daemon-reload failed"
    systemctl --user enable yr.service || die "failed to enable yr.service"
    systemctl --user restart yr.service || die "failed to start yr.service"
    echo "enabled and started: yr.service (location: ${CONFIG_LOCATION})"
    if ! systemctl --user status yr.service --no-pager; then
        echo "note: could not read service status" >&2
    fi

    case ":$PATH:" in
        *":$bin_dir:"*) ;;
        *) echo "note: $bin_dir is not in PATH" >&2 ;;
    esac
}

uninstall_self() {
    local src dest unit_dir unit
    src=$(readlink -f "$0") || die "cannot resolve script path"
    dest="${HOME}/.local/bin/yr"
    unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
    unit="${unit_dir}/yr.service"

    if [[ -f $unit ]]; then
        if ! systemctl --user disable --now yr.service >/dev/null 2>&1; then
            echo "note: yr.service was not running" >&2
        fi
        rm -f "$unit" || die "failed to remove $unit"
        if ! systemctl --user daemon-reload >/dev/null 2>&1; then
            echo "note: systemctl --user daemon-reload failed" >&2
        fi
        echo "removed: yr.service"
    fi

    if [[ -L $dest ]]; then
        if [[ $(readlink -f "$dest") != "$src" ]]; then
            die "$dest points elsewhere; refusing to remove"
        fi
        rm -f "$dest" || die "failed to remove $dest"
        echo "removed: $dest"
    elif [[ -e $dest ]]; then
        die "$dest is not a symlink; refusing to remove"
    else
        echo "not installed: $dest"
    fi

    if [[ -f $CONFIG_FILE ]]; then
        rm -f "$CONFIG_FILE" || die "failed to remove $CONFIG_FILE"
        if ! rmdir "$CONFIG_DIR" 2>/dev/null; then
            echo "note: kept $CONFIG_DIR (not empty)" >&2
        fi
        echo "removed: $CONFIG_FILE"
    fi
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
            --no-cache)
                NO_CACHE=1
                shift
                ;;
            -w|--warnings)
                WARN=1
                shift
                ;;
            --notify)
                NOTIFY=1
                shift
                ;;
            -ar|--auto-run)
                AUTO_RUN=1
                shift
                ;;
            --interval)
                [[ $# -ge 2 ]] || die "option $1 requires an argument"
                INTERVAL=$2
                INTERVAL_SET=1
                shift 2
                ;;
            -c|--config)
                DO_CONFIG=1
                shift
                ;;
            -i|--install)
                DO_INSTALL=1
                shift
                ;;
            -u|--uninstall)
                DO_UNINSTALL=1
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

    load_config
    if (( !INTERVAL_SET )) && [[ -n $CONFIG_INTERVAL ]]; then
        INTERVAL=$CONFIG_INTERVAL
    fi

    [[ $HOURS =~ ^[0-9]+$ ]] || die "--hours must be a positive integer"
    HOURS=$((10#$HOURS))
    (( HOURS > 0 )) || die "--hours must be a positive integer"

    [[ $INTERVAL =~ ^[0-9]+$ ]] || die "--interval must be a positive integer"
    INTERVAL=$((10#$INTERVAL))
    (( INTERVAL > 0 )) || die "--interval must be a positive integer"

    if (( DO_UNINSTALL )); then
        uninstall_self
        exit 0
    fi
    if (( DO_CONFIG )); then
        config_dialog
        exit 0
    fi
    if (( DO_INSTALL )); then
        load_config
        if (( ${#args[@]} == 1 )); then
            CONFIG_LOCATION=${args[0]}
        elif (( ${#args[@]} == 2 )); then
            CONFIG_LOCATION="${args[0]},${args[1]}"
        fi
        if [[ -n $CONFIG_LOCATION ]]; then
            local cfg_interval=$INTERVAL
            if (( !INTERVAL_SET )) && [[ -n $CONFIG_INTERVAL ]]; then
                cfg_interval=$CONFIG_INTERVAL
            fi
            write_config "$CONFIG_LOCATION" "$cfg_interval"
        else
            echo "No location configured; starting configuration."
            config_dialog
            load_config
        fi
        [[ -n $CONFIG_LOCATION ]] || die "location is required"
        install_self
        exit 0
    fi

    require_deps
    init_color

    local lat="" lon="" name="" place=""
    if (( ${#args[@]} == 0 )); then
        if [[ -z $CONFIG_LOCATION ]]; then
            usage >&2
            exit 1
        fi
        if [[ $CONFIG_LOCATION == *,* ]]; then
            lat=${CONFIG_LOCATION%%,*}
            lon=${CONFIG_LOCATION#*,}
            lat=${lat//[[:space:]]/}
            lon=${lon//[[:space:]]/}
        else
            place=$CONFIG_LOCATION
        fi
    elif (( ${#args[@]} == 1 )); then
        if [[ ${args[0]} == *,* ]]; then
            lat=${args[0]%%,*}
            lon=${args[0]#*,}
            lat=${lat//[[:space:]]/}
            lon=${lon//[[:space:]]/}
        else
            place=${args[0]}
        fi
    elif (( ${#args[@]} == 2 )); then
        lat=${args[0]}
        lon=${args[1]}
    else
        usage >&2
        exit 1
    fi

    if [[ -n $place ]]; then
        local geo
        geo=$(geocode "$place")
        IFS=$'\t' read -r lat lon name <<<"$geo"
    fi
    validate_coords "$lat" "$lon"

    if (( AUTO_RUN )); then
        require_notify
        auto_run "$lat" "$lon" "$name"
    elif (( NOTIFY )); then
        require_notify
        show_warnings "$lat" "$lon" "$name" notify
    elif (( WARN )); then
        show_warnings "$lat" "$lon" "$name" print
    else
        print_forecast "$lat" "$lon" "$name"
    fi
}

main "$@"
