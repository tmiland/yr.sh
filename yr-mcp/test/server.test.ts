import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import type { WeatherClient } from "../src/client.js";

function stubClient(overrides: Record<string, unknown> = {}): WeatherClient {
  return {
    geocode: vi.fn(async () => ({
      lat: 59.88,
      lon: 8.59,
      name: "Rjukan, Norway",
      timezone: "Europe/Oslo",
    })),
    resolveTimezone: vi.fn(async () => "Europe/Oslo"),
    currentConditions: vi.fn(async () => ({
      data: {
        time: "2026-11-21T10:00:00Z",
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
      },
      units: { air_temperature: "celsius" },
    })),
    hourlyForecast: vi.fn(async () => ({
      data: [
        {
          time: "2026-11-21T11:00:00Z",
          symbolCode: "fair_day",
          condition: "Fair",
          temperature: 0.5,
          precipitation: 0.0,
          probabilityOfPrecipitation: 0.0,
        },
      ],
      units: { probability_of_precipitation: "%" },
    })),
    warnings: vi.fn(async () => []),
    sunMoon: vi.fn(async () => ({
      data: {
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
      },
      errors: [],
    })),
    ...overrides,
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

function textPayload(result: Awaited<ReturnType<Client["callTool"]>>): Record<string, unknown> {
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0].text) as Record<string, unknown>;
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

  it("calls get_current_conditions with coordinates and returns an envelope", async () => {
    const stub = stubClient();
    const { client } = await connectedClient(createServer(stub));
    const result = await client.callTool({
      name: "get_current_conditions",
      arguments: { lat: 59.88, lon: 8.59 },
    });
    expect(result.isError).toBeFalsy();
    const payload = textPayload(result);
    expect((payload.data as Record<string, unknown>).temperature).toBe(0.3);
    expect((payload.data as Record<string, unknown>).time).toBe("2026-11-21T10:00:00Z");
    expect((payload.location as Record<string, unknown>).name).toBe("59.8800, 8.5900");
    expect(payload.units).toEqual({ air_temperature: "celsius" });
    expect(stub.resolveTimezone).not.toHaveBeenCalled();
  });

  it("calls get_hourly_forecast and passes hours through", async () => {
    const stub = stubClient();
    const { client } = await connectedClient(createServer(stub));
    const result = await client.callTool({
      name: "get_hourly_forecast",
      arguments: { place: "Rjukan", hours: 2 },
    });
    expect(result.isError).toBeFalsy();
    const payload = textPayload(result);
    expect((payload.data as unknown[]).length).toBe(1);
    expect(payload.units).toEqual({ probability_of_precipitation: "%" });
    expect(stub.hourlyForecast).toHaveBeenCalledWith(59.88, 8.59, 2);
  });

  it("calls get_warnings and returns the envelope", async () => {
    const { client } = await connectedClient(createServer(stubClient()));
    const result = await client.callTool({
      name: "get_warnings",
      arguments: { lat: 59.88, lon: 8.59 },
    });
    expect(result.isError).toBeFalsy();
    const payload = textPayload(result);
    expect(payload.data).toEqual([]);
    expect((payload.location as Record<string, unknown>).timezone).toBeNull();
  });

  it("calls get_sun_moon and returns date, offset and timezone", async () => {
    const { client } = await connectedClient(createServer(stubClient()));
    const result = await client.callTool({
      name: "get_sun_moon",
      arguments: { place: "Rjukan" },
    });
    expect(result.isError).toBeFalsy();
    const payload = textPayload(result);
    expect((payload.data as Record<string, unknown>).sunrise).toBe("08:37");
    expect((payload.location as Record<string, unknown>).timezone).toBe("Europe/Oslo");
    expect(payload.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payload.utcOffset).toMatch(/^[+-]\d{2}:\d{2}$/);
    expect(payload.partial).toBe(false);
  });

  it("returns a partial sun/moon result when one upstream fails", async () => {
    const stub = stubClient({
      sunMoon: vi.fn(async () => ({
        data: {
          sunrise: null,
          sunset: null,
          daylightMinutes: null,
          polarNight: false,
          midnightSun: false,
          moonPhaseAngle: 131.16,
          moonPhase: "Waxing gibbous",
          moonIllumination: 83,
          moonrise: "14:08",
          moonset: "03:58",
        },
        errors: ["sun: HTTP 500 from: https://api.met.no/weatherapi/sunrise/3.0/sun"],
      })),
    });
    const { client } = await connectedClient(createServer(stub));
    const result = await client.callTool({
      name: "get_sun_moon",
      arguments: { lat: 59.88, lon: 8.59 },
    });
    expect(result.isError).toBeFalsy();
    const payload = textPayload(result);
    expect(payload.partial).toBe(true);
    expect(payload.errors).toHaveLength(1);
    expect((payload.data as Record<string, unknown>).moonPhase).toBe("Waxing gibbous");
  });

  it("returns an error for missing location", async () => {
    const { client } = await connectedClient(createServer(stubClient()));
    const result = await client.callTool({
      name: "get_current_conditions",
      arguments: {},
    });
    expect(result.isError).toBe(true);
  });

  it("surfaces upstream failures as tool errors", async () => {
    const stub = stubClient({
      currentConditions: vi.fn(async () => {
        throw new Error("HTTP 500 from: https://api.met.no/forecast");
      }),
    });
    const { client } = await connectedClient(createServer(stub));
    const result = await client.callTool({
      name: "get_current_conditions",
      arguments: { lat: 59.88, lon: 8.59 },
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toMatch(/500/);
  });

  it("rejects hours above the schema maximum", async () => {
    const { client } = await connectedClient(createServer(stubClient()));
    const result = await client.callTool({
      name: "get_hourly_forecast",
      arguments: { lat: 59.88, lon: 8.59, hours: 99 },
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toMatch(/48/);
  });
});
