# yr.sh — Yr.no weather in your terminal

Fetch the forecast from yr.no (MET Norway) and print a clean dashboard.

## Features

- Current conditions: temperature (with feels-like), wind and gusts, humidity, pressure, UV
- Hourly forecast with weather icons, temperature, precipitation and rain probability
- Day separators (Today / Tomorrow / weekday)
- Automatic place lookup or explicit coordinates
- Local time, metric units
- Color when the output is a terminal (respects `NO_COLOR`); `--plain` for scripts
- Configurable forecast length with `--hours`

## Requirements

- Bash 4+
- curl, jq, awk
- GNU date (Linux)

## Usage

```bash
# Forecast for a place (geocoded automatically)
./yr.sh Oslo

# Forecast for coordinates
./yr.sh 59.9139 10.7522

# Show the next 12 hours
./yr.sh --hours 12 Bergen

# Script-friendly output (no icons or color)
./yr.sh --plain Oslo

# Help and version
./yr.sh --help
./yr.sh --version
```

## Example output

```text
  Oslo, Norway · 59.91, 10.75 · updated 21:30
  ────────────────────────────────────────────────
  🌡  3.2 °C  (feels like 1.5 °C)
  💨  1.7 m/s from NE  · gust 2.3 m/s
  💧  84.6% humidity · 1034.2 hPa
  🌙  Clear · UV 0.0

  Today
  21:00  🌙  Clear                 3.2 °C     0.0 mm     0%
  22:00  🌙  Clear                 2.9 °C     0.0 mm     0%
  23:00  🌙  Clear                 2.6 °C     0.0 mm     0%

  Tomorrow
  00:00  🌙  Clear                 2.4 °C     0.0 mm     0%
```

## Data sources

- Forecast: [MET Norway Locationforecast 2.0](https://api.met.no/weatherapi/locationforecast/2.0/documentation) (`complete`) — the API behind yr.no
- Geocoding: [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)

Some fields (rain probability, wind gusts) are only published for parts of the world, mainly the Nordic area; elsewhere they show as `–`.

## License

MIT
