# yr-mcp

MCP server exposing MET Norway (yr.no) weather as typed tools for AI agents.

Sibling of the `yr.sh` terminal CLI — same data sources (MET Norway Locationforecast 2.0, Sunrise 3.0, MetAlerts 2.0, Open-Meteo geocoding/timezone), same 4-decimal coordinate truncation and a bounded, `Expires`-aware cache, but structured JSON in and out.

## Tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_current_conditions` | `place` or `lat`+`lon` | now panel: temperature, feels-like, wind, humidity, pressure, UV, condition |
| `get_hourly_forecast` | `place` or `lat`+`lon`, `hours` (default 6, max 48) | hourly entries: time, condition, temperature, precipitation, probability (0–1 fraction) |
| `get_warnings` | `place` or `lat`+`lon` | active MET Norway warnings (Norway only) |
| `get_sun_moon` | `place` or `lat`+`lon` | sunrise/sunset, daylight minutes, polar night/midnight sun, moon phase/illumination/rise/set |

## Response shape

Every tool returns an envelope so an agent can verify what it got and in which units:

```json
{
  "location": {
    "name": "Rjukan, Norway",
    "lat": 59.88,
    "lon": 8.59,
    "timezone": "Europe/Oslo"
  },
  "units": {
    "air_temperature": "celsius",
    "wind_speed": "m/s",
    "probability_of_precipitation": "fraction"
  },
  "data": {
    "time": "2026-11-21T10:00:00Z",
    "temperature": 0.3,
    "condition": "Fair"
  }
}
```

- `units` is MET's own `meta.units` map and is omitted where the source has none (`get_warnings`).
- `data.probabilityOfPrecipitation` is a **0–1 fraction**, converted from MET's percent value; `units.probability_of_precipitation` is relabelled to `fraction` accordingly.
- `get_current_conditions` includes `data.time`, the valid time of the observation/model step; `data.updatedAt` is the model run time.
- `get_sun_moon` adds `date` and `utcOffset`. If one of the two upstream calls fails it returns the available half with `"partial": true` and an `errors` array; if timezone lookup fails it uses UTC and sets `"timezoneFallback": true`.
- `place` and `lat`/`lon` are alternative inputs; `place` takes precedence if both are supplied.

Exact poles (`lat=±90`) and the antimeridian (`lon=±180`) are clamped by ~11 m for the Sunrise API, which rejects the exact values with HTTP 422.

## HTTP behavior

- 20-second timeout per request (matching `yr.sh --max-time 20`).
- In-memory cache keyed by the full request URL (coordinates are already 4-decimal), up to 200 entries.
- Fresh entries are reused until the server's `Expires` header, or 10 minutes when absent; expired entries are revalidated with `If-Modified-Since`/`If-None-Match` and HTTP 304 reuses the cached body.
- Network and JSON errors name the failing endpoint.

Requires Node.js 20 or newer.

## Install and run

```bash
npm install
npm run build
npm start
```

Speaks stdio. Example agent config:

```json
{
  "mcpServers": {
    "yr": {
      "command": "node",
      "args": ["/path/to/yr.sh/yr-mcp/dist/index.js"]
    }
  }
}
```

## Development

```bash
npm test          # vitest — offline, HTTP stubbed
npm run build     # tsc → dist/
```

Layout:

- `src/lib/` — pure parsing/validation helpers (no I/O)
- `src/client.ts` — HTTP layer (injectable fetch)
- `src/tools.ts` — tool handlers (location resolution + dispatch)
- `src/server.ts` — MCP wiring (registers the four tools)
- `src/index.ts` — stdio entry point
