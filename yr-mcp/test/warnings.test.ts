import { describe, expect, it } from "vitest";
import { parseWarnings } from "../src/lib/warnings.js";

const FEATURE = {
  type: "Feature",
  geometry: { type: "Polygon", coordinates: [[[5.0, 58.0], [8.0, 58.0], [8.0, 60.0], [5.0, 60.0], [5.0, 58.0]]] },
  properties: {
    id: "2.49.0.1.578.0.20240319110603.082",
    title: "TEST Risk of high forest fires, yellow level, Trøndelag",
    description: "TEST TEST TEST TEST TEST",
    instruction: "TEST TEST TEST Be very careful with open fire.",
    event: "forestFire",
    eventAwarenessName: "TEST TEST TEST Risk of high forest fires",
    severity: "Severe",
    certainty: "Possible",
    awareness_level: "2; yellow; Moderate",
    awareness_type: "8; forest-fire",
    riskMatrixColor: "Yellow",
    area: "Trøndelag",
    county: ["50"],
    eventEndingTime: "2034-03-19T14:05:00+00:00",
    status: "Test",
    type: "Alert",
    web: "https://www.met.no/en/contact-us",
  },
};

describe("parseWarnings", () => {
  it("parses a real-shaped feature", () => {
    const warnings = parseWarnings({ type: "FeatureCollection", features: [FEATURE] });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toEqual({
      title: "TEST Risk of high forest fires, yellow level, Trøndelag",
      description: "TEST TEST TEST TEST TEST",
      event: "forestFire",
      awarenessType: "forest-fire",
      riskColor: "yellow",
      severity: "Severe",
      certainty: "Possible",
      area: "Trøndelag",
      expires: "2034-03-19T14:05:00+00:00",
      status: "Test",
    });
  });

  it("returns an empty array when there are no features", () => {
    expect(parseWarnings({ type: "FeatureCollection", features: [] })).toEqual([]);
  });

  it("throws when features are missing instead of reporting a false all-clear", () => {
    expect(() => parseWarnings({ type: "FeatureCollection" })).toThrow(/invalid warnings/i);
    expect(() => parseWarnings(null)).toThrow(/invalid warnings/i);
  });

  it("falls back to the event name when title is missing", () => {
    const feature = {
      type: "Feature",
      properties: { event: "gale", riskMatrixColor: "Orange", awareness_type: "1; wind" },
    };
    const warnings = parseWarnings({ features: [feature] });
    expect(warnings[0].title).toBe("gale");
    expect(warnings[0].riskColor).toBe("orange");
  });

  it("falls back to a generic title and yellow color when nothing is known", () => {
    const warnings = parseWarnings({ features: [{ type: "Feature", properties: {} }] });
    expect(warnings[0].title).toBe("Weather warning");
    expect(warnings[0].riskColor).toBe("yellow");
    expect(warnings[0].description).toBeNull();
  });

  it("normalizes an unknown risk color to yellow", () => {
    const feature = {
      type: "Feature",
      properties: { riskMatrixColor: "Purple" },
    };
    const warnings = parseWarnings({ features: [feature] });
    expect(warnings[0].riskColor).toBe("yellow");
  });
});
