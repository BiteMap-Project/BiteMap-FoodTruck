import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import OperatorWorkspace from "./OperatorWorkspace";

const fetchMock = vi.fn();
const account = { id: 1, displayName: "Owner", email: "owner@example.com", roles: ["ROLE_OPERATOR"] };
const order = { id: 42, vendorId: 7, status: "PLACED", version: 0, total: 8.5,
  createdAt: "2026-10-15T18:00:00Z", updatedAt: "2026-10-15T18:00:00Z", estimatedReadyAt: null, cancellationReason: null,
  items: [{ menuItemId: 2, name: "Saved taco", unitPrice: 4.25, quantity: 2, lineTotal: 8.5 }] };
const page = (items: unknown[], current = 0, totalPages = 1) => ({ items, page: current, size: 20, totalElements: items.length, totalPages });
const response = (status: number, body?: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
let current: typeof order;
beforeEach(() => {
  current = { ...order };
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/csrf") return response(200, { headerName: "X-CSRF-TOKEN", token: "fresh" });
    if (url.includes("vendors?")) return response(200, page([{ id: 7, name: "Spicy Food", category: "Food", location: "CSUN" }, { id: 8, name: "Other truck", category: "Food", location: "CSUN" }]));
    if (url.includes("menu-items?")) return response(200, page([]));
    if (url.includes("/orders?")) return response(200, page([current]));
    if (init?.method === "PATCH") { const body = JSON.parse(init.body as string); current = { ...current, ...body, version: current.version + 1 }; return response(200, current); }
    if (url.endsWith("/orders/42")) return response(200, current);
    return response(500);
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
async function show() {
  render(<MemoryRouter><Routes><Route path="*" element={<OperatorWorkspace account={account} onSignOut={() => {}} signingOut={false} logoutError="" />} />
    <Route path="/operator/login" element={<p>Sign in again</p>} /></Routes></MemoryRouter>);
  await screen.findByRole("heading", { name: "Spicy Food" });
  fireEvent.click(screen.getByRole("button", { name: "Orders" }));
}
async function detail() {
  await show();
  fireEvent.click(await screen.findByRole("button", { name: "View order #42" }));
  await screen.findByText("Saved taco");
}
const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");

it("reopens a bookmarked order and queue filter without a previous component session", async () => {
  render(<MemoryRouter initialEntries={["/operator/vendors/7/orders?order=42&status=PLACED&page=0"]}><OperatorWorkspace account={account} onSignOut={() => {}} signingOut={false} logoutError="" /></MemoryRouter>);
  expect(await screen.findByText("Saved taco")).toBeInTheDocument();
  expect(screen.getByLabelText("Order status")).toHaveValue("PLACED");
  expect(fetchMock).toHaveBeenCalledWith("/api/operator/vendors/7/orders?page=0&size=20&status=PLACED", expect.objectContaining({ credentials: "same-origin" }));
});

it("loads the selected truck queue and saved order detail", async () => {
  await detail();
  expect(fetchMock).toHaveBeenCalledWith("/api/operator/vendors/7/orders?page=0&size=20", expect.objectContaining({ credentials: "same-origin" }));
  expect(screen.getByText("Saved taco")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Accept order" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Mark ready" })).not.toBeInTheDocument();
});
it("sends current version and fresh CSRF then exposes only the next action", async () => {
  await detail();
  fireEvent.click(screen.getByRole("button", { name: "Accept order" }));
  expect(await screen.findByRole("button", { name: "Mark ready" })).toBeEnabled();
  expect(fetchMock).toHaveBeenCalledWith("/api/operator/vendors/7/orders/42/status", expect.objectContaining({
    method: "PATCH", credentials: "same-origin", headers: expect.objectContaining({ "X-CSRF-TOKEN": "fresh" }),
    body: JSON.stringify({ status: "ACCEPTED", version: 0 }),
  }));
  fireEvent.click(screen.getByRole("button", { name: "Mark ready" }));
  fireEvent.click(await screen.findByRole("button", { name: "Mark collected" }));
  expect(await screen.findByText("This order is completed. No further changes are allowed.")).toBeInTheDocument();
});
it("sets a preparation estimate without changing order status", async () => {
  await detail();
  fireEvent.change(screen.getByLabelText("Ready-time estimate"), { target: { value: "30" } });
  fireEvent.click(screen.getByRole("button", { name: "Set estimate" }));
  await screen.findByText("Estimated ready");
  const call = fetchMock.mock.calls.find(([url, init]) => url.endsWith("/orders/42/estimate") && init?.method === "PATCH");
  expect(call).toBeDefined();
  const body = JSON.parse(call![1].body as string);
  expect(body.version).toBe(0);
  expect(new Date(body.estimatedReadyAt).getTime()).toBeGreaterThan(Date.now() + 29 * 60_000);
  expect(current.status).toBe("PLACED");
});
it("requires a reason and explicit cancellation confirmation", async () => {
  await detail();
  fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
  const submit = screen.getByRole("button", { name: "Confirm cancellation" });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason visible to the customer"), { target: { value: " Kitchen closed " } });
  fireEvent.click(submit);
  await waitFor(() => expect(screen.getByText("Kitchen closed", { selector: "p" })).toBeInTheDocument());
  expect(JSON.parse(writes()[0][1].body)).toEqual({ status: "CANCELLED", version: 0, cancellationReason: "Kitchen closed" });
  expect(screen.queryByRole("button", { name: "Accept order" })).not.toBeInTheDocument();
});
it.each([409, 503])("blocks stale or uncertain writes after %s until explicit detail refresh", async code => {
  await detail();
  const original = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => init?.method === "PATCH" ? response(code, { detail: "Refresh required" }) : original(url, init));
  fireEvent.click(screen.getByRole("button", { name: "Accept order" }));
  await screen.findByText(/Refresh required/);
  expect(screen.getByRole("button", { name: "Accept order" })).toBeDisabled();
  expect(writes()).toHaveLength(1);
  current = { ...current, status: "ACCEPTED", version: 1 };
  fireEvent.click(screen.getByRole("button", { name: "Refresh order details" }));
  expect(await screen.findByRole("button", { name: "Mark ready" })).toBeEnabled();
  expect(writes()).toHaveLength(1);
});
it("prevents double clicks while a write is pending", async () => {
  await detail();
  const original = fetchMock.getMockImplementation()!;
  let resolve!: (value: unknown) => void;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => init?.method === "PATCH" ? new Promise(r => { resolve = r; }) : original(url, init));
  const accept = screen.getByRole("button", { name: "Accept order" });
  fireEvent.click(accept); fireEvent.click(accept);
  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(accept).toBeDisabled();
  await act(async () => resolve(response(200, { ...order, status: "ACCEPTED", version: 1 })));
});
it("handles empty queues, filters, and repeat refreshes", async () => {
  const original = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => url.includes("/orders?") ? response(200, page([])) : original(url, init));
  await show();
  expect(await screen.findByText("No orders match this filter.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Order status"), { target: { value: "READY" } });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/operator/vendors/7/orders?page=0&size=20&status=READY", expect.anything()));
  fireEvent.click(screen.getByRole("button", { name: "Refresh orders" }));
  expect(await screen.findByText("No orders match this filter.")).toBeInTheDocument();
});
it("redirects on expired sessions without attempting a write", async () => {
  await detail();
  fetchMock.mockResolvedValue(response(401));
  fireEvent.click(screen.getByRole("button", { name: "Accept order" }));
  expect(await screen.findByText("Sign in again")).toBeInTheDocument();
  expect(writes()).toHaveLength(0);
});
it.each([403,404])("shows a safe detail error for %s instead of retaining action buttons", async code => {
  const original = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => url.endsWith("/orders/42") ? response(code) : original(url, init));
  await show();
  fireEvent.click(await screen.findByRole("button", { name: "View order #42" }));
  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "Accept order" })).not.toBeInTheDocument();
});
it("ignores a late detail response after switching trucks", async () => {
  let resolve!: (value: unknown) => void;
  const original = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => url.endsWith("/orders/42") ? new Promise(r => { resolve = r; }) : url.includes("/8/orders?") ? response(200, page([])) : original(url, init));
  await show();
  fireEvent.click(await screen.findByRole("button", { name: "View order #42" }));
  fireEvent.change(screen.getByLabelText("Your truck"), { target: { value: "8" } });
  await screen.findByText("No orders match this filter.");
  await act(async () => resolve(response(200, order)));
  expect(screen.queryByText("Saved taco")).not.toBeInTheDocument();
});
it("paginates orders and resets to page zero when filtering", async () => {
  const original = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes("/orders?")) return response(200, page([order], url.includes("page=1") ? 1 : 0, 2));
    return original(url, init);
  });
  await show();
  fireEvent.click(await screen.findByRole("button", { name: "Next orders" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/operator/vendors/7/orders?page=1&size=20", expect.anything()));
  fireEvent.change(screen.getByLabelText("Order status"), { target: { value: "PLACED" } });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/operator/vendors/7/orders?page=0&size=20&status=PLACED", expect.anything()));
});
it("does not retry a write after a lost network response", async () => {
  await detail();
  const original = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => init?.method === "PATCH" ? Promise.reject(new TypeError("Network failed")) : original(url, init));
  fireEvent.click(screen.getByRole("button", { name: "Accept order" }));
  await screen.findByText(/Connection interrupted/);
  expect(screen.getByRole("button", { name: "Accept order" })).toBeDisabled();
  expect(writes()).toHaveLength(1);
});
it("refreshes the queue periodically only while visible", async () => {
  const interval = vi.spyOn(window, "setInterval");
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  await show();
  await screen.findByRole("button", { name: "View order #42" });
  const tick = interval.mock.calls.find(([, delay]) => delay === 30000)![0] as () => void;
  const before = fetchMock.mock.calls.filter(([url]) => url.includes("/orders?")).length;
  await act(async () => tick());
  expect(fetchMock.mock.calls.filter(([url]) => url.includes("/orders?")).length).toBeGreaterThan(before);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  const hidden = fetchMock.mock.calls.length;
  await act(async () => tick());
  expect(fetchMock.mock.calls.length).toBe(hidden);
  vi.restoreAllMocks();
});
