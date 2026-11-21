import { parseCurrentConditions, type CurrentConditions } from "./lib/current.js";
import { parseGeocodeResponse, type GeocodedPlace } from "./lib/geocode.js";
import { parseHourlyForecast, type HourlyEntry } from "./lib/hourly.js";
import { parseSunMoon, type SunMoon } from "./lib/sunmoon.js";
import { parseWarnings, type Warning } from "./lib/warnings.js";

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const TIMEZONE_URL = "https://api.open-meteo.com/v1/forecast";
const FORECAST_URL = "https://api.met.no/weatherapi/locationforecast/2.0/complete";
const SUN_URL = "https://api.met.no/weatherapi/sunrise/3.0/sun";
const MOON_URL = "https://api.met.no/weatherapi/sunrise/3.0/moon";
const ALERTS_URL = "https://api.met.no/weatherapi/metalerts/2.0/current.json";
const USER_AGENT = "yr-mcp/1.0 (https://github.com/tmiland/yr.sh)";

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

function fmt(n: number): string {
  return n.toFixed(4);
}

async function getJson(fetchFn: FetchFn, url: string): Promise<unknown> {
  const res = await fetchFn(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from: ${url}`);
  }
  return res.json();
}

export class WeatherClient {
  constructor(private readonly fetchFn: FetchFn = (url, init) => fetch(url, init)) {}

  async geocode(place: string): Promise<GeocodedPlace> {
    const url = `${GEOCODE_URL}?name=${encodeURIComponent(place)}&count=1&language=en`;
    const body = await getJson(this.fetchFn, url);
    return parseGeocodeResponse(body);
  }

  async currentConditions(lat: number, lon: number): Promise<CurrentConditions> {
    const url = `${FORECAST_URL}?lat=${fmt(lat)}&lon=${fmt(lon)}`;
    const body = await getJson(this.fetchFn, url);
    return parseCurrentConditions(body);
  }

  async hourlyForecast(lat: number, lon: number, hours: number): Promise<HourlyEntry[]> {
    const url = `${FORECAST_URL}?lat=${fmt(lat)}&lon=${fmt(lon)}`;
    const body = await getJson(this.fetchFn, url);
    return parseHourlyForecast(body, hours);
  }

  async resolveTimezone(lat: number, lon: number): Promise<string> {
    const url = `${TIMEZONE_URL}?latitude=${fmt(lat)}&longitude=${fmt(lon)}&timezone=auto&forecast_days=1`;
    const body = (await getJson(this.fetchFn, url)) as { timezone?: unknown };
    return typeof body?.timezone === "string" ? body.timezone : "";
  }

  async warnings(lat: number, lon: number): Promise<Warning[]> {
    const url = `${ALERTS_URL}?lat=${fmt(lat)}&lon=${fmt(lon)}&lang=en`;
    const body = await getJson(this.fetchFn, url);
    return parseWarnings(body);
  }

  async sunMoon(lat: number, lon: number, date: string, offset: string): Promise<SunMoon> {
    const latR = fmt(lat);
    const lonR = fmt(lon);
    const offsetEnc = encodeURIComponent(offset);
    const sunUrl = `${SUN_URL}?lat=${latR}&lon=${lonR}&date=${date}&offset=${offsetEnc}`;
    const moonUrl = `${MOON_URL}?lat=${latR}&lon=${lonR}&date=${date}&offset=${offsetEnc}`;
    const [sunBody, moonBody] = await Promise.all([
      getJson(this.fetchFn, sunUrl),
      getJson(this.fetchFn, moonUrl),
    ]);
    return parseSunMoon(sunBody, moonBody);
  }
}
