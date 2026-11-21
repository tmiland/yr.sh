export interface GeocodedPlace {
  lat: number;
  lon: number;
  name: string;
  timezone: string;
}

export function parseGeocodeResponse(body: unknown): GeocodedPlace {
  const results = (body as { results?: unknown[] })?.results;
  const first = Array.isArray(results) ? results[0] : undefined;
  if (!first || typeof first !== "object") {
    throw new Error("location not found");
  }
  const r = first as Record<string, unknown>;
  const lat = typeof r.latitude === "number" ? r.latitude : NaN;
  const lon = typeof r.longitude === "number" ? r.longitude : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("location not found");
  }
  const name = typeof r.name === "string" ? r.name : "";
  const country = typeof r.country === "string" ? r.country : "";
  const timezone = typeof r.timezone === "string" ? r.timezone : "";
  return {
    lat,
    lon,
    name: country ? `${name}, ${country}` : name,
    timezone,
  };
}
