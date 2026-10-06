import { describe, expect, it } from "vitest";
import type { TruckAnalytics } from "../../services/analytics";
import { analyticsCsv } from "./exportCsv";

const report: TruckAnalytics = {
  totalTrucks: 1,
  totalMenuItems: 2,
  availableMenuItems: 1,
  upcomingStops: 1,
  trucks: [{
    vendorId: 7,
    name: "Tacos, Tea & More",
    category: "Tacos",
    location: "CSUN \"East\"",
    menuItemCount: 2,
    availableItemCount: 1,
    averageMenuPrice: 8.5,
    totalStopCount: 3,
    upcomingStopCount: 1,
    nextStopAt: "2030-01-02T18:00:00Z",
  }],
};

describe("analyticsCsv", () => {
  it("exports every reporting column with spreadsheet-safe quoting", () => {
    const csv = analyticsCsv(report);
    expect(csv).toContain('"Truck ID","Truck","Category","Location"');
    expect(csv).toContain('"Tacos, Tea & More"');
    expect(csv).toContain('"CSUN ""East"""');
    expect(csv).toContain('"8.5"');
    expect(csv).toContain('"2030-01-02T18:00:00Z"');
  });

  it("prevents exported text from becoming a spreadsheet formula", () => {
    const unsafe = { ...report, trucks: [{ ...report.trucks[0], name: "=HYPERLINK(\"bad\")" }] };
    expect(analyticsCsv(unsafe)).toContain('"\'=HYPERLINK(""bad"")"');
  });

  it("keeps missing prices and dates blank", () => {
    const incomplete = { ...report, trucks: [{ ...report.trucks[0], averageMenuPrice: null, nextStopAt: null }] };
    const row = analyticsCsv(incomplete).split("\r\n")[1];
    expect(row).toContain('"1",,"3","1",');
  });
});
