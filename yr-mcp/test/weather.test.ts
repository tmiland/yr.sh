import { describe, expect, it } from "vitest";
import { conditionLabel, symbolBase } from "../src/lib/weather.js";

describe("symbolBase", () => {
  it("strips _day suffix", () => {
    expect(symbolBase("clearsky_day")).toBe("clearsky");
  });

  it("strips _night suffix", () => {
    expect(symbolBase("rain_night")).toBe("rain");
  });

  it("strips _polartwilight suffix", () => {
    expect(symbolBase("cloudy_polartwilight")).toBe("cloudy");
  });

  it("leaves a bare code unchanged", () => {
    expect(symbolBase("fair")).toBe("fair");
  });
});

describe("conditionLabel", () => {
  it("maps clearsky to Clear", () => {
    expect(conditionLabel("clearsky_day")).toBe("Clear");
  });

  it("maps fair to Fair", () => {
    expect(conditionLabel("fair_night")).toBe("Fair");
  });

  it("maps partlycloudy to Partly cloudy", () => {
    expect(conditionLabel("partlycloudy_day")).toBe("Partly cloudy");
  });

  it("maps fog to Fog", () => {
    expect(conditionLabel("fog_day")).toBe("Fog");
  });

  it("maps rain variants", () => {
    expect(conditionLabel("lightrain_day")).toBe("Light rain");
    expect(conditionLabel("rain_day")).toBe("Rain");
    expect(conditionLabel("rainshowers_day")).toBe("Rain showers");
    expect(conditionLabel("heavyrain_day")).toBe("Heavy rain");
  });

  it("maps sleet and snow variants", () => {
    expect(conditionLabel("lightsleet_day")).toBe("Light sleet");
    expect(conditionLabel("sleet_day")).toBe("Sleet");
    expect(conditionLabel("lightsnow_day")).toBe("Light snow");
    expect(conditionLabel("snow_day")).toBe("Snow");
    expect(conditionLabel("heavysnow_day")).toBe("Heavy snow");
  });

  it("maps thunder to Thunderstorm", () => {
    expect(conditionLabel("thunder_day")).toBe("Thunderstorm");
  });

  it("falls back to the humanized base for unknown codes", () => {
    expect(conditionLabel("some_unknown_code")).toBe("some unknown code");
  });
});
