# yr.sh — Yr.no Weather Shell Script

Fetch weather from yr.no directly from the terminal.

## Features

- Fetch current weather conditions
- Multi-day forecast support
- Location-based queries (city names or coordinates)
- Severe weather alerts
- Rain probability display

## Installation

```bash
cd ~/.github/yr.sh
chmod +x weather.sh
```

## Usage

```bash
# Fetch weather for Oslo
./weather.sh Oslo

# Fetch weather for coordinates
./weather.sh 59.9139 10.7522

# Show help
./weather.sh --help
```

## Requirements

- Bash 4+
- curl
- python3

## API Key

Optional: Set `YR_API_KEY` environment variable for extended features.

## License

MIT
