import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import SchedulePanel from "./SchedulePanel";
import { repeatPreview } from "./RepeatScheduleFields";
import type { RepeatRule } from "../../services/operatorSchedules";

it.each([
  ["DAILY", 29], ["EVERY_2_DAYS", 15], ["WEEKLY", 5], ["EVERY_2_WEEKS", 3],
] as const)("previews %s including the first and matching last date", (frequency, count) => {
  const preview = repeatPreview("2090-01-03", { frequency, until: "2090-01-31" });
  expect(preview.error).toBe("");
  expect(preview.dates).toHaveLength(count);
  expect(preview.dates[0]).toBe("2090-01-03");
  expect(preview.dates.at(-1)).toBe("2090-01-31");
});

it("does not force an off-pattern final date into a weekly schedule", () => {
  expect(repeatPreview("2090-01-03", { frequency: "WEEKLY", until: "2090-01-12" }).dates)
    .toEqual(["2090-01-03", "2090-01-10"]);
});

it("counts calendar dates through leap day and across year boundaries", () => {
  expect(repeatPreview("2088-02-28", { frequency: "DAILY", until: "2088-03-01" }).dates)
    .toEqual(["2088-02-28", "2088-02-29", "2088-03-01"]);
  expect(repeatPreview("2090-12-31", { frequency: "DAILY", until: "2091-01-01" }).dates)
    .toEqual(["2090-12-31", "2091-01-01"]);
});

it.each(["", "2090-01-02", "2090-01-03", "2090-02-30", "2090-03-01", "2091-01-04"])(
  "rejects invalid or excessive repeat end %s", until => {
    expect(repeatPreview("2090-01-03", { frequency: "DAILY", until }).error).not.toBe("");
  },
);

const stored = {
  id: 12, vendorId: 7, venueName: "Existing lunch", address: "CSUN",
  latitude: 34.24, longitude: -118.53,
  startsAt: "2090-01-02T19:00:00Z", endsAt: "2090-01-02T22:00:00Z",
  timeZone: "America/Los_Angeles", status: "scheduled", version: 0,
};
const response = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300, status, json: async () => body,
});
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url.startsWith("/api/operator/schedule-addresses?")) {
      return response(200, [{ address: "18111 NORDHOFF ST", latitude: 34.24, longitude: -118.53 }]);
    }
    if (url === "/api/auth/csrf") return response(200, { headerName: "X-CSRF-TOKEN", token: "fresh" });
    if (options?.method === "POST") return response(201, [stored, { ...stored, id: 13 }]);
    return response(200, { items: [stored], totalElements: 1, page: 0, totalPages: 1 });
  });
});

async function openForm() {
  render(<MemoryRouter><SchedulePanel vendorId={7} /></MemoryRouter>);
  await screen.findByRole("heading", { name: "Existing lunch" });
  fireEvent.click(screen.getByText("Add stop"));
  for (const [label, value] of [
    ["Venue name", "Weekly lunch"], ["Street address", "18111 Nordhoff St"],
    ["City", "Northridge"], ["Start date", "2090-01-03"], ["Start time", "11:00"],
    ["End date", "2090-01-03"], ["End time", "14:00"],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByText("Find address"));
  fireEvent.click(await screen.findByText("Use 18111 NORDHOFF ST"));
}

function repeat(frequency: RepeatRule["frequency"], until: string) {
  fireEvent.change(screen.getByLabelText("Repeat"), { target: { value: frequency } });
  fireEvent.change(screen.getByLabelText("Repeat through"), { target: { value: until } });
}

it("submits one atomic repeat request with CSRF and the selected address", async () => {
  await openForm();
  repeat("WEEKLY", "2090-01-10");
  expect(screen.getByText("2 stops will be created.")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Save 2 stops"));
  await screen.findByText("2 stops saved to BiteMap. Edit or cancel each stop separately.");
  const writes = fetchMock.mock.calls.filter(([, options]) => options?.method === "POST");
  expect(writes).toHaveLength(1);
  expect(writes[0][0]).toBe("/api/operator/vendors/7/stops/repeat");
  expect(writes[0][1].headers["X-CSRF-TOKEN"]).toBe("fresh");
  expect(JSON.parse(writes[0][1].body)).toMatchObject({
    frequency: "WEEKLY", until: "2090-01-10",
    stop: { address: "18111 NORDHOFF ST", latitude: 34.24, longitude: -118.53,
      startsAt: "2090-01-03T11:00:00-08:00", endsAt: "2090-01-03T14:00:00-08:00" },
  });
});

it("does not send an oversized recurrence", async () => {
  await openForm();
  repeat("DAILY", "2090-04-03");
  fireEvent.submit(screen.getByRole("form", { name: "Schedule stop" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("2–52 stops");
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
});

it("keeps a repeat draft and blocks retry after a conflict", async () => {
  await openForm();
  repeat("EVERY_2_WEEKS", "2090-01-17");
  fetchMock.mockResolvedValueOnce(response(200, { headerName: "X-CSRF-TOKEN", token: "fresh" }))
    .mockResolvedValueOnce(response(409, { detail: "No stops saved. 2090-01-17: This truck already has a stop." }));
  fireEvent.click(screen.getByText("Save 2 stops"));
  expect(await screen.findByRole("alert")).toHaveTextContent("No stops saved");
  expect(screen.getByLabelText("Repeat")).toHaveValue("EVERY_2_WEEKS");
  expect(screen.getByText("Save 2 stops")).toBeDisabled();
});

it("edits an existing occurrence without offering to generate another series", async () => {
  render(<MemoryRouter><SchedulePanel vendorId={7} /></MemoryRouter>);
  fireEvent.click(await screen.findByText("Edit Existing lunch"));
  expect(screen.queryByLabelText("Repeat")).not.toBeInTheDocument();
  expect(screen.getByText("Save stop")).toBeInTheDocument();
});
