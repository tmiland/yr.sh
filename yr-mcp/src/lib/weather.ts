const LABELS: Record<string, string> = {
  thunder: "Thunderstorm",
  clearsky: "Clear",
  fair: "Fair",
  partlycloudy: "Partly cloudy",
  cloudy: "Cloudy",
  fog: "Fog",
  lightrain: "Light rain",
  lightrainshowers: "Light showers",
  rain: "Rain",
  rainshowers: "Rain showers",
  heavyrain: "Heavy rain",
  heavyrainshowers: "Heavy showers",
  lightsleet: "Light sleet",
  sleet: "Sleet",
  sleetshowers: "Sleet showers",
  lightsnow: "Light snow",
  lightsnowshowers: "Light snow showers",
  snow: "Snow",
  snowshowers: "Snow showers",
  heavysnow: "Heavy snow",
  heavysnowshowers: "Heavy snow showers",
};

export function symbolBase(code: string): string {
  return code.replace(/_(day|night|polartwilight)$/, "");
}

export function conditionLabel(code: string): string {
  const base = symbolBase(code);
  if (base.includes("thunder")) return "Thunderstorm";
  if (LABELS[base]) return LABELS[base];
  return base.replace(/_/g, " ");
}
