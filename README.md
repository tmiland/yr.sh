# yr.sh — Yr.no weather in your terminal

Fetch the forecast from yr.no (MET Norway) and print a clean dashboard, with desktop notifications for weather warnings.

## Features

- Current conditions: temperature (with feels-like), wind and gusts, humidity, pressure, UV
- Hourly forecast with weather icons, temperature, precipitation and rain probability
- Day separators (Today / Tomorrow / weekday)
- Active weather warnings from MET MetAlerts (Norway)
- Desktop notifications for new warnings (`notify-send`) with Yr warning icons, one-shot or as a systemd user service
- Automatic place lookup or explicit coordinates
- Local time, metric units
- Color when the output is a terminal (respects `NO_COLOR`); `--plain` for scripts
- Configurable forecast length (`--hours`) and cache bypass (`--no-cache`)

## Requirements

- Bash 4+
- curl, jq, awk
- GNU date (Linux)
- libnotify (`notify-send`) and zenity for notifications and the config dialog

## Install

```bash
./yr.sh --install Rjukan   # command + systemd user service
yr Oslo
```

`--install` symlinks the script to `~/.local/bin/yr`, saves the location to the config, installs `yr.service` and enables/starts it. Without a location argument it uses the existing config or opens the config dialog.

```bash
./yr.sh --uninstall        # remove command, service and config
```

## Configuration

```bash
yr -c
```

Opens a zenity form (falls back to terminal prompts without a display) for the location and poll interval. Config is stored at `~/.config/yr.sh/config`:

```text
# yr.sh configuration
location=Rjukan
interval=600
```

With no place argument, `yr` uses the configured location. Restart the service after changing the config:

```bash
systemctl --user restart yr.service
```

## Usage

```bash
yr Oslo                    # forecast for a place
yr 59.9139 10.7522         # forecast for coordinates
yr --hours 12 Bergen       # next 12 hours
yr --plain Oslo            # no icons or color (scripts)
yr -w                      # active warnings for the configured location
yr --notify Oslo           # print and desktop-notify warnings
yr -ar --interval 600 Oslo # manual warning monitor
yr --help
yr --version
```

## Warnings service

`--install` runs the warnings monitor as a systemd user service:

```bash
systemctl --user status yr.service
journalctl --user -u yr.service -f
systemctl --user restart yr.service
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
- Warning icons: [Yr warning icons](https://github.com/nrkno/yr-warning-icons) © 2015 Yr/NRK, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), vendored in `assets/warning-icons/` with the license text.
- Geocoding: [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api).

## License

MIT
