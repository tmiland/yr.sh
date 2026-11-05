# yr.sh — Yr.no weather in your terminal

Fetch the forecast from yr.no (MET Norway) and print a clean dashboard, with optional desktop notifications for weather warnings.

## Features

- Current conditions: temperature (with feels-like), wind and gusts, humidity, pressure, UV
- Hourly forecast with weather icons, temperature, precipitation and rain probability
- Day separators (Today / Tomorrow / weekday)
- Active weather warnings from MET MetAlerts (Norway)
- Desktop notifications for new warnings (`notify-send`), one-shot or auto-run
- Automatic place lookup or explicit coordinates
- Local time, metric units
- Color when the output is a terminal (respects `NO_COLOR`); `--plain` for scripts
- Configurable forecast length (`--hours`) and cache bypass (`--no-cache`)

## Requirements

- Bash 4+
- curl, jq, awk
- GNU date (Linux)
- libnotify (`notify-send`) for warning notifications

## Install

```bash
./yr.sh --install     # symlink to ~/.local/bin/yr
yr Oslo
./yr.sh --uninstall   # remove the symlink
```

## Usage

```bash
# Forecast for a place (geocoded automatically)
yr Oslo

# Forecast for coordinates
yr 59.9139 10.7522

# Show the next 12 hours
yr --hours 12 Bergen

# Script-friendly output (no icons or color)
yr --plain Oslo

# Help and version
yr --help
yr --version
```

## Warnings and notifications

```bash
yr -w Oslo                  # print active warnings
yr --notify Oslo            # print and send a desktop notification
yr -ar --interval 600 Oslo  # poll every 10 minutes, notify on new warnings
```

`-ar` runs until stopped. To keep it running, use a systemd user unit:

```ini
[Unit]
Description=yr.sh weather warnings
PartOf=graphical-session.target
After=graphical-session.target

[Service]
Type=simple
Environment="DISPLAY=:0"
ExecStart=%h/.local/bin/yr --auto-run Oslo
Restart=on-failure

[Install]
WantedBy=default.target
```

Save as `~/.config/systemd/user/yr-warnings.service`, then:

```bash
systemctl --user daemon-reload
systemctl --user enable --now yr-warnings.service
```

Warnings come from MET Norway's MetAlerts and cover Norway only.

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

## API compatibility

- Requests identify themselves with a contact URL in the User-Agent (MET requirement).
- Coordinates are truncated to 4 decimals, as required by MET.
- Forecast and alert responses are cached until the server's `Expires` header; `--no-cache` forces a refresh.
- HTTP 203 (deprecated product) prints a warning; 403/429 produce clear errors.
- Responses are requested with gzip compression.

Some fields (rain probability, wind gusts) are only published for parts of the world, mainly the Nordic area; elsewhere they show as `–`.

## Data sources and license

- Forecast and warnings: [MET Norway](https://www.met.no/) via [api.met.no](https://api.met.no/), the API behind yr.no. Data is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) and [NLOD](https://data.norge.no/nlod/en/2.0).
- Geocoding: [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api).

## License

MIT
