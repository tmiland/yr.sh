import { moonIllumination, moonPhaseName } from "./moon.js";

export interface SunMoon {
  sunrise: string | null;
  sunset: string | null;
  daylightMinutes: number | null;
  polarNight: boolean;
  midnightSun: boolean;
  moonPhaseAngle: number | null;
  moonPhase: string | null;
  moonIllumination: number | null;
  moonrise: string | null;
  moonset: string | null;
}

function timeOf(v: unknown): string | null {
  if (typeof v !== "string" || v.length < 16) return null;
  // "2026-11-21T08:37+01:00" -> "08:37"
  return v.slice(11, 16);
}

function epochOf(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

export function parseSunMoon(sunBody: unknown, moonBody: unknown): SunMoon {
  const sunProps = (sunBody as { properties?: Record<string, unknown> } | null)?.properties;
  const sunriseRaw = (sunProps?.sunrise as Record<string, unknown> | undefined)?.time;
  const sunsetRaw = (sunProps?.sunset as Record<string, unknown> | undefined)?.time;
  const solarnoon = sunProps?.solarnoon as Record<string, unknown> | undefined;
  const elevation =
    typeof solarnoon?.disc_centre_elevation === "number"
      ? (solarnoon.disc_centre_elevation as number)
      : null;

  const sunrise = timeOf(sunriseRaw);
  const sunset = timeOf(sunsetRaw);

  let daylightMinutes: number | null = null;
  const sr = epochOf(sunriseRaw);
  const ss = epochOf(sunsetRaw);
  if (sr !== null && ss !== null) {
    daylightMinutes = Math.round((ss - sr) / 60000);
  }

  const polarNight = sunrise === null && sunset === null && (elevation === null || elevation <= 0);
  const midnightSun = sunrise === null && sunset === null && elevation !== null && elevation > 0;

  const moonProps = (moonBody as { properties?: Record<string, unknown> } | null)?.properties;
  const moonPhaseAngle =
    typeof moonProps?.moonphase === "number" ? (moonProps.moonphase as number) : null;
  const moonrise = timeOf((moonProps?.moonrise as Record<string, unknown> | undefined)?.time);
  const moonset = timeOf((moonProps?.moonset as Record<string, unknown> | undefined)?.time);

  return {
    sunrise,
    sunset,
    daylightMinutes,
    polarNight,
    midnightSun,
    moonPhaseAngle,
    moonPhase: moonPhaseAngle === null ? null : moonPhaseName(moonPhaseAngle),
    moonIllumination: moonPhaseAngle === null ? null : moonIllumination(moonPhaseAngle),
    moonrise,
    moonset,
  };
}
