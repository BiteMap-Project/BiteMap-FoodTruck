import type { TruckAnalytics } from "../../services/analytics";

const columns = [
  "Truck ID",
  "Truck",
  "Category",
  "Location",
  "Menu items",
  "Available items",
  "Average menu price (USD)",
  "Total stops",
  "Upcoming stops",
  "Next stop (UTC)",
];

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  // Spreadsheet programs can treat these leading characters as formulas.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function analyticsCsv(data: TruckAnalytics): string {
  const rows = data.trucks.map((truck) => [
    truck.vendorId,
    truck.name,
    truck.category,
    truck.location,
    truck.menuItemCount,
    truck.availableItemCount,
    truck.averageMenuPrice,
    truck.totalStopCount,
    truck.upcomingStopCount,
    truck.nextStopAt,
  ]);
  return [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function downloadAnalyticsCsv(data: TruckAnalytics): void {
  const blob = new Blob([analyticsCsv(data)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bitemap-truck-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
