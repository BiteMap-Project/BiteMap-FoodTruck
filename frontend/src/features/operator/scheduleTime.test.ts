import { expect, it } from "vitest";
import { localTime, timeCandidates } from "./scheduleTime";

it("converts winter, summer and fractional offsets independently of browser zone", () => {
  expect(timeCandidates("2030-01-02T11:00", "America/Los_Angeles")).toEqual(["2030-01-02T11:00:00-08:00"]);
  expect(timeCandidates("2030-07-02T11:00", "America/Los_Angeles")).toEqual(["2030-07-02T11:00:00-07:00"]);
  expect(timeCandidates("2030-01-02T11:00", "Asia/Kolkata")).toEqual(["2030-01-02T11:00:00+05:30"]);
  expect(localTime("2030-01-02T19:00:00Z", "America/Los_Angeles")).toBe("2030-01-02T11:00:00");
});
it("rejects DST gaps, invalid zones and impossible calendar dates", () => {
  expect(timeCandidates("2030-03-10T02:30", "America/Los_Angeles")).toEqual([]);
  expect(timeCandidates("2030-02-30T11:00", "UTC")).toEqual([]);
  expect(timeCandidates("2030-01-02T11:00", "Not/AZone")).toEqual([]);
  expect(timeCandidates("", "UTC")).toEqual([]);
});
it("offers both offsets for a repeated hour and preserves seconds", () => {
  expect(timeCandidates("2030-11-03T01:30:15", "America/Los_Angeles")).toEqual(["2030-11-03T01:30:15-07:00", "2030-11-03T01:30:15-08:00"]);
});
