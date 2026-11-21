import { describe, expect, it } from "vitest";
import { responseUnits } from "../src/lib/units.js";

describe("responseUnits", () => {
  it("extracts MET's meta.units map", () => {
    const body = {
      properties: {
        meta: {
          units: {
            air_temperature: "celsius",
            wind_speed: "m/s",
            probability_of_precipitation: "%",
          },
        },
      },
    };
    expect(responseUnits(body)).toEqual({
      air_temperature: "celsius",
      wind_speed: "m/s",
      probability_of_precipitation: "%",
    });
  });

  it("returns an empty map when units are missing", () => {
    expect(responseUnits({ properties: { meta: {} } })).toEqual({});
    expect(responseUnits(null)).toEqual({});
    expect(responseUnits({ properties: { meta: { units: [] } } })).toEqual({});
  });
});
