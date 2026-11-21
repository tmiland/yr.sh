import { conditionLabel } from "./weather.js";

export interface CurrentConditions {
  updatedAt: string;
  symbolCode: string;
  condition: string;
  temperature: number;
  feelsLike: number | null;
  windSpeed: number;
  windGust: number | null;
  windDirection: number | null;
  humidity: number;
  pressure: number;
  uv: number | null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function numOr(v: unknown, fallback: number): number {
  const n = num(v);
  return n === null ? fallback : n;
}

export function parseCurrentConditions(body: unknown): CurrentConditions {
  const props = (body as { properties?: Record<string, unknown> })?.properties;
  const series = props?.timeseries as unknown[] | undefined;
  if (!Array.isArray(series) || series.length === 0) {
    throw new Error("no forecast data returned");
  }
  const t = series[0] as Record<string, unknown>;
  const data = (t?.data ?? {}) as Record<string, unknown>;
  const next1 = (data.next_1_hours ?? {}) as Record<string, unknown>;
  const next6 = (data.next_6_hours ?? {}) as Record<string, unknown>;
  const instant = (data.instant ?? {}) as Record<string, unknown>;
  const details = (instant.details ?? {}) as Record<string, unknown>;
  const meta = (props?.meta ?? {}) as Record<string, unknown>;

  const symbolCode =
    ((next1.summary as Record<string, unknown> | undefined)?.symbol_code as string | undefined) ??
    ((next6.summary as Record<string, unknown> | undefined)?.symbol_code as string | undefined) ??
    "unknown";

  const temperature = numOr(details.air_temperature, 0);
  const feelsLike = num(details.apparent_air_temperature);
  const windSpeed = numOr(details.wind_speed, 0);
  const windGust = num(details.wind_speed_of_gust);
  const windDirection = num(details.wind_from_direction);
  const humidity = numOr(details.relative_humidity, 0);
  const pressure = numOr(details.air_pressure_at_sea_level, 0);
  const uv = num(details.ultraviolet_index_clear_sky);

  return {
    updatedAt: typeof meta.updated_at === "string" ? meta.updated_at : "unknown",
    symbolCode,
    condition: conditionLabel(symbolCode),
    temperature,
    feelsLike,
    windSpeed,
    windGust,
    windDirection,
    humidity,
    pressure,
    uv,
  };
}
