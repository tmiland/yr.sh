import { describe, expect, it } from "vitest";
import { parseSunMoon } from "../src/lib/sunmoon.js";

const SUN_BODY = {
  properties: {
    sunrise: { time: "2026-11-21T08:37+01:00", azimuth: 130.88 },
    sunset: { time: "2026-11-21T15:45+01:00", azimuth: 228.97 },
    solarnoon: {
      time: "2026-11-21T12:11+01:00",
      disc_centre_elevation: 10.15,
      visible: true,
    },
  },
};

const MOON_BODY = {
  properties: {
    moonrise: { time: "2026-11-21T14:08+01:00", azimuth: 68.71 },
    moonset: { time: "2026-11-21T03:58+01:00", azimuth: 285.97 },
    moonphase: 131.16,
  },
};

describe("parseSunMoon", () => {
  it("parses sunrise/sunset and daylight from a real response", () => {
    const sun = parseSunMoon(SUN_BODY, MOON_BODY);
    expect(sun.sunrise).toBe("08:37");
    expect(sun.sunset).toBe("15:45");
    expect(sun.daylightMinutes).toBe(428); // 7h 08m
    expect(sun.polarNight).toBe(false);
    expect(sun.midnightSun).toBe(false);
  });

  it("parses moon phase, illumination and rise/set", () => {
    const sun = parseSunMoon(SUN_BODY, MOON_BODY);
    expect(sun.moonPhaseAngle).toBe(131.16);
    expect(sun.moonPhase).toBe("Waxing gibbous");
    expect(sun.moonIllumination).toBe(83);
    expect(sun.moonrise).toBe("14:08");
    expect(sun.moonset).toBe("03:58");
  });

  it("detects polar night when the sun never rises", () => {
    const body = {
      properties: {
        solarnoon: { time: "2026-11-21T12:11+01:00", disc_centre_elevation: -5.0, visible: false },
      },
    };
    const sun = parseSunMoon(body, null);
    expect(sun.sunrise).toBeNull();
    expect(sun.sunset).toBeNull();
    expect(sun.daylightMinutes).toBeNull();
    expect(sun.polarNight).toBe(true);
    expect(sun.midnightSun).toBe(false);
  });

  it("detects midnight sun when the sun never sets", () => {
    const body = {
      properties: {
        solarnoon: { time: "2026-11-21T12:11+01:00", disc_centre_elevation: 30.0, visible: true },
      },
    };
    const sun = parseSunMoon(body, null);
    expect(sun.midnightSun).toBe(true);
    expect(sun.polarNight).toBe(false);
  });

  it("handles a missing moon body", () => {
    const sun = parseSunMoon(SUN_BODY, null);
    expect(sun.moonPhase).toBeNull();
    expect(sun.moonrise).toBeNull();
    expect(sun.moonset).toBeNull();
  });

  it("handles a missing moonrise/moonset", () => {
    const body = { properties: { moonphase: 45 } };
    const sun = parseSunMoon(SUN_BODY, body);
    expect(sun.moonPhase).toBe("Waxing crescent");
    expect(sun.moonrise).toBeNull();
    expect(sun.moonset).toBeNull();
  });
});
