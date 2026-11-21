#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WeatherClient } from "./client.js";
import { createServer } from "./server.js";

const server = createServer(new WeatherClient());
const transport = new StdioServerTransport();
await server.connect(transport);
