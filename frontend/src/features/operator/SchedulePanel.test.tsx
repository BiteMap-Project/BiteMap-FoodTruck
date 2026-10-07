import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import SchedulePanel from "./SchedulePanel";
import type { ManagedStop } from "../../services/operatorSchedules";

const stop: ManagedStop = { id: 12, vendorId: 7, venueName: "Campus lunch", address: "CSUN", latitude: 34.24, longitude: -118.53, startsAt: "2090-01-02T19:00:00Z", endsAt: "2090-01-02T22:00:00Z", timeZone: "America/Los_Angeles", status: "scheduled", version: 3, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
const response = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const page = (items: ManagedStop[] = [stop], current = 0, totalPages = 1) => ({ items, page: current, size: 20, totalElements: items.length, totalPages });
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url === "/api/auth/csrf") return response(200, { headerName: "X-CSRF-TOKEN", token: "fresh" });
    if (options?.method) return response(200, stop);
    return response(200, page());
  });
});
function show() { return render(<MemoryRouter><Routes><Route path="/" element={<SchedulePanel vendorId={7} />} /><Route path="/operator/login" element={<p>Login screen</p>} /></Routes></MemoryRouter>); }
async function open() { show(); await screen.findByRole("heading", { name: "Campus lunch" }); }
function fill() {
  for (const [label, value] of [["Venue name", "Dinner"], ["Street address", "Northridge"], ["Latitude", "34.24"], ["Longitude", "-118.53"], ["Start (local time)", "2090-01-03T11:00"], ["End (local time)", "2090-01-03T14:00"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
it("loads only the selected vendor's schedule and shows stored-zone times", async () => {
  await open(); expect(fetchMock).toHaveBeenCalledWith("/api/operator/vendors/7/stops?page=0&size=20", expect.objectContaining({ credentials: "same-origin", signal: expect.any(AbortSignal) }));
  expect(screen.getByText(/America\/Los_Angeles/)).toBeInTheDocument();
});
it("creates a stop with explicit offsets and fresh CSRF", async () => {
  await open(); fireEvent.click(screen.getByText("Add stop")); fill(); fireEvent.submit(screen.getByRole("form", { name: "Schedule stop" }));
  await screen.findByText("Schedule saved to BiteMap.");
  expect(fetchMock).toHaveBeenCalledWith("/api/operator/vendors/7/stops", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "X-CSRF-TOKEN": "fresh" }), body: JSON.stringify({ venueName: "Dinner", address: "Northridge", latitude: 34.24, longitude: -118.53, startsAt: "2090-01-03T11:00:00-08:00", endsAt: "2090-01-03T14:00:00-08:00", timeZone: "America/Los_Angeles" }) }));
});
it("edits using the stored version and nested contract", async () => {
  await open(); fireEvent.click(screen.getByText("Edit Campus lunch")); fireEvent.submit(screen.getByRole("form", { name: "Schedule stop" }));
  await screen.findByText("Schedule saved to BiteMap.");
  const call = fetchMock.mock.calls.find(([, options]) => options?.method === "PUT")!;
  expect(call[0]).toBe("/api/operator/vendors/7/stops/12"); expect(JSON.parse(call[1].body)).toMatchObject({ version: 3, stop: { venueName: "Campus lunch", startsAt: "2090-01-02T11:00:00-08:00" } });
});
it("requires cancellation confirmation and sends its version", async () => {
  await open(); fireEvent.click(screen.getByText("Cancel Campus lunch")); expect(fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("Keep stop")); expect(screen.queryByRole("group", { name: "Confirm cancellation" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Cancel Campus lunch")); fireEvent.click(screen.getByText("Confirm cancellation"));
  await screen.findByText("Schedule saved to BiteMap.");
  expect(fetchMock).toHaveBeenCalledWith("/api/operator/vendors/7/stops/12/cancel", expect.objectContaining({ method: "POST", body: '{"version":3}' }));
});
it("retains a conflicting draft and blocks writes until explicit reload", async () => {
  await open(); fireEvent.click(screen.getByText("Add stop")); fill();
  fetchMock.mockResolvedValueOnce(response(200, { headerName: "X-CSRF-TOKEN", token: "fresh" })).mockResolvedValueOnce(response(409, { detail: "This truck already has a stop during that time." }));
  fireEvent.submit(screen.getByRole("form", { name: "Schedule stop" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("already has a stop"); expect(screen.getByLabelText("Venue name")).toHaveValue("Dinner"); expect(screen.getByText("Save stop")).toBeDisabled();
  fireEvent.click(screen.getByText("Reload schedule (discard draft)")); await screen.findByRole("heading", { name: "Campus lunch" }); expect(screen.getByText("Add stop")).toBeEnabled();
});
it("shows empty results and retries a failed read", async () => {
  fetchMock.mockRejectedValueOnce(new Error("offline")); show(); await screen.findByRole("alert");
  fetchMock.mockResolvedValueOnce(response(200, page([]))); fireEvent.click(screen.getByText("Reload schedule")); expect(await screen.findByText(/No stops on this page/)).toBeInTheDocument();
});
it("navigates on expired sessions", async () => {
  fetchMock.mockResolvedValueOnce(response(401)); show(); expect(await screen.findByText("Login screen")).toBeInTheDocument();
});
it("preserves completed and cancelled history without edit or cancel actions", async () => {
  fetchMock.mockResolvedValueOnce(response(200, page([{ ...stop, endsAt: "2020-01-01T00:00:00Z" }, { ...stop, id: 13, venueName: "Cancelled stop", status: "cancelled" }]))); show(); await screen.findByText("Completed");
  expect(screen.getByText("Edit Campus lunch")).toBeDisabled(); expect(screen.getByText("Cancel Campus lunch")).toBeDisabled(); expect(screen.getByText("Edit Cancelled stop")).toBeDisabled(); expect(screen.getByText("Cancel Cancelled stop")).toBeDisabled();
});
it("pages schedules", async () => {
  fetchMock.mockResolvedValueOnce(response(200, page([stop], 0, 2))); await open(); fireEvent.click(screen.getByText("Next stops"));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/operator/vendors/7/stops?page=1&size=20", expect.anything()));
});
it("aborts reads when leaving the schedule", async () => {
  let resolve!: (value: unknown) => void;
  fetchMock.mockImplementationOnce(() => new Promise(r => { resolve = r; })); const view = show();
  const signal = fetchMock.mock.calls[0][1].signal; view.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => resolve(response(200, page())));
});
it("rejects invalid local times before any mutation", async () => {
  await open(); fireEvent.click(screen.getByText("Add stop")); fill(); fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "Not/AZone" } });
  fireEvent.submit(screen.getByRole("form", { name: "Schedule stop" })); expect(await screen.findByRole("alert")).toHaveTextContent("valid local times"); expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each([403, 404, 503])("blocks further writes after HTTP %i without losing the draft", async status => {
  await open(); fireEvent.click(screen.getByText("Add stop")); fill();
  fetchMock.mockResolvedValueOnce(response(200, { headerName: "X-CSRF-TOKEN", token: "fresh" })).mockResolvedValueOnce(response(status));
  fireEvent.submit(screen.getByRole("form", { name: "Schedule stop" }));
  await screen.findByRole("alert"); expect(screen.getByText("Save stop")).toBeDisabled(); expect(screen.getByLabelText("Venue name")).toHaveValue("Dinner");
});
it("prevents duplicate submissions while a request is pending", async () => {
  await open(); fireEvent.click(screen.getByText("Add stop")); fill();
  let resolve!: (value: unknown) => void;
  fetchMock.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  fireEvent.submit(screen.getByRole("form", { name: "Schedule stop" })); fireEvent.submit(screen.getByRole("form", { name: "Schedule stop" }));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => resolve(response(200, { headerName: "X-CSRF-TOKEN", token: "fresh" })));
  await screen.findByText("Schedule saved to BiteMap."); expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
});
it("does not reload or redirect from a mutation completed after leaving", async () => {
  const view = show(); await screen.findByRole("heading", { name: "Campus lunch" }); fireEvent.click(screen.getByText("Cancel Campus lunch"));
  let resolve!: (value: unknown) => void;
  fetchMock.mockResolvedValueOnce(response(200, { headerName: "X-CSRF-TOKEN", token: "fresh" })).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  fireEvent.click(screen.getByText("Confirm cancellation")); await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3)); view.unmount();
  await act(async () => resolve(response(200, stop))); expect(fetchMock).toHaveBeenCalledTimes(3);
});
