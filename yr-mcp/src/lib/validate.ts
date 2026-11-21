export interface Coords {
  lat: number;
  lon: number;
}

export function validateCoords(lat: number, lon: number): Coords {
  if (typeof lat !== "number" || Number.isNaN(lat) || !Number.isFinite(lat)) {
    throw new Error(`latitude is not a number: ${lat}`);
  }
  if (typeof lon !== "number" || Number.isNaN(lon) || !Number.isFinite(lon)) {
    throw new Error(`longitude is not a number: ${lon}`);
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error(`coordinates out of range: ${lat} ${lon}`);
  }
  return { lat, lon };
}
