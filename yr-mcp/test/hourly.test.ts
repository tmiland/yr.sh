import { describe, expect, it } from "vitest";
import { parseHourlyForecast } from "../src/lib/hourly.js";

function makeEntry(time: string, symbol: string, temp: number, precip: number | null, prob: number | null) {
  return {
    time,
    data: {
      next_1_hours: {
        summary: { symbol_code: symbol },
        details: {
          precipitation_amount: precip,
          probability_of_precipitation: prob,
        },
      },
      next_6_hours: { summary: { symbol_code: "cloudy_day" } },
      instant: { details: { air_temperature: temp } },
    },
  };
}

const BODY = {
  properties: {
    timeseries: [
      makeEntry("2026-11-21T11:00:00Z", "clearsky_day", -0.4, 0.0, 0.0),
      makeEntry("2026-11-21T12:00:00Z", "clearsky_day", 0.5, 0.0, 0.0),
      makeEntry("2026-11-21T13:00:00Z", "fair_day", 1.0, 0.0, 0.03),
      makeEntry("2026-11-21T14:00:00Z", "fair_day", 1.1, 0.0, 0.01),
      makeEntry("2026-11-21T15:00:00Z", "fair_day", 0.5, 0.0, 0.03),
    ],
  },
};

describe("parseHourlyForecast", () => {
  it("parses the requested number of hours", () => {
    const rows = parseHourlyForecast(BODY, 3);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      time: "2026-11-21T11:00:00Z",
      symbolCode: "clearsky_day",
      condition: "Clear",
      temperature: -0.4,
      precipitation: 0.0,
      probabilityOfPrecipitation: 0.0,
    });
    expect(rows[2].time).toBe("2026-11-21T13:00:00Z");
  });

  it("returns all entries when hours exceeds the series length", () => {
    const rows = parseHourlyForecast(BODY, 100);
    expect(rows).toHaveLength(5);
  });

  it("falls back to next_6_hours symbol and null details", () => {
    const body = {
      properties: {
        timeseries: [
          {
            time: "2026-11-21T11:00:00Z",
            data: {
              next_6_hours: { summary: { symbol_code: "snow_night" } },
              instant: { details: { air_temperature: -4 } },
            },
          },
        ],
      },
    };
    const rows = parseHourlyForecast(body, 1);
    expect(rows[0].symbolCode).toBe("snow_night");
    expect(rows[0].condition).toBe("Snow");
    expect(rows[0].precipitation).toBeNull();
    expect(rows[0].probabilityOfPrecipitation).toBeNull();
  });

  it("throws when timeseries is empty", () => {
    expect(() => parseHourlyForecast({ properties: { timeseries: [] } }, 6)).toThrow(/no forecast/i);
  });

  it("throws for a non-positive hours value", () => {
    expect(() => parseHourlyForecast(BODY, 0)).toThrow(/hours/i);
  });
});
