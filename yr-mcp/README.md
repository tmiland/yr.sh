# yr-mcp

MCP server exposing MET Norway (yr.no) weather as typed tools for AI agents.

Sibling of the `yr.sh` terminal CLI — same data sources (MET Norway Locationforecast 2.0, Sunrise 3.0, MetAlerts 2.0, Open-Meteo geocoding/timezone), same 4-decimal coordinate truncation and 4-decimal caching discipline, but structured JSON in and out.

## Tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_current_conditions` | `place` or `lat`+`lon` | now panel: temperature, feels-like, wind, humidity, pressure, UV, condition |
| `get_hourly_forecast` | `place` or `lat`+`lon`, `hours` (default 6, max 48) | hourly entries: time, condition, temperature, precipitation, probability (0–1 fraction) |
| `get_warnings` | `place` or `lat`+`lon` | active MET Norway warnings (Norway only) |
| `get_sun_moon` | `place` or `lat`+`lon` | sunrise/sunset, daylight minutes, polar night/midnight sun, moon phase/illumination/rise/set |

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
