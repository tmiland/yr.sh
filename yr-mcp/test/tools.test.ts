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
    geocode: vi.fn(async () => ({
      lat: 59.88,
      lon: 8.59,
      name: "Rjukan, Norway",
      timezone: "Europe/Oslo",
    })),
    resolveTimezone: vi.fn(async () => "Europe/Oslo"),
    currentConditions: vi.fn(async () => ({
      data: {
        time: "2026-11-21T10:00:00Z",
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
      },
      units: { air_temperature: "celsius", wind_speed: "m/s" },
    })),
    hourlyForecast: vi.fn(async () => ({
      data: [
        {
          time: "2026-11-21T11:00:00Z",
          symbolCode: "fair_day",
          condition: "Fair",
          temperature: 0.5,
          precipitation: 0.0,
          probabilityOfPrecipitation: 0.0,
        },
      ],
      units: { precipitation_amount: "mm", probability_of_precipitation: "%" },
    })),
    warnings: vi.fn(async () => [
      {
        title: "TEST",
        description: "TEST",
        event: "forestFire",
        awarenessType: "forest-fire",
        riskColor: "yellow",
        severity: "Severe",
        certainty: "Possible",
        area: "Trøndelag",
        expires: null,
        status: "Test",
      },
    ]),
    sunMoon: vi.fn(async () => ({
      data: {
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
      },
      errors: [],
    })),
    ...overrides,
  } as unknown as WeatherClient;
}

describe("getCurrentConditions", () => {
  it("resolves a place via geocoding and returns location, units and data", async () => {
    const client = stubClient();
    const result = await getCurrentConditions(client, { place: "Rjukan" });
    expect(client.geocode).toHaveBeenCalledWith("Rjukan");
    expect(client.currentConditions).toHaveBeenCalledWith(59.88, 8.59);
    expect(result.location).toEqual({
      name: "Rjukan, Norway",
      lat: 59.88,
      lon: 8.59,
      timezone: "Europe/Oslo",
    });
    expect(result.units).toEqual({ air_temperature: "celsius", wind_speed: "m/s" });
    expect(result.data.temperature).toBe(0.3);
    expect(result.data.time).toBe("2026-11-21T10:00:00Z");
  });

  it("uses coordinates directly without a timezone round-trip", async () => {
    const client = stubClient();
    const result = await getCurrentConditions(client, { lat: 59.88, lon: 8.59 });
    expect(client.geocode).not.toHaveBeenCalled();
    expect(client.resolveTimezone).not.toHaveBeenCalled();
    expect(client.currentConditions).toHaveBeenCalledWith(59.88, 8.59);
    expect(result.location.name).toBe("59.8800, 8.5900");
    expect(result.location.timezone).toBeNull();
    expect(result.data.condition).toBe("Fair");
  });

  it("throws when neither place nor coordinates are given", async () => {
    const client = stubClient();
    await expect(getCurrentConditions(client, {})).rejects.toThrow(/place|coordinates/i);
  });

  it("throws when only one coordinate is given", async () => {
    const client = stubClient();
    await expect(getCurrentConditions(client, { lat: 59.88 })).rejects.toThrow(
      /latitude and longitude/i
    );
  });
});

describe("getHourlyForecast", () => {
  it("defaults to 6 hours", async () => {
    const client = stubClient();
    const result = await getHourlyForecast(client, { lat: 59.88, lon: 8.59 });
    expect(client.hourlyForecast).toHaveBeenCalledWith(59.88, 8.59, 6);
    expect(client.resolveTimezone).not.toHaveBeenCalled();
    expect(result.data).toHaveLength(1);
    expect(result.units.probability_of_precipitation).toBe("%");
  });

  it("passes the requested hours through", async () => {
    const client = stubClient();
    await getHourlyForecast(client, { lat: 59.88, lon: 8.59, hours: 12 });
    expect(client.hourlyForecast).toHaveBeenCalledWith(59.88, 8.59, 12);
  });
});

describe("getWarnings", () => {
  it("returns warnings for coordinates in an envelope", async () => {
    const client = stubClient();
    const result = await getWarnings(client, { lat: 59.88, lon: 8.59 });
    expect(client.resolveTimezone).not.toHaveBeenCalled();
    expect(result.data).toHaveLength(1);
    expect(result.location.name).toBe("59.8800, 8.5900");
  });
});

describe("getSunMoon", () => {
  it("resolves timezone, date and offset for a place", async () => {
    const client = stubClient();
    const result = await getSunMoon(client, { place: "Rjukan" });
    expect(client.geocode).toHaveBeenCalledWith("Rjukan");
    expect(client.sunMoon).toHaveBeenCalledWith(
      59.88,
      8.59,
      expect.any(String),
      expect.any(String)
    );
    const [, , date, offset] = (client.sunMoon as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(offset).toMatch(/^[+-]\d{2}:\d{2}$/);
    expect(result.location.timezone).toBe("Europe/Oslo");
    expect(result.date).toBe(date);
    expect(result.utcOffset).toBe(offset);
    expect(result.partial).toBe(false);
    expect(result.data.sunrise).toBe("08:37");
  });

  it("resolves timezone for coordinates", async () => {
    const client = stubClient();
    const result = await getSunMoon(client, { lat: 59.88, lon: 8.59 });
    expect(client.resolveTimezone).toHaveBeenCalledWith(59.88, 8.59);
    expect(result.location.timezone).toBe("Europe/Oslo");
    expect(result.timezoneFallback).toBeUndefined();
  });

  it("falls back to resolveTimezone when the geocoder has no timezone", async () => {
    const client = stubClient({
      geocode: vi.fn(async () => ({
        lat: 59.88,
        lon: 8.59,
        name: "Rjukan, Norway",
        timezone: "",
      })),
    });
    await getSunMoon(client, { place: "Rjukan" });
    expect(client.resolveTimezone).toHaveBeenCalledWith(59.88, 8.59);
  });

  it("marks a UTC fallback when timezone resolution fails", async () => {
    const client = stubClient({
      resolveTimezone: vi.fn(async () => {
        throw new Error("timezone down");
      }),
    });
    const result = await getSunMoon(client, { lat: 59.88, lon: 8.59 });
    expect(result.location.timezone).toBe("UTC");
    expect(result.timezoneFallback).toBe(true);
  });

  it("forwards partial sun/moon failures", async () => {
    const client = stubClient({
      sunMoon: vi.fn(async () => ({
        data: {
          sunrise: null,
          sunset: null,
          daylightMinutes: null,
          polarNight: false,
          midnightSun: false,
          moonPhaseAngle: 131.16,
          moonPhase: "Waxing gibbous",
          moonIllumination: 83,
          moonrise: "14:08",
          moonset: "03:58",
        },
        errors: ["sun: HTTP 500 from: https://api.met.no/weatherapi/sunrise/3.0/sun"],
      })),
    });
    const result = await getSunMoon(client, { lat: 59.88, lon: 8.59 });
    expect(result.partial).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.data.moonPhase).toBe("Waxing gibbous");
  });
});
