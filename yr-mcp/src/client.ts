import { parseCurrentConditions, type CurrentConditions } from "./lib/current.js";
import { parseGeocodeResponse, type GeocodedPlace } from "./lib/geocode.js";
import { parseHourlyForecast, type HourlyEntry } from "./lib/hourly.js";
import { parseSunMoon, type SunMoon } from "./lib/sunmoon.js";
import { hourlyUnits, responseUnits, type Units } from "./lib/units.js";
import { parseWarnings, type Warning } from "./lib/warnings.js";

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const TIMEZONE_URL = "https://api.open-meteo.com/v1/forecast";
const FORECAST_URL = "https://api.met.no/weatherapi/locationforecast/2.0/complete";
const SUN_URL = "https://api.met.no/weatherapi/sunrise/3.0/sun";
const MOON_URL = "https://api.met.no/weatherapi/sunrise/3.0/moon";
const ALERTS_URL = "https://api.met.no/weatherapi/metalerts/2.0/current.json";
const USER_AGENT = "yr-mcp/1.0 (https://github.com/tmiland/yr.sh)";

// The Sunrise 3.0 API rejects exact poles and the antimeridian with HTTP 422.
// Nudge those values by ~11 m / ~11 m so the request is still valid.
const SUN_MAX_LAT = 89.9999;
const SUN_MAX_LON = 179.9999;

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_CACHE_TTL_MS = 10 * 60_000;
const DEFAULT_MAX_CACHE_ENTRIES = 200;

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface ForecastResult<T> {
  data: T;
  units: Units;
}

export interface SunMoonResult {
  data: SunMoon;
  errors: string[];
}

export interface WeatherClientOptions {
  /** Per-request timeout. Defaults to 20 s, matching the CLI's --max-time 20. */
  timeoutMs?: number;
  /** Fallback TTL when the response has no usable Expires header. */
  cacheTtlMs?: number;
  /** Upper bound on cached responses; oldest entries are evicted first. */
  maxCacheEntries?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

interface CacheEntry {
  body: unknown;
  expiresAt: number;
  lastModified: string | null;
  etag: string | null;
}

class JsonCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly maxEntries: number,
    private readonly fallbackTtlMs: number
  ) {}

  get(url: string): CacheEntry | undefined {
    return this.entries.get(url);
  }

  isFresh(entry: CacheEntry, nowMs: number): boolean {
    return nowMs < entry.expiresAt;
  }

  touch(url: string): void {
    const entry = this.entries.get(url);
    if (!entry) return;
    this.entries.delete(url);
    this.entries.set(url, entry);
  }

  set(url: string, body: unknown, res: Response, nowMs: number): void {
    if (this.maxEntries <= 0) return;
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(url, {
      body,
      expiresAt: expiryOf(res, nowMs, this.fallbackTtlMs),
      lastModified: res.headers.get("last-modified"),
      etag: res.headers.get("etag"),
    });
  }

  refresh(url: string, res: Response, nowMs: number): void {
    const entry = this.entries.get(url);
    if (!entry) return;
    entry.expiresAt = expiryOf(res, nowMs, this.fallbackTtlMs);
    const lastModified = res.headers.get("last-modified");
    const etag = res.headers.get("etag");
    if (lastModified) entry.lastModified = lastModified;
    if (etag) entry.etag = etag;
    this.touch(url);
  }
}

function expiryOf(res: Response, nowMs: number, fallbackTtlMs: number): number {
  const expires = res.headers.get("expires");
  if (expires) {
    const parsed = Date.parse(expires);
    if (Number.isFinite(parsed)) return parsed;
  }
  return nowMs + fallbackTtlMs;
}

function fmt(n: number): string {
  return n.toFixed(4);
}

