export function localDate(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// UTC offset (+HH:MM) of the timezone at noon UTC on the given date.
export function utcOffset(timeZone: string, date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const localAsUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offsetMs = localAsUTC - guess.getTime();
  const sign = offsetMs >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMs);
  const hh = Math.floor(abs / 3600000);
  const mm = Math.floor((abs % 3600000) / 60000);
  return `${sign}${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
