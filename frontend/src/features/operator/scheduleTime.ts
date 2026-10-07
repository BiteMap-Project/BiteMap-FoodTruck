// Never parse datetime-local in the browser's implicit time zone.
export function localTime(instant: string | number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
  const value = (type: string) => parts.find(p => p.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}`;
}

// Collect offsets around the requested date, then round-trip candidates. Gaps
// have zero candidates; repeated DST hours have two and require a user choice.
export function timeCandidates(local: string, zone: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) return [];
  const normalized = local.length === 16 ? `${local}:00` : local;
  const wall = Date.parse(`${normalized}Z`);
  if (!Number.isFinite(wall)) return [];
  const offsets = new Set<number>();
  try {
    for (let hours = -48; hours <= 48; hours += 6) {
      const sample = wall + hours * 3600000;
      offsets.add(Date.parse(`${localTime(sample, zone)}Z`) - sample);
    }
    return [...offsets].filter(offset => localTime(wall - offset, zone) === normalized).sort((a, b) => b - a).map(offset => {
      const minutes = Math.abs(offset) / 60000;
      const sign = offset < 0 ? "-" : "+";
      return `${normalized}${sign}${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    });
  } catch { return []; }
}