function clamp(n: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, n));
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class WeatherClient {
  private readonly fetchFn: FetchFn;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly cache: JsonCache;

  constructor(
    fetchFn: FetchFn = (url, init) => fetch(url, init),
    options: WeatherClientOptions = {}
  ) {
    this.fetchFn = fetchFn;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    this.cache = new JsonCache(
      options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES,
      options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
    );
  }

  private async getJson(url: string): Promise<unknown> {
    const nowMs = this.now();
    const cached = this.cache.get(url);
    if (cached && this.cache.isFresh(cached, nowMs)) {
      this.cache.touch(url);
      return cached.body;
    }

    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    };
    if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;
    if (cached?.etag) headers["If-None-Match"] = cached.etag;

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new Error(`request failed: ${url}: ${message(err)}`);
    }

    if (res.status === 304) {
      if (!cached) throw new Error(`HTTP 304 without a cached response from: ${url}`);
      this.cache.refresh(url, res, nowMs);
      return cached.body;
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from: ${url}`);
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      throw new Error(`invalid JSON from: ${url}: ${message(err)}`);
    }
    this.cache.set(url, body, res, nowMs);
    return body;
  }

  async geocode(place: string): Promise<GeocodedPlace> {
    const url = `${GEOCODE_URL}?name=${encodeURIComponent(place)}&count=1&language=en`;
    const body = await this.getJson(url);
    return parseGeocodeResponse(body);
  }

  async currentConditions(lat: number, lon: number): Promise<ForecastResult<CurrentConditions>> {
    const url = `${FORECAST_URL}?lat=${fmt(lat)}&lon=${fmt(lon)}`;
    const body = await this.getJson(url);
    return { data: parseCurrentConditions(body), units: responseUnits(body) };
  }

  async hourlyForecast(
    lat: number,
    lon: number,
    hours: number
  ): Promise<ForecastResult<HourlyEntry[]>> {
    const url = `${FORECAST_URL}?lat=${fmt(lat)}&lon=${fmt(lon)}`;
    const body = await this.getJson(url);
    return { data: parseHourlyForecast(body, hours), units: hourlyUnits(body) };
  }

  async resolveTimezone(lat: number, lon: number): Promise<string> {
    const url = `${TIMEZONE_URL}?latitude=${fmt(lat)}&longitude=${fmt(lon)}&timezone=auto&forecast_days=1`;
    const body = (await this.getJson(url)) as { timezone?: unknown };
    return typeof body?.timezone === "string" ? body.timezone : "";
  }

  async warnings(lat: number, lon: number): Promise<Warning[]> {
    const url = `${ALERTS_URL}?lat=${fmt(lat)}&lon=${fmt(lon)}&lang=en`;
    const body = await this.getJson(url);
    return parseWarnings(body);
  }

  async sunMoon(
    lat: number,
    lon: number,
    date: string,
    offset: string
  ): Promise<SunMoonResult> {
    const latR = fmt(clamp(lat, SUN_MAX_LAT));
    const lonR = fmt(clamp(lon, SUN_MAX_LON));
    const offsetEnc = encodeURIComponent(offset);
    const sunUrl = `${SUN_URL}?lat=${latR}&lon=${lonR}&date=${date}&offset=${offsetEnc}`;
    const moonUrl = `${MOON_URL}?lat=${latR}&lon=${lonR}&date=${date}&offset=${offsetEnc}`;

    const [sunResult, moonResult] = await Promise.allSettled([
      this.getJson(sunUrl),
      this.getJson(moonUrl),
    ]);

    const errors: string[] = [];
    const sunBody = sunResult.status === "fulfilled" ? sunResult.value : null;
    const moonBody = moonResult.status === "fulfilled" ? moonResult.value : null;
    if (sunResult.status === "rejected") errors.push(`sun: ${message(sunResult.reason)}`);
    if (moonResult.status === "rejected") errors.push(`moon: ${message(moonResult.reason)}`);
    if (sunBody === null && moonBody === null) {
      throw new Error(`sun and moon request failed: ${errors.join("; ")}`);
    }

    return { data: parseSunMoon(sunBody, moonBody), errors };
  }
}
