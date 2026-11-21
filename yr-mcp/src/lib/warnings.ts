export interface Warning {
  title: string;
  description: string | null;
  event: string | null;
  awarenessType: string | null;
  riskColor: "yellow" | "orange" | "red";
  severity: string | null;
  certainty: string | null;
  area: string | null;
  expires: string | null;
  status: string | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function riskColor(v: unknown): "yellow" | "orange" | "red" {
  const c = typeof v === "string" ? v.toLowerCase() : "";
  if (c === "yellow" || c === "orange" || c === "red") return c;
  return "yellow";
}

export function parseWarnings(body: unknown): Warning[] {
  const features = (body as { features?: unknown[] })?.features;
  if (!Array.isArray(features)) return [];
  const warnings: Warning[] = [];
  for (const f of features) {
    const p = (f as { properties?: Record<string, unknown> } | null)?.properties;
    if (!p || typeof p !== "object") continue;
    const awarenessRaw = str(p.awareness_type);
    const awarenessType = awarenessRaw ? awarenessRaw.replace(/^[^;]*;\s*/, "") : null;
    warnings.push({
      title: str(p.title) ?? str(p.event) ?? "Weather warning",
      description: str(p.description),
      event: str(p.event),
      awarenessType,
      riskColor: riskColor(p.riskMatrixColor),
      severity: str(p.severity),
      certainty: str(p.certainty),
      area: str(p.area),
      expires: str(p.eventEndingTime),
      status: str(p.status),
    });
  }
  return warnings;
}
