export type When = "week" | "now" | "today" | "custom";

export type CustomDates = { from: string; to: string };

export type Window = { from?: Date; to?: Date } | { error: string };

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_RANGE_DAYS = 31;

/** Parses an `<input type="date">` value (YYYY-MM-DD) as local midnight. */
function localDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Turns the "When" filter into the [from, to) window sent to /api/vendor-stops.
 * An empty object means "use the server default" (now through the next 7 days).
 */
export function resolveWindow(when: When, custom: CustomDates, now = new Date()): Window {
  switch (when) {
    case "week":
      return {};
    case "now":
      return { from: now, to: new Date(now.getTime() + 60_000) };
    case "today": {
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return { from: now, to: midnight };
    }
    case "custom": {
      const start = localDate(custom.from);
      const lastDay = localDate(custom.to);
      if (!start || !lastDay) return { error: "Choose a start and end date." };
      if (lastDay < start) return { error: "The end date must be on or after the start date." };
      // The end date is inclusive for people, so the window runs to the following midnight.
      const end = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 1);
      // Same rule as the server: at most 31 × 24 hours (a DST change can add an hour).
      if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * DAY_MS) {
        return { error: `Choose a range of ${MAX_RANGE_DAYS} days or fewer.` };
      }
      return { from: start, to: end };
    }
  }
}
