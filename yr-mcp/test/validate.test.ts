import { describe, expect, it } from "vitest";
import { validateCoords } from "../src/lib/validate.js";

describe("validateCoords", () => {
  it("accepts valid coordinates", () => {
    expect(validateCoords(59.88, 8.59)).toEqual({ lat: 59.88, lon: 8.59 });
  });

  it("accepts boundary values", () => {
    expect(validateCoords(-90, -180)).toEqual({ lat: -90, lon: -180 });
    expect(validateCoords(90, 180)).toEqual({ lat: 90, lon: 180 });
  });

  it("rejects non-numeric latitude", () => {
    expect(() => validateCoords(NaN, 8.59)).toThrow(/latitude/i);
  });

  it("rejects non-numeric longitude", () => {
    expect(() => validateCoords(59.88, NaN)).toThrow(/longitude/i);
  });

  it("rejects out-of-range latitude", () => {
    expect(() => validateCoords(91, 8.59)).toThrow(/range/i);
    expect(() => validateCoords(-91, 8.59)).toThrow(/range/i);
  });

  it("rejects out-of-range longitude", () => {
    expect(() => validateCoords(59.88, 181)).toThrow(/range/i);
    expect(() => validateCoords(59.88, -181)).toThrow(/range/i);
  });
});
