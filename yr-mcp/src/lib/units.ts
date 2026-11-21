export type Units = Record<string, string>;

// MET publishes its unit map at properties.meta.units. Pass it through so
// callers never have to guess what a bare number means.
export function responseUnits(body: unknown): Units {
  const props = (body as { properties?: Record<string, unknown> } | null)?.properties;
  const meta = (props?.meta ?? {}) as Record<string, unknown>;
  const units = meta.units;
  if (!units || typeof units !== "object" || Array.isArray(units)) return {};
  const out: Units = {};
  for (const [key, value] of Object.entries(units)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}
