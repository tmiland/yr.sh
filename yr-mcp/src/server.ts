import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WeatherClient } from "./client.js";
import {
  getCurrentConditions,
  getHourlyForecast,
  getSunMoon,
  getWarnings,
  type ToolArgs,
} from "./tools.js";

const locationShape = {
  place: z.string().optional().describe("Place name, e.g. 'Rjukan'. Mutually exclusive with lat/lon."),
  lat: z.number().min(-90).max(90).optional().describe("Latitude (-90..90). Requires lon."),
  lon: z.number().min(-180).max(180).optional().describe("Longitude (-180..180). Requires lat."),
};

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

async function guard(fn: () => Promise<unknown>) {
  try {
    return jsonResult(await fn());
  } catch (err) {
    return errorResult(err);
  }
}

export function createServer(client: WeatherClient): McpServer {
  const server = new McpServer({ name: "yr-mcp", version: "1.0.0" });

  server.registerTool(
    "get_current_conditions",
    {
      title: "Current conditions",
      description: "Current weather for a place or coordinates: temperature, feels-like, wind, humidity, pressure, UV, condition.",
      inputSchema: locationShape,
    },
    async (args: ToolArgs) => guard(() => getCurrentConditions(client, args))
  );

  server.registerTool(
    "get_hourly_forecast",
    {
      title: "Hourly forecast",
      description: "Hourly forecast for a place or coordinates. Returns an array of hourly entries (time, condition, temperature, precipitation, precipitation probability as a 0-1 fraction).",
      inputSchema: {
        ...locationShape,
        hours: z.number().int().min(1).max(48).optional().describe("Number of hours to return (default 6, max 48)."),
      },
    },
    async (args: ToolArgs) => guard(() => getHourlyForecast(client, args))
  );

  server.registerTool(
    "get_warnings",
    {
      title: "Weather warnings",
      description: "Active MET Norway weather warnings for a place or coordinates (Norway only).",
      inputSchema: locationShape,
    },
    async (args: ToolArgs) => guard(() => getWarnings(client, args))
  );

  server.registerTool(
    "get_sun_moon",
    {
      title: "Sun and moon",
      description: "Sunrise/sunset, daylight length, polar night/midnight sun, moon phase, illumination and moonrise/moonset for a place or coordinates.",
      inputSchema: locationShape,
    },
    async (args: ToolArgs) => guard(() => getSunMoon(client, args))
  );

  return server;
}
