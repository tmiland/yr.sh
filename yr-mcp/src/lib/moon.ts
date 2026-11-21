const PHASE_NAMES = [
  "New moon",
  "Waxing crescent",
  "First quarter",
  "Waxing gibbous",
  "Full moon",
  "Waning gibbous",
  "Last quarter",
  "Waning crescent",
];

// Phase index 0-7: new, waxing crescent, first quarter, waxing gibbous,
// full, waning gibbous, last quarter, waning crescent.
export function moonPhaseIndex(phaseAngle: number): number {
  let p = phaseAngle % 360;
  if (p < 0) p += 360;
  return Math.floor((p + 22.5) / 45) % 8;
}

export function moonPhaseName(phaseAngle: number): string {
  return PHASE_NAMES[moonPhaseIndex(phaseAngle)];
}

export function moonIllumination(phaseAngle: number): number {
  const rad = ((phaseAngle % 360) * Math.PI) / 180;
  return Math.round(((1 - Math.cos(rad)) / 2) * 100);
}
