import { describe, expect, it } from "vitest";
import { WeatherClient, type FetchFn } from "../src/client.js";

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

const FORECAST_BODY = {
  properties: {
    meta: {
      updated_at: "2026-11-21T10:29:04Z",
      units: {
        air_temperature: "celsius",
        wind_speed: "m/s",
        probability_of_precipitation: "%",
      },
    },
    timeseries: [
      {
        time: "2026-11-21T10:00:00Z",
        data: {
          next_1_hours: {
            summary: { symbol_code: "fair_day" },
            details: { precipitation_amount: 0.0, probability_of_precipitation: 0.1 },
          },
          instant: {
            details: {
              air_temperature: 0.3,
              apparent_air_temperature: -0.5,
              wind_speed: 0.5,
              wind_speed_of_gust: 6.5,
              wind_from_direction: 283.0,
              relative_humidity: 67.1,
              air_pressure_at_sea_level: 1007.8,
              ultraviolet_index_clear_sky: 0.2,
            },
          },
        },
      },
    ],
  },
};

const GEOCODE_BODY = {
  results: [
    { latitude: 59.88, longitude: 8.59, name: "Rjukan", country: "Norway", timezone: "Europe/Oslo" },
  ],
};

const SUN_BODY = {
  properties: {
    sunrise: { time: "2026-11-21T08:37+01:00" },
    sunset: { time: "2026-11-21T15:45+01:00" },
    solarnoon: { disc_centre_elevation: 10.15 },
  },
};

const MOON_BODY = {
  properties: {
    moonphase: 131.16,
    moonrise: { time: "2026-11-21T14:08+01:00" },
    moonset: { time: "2026-11-21T03:58+01:00" },
  },
};

const ALERTS_BODY = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        title: "TEST Risk of high forest fires",
        description: "TEST TEST TEST",
        event: "forestFire",
        awareness_type: "8; forest-fire",
        riskMatrixColor: "Yellow",
        area: "Trøndelag",
        status: "Test",
      },
    },
  ],
};

function stubFetch(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const fetchFn = async (url: string) => {
    calls.push(url);
    for (const [pattern, body] of Object.entries(routes)) {
      if (url.includes(pattern)) return jsonResponse(body);
    }
    return new Response("not found", { status: 404 });
  };
  return { fetchFn, calls };
}

describe("WeatherClient", () => {
  it("geocodes a place and parses the result", async () => {
    const { fetchFn, calls } = stubFetch({ "geocoding-api.open-meteo.com": GEOCODE_BODY });
    const client = new WeatherClient(fetchFn);
    const place = await client.geocode("Rjukan");
    expect(place).toEqual({ lat: 59.88, lon: 8.59, name: "Rjukan, Norway", timezone: "Europe/Oslo" });
    expect(calls[0]).toContain("name=Rjukan");
  });

  it("fetches current conditions from the MET forecast endpoint", async () => {
    const { fetchFn, calls } = stubFetch({ "locationforecast/2.0/complete": FORECAST_BODY });
    const client = new WeatherClient(fetchFn);
    const { data: c, units } = await client.currentConditions(59.88, 8.59);
    expect(c.temperature).toBe(0.3);
    expect(c.condition).toBe("Fair");
    expect(c.time).toBe("2026-11-21T10:00:00Z");
    expect(units.air_temperature).toBe("celsius");
    expect(calls[0]).toContain("lat=59.8800");
    expect(calls[0]).toContain("lon=8.5900");
  });

  it("fetches hourly forecast with the requested hours", async () => {
    const { fetchFn } = stubFetch({ "locationforecast/2.0/complete": FORECAST_BODY });
    const client = new WeatherClient(fetchFn);
    const { data: rows, units } = await client.hourlyForecast(59.88, 8.59, 6);
    expect(rows).toHaveLength(1);
    expect(rows[0].time).toBe("2026-11-21T10:00:00Z");
    expect(units.probability_of_precipitation).toBe("%");
  });

  it("fetches warnings from the MET alerts endpoint", async () => {
    const { fetchFn, calls } = stubFetch({ "metalerts/2.0/current.json": ALERTS_BODY });
    const client = new WeatherClient(fetchFn);
    const warnings = await client.warnings(59.88, 8.59);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].riskColor).toBe("yellow");
    expect(calls[0]).toContain("lang=en");
  });

  it("fetches sun and moon for the given date and offset", async () => {
    const { fetchFn, calls } = stubFetch({
      "sunrise/3.0/sun": SUN_BODY,
      "sunrise/3.0/moon": MOON_BODY,
    });
    const client = new WeatherClient(fetchFn);
    const { data: sun } = await client.sunMoon(59.88, 8.59, "2026-11-21", "+01:00");
    expect(sun.sunrise).toBe("08:37");
    expect(sun.moonPhase).toBe("Waxing gibbous");
    expect(calls.some((u) => u.includes("date=2026-11-21"))).toBe(true);
    expect(calls.some((u) => u.includes("offset=%2B01%3A00"))).toBe(true);
  });

  it("resolves the timezone for coordinates", async () => {
    const { fetchFn, calls } = stubFetch({
      "api.open-meteo.com/v1/forecast": { timezone: "Europe/Oslo" },
    });
    const client = new WeatherClient(fetchFn);
    const tz = await client.resolveTimezone(59.88, 8.59);
    expect(tz).toBe("Europe/Oslo");
    expect(calls[0]).toContain("timezone=auto");
    expect(calls[0]).toContain("latitude=59.8800");
  });

  it("throws on HTTP errors", async () => {
    const client = new WeatherClient(async () => new Response("boom", { status: 500 }));
    await expect(client.currentConditions(59.88, 8.59)).rejects.toThrow(/500/);
  });
});

