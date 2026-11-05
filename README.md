# yr.sh — Yr.no weather in your terminal

Fetch the forecast from yr.no (MET Norway) and print a readable summary.

## Features

- Current conditions: temperature, wind, humidity, pressure
- Hourly forecast with symbol and precipitation
- Place lookup by name (geocoded automatically) or explicit coordinates
- Configurable forecast length
- Metric units (°C, m/s, mm, hPa)

## Requirements

- Bash 4+
- curl
- jq

## Usage

```bash
# Forecast for a place (geocoded automatically)
./weather.sh Oslo

# Forecast for coordinates
./weather.sh 59.9139 10.7522

# Show the next 12 hours
./weather.sh --hours 12 Bergen

# Help and version
./weather.sh --help
./weather.sh --version
```

## Example output

```text
Weather for Oslo, Norway (59.91273, 10.74609)
Updated: 2026-11-05T19:30:32Z

Now: 3.6 °C, wind 1.1 m/s from 81.0°, humidity 84.3%, pressure 1033.5 hPa

Forecast (UTC):
  19:00  clearsky_night        3.6 °C    0.0 mm
  20:00  clearsky_night        3.2 °C    0.0 mm
```

## Data sources

- Forecast: [MET Norway Locationforecast 2.0](https://api.met.no/weatherapi/locationforecast/2.0/documentation) — the API behind yr.no
- Geocoding: [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)

## License

MIT
