import { expect, it } from "vitest";
import { formatDistance, formatStopTime } from "./format";
import { resolveWindow } from "./timeWindow";

const now = new Date(2026, 8, 28, 14, 30); // local Sep 28 2026, 2:30 PM
const none = { from: "", to: "" };

it("uses the server's default window for the next 7 days", () => {
  expect(resolveWindow("week", none, now)).toEqual({});
});

it("asks for trucks overlapping the current minute for 'Open now'", () => {
  expect(resolveWindow("now", none, now)).toEqual({ from: now, to: new Date(now.getTime() + 60_000) });
});

it("runs 'Later today' until local midnight", () => {
  expect(resolveWindow("today", none, now)).toEqual({ from: now, to: new Date(2026, 8, 29) });
});

it("treats the custom end date as inclusive", () => {
  expect(resolveWindow("custom", { from: "2026-10-01", to: "2026-10-03" }, now))
    .toEqual({ from: new Date(2026, 9, 1), to: new Date(2026, 9, 4) });
});

it.each([
  [{ from: "", to: "2026-10-03" }, "Choose a start and end date."],
  [{ from: "2026-10-05", to: "2026-10-03" }, "The end date must be on or after the start date."],
  [{ from: "2026-10-01", to: "2026-11-15" }, "Choose a range of 31 days or fewer."],
])("rejects an invalid custom range %o before calling the server", (dates, error) => {
  expect(resolveWindow("custom", dates, now)).toEqual({ error });
});

it("formats times in the stop's own time zone", () => {
  expect(formatStopTime("2026-09-28T18:00:00Z", "2026-09-28T21:00:00Z", "America/Los_Angeles"))
    .toBe("Mon, Sep 28, 11:00 AM – 2:00 PM PDT");
  expect(formatStopTime("2026-09-29T04:00:00Z", "2026-09-29T08:00:00Z", "America/Los_Angeles"))
    .toBe("Mon, Sep 28, 9:00 PM – Tue, Sep 29, 1:00 AM PDT");
});

it("formats distance in miles", () => {
  expect(formatDistance(50)).toBe("Less than 0.1 mi away");
  expect(formatDistance(3218.688)).toBe("2.0 mi away");
});
