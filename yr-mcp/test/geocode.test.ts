import { describe, expect, it } from "vitest";
import { parseGeocodeResponse } from "../src/lib/geocode.js";

describe("parseGeocodeResponse", () => {
  it("parses a full result", () => {
    const body = {
      results: [
        {
          latitude: 59.88,
          longitude: 8.59,
          name: "Rjukan",
          country: "Norway",
          timezone: "Europe/Oslo",
        },
      ],
    };
    expect(parseGeocodeResponse(body)).toEqual({
      lat: 59.88,
      lon: 8.59,
      name: "Rjukan, Norway",
      timezone: "Europe/Oslo",
    });
  });

  it("omits the country when absent", () => {
    const body = {
      results: [{ latitude: 59.88, longitude: 8.59, name: "Rjukan" }],
    };
    expect(parseGeocodeResponse(body).name).toBe("Rjukan");
  });

  it("throws when no results", () => {
    expect(() => parseGeocodeResponse({ results: [] })).toThrow(/not found/i);
  });

  it("throws when results are missing entirely", () => {
    expect(() => parseGeocodeResponse({})).toThrow(/not found/i);
  });

  it("throws when coordinates are missing", () => {
    const body = { results: [{ name: "Rjukan", country: "Norway" }] };
    expect(() => parseGeocodeResponse(body)).toThrow(/not found/i);
  });
});
