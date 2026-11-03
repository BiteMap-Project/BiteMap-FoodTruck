import { act, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import OrderConfirmationPage from "./OrderConfirmationPage";

const fetchMock = vi.fn();
const order = { id: 42, vendorId: 7, vendorName: "Spicy Food", status: "PLACED", total: 8.5,
  createdAt: "2026-10-15T18:00:00Z", estimatedReadyAt: null, cancellationReason: null,
  items: [{ menuItemId: 1, name: "Taco", quantity: 2, unitPrice: 4.25, lineTotal: 8.5 }] };
const response = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body });
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); fetchMock.mockResolvedValue(response(order));
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function show(path = "/orders/42/confirmation") {
  await act(async () => {
    render(<MemoryRouter initialEntries={[path]}><Link to="/orders/43/confirmation">Other order</Link><Routes>
      <Route path="/orders/:id/confirmation" element={<OrderConfirmationPage />} />
    </Routes></MemoryRouter>);
  });
}
const tick = async (ms = 10000) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

it("shows placed, accepted, ready and collected status without reloading", async () => {
  await show();
  expect(screen.getByText("Your order has been placed.")).toBeInTheDocument();
  for (const [status, message] of [["ACCEPTED","Your order has been accepted."],["READY","Your order is ready for pickup."],["COMPLETED","Your order has been collected."]]) {
    fetchMock.mockResolvedValue(response({ ...order, status }));
    await tick();
    expect(screen.getByText(message)).toBeInTheDocument();
  }
  const count = fetchMock.mock.calls.length;
  await tick(60000); expect(fetchMock).toHaveBeenCalledTimes(count);
  expect(fetchMock.mock.calls.every(([, init]) => !init.method)).toBe(true);
});
it("shows the operator's ready-time estimate while the order is being prepared", async () => {
  fetchMock.mockResolvedValue(response({ ...order, status: "ACCEPTED", estimatedReadyAt: "2026-10-15T18:30:00Z" }));
  await show();
  expect(screen.getByText("Estimated ready time")).toBeInTheDocument();
  expect(
    document.querySelector('time[datetime="2026-10-15T18:30:00Z"]'),
  ).toBeInTheDocument();
});
it("shows cancellation reason as text and stops polling", async () => {
  fetchMock.mockResolvedValue(response({ ...order, status: "CANCELLED", cancellationReason: "<b>Kitchen closed</b>" }));
  await show();
  expect(screen.getByText("Your order was cancelled.")).toBeInTheDocument();
  expect(screen.getByText("<b>Kitchen closed</b>")).toBeInTheDocument();
  expect(screen.queryByText("Total due at pickup")).not.toBeInTheDocument();
  await tick(60000); expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("pauses while hidden and refreshes immediately when visible", async () => {
  await show();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  await tick(30000); expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock.mockResolvedValue(response({ ...order, status: "READY" }));
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(screen.getByText("Your order is ready for pickup.")).toBeInTheDocument();
});
it("retains the last known status on transient failure then recovers", async () => {
  await show(); fetchMock.mockRejectedValue(new TypeError("offline"));
  await tick();
  expect(screen.getByRole("alert")).toHaveTextContent(/last known|could not refresh/i);
  expect(screen.getByText("Your order has been placed.")).toBeInTheDocument();
  fetchMock.mockResolvedValue(response({ ...order, status: "ACCEPTED" }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Refresh status" })));
  expect(screen.getByText("Your order has been accepted.")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it.each([401,403,404])("clears private data and stops polling on %s", async code => {
  await show(); fetchMock.mockResolvedValue(response({ detail: "Denied" }, code));
  await tick();
  expect(screen.queryByText("Taco")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toBeInTheDocument();
  const count = fetchMock.mock.calls.length;
  await tick(60000); expect(fetchMock).toHaveBeenCalledTimes(count);
  if (code === 401) expect(screen.getByRole("link", { name: "Customer sign in" })).toHaveAttribute("href", expect.stringContaining("/customer/login"));
});
it("does not overlap refreshes or apply results after unmount", async () => {
  let resolve!: (value: unknown) => void;
  fetchMock.mockImplementation(() => new Promise(r => { resolve = r; }));
  await show();
  expect(screen.getByRole("button", { name: "Refresh status" })).toBeDisabled();
  await tick(10000); expect(fetchMock).toHaveBeenCalledTimes(1);
  const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
  await act(async () => fireEvent.click(screen.getByText("Other order")));
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(response({ ...order, id: 43, status: "READY" })));
  expect(screen.queryByText(/Order #42/)).not.toBeInTheDocument();
});
it("ignores a late response for a previously viewed order", async () => {
  let resolve!: (value: unknown) => void;
  fetchMock.mockImplementation((path: string) => path.includes("/42") ? new Promise(r => { resolve = r; }) : Promise.resolve(response({ ...order, id:43, vendorName:"Other truck" })));
  await show();
  await act(async () => fireEvent.click(screen.getByText("Other order")));
  await act(async () => resolve(response(order)));
  expect(screen.getByText("Order #43 · Other truck")).toBeInTheDocument();
  expect(screen.queryByText(/Order #42/)).not.toBeInTheDocument();
});
it("does not fetch malformed order IDs", async () => {
  await show("/orders/not-an-id/confirmation");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("Order not found.");
});
it("aborts stalled requests and provides retry without duplicating orders", async () => {
  fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  await show(); await tick(15000);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Refresh status" })).toBeEnabled();
});
it("backs off failed polling instead of hammering the server", async () => {
  await show(); fetchMock.mockRejectedValue(new TypeError("offline"));
  await tick(); expect(fetchMock).toHaveBeenCalledTimes(2);
  await tick(); expect(fetchMock).toHaveBeenCalledTimes(2);
  await tick(); expect(fetchMock).toHaveBeenCalledTimes(3);
  await tick(30000); expect(fetchMock).toHaveBeenCalledTimes(3);
  await tick(); expect(fetchMock).toHaveBeenCalledTimes(4);
});
it("old aborted requests cannot cancel the resumed request timeout", async () => {
  let firstReject!: (error: unknown) => void;
  fetchMock.mockImplementationOnce(() => new Promise((_resolve, reject) => { firstReject = reject; }));
  fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  await show();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  await act(async () => firstReject(new DOMException("Aborted", "AbortError")));
  await tick(15000);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "Refresh status" })).toBeEnabled();
  expect(screen.getByRole("alert")).toBeInTheDocument();
});
it("does not treat an unknown status as collected", async () => {
  fetchMock.mockResolvedValue(response({ ...order, status: "UNRECOGNIZED" }));
  await show();
  expect(screen.getByText("Order status is unavailable.")).toBeInTheDocument();
  expect(screen.queryByText("Your order has been collected.")).not.toBeInTheDocument();
});
