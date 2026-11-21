import { describe, expect, it, vi } from "vitest";
import {
  getCurrentConditions,
  getHourlyForecast,
  getSunMoon,
  getWarnings,
} from "../src/tools.js";
import type { WeatherClient } from "../src/client.js";

function stubClient(overrides: Record<string, unknown> = {}): WeatherClient {
  return {
    geocode: vi.fn(async () => ({ lat: 59.88, lon: 8.59, name: "Rjukan, Norway", timezone: "Europe/Oslo" })),
    resolveTimezone: vi.fn(async () => "Europe/Oslo"),
    currentConditions: vi.fn(async () => ({
      updatedAt: "2026-11-21T10:29:04Z",
      symbolCode: "fair_day",
      condition: "Fair",
      temperature: 0.3,
      feelsLike: -0.5,
      windSpeed: 0.5,
      windGust: 6.5,
      windDirection: 283.0,
      humidity: 67.1,
      pressure: 1007.8,
      uv: 0.2,
    })),
    hourlyForecast: vi.fn(async (_lat: number, _lon: number, hours: number) => [
      { time: "2026-11-21T11:00:00Z", symbolCode: "fair_day", condition: "Fair", temperature: 0.5, precipitation: 0.0, probabilityOfPrecipitation: 0.0 },
    ]),
    warnings: vi.fn(async () => [
      { title: "TEST", description: "TEST", event: "forestFire", awarenessType: "forest-fire", riskColor: "yellow", severity: "Severe", certainty: "Possible", area: "Trøndelag", expires: null, status: "Test" },
    ]),
    sunMoon: vi.fn(async () => ({
      sunrise: "08:37",
      sunset: "15:45",
      daylightMinutes: 428,
      polarNight: false,
      midnightSun: false,
      moonPhaseAngle: 131.16,
      moonPhase: "Waxing gibbous",
      moonIllumination: 83,
      moonrise: "14:08",
      moonset: "03:58",
    })),
    ...overrides,
  } as unknown as WeatherClient;
}

describe("getCurrentConditions", () => {
  it("resolves a place via geocoding", async () => {
    const client = stubClient();
    const result = await getCurrentConditions(client, { place: "Rjukan" });
    expect(client.geocode).toHaveBeenCalledWith("Rjukan");
    expect(client.currentConditions).toHaveBeenCalledWith(59.88, 8.59);
    expect(result.temperature).toBe(0.3);
  });

  it("uses coordinates directly", async () => {
    const client = stubClient();
    const result = await getCurrentConditions(client, { lat: 59.88, lon: 8.59 });
    expect(client.geocode).not.toHaveBeenCalled();
    expect(client.currentConditions).toHaveBeenCalledWith(59.88, 8.59);
    expect(result.condition).toBe("Fair");
  });

  it("throws when neither place nor coordinates are given", async () => {
    const client = stubClient();
    await expect(getCurrentConditions(client, {})).rejects.toThrow(/place|coordinates/i);
  });

  it("throws when only one coordinate is given", async () => {
    const client = stubClient();
    await expect(getCurrentConditions(client, { lat: 59.88 })).rejects.toThrow(/latitude and longitude/i);
  });
});

describe("getHourlyForecast", () => {
  it("defaults to 6 hours", async () => {
    const client = stubClient();
    await getHourlyForecast(client, { lat: 59.88, lon: 8.59 });
    expect(client.hourlyForecast).toHaveBeenCalledWith(59.88, 8.59, 6);
  });

  it("passes the requested hours through", async () => {
    const client = stubClient();
    await getHourlyForecast(client, { lat: 59.88, lon: 8.59, hours: 12 });
    expect(client.hourlyForecast).toHaveBeenCalledWith(59.88, 8.59, 12);
  });
});

describe("getWarnings", () => {
  it("returns warnings for coordinates", async () => {
    const client = stubClient();
    const warnings = await getWarnings(client, { lat: 59.88, lon: 8.59 });
    expect(warnings).toHaveLength(1);
  });
});

describe("getSunMoon", () => {
  it("resolves timezone, date and offset for a place", async () => {
    const client = stubClient();
    const result = await getSunMoon(client, { place: "Rjukan" });
    expect(client.geocode).toHaveBeenCalledWith("Rjukan");
    expect(client.sunMoon).toHaveBeenCalledWith(59.88, 8.59, expect.any(String), expect.any(String));
    const [, , date, offset] = (client.sunMoon as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(offset).toMatch(/^[+-]\d{2}:\d{2}$/);
    expect(result.sunrise).toBe("08:37");
  });

  it("resolves timezone for coordinates", async () => {
    const client = stubClient();
    await getSunMoon(client, { lat: 59.88, lon: 8.59 });
    expect(client.resolveTimezone).toHaveBeenCalledWith(59.88, 8.59);
  });
});
