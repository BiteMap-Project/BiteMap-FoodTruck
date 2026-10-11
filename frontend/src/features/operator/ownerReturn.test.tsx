import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import App from "../../App";
import OperatorHomePage from "../../pages/OperatorHomePage";
import TruckMenuPage from "../../pages/TruckMenuPage";
import { readOwnerReturn, readWorkspaceRestore } from "./ownerReturn";

const fetchMock = vi.fn();
const account = { id: 2, displayName: "Owner", email: "owner@example.com", roles: ["ROLE_CUSTOMER", "ROLE_OPERATOR"] };
const first = { id: 7, name: "Spicy Food", category: "Tacos", location: "CSUN" };
const second = { id: 8, name: "Soup Cart", category: "Soup", location: "Reseda" };
const page = (items: unknown[]) => ({ items, page: 0, size: 20, totalElements: items.length, totalPages: 1 });
const response = (status: number, body?: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.clear();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/auth/me") return response(200, account);
    if (url.startsWith("/api/operator/vendors?")) return response(200, page([first, second]));
    if (url.includes("/menu-items?")) return response(200, page([]));
    if (url.includes("/stops?")) return response(200, page([]));
    if (url === "/api/vendors/8") return response(200, { ...second, menu: [] });
    return response(500);
  });
});

function ownerRoutes() {
  return (
    <Routes>
      <Route path="/operator" element={<OperatorHomePage />} />
      <Route path="/operator/login" element={<p>Login screen</p>} />
      <Route path="/operator/analytics" element={<p>Business insights</p>} />
      <Route path="/trucks" element={<p>Customer homepage</p>} />
      <Route path="/trucks/:id" element={<TruckMenuPage />} />
    </Routes>
  );
}

it("returns from the customer menu preview to the same truck and tab on the dashboard", async () => {
  render(<MemoryRouter initialEntries={["/operator"]}>{ownerRoutes()}</MemoryRouter>);

  // Pick the second truck and the Menu tab, then preview it as a customer.
  const truckPicker = await screen.findByRole("combobox", { name: "Your truck" });
  fireEvent.change(truckPicker, { target: { value: "8" } });
  const nav = screen.getByRole("navigation", { name: "Owner navigation" });
  fireEvent.click(within(nav).getByRole("button", { name: "Menu" }));
  fireEvent.click(screen.getByRole("link", { name: /View customer menu/ }));

  expect(await screen.findByRole("heading", { name: "Soup Cart" })).toBeInTheDocument();
  expect(screen.getByRole("note")).toHaveTextContent("previewing this menu");
  expect(screen.queryByRole("link", { name: "← Back to trucks" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("link", { name: "← Back to your dashboard" }));

  // Back on the dashboard without signing in again, still on Soup Cart / Menu.
  const picker = await screen.findByRole("combobox", { name: "Your truck" });
  expect(picker).toHaveValue("8");
  const navAgain = screen.getByRole("navigation", { name: "Owner navigation" });
  expect(within(navAgain).getByRole("button", { name: "Menu" })).toHaveAttribute("aria-current", "page");
  expect(screen.queryByText("Login screen")).not.toBeInTheDocument();
  expect(screen.queryByText("Customer homepage")).not.toBeInTheDocument();
});

it("keeps the normal back link for customers opening a truck page", async () => {
  render(<MemoryRouter initialEntries={["/trucks/8"]}>{ownerRoutes()}</MemoryRouter>);

  expect(await screen.findByRole("heading", { name: "Soup Cart" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "← Back to trucks" })).toHaveAttribute("href", "/trucks");
  expect(screen.queryByRole("link", { name: /Back to your dashboard/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("note")).not.toBeInTheDocument();
});

it("returns to business insights when the preview was opened from analytics", async () => {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/trucks/8", state: { ownerReturn: { from: "analytics" } } }]}>
      {ownerRoutes()}
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole("link", { name: "← Back to business insights" }));
  expect(await screen.findByText("Business insights")).toBeInTheDocument();
});

it("points the truck page's Owner workspace link at the workspace, not the login form", async () => {
  render(<MemoryRouter initialEntries={["/trucks/8"]}><App /></MemoryRouter>);
  expect(await screen.findByRole("link", { name: "Owner workspace →" })).toHaveAttribute("href", "/operator");
});

it("ignores missing or malformed navigation state", () => {
  expect(readOwnerReturn(null)).toBeNull();
  expect(readOwnerReturn({ ownerReturn: { from: "workspace", vendorId: "8", tab: "Menu" } })).toBeNull();
  expect(readOwnerReturn({ ownerReturn: { from: "workspace", vendorId: 8, tab: "Admin" } })).toBeNull();
  expect(readOwnerReturn({ ownerReturn: { from: "workspace", vendorId: 8, tab: "Menu" } }))
    .toEqual({ from: "workspace", vendorId: 8, tab: "Menu" });
  expect(readWorkspaceRestore({ restore: { vendorId: 8 } })).toBeNull();
  expect(readWorkspaceRestore({ restore: { vendorId: 8, tab: "Schedule" } })).toEqual({ vendorId: 8, tab: "Schedule" });
});
