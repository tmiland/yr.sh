import { conditionLabel } from "./weather.js";

export interface HourlyEntry {
  time: string;
  symbolCode: string;
  condition: string;
  temperature: number;
  precipitation: number | null;
  probabilityOfPrecipitation: number | null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// MET publishes probability_of_precipitation in percent; the tool contract is 0-1.
function fraction(v: unknown): number | null {
  const n = num(v);
  if (n === null) return null;
  return Math.min(1, Math.max(0, n / 100));
}

export function parseHourlyForecast(body: unknown, hours: number): HourlyEntry[] {
  if (!Number.isInteger(hours) || hours < 1) {
    throw new Error(`hours must be a positive integer: ${hours}`);
  }
  const props = (body as { properties?: Record<string, unknown> })?.properties;
  const series = props?.timeseries as unknown[] | undefined;
  if (!Array.isArray(series) || series.length === 0) {
    throw new Error("no forecast data returned");
  }
  const count = Math.min(hours, series.length);
  const rows: HourlyEntry[] = [];
  for (let i = 0; i < count; i++) {
    const t = series[i] as Record<string, unknown>;
    const data = (t?.data ?? {}) as Record<string, unknown>;
    const next1 = (data.next_1_hours ?? {}) as Record<string, unknown>;
    const next6 = (data.next_6_hours ?? {}) as Record<string, unknown>;
    const instant = (data.instant ?? {}) as Record<string, unknown>;
    const details = (instant.details ?? {}) as Record<string, unknown>;
    const next1Details = (next1.details ?? {}) as Record<string, unknown>;
    const symbolCode =
      ((next1.summary as Record<string, unknown> | undefined)?.symbol_code as string | undefined) ??
      ((next6.summary as Record<string, unknown> | undefined)?.symbol_code as string | undefined) ??
      "unknown";
    rows.push({
      time: typeof t.time === "string" ? t.time : "",
      symbolCode,
      condition: conditionLabel(symbolCode),
      temperature: num(details.air_temperature) ?? 0,
      precipitation: num(next1Details.precipitation_amount),
      probabilityOfPrecipitation: fraction(next1Details.probability_of_precipitation),
    });
  }
  return rows;
}
