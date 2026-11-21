import type { WeatherClient } from "./client.js";
import { localDate, utcOffset } from "./lib/localtime.js";
import { validateCoords } from "./lib/validate.js";
import type { CurrentConditions } from "./lib/current.js";
import type { HourlyEntry } from "./lib/hourly.js";
import type { SunMoon } from "./lib/sunmoon.js";
import type { Units } from "./lib/units.js";
import type { Warning } from "./lib/warnings.js";

export interface ToolArgs {
  place?: string;
  lat?: number;
  lon?: number;
  hours?: number;
}

export interface ToolLocation {
  name: string;
  lat: number;
  lon: number;
  timezone: string | null;
}

export interface ToolEnvelope<T> {
  location: ToolLocation;
  units?: Units;
  date?: string;
  utcOffset?: string;
  timezoneFallback?: boolean;
  partial?: boolean;
  errors?: string[];
  data: T;
}

interface ResolvedLocation {
  lat: number;
  lon: number;
  name: string;
  timezone: string | null;
}

async function resolveLocation(client: WeatherClient, args: ToolArgs): Promise<ResolvedLocation> {
  if (args.place) {
    const place = await client.geocode(args.place);
    return {
      lat: place.lat,
      lon: place.lon,
      name: place.name,
      timezone: place.timezone || null,
    };
  }
  if (args.lat === undefined && args.lon === undefined) {
    throw new Error("provide either a place name or latitude and longitude");
  }
  if (args.lat === undefined || args.lon === undefined) {
    throw new Error("provide latitude and longitude together");
  }
  const { lat, lon } = validateCoords(args.lat, args.lon);
  return { lat, lon, name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, timezone: null };
}

export async function getCurrentConditions(
  client: WeatherClient,
  args: ToolArgs
): Promise<ToolEnvelope<CurrentConditions>> {
  const loc = await resolveLocation(client, args);
  const { data, units } = await client.currentConditions(loc.lat, loc.lon);
  return { location: loc, units, data };
}

export async function getHourlyForecast(
  client: WeatherClient,
  args: ToolArgs
): Promise<ToolEnvelope<HourlyEntry[]>> {
  const loc = await resolveLocation(client, args);
  const hours = args.hours ?? 6;
  const { data, units } = await client.hourlyForecast(loc.lat, loc.lon, hours);
  return { location: loc, units, data };
}

export async function getWarnings(
  client: WeatherClient,
  args: ToolArgs
): Promise<ToolEnvelope<Warning[]>> {
  const loc = await resolveLocation(client, args);
  const data = await client.warnings(loc.lat, loc.lon);
  return { location: loc, data };
}

export async function getSunMoon(
  client: WeatherClient,
  args: ToolArgs
): Promise<ToolEnvelope<SunMoon>> {
  const loc = await resolveLocation(client, args);

  let timezone = loc.timezone;
  let timezoneFallback = false;
  if (!timezone) {
    try {
      timezone = await client.resolveTimezone(loc.lat, loc.lon);
    } catch {
      timezone = "";
    }
    if (!timezone) {
      timezone = "UTC";
      timezoneFallback = true;
    }
  }

  const date = localDate(timezone);
  const offset = utcOffset(timezone, date);
  const { data, errors } = await client.sunMoon(loc.lat, loc.lon, date, offset);

  return {
    location: { ...loc, timezone },
    date,
    utcOffset: offset,
    ...(timezoneFallback ? { timezoneFallback: true } : {}),
    partial: errors.length > 0,
    ...(errors.length > 0 ? { errors } : {}),
    data,
  };
}
