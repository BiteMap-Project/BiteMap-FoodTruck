function sameDay(a: Date, b: Date, timeZone: string) {
  const day = new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "short" });
  return day.format(a) === day.format(b);
}

/** e.g. "Mon, Sep 28, 11:00 AM – 2:00 PM PDT", shown in the stop's own time zone. */
export function formatStopTime(startsAt: string, endsAt: string, timeZone: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const withDate: Intl.DateTimeFormatOptions = {
    timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  };
  const startText = new Intl.DateTimeFormat("en-US", withDate).format(start);
  const endText = new Intl.DateTimeFormat("en-US", {
    ...(sameDay(start, end, timeZone) ? { timeZone, hour: "numeric", minute: "2-digit" } : withDate),
    timeZoneName: "short",
  }).format(end);
  return `${startText} – ${endText}`;
}

export function formatDistance(meters: number) {
  const miles = meters / 1609.344;
  return miles < 0.1 ? "Less than 0.1 mi away" : `${miles.toFixed(1)} mi away`;
}
