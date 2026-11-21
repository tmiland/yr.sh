import type { WeatherClient } from "./client.js";
import { localDate, utcOffset } from "./lib/localtime.js";
import { validateCoords } from "./lib/validate.js";
import type { CurrentConditions } from "./lib/current.js";
import type { HourlyEntry } from "./lib/hourly.js";
import type { SunMoon } from "./lib/sunmoon.js";
import type { Warning } from "./lib/warnings.js";

export interface ToolArgs {
  place?: string;
  lat?: number;
  lon?: number;
  hours?: number;
}

interface ResolvedLocation {
  lat: number;
  lon: number;
  name: string;
  timezone: string;
}

async function resolveLocation(client: WeatherClient, args: ToolArgs): Promise<ResolvedLocation> {
  if (args.place) {
    const place = await client.geocode(args.place);
    return { lat: place.lat, lon: place.lon, name: place.name, timezone: place.timezone };
  }
  if (args.lat === undefined && args.lon === undefined) {
    throw new Error("provide either a place name or latitude and longitude");
  }
  if (args.lat === undefined || args.lon === undefined) {
    throw new Error("provide latitude and longitude together");
  }
  const { lat, lon } = validateCoords(args.lat, args.lon);
  const timezone = await client.resolveTimezone(lat, lon).catch(() => "");
  return { lat, lon, name: `${lat.toFixed(2)}, ${lon.toFixed(2)}`, timezone };
}

export async function getCurrentConditions(client: WeatherClient, args: ToolArgs): Promise<CurrentConditions> {
  const loc = await resolveLocation(client, args);
  return client.currentConditions(loc.lat, loc.lon);
}

export async function getHourlyForecast(client: WeatherClient, args: ToolArgs): Promise<HourlyEntry[]> {
  const loc = await resolveLocation(client, args);
  const hours = args.hours ?? 6;
  return client.hourlyForecast(loc.lat, loc.lon, hours);
}

export async function getWarnings(client: WeatherClient, args: ToolArgs): Promise<Warning[]> {
  const loc = await resolveLocation(client, args);
  return client.warnings(loc.lat, loc.lon);
}

export async function getSunMoon(client: WeatherClient, args: ToolArgs): Promise<SunMoon> {
  const loc = await resolveLocation(client, args);
  const tz = loc.timezone || "UTC";
  const date = localDate(tz);
  const offset = utcOffset(tz, date);
  return client.sunMoon(loc.lat, loc.lon, date, offset);
}
