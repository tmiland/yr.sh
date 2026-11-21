import { describe, expect, it } from "vitest";
import { parseCurrentConditions } from "../src/lib/current.js";

const BODY = {
  properties: {
    meta: { updated_at: "2026-11-21T10:29:04Z" },
    timeseries: [
      {
        time: "2026-11-21T10:00:00Z",
        data: {
          next_1_hours: {
            summary: { symbol_code: "fair_day" },
            details: {
              precipitation_amount: 0.0,
              probability_of_precipitation: 0.1,
            },
          },
          next_6_hours: { summary: { symbol_code: "cloudy_day" } },
          instant: {
            details: {
              air_pressure_at_sea_level: 1007.8,
              air_temperature: 0.3,
              apparent_air_temperature: -0.5,
              relative_humidity: 67.1,
              ultraviolet_index_clear_sky: 0.2,
              wind_from_direction: 283.0,
              wind_speed: 0.5,
              wind_speed_of_gust: 6.5,
            },
          },
        },
      },
    ],
  },
};

describe("parseCurrentConditions", () => {
  it("extracts the now panel from a real response", () => {
    const c = parseCurrentConditions(BODY);
    expect(c).toEqual({
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
    });
  });

  it("falls back to next_6_hours symbol when next_1_hours is missing", () => {
    const body = {
      properties: {
        meta: { updated_at: "2026-11-21T10:29:04Z" },
        timeseries: [
          {
            time: "2026-11-21T10:00:00Z",
            data: {
              next_6_hours: { summary: { symbol_code: "snow_night" } },
              instant: {
                details: {
                  air_pressure_at_sea_level: 1000,
                  air_temperature: -4,
                  relative_humidity: 80,
                  wind_speed: 3,
                },
              },
            },
          },
        ],
      },
    };
    const c = parseCurrentConditions(body);
    expect(c.symbolCode).toBe("snow_night");
    expect(c.condition).toBe("Snow");
    expect(c.feelsLike).toBeNull();
    expect(c.windGust).toBeNull();
    expect(c.windDirection).toBeNull();
    expect(c.uv).toBeNull();
  });

  it("throws when timeseries is empty", () => {
    expect(() =>
      parseCurrentConditions({ properties: { meta: {}, timeseries: [] } })
    ).toThrow(/no forecast/i);
  });
});