describe("WeatherClient caching", () => {
  it("reuses a fresh response for identical requests", async () => {
    let calls = 0;
    const client = new WeatherClient(async () => {
      calls++;
      return jsonResponse(FORECAST_BODY);
    });
    await client.currentConditions(59.88, 8.59);
    await client.currentConditions(59.88, 8.59);
    expect(calls).toBe(1);
  });

  it("revalidates an expired entry with If-Modified-Since and reuses the 304 body", async () => {
    let calls = 0;
    let now = 0;
    const seen: RequestInit[] = [];
    const fetchFn: FetchFn = async (_url, init) => {
      seen.push(init ?? {});
      calls++;
      if (calls === 1) {
        return jsonResponse(FORECAST_BODY, 200, {
          "Last-Modified": "Fri, 21 Nov 2026 10:00:00 GMT",
        });
      }
      return new Response(null, { status: 304 });
    };
    const client = new WeatherClient(fetchFn, { cacheTtlMs: 1000, now: () => now });
    const first = await client.currentConditions(59.88, 8.59);
    now = 5000;
    const second = await client.currentConditions(59.88, 8.59);
    expect(calls).toBe(2);
    expect(second.data).toEqual(first.data);
    expect(seen[1].headers).toMatchObject({
      "If-Modified-Since": "Fri, 21 Nov 2026 10:00:00 GMT",
    });
  });
});

describe("WeatherClient timeouts", () => {
  it("aborts a stalled request and names the endpoint", async () => {
    const fetchFn: FetchFn = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    const client = new WeatherClient(fetchFn, { timeoutMs: 20 });
    await expect(client.currentConditions(59.88, 8.59)).rejects.toThrow(
      /request failed: .*locationforecast/
    );
  });
});

describe("WeatherClient sun and moon", () => {
  it("returns partial data when one endpoint fails", async () => {
    const client = new WeatherClient(async (url) =>
      url.includes("/moon") ? new Response("boom", { status: 500 }) : jsonResponse(SUN_BODY)
    );
    const { data, errors } = await client.sunMoon(59.88, 8.59, "2026-11-21", "+01:00");
    expect(data.sunrise).toBe("08:37");
    expect(data.polarNight).toBe(false);
    expect(data.moonPhase).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/500/);
  });

  it("throws when both endpoints fail", async () => {
    const client = new WeatherClient(async () => new Response("boom", { status: 500 }));
    await expect(
      client.sunMoon(59.88, 8.59, "2026-11-21", "+01:00")
    ).rejects.toThrow(/sun and moon/i);
  });

  it("clamps exact poles and the antimeridian for the sunrise API", async () => {
    const urls: string[] = [];
    const client = new WeatherClient(async (url) => {
      urls.push(url);
      return jsonResponse(url.includes("/moon") ? MOON_BODY : SUN_BODY);
    });
    await client.sunMoon(90, 180, "2026-11-21", "+00:00");
    await client.sunMoon(-90, -180, "2026-11-21", "+00:00");
    expect(urls).toHaveLength(4);
    expect(urls.every((u) => u.includes("lat=89.9999") || u.includes("lat=-89.9999"))).toBe(true);
    expect(urls.every((u) => u.includes("lon=179.9999") || u.includes("lon=-179.9999"))).toBe(true);
  });
});
