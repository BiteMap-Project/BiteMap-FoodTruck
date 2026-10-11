import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import OperatorHomePage from "../../pages/OperatorHomePage";

const fetchMock = vi.fn();
const account = { id: 2, displayName: "Owner", email: "owner@example.com", roles: ["ROLE_CUSTOMER", "ROLE_OPERATOR"] };
const vendor = { id: 7, name: "Spicy Food", category: "Tacos", location: "CSUN" };
const item = { id: 10, vendorId: 7, name: "Taco", description: "Fresh", price: 4.5, status: "ACTIVE", version: 3 };
const page = (items: unknown[], current = 0, totalPages = 1) => ({ items, page: current, size: 20, totalElements: items.length, totalPages });
const response = (status: number, body?: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/auth/me") return response(200, account);
    if (url === "/api/auth/csrf") return response(200, { headerName: "X-CSRF-TOKEN", token: "fresh-token" });
    if (url.startsWith("/api/operator/vendors?")) return response(200, page([vendor]));
    if (url.includes("menu-items?")) return response(200, page([item]));
    return response(500);
  });
});

function show(path = "/owner") {
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/owner" element={<OperatorHomePage />} /><Route path="/operator/login" element={<p>Login screen</p>} /></Routes></MemoryRouter>);
}
it("opens the Schedule tab for the selected owned truck", async () => {
  show(); await screen.findByRole("heading", { name: "Spicy Food" });
  fetchMock.mockResolvedValueOnce(response(200, page([])));
  fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
  expect(await screen.findByText(/No stops on this page/)).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith("/api/operator/vendors/7/stops?page=0&size=20", expect.objectContaining({ credentials: "same-origin" }));
});
async function openMenu() {
  show();
  await screen.findByRole("heading", { name: "Spicy Food" });
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  await screen.findByRole("heading", { name: "Taco" });
}

it("protects the owner route and never requests vendors for an anonymous session", async () => {
  fetchMock.mockResolvedValue(response(401)); show();
  expect(await screen.findByText("Login screen")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("shows owned vendor data, not local demo orders or sales", async () => {
  show();
  expect(await screen.findByRole("heading", { name: "Spicy Food" })).toBeInTheDocument();
  expect(screen.queryByText("The Rolling Kitchen")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Orders" }));
  expect(screen.getByText("Orders are not connected yet")).toBeInTheDocument();
});

it("offers first-vendor creation when the account owns no vendors", async () => {
  fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url === "/api/auth/me") return response(200, account);
    if (url === "/api/auth/csrf") return response(200, { headerName: "X-CSRF-TOKEN", token: "fresh-token" });
    if (options?.method === "POST") return response(201, vendor);
    return response(200, page([]));
  });
  show(); await screen.findByText("No trucks yet");
  fireEvent.click(screen.getByRole("button", { name: "New truck" }));
  fireEvent.change(screen.getByLabelText("Truck name"), { target: { value: "Spicy Food" } });
  fireEvent.change(screen.getByLabelText("Cuisine / category"), { target: { value: "Tacos" } });
  fireEvent.change(screen.getByLabelText("Location"), { target: { value: "CSUN" } });
  fireEvent.submit(screen.getByRole("form", { name: "Create truck" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/operator/vendors", expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Spicy Food", category: "Tacos", location: "CSUN" }) })));
});

it("sends fresh CSRF and the current version for a status change", async () => {
  await openMenu();
  fetchMock.mockResolvedValueOnce(response(200, { headerName: "X-CSRF-TOKEN", token: "fresh-token" }))
    .mockResolvedValueOnce(response(200, { ...item, status: "SOLD_OUT", version: 4 }))
    .mockResolvedValueOnce(response(200, page([{ ...item, status: "SOLD_OUT", version: 4 }])));
  fireEvent.change(screen.getByLabelText("Availability for Taco"), { target: { value: "SOLD_OUT" } });
  await waitFor(() => expect(screen.getByLabelText("Availability for Taco")).toHaveValue("SOLD_OUT"));
  expect(fetchMock).toHaveBeenCalledWith("/api/operator/vendors/7/menu-items/10/availability", expect.objectContaining({ method: "PATCH", credentials: "same-origin", headers: expect.objectContaining({ "X-CSRF-TOKEN": "fresh-token" }), body: JSON.stringify({ status: "SOLD_OUT", version: 3 }) }));
});

it("blocks stale saves until explicit reload and does not retry writes", async () => {
  await openMenu();
  fetchMock.mockResolvedValueOnce(response(200, { headerName: "X-CSRF-TOKEN", token: "fresh-token" })).mockResolvedValueOnce(response(409));
  fireEvent.change(screen.getByLabelText("Availability for Taco"), { target: { value: "INACTIVE" } });
  expect(await screen.findByRole("alert")).toHaveTextContent("changed elsewhere");
  expect(screen.getByLabelText("Availability for Taco")).toBeDisabled();
  expect(screen.getByLabelText("Availability for Taco")).toHaveValue("ACTIVE");
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Reload menu" }));
  await waitFor(() => expect(screen.getByLabelText("Availability for Taco")).toBeEnabled());
});

it("redirects when a write reports an expired session", async () => {
  await openMenu();
  fetchMock.mockResolvedValueOnce(response(401));
  fireEvent.change(screen.getByLabelText("Availability for Taco"), { target: { value: "SOLD_OUT" } });
  expect(await screen.findByText("Login screen")).toBeInTheDocument();
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
});

