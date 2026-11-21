import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import type { WeatherClient } from "../src/client.js";

function stubClient(): WeatherClient {
  return {
    geocode: vi.fn(async () => ({ lat: 59.88, lon: 8.59, name: "Rjukan, Norway", timezone: "Europe/Oslo" })),
    resolveTimezone: vi.fn(async () => "Europe/Oslo"),
    currentConditions: vi.fn(async () => ({
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
    })),
    hourlyForecast: vi.fn(async () => [
      { time: "2026-11-21T11:00:00Z", symbolCode: "fair_day", condition: "Fair", temperature: 0.5, precipitation: 0.0, probabilityOfPrecipitation: 0.0 },
    ]),
    warnings: vi.fn(async () => []),
    sunMoon: vi.fn(async () => ({
      sunrise: "08:37",
      sunset: "15:45",
      daylightMinutes: 428,
      polarNight: false,
      midnightSun: false,
      moonPhaseAngle: 131.16,
      moonPhase: "Waxing gibbous",
      moonIllumination: 83,
      moonrise: "14:08",
      moonset: "03:58",
    })),
  } as unknown as WeatherClient;
}

async function connectedClient(server: ReturnType<typeof createServer>) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  return { client, server };
}

describe("createServer", () => {
  it("lists the four weather tools", async () => {
    const { client } = await connectedClient(createServer(stubClient()));
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "get_current_conditions",
      "get_hourly_forecast",
      "get_sun_moon",
      "get_warnings",
    ]);
  });

  it("calls get_current_conditions with coordinates and returns JSON", async () => {
    const { client } = await connectedClient(createServer(stubClient()));
    const result = await client.callTool({
      name: "get_current_conditions",
      arguments: { lat: 59.88, lon: 8.59 },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0].text);
    expect(payload.temperature).toBe(0.3);
    expect(payload.condition).toBe("Fair");
  });

  it("returns an error for missing location", async () => {
    const { client } = await connectedClient(createServer(stubClient()));
    const result = await client.callTool({
      name: "get_current_conditions",
      arguments: {},
    });
    expect(result.isError).toBe(true);
  });

  it("calls get_warnings and returns an empty list", async () => {
    const { client } = await connectedClient(createServer(stubClient()));
    const result = await client.callTool({
      name: "get_warnings",
      arguments: { lat: 59.88, lon: 8.59 },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0].text)).toEqual([]);
  });
});
