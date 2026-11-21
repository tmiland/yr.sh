import { describe, expect, it } from "vitest";
import { moonIllumination, moonPhaseIndex, moonPhaseName } from "../src/lib/moon.js";

describe("moonPhaseIndex", () => {
  it("maps 0° to new moon", () => {
    expect(moonPhaseIndex(0)).toBe(0);
  });

  it("maps 90° to first quarter", () => {
    expect(moonPhaseIndex(90)).toBe(2);
  });

  it("maps 180° to full moon", () => {
    expect(moonPhaseIndex(180)).toBe(4);
  });

  it("maps 270° to last quarter", () => {
    expect(moonPhaseIndex(270)).toBe(6);
  });

  it("wraps angles >= 360", () => {
    expect(moonPhaseIndex(360)).toBe(0);
    expect(moonPhaseIndex(450)).toBe(2);
  });

  it("wraps negative angles", () => {
    expect(moonPhaseIndex(-90)).toBe(6);
  });
});

describe("moonPhaseName", () => {
  it("names all 8 sectors", () => {
    expect(moonPhaseName(0)).toBe("New moon");
    expect(moonPhaseName(45)).toBe("Waxing crescent");
    expect(moonPhaseName(90)).toBe("First quarter");
    expect(moonPhaseName(135)).toBe("Waxing gibbous");
    expect(moonPhaseName(180)).toBe("Full moon");
    expect(moonPhaseName(225)).toBe("Waning gibbous");
    expect(moonPhaseName(270)).toBe("Last quarter");
    expect(moonPhaseName(315)).toBe("Waning crescent");
  });
});

describe("moonIllumination", () => {
  it("is 0% at new moon", () => {
    expect(moonIllumination(0)).toBe(0);
  });

  it("is 100% at full moon", () => {
    expect(moonIllumination(180)).toBe(100);
  });

  it("is 50% at quarter phases", () => {
    expect(moonIllumination(90)).toBe(50);
    expect(moonIllumination(270)).toBe(50);
  });

  it("rounds to the nearest integer", () => {
    expect(moonIllumination(45)).toBe(15);
  });
});
