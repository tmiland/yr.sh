import { describe, expect, it } from "vitest";
import { localDate, utcOffset } from "../src/lib/localtime.js";

describe("localDate", () => {
  it("returns the YYYY-MM-DD date in the given timezone", () => {
    // 2026-11-21T23:30:00Z is already 2026-11-22 00:30 in Europe/Oslo (UTC+1)
    const now = new Date("2026-11-21T23:30:00Z");
    expect(localDate("Europe/Oslo", now)).toBe("2026-11-22");
  });

  it("matches UTC for UTC timezone", () => {
    const now = new Date("2026-11-21T23:30:00Z");
    expect(localDate("UTC", now)).toBe("2026-11-21");
  });
});

describe("utcOffset", () => {
  it("returns the offset at noon UTC for Europe/Oslo in winter (UTC+1)", () => {
    expect(utcOffset("Europe/Oslo", "2026-11-21")).toBe("+01:00");
  });

  it("returns the offset at noon UTC for Europe/Oslo in summer (UTC+2)", () => {
    expect(utcOffset("Europe/Oslo", "2026-06-21")).toBe("+02:00");
  });

  it("returns +00:00 for UTC", () => {
    expect(utcOffset("UTC", "2026-11-21")).toBe("+00:00");
  });

  it("handles negative offsets", () => {
    expect(utcOffset("America/New_York", "2026-11-21")).toBe("-05:00");
  });
});