it("preserves entered fields on server failure and sends detail edits without status", async () => {
  await openMenu(); fireEvent.click(screen.getByRole("button", { name: "Edit Taco" }));
  fireEvent.change(screen.getByLabelText("Price (USD)"), { target: { value: "7.25" } });
  fetchMock.mockResolvedValueOnce(response(200, { headerName: "X-CSRF-TOKEN", token: "fresh-token" })).mockResolvedValueOnce(response(503));
  fireEvent.submit(screen.getByRole("form", { name: "Edit menu item" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
  expect(screen.getByLabelText("Price (USD)")).toHaveValue("7.25");
  expect(fetchMock).toHaveBeenCalledWith("/api/operator/vendors/7/menu-items/10", expect.objectContaining({ method: "PUT", body: JSON.stringify({ name: "Taco", description: "Fresh", price: 7.25, version: 3 }) }));
});

it("validates menu prices before sending writes", async () => {
  await openMenu(); fireEvent.click(screen.getByRole("button", { name: "Add menu item" }));
  fireEvent.change(screen.getByLabelText("Item name"), { target: { value: "Bowl" } });
  fireEvent.change(screen.getByLabelText("Price (USD)"), { target: { value: "3.456" } });
  fireEvent.submit(screen.getByRole("form", { name: "Add menu item" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("2 decimal places");
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method)).toHaveLength(0);
});

it("creates an item using the real status DTO and reloads the menu", async () => {
  await openMenu(); fireEvent.click(screen.getByRole("button", { name: "Add menu item" }));
  fireEvent.change(screen.getByLabelText("Item name"), { target: { value: "Bowl" } });
  fireEvent.change(screen.getByLabelText("Price (USD)"), { target: { value: "8.50" } });
  fireEvent.change(screen.getByLabelText("Initial availability"), { target: { value: "INACTIVE" } });
  fetchMock.mockResolvedValueOnce(response(200, { headerName: "X-CSRF-TOKEN", token: "fresh-token" })).mockResolvedValueOnce(response(201, { ...item, name: "Bowl" }));
  fireEvent.submit(screen.getByRole("form", { name: "Add menu item" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/operator/vendors/7/menu-items", expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Bowl", description: null, price: 8.5, status: "INACTIVE" }) })));
  await waitFor(() => expect(screen.queryByRole("form", { name: "Add menu item" })).not.toBeInTheDocument());
});

it("updates only the selected vendor's profile", async () => {
  await openMenu(); fireEvent.click(screen.getByRole("button", { name: "Truck Details" }));
  fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Reseda" } });
  fetchMock.mockResolvedValueOnce(response(200, { headerName: "X-CSRF-TOKEN", token: "fresh-token" })).mockResolvedValueOnce(response(200, { ...vendor, location: "Reseda" }));
  fireEvent.submit(screen.getByRole("form", { name: "Edit truck" }));
  expect(await screen.findByText("Saved to BiteMap.")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith("/api/operator/vendors/7", expect.objectContaining({ method: "PUT", body: JSON.stringify({ name: "Spicy Food", category: "Tacos", location: "Reseda" }) }));
});

it.each([403, 404])("blocks mutations after a %s access rejection", async (status) => {
  await openMenu();
  fetchMock.mockResolvedValueOnce(response(200, { headerName: "X-CSRF-TOKEN", token: "fresh-token" })).mockResolvedValueOnce(response(status));
  fireEvent.change(screen.getByLabelText("Availability for Taco"), { target: { value: "INACTIVE" } });
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Add menu item" })).toBeDisabled();
});

it("supports vendor and menu pagination", async () => {
  const original = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("vendors?page=0")) return response(200, page([vendor], 0, 2));
    if (url.includes("vendors?page=1")) return response(200, page([{ ...vendor, id: 8, name: "Second truck" }], 1, 2));
    if (url.includes("menu-items?page=0")) return response(200, page([item], 0, 2));
    if (url.includes("menu-items?page=1")) return response(200, page([], 1, 2));
    return original(url, init);
  });
  await openMenu();
  fireEvent.click(screen.getByRole("button", { name: "Next menu" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("menu-items?page=1"), expect.anything()));
  fireEvent.click(screen.getByRole("button", { name: "Next trucks" }));
  expect(await screen.findByRole("heading", { name: "Second truck" })).toBeInTheDocument();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/operator/vendors/8/menu-items?page=0&size=20", expect.anything()));
});

it("ignores a late menu response from a previously selected vendor", async () => {
  let resolveFirst: (value: unknown) => void = () => {};
  const original = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("vendors?")) return response(200, page([vendor, { ...vendor, id: 8, name: "Second truck" }]));
    if (url.includes("/7/menu-items")) return new Promise(resolve => { resolveFirst = resolve; });
    if (url.includes("/8/menu-items")) return response(200, page([{ ...item, vendorId: 8, name: "Second menu" }]));
    return original(url, init);
  });
  show(); await screen.findByRole("heading", { name: "Spicy Food" });
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  fireEvent.change(screen.getByLabelText("Your truck"), { target: { value: "8" } });
  expect(await screen.findByRole("heading", { name: "Second menu" })).toBeInTheDocument();
  await act(async () => resolveFirst(response(200, page([item]))));
  expect(screen.queryByRole("heading", { name: "Taco" })).not.toBeInTheDocument();
});
