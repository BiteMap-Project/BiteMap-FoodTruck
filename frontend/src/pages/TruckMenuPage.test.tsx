import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Link } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import App from "../App";
import TruckMenuPage from "./TruckMenuPage";
import { AuthProvider } from "../auth/AuthContext";
import { addCartItem, readCart, setCartQuantity } from "../features/cart/cart";

const truck = {
  id: -2, name: "Database Taco", category: "Tacos", location: "Northridge",
  menu: [{ id: 40, name: "Veggie Taco", description: "Beans and salsa", price: 4.5, available: false }],
};
const fetchMock = vi.fn();
vi.mock("../services/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("../services/auth")>(),
  getCurrentAccount: vi.fn(async () => null),
}));
const response = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body });
const app = <AuthProvider><App /></AuthProvider>;
const open = (id = "-2") => render(<MemoryRouter initialEntries={[`/trucks/${id}`]}>{app}</MemoryRouter>);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.clear();
});

it("adds an available database menu item to the customer cart", async () => {
  fetchMock.mockResolvedValue(response({ ...truck, menu: [{ ...truck.menu[0], available: true }] }));
  open();
  fireEvent.click(await screen.findByRole("button", { name: "Add Veggie Taco to cart" }));
  expect(screen.getByRole("status")).toHaveTextContent("Veggie Taco added");
  expect(screen.getByRole("link", { name: "Cart (1)" })).toHaveAttribute("href", "/cart");
});

it("shows inline quantity controls, updates the cart and removes the whole item", async () => {
  fetchMock.mockResolvedValue(response({ ...truck, menu: [{ ...truck.menu[0], available: true }] }));
  open();
  fireEvent.click(await screen.findByRole("button", { name: "Add Veggie Taco to cart" }));
  expect(screen.getByText("Added to cart (1)")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Decrease Veggie Taco quantity" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Increase Veggie Taco quantity" }));
  expect(screen.getByText("Added to cart (2)")).toBeInTheDocument();
  expect(readCart()?.items[0].quantity).toBe(2);
  expect(screen.getByRole("link", { name: "Cart (2)" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Decrease Veggie Taco quantity" }));
  expect(readCart()?.items[0].quantity).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Remove Veggie Taco from cart" }));
  expect(readCart()).toBeNull();
  expect(screen.getByRole("button", { name: "Add Veggie Taco to cart" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Cart (0)" })).toBeInTheDocument();
});

it("restores quantities and synchronizes other cart changes, with a maximum of ten", async () => {
  addCartItem(truck.id, truck.name, truck.menu[0]);
  setCartQuantity(40, 9);
  fetchMock.mockResolvedValue(response({ ...truck, menu: [{ ...truck.menu[0], available: true }] }));
  open();
  expect(await screen.findByText("Added to cart (9)")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Increase Veggie Taco quantity" }));
  expect(screen.getByRole("button", { name: "Increase Veggie Taco quantity" })).toBeDisabled();
  expect(readCart()?.items[0].quantity).toBe(10);
  act(() => { setCartQuantity(40, 3); });
  expect(screen.getByText("Added to cart (3)")).toBeInTheDocument();
});

it("does not modify another truck's cart even when menu item IDs match", async () => {
  addCartItem(99, "Other truck", truck.menu[0]);
  fetchMock.mockResolvedValue(response({ ...truck, menu: [{ ...truck.menu[0], available: true }] }));
  open();
  fireEvent.click(await screen.findByRole("button", { name: "Add Veggie Taco to cart" }));
  expect(screen.getByRole("status")).toHaveTextContent("another truck");
  expect(screen.queryByText(/Added to cart/)).not.toBeInTheDocument();
  expect(readCart()?.vendorId).toBe(99);
});

it("allows removing unavailable items but not increasing their quantity", async () => {
  addCartItem(truck.id, truck.name, truck.menu[0]);
  fetchMock.mockResolvedValue(response(truck));
  open();
  expect(await screen.findByText("Currently unavailable")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Increase Veggie Taco quantity" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Remove Veggie Taco from cart" }));
  expect(readCart()).toBeNull();
  expect(screen.queryByRole("button", { name: "Add Veggie Taco to cart" })).not.toBeInTheDocument();
});

it("opens the styled discovery page at /trucks", async () => {
  fetchMock.mockResolvedValue(response({ items: [], totalElements: 0, totalPages: 0, page: 0, size: 20 }));
  render(<MemoryRouter initialEntries={["/trucks"]}>{app}</MemoryRouter>);
  expect(screen.getByRole("heading", { name: "Your next great bite, nearby." })).toBeInTheDocument();
  expect(await screen.findByRole("searchbox")).toBeInTheDocument();
});

it("loads a direct URL with matching details, USD prices and unavailable items", async () => {
  fetchMock.mockResolvedValue(response(truck));
  open();
  expect(screen.getByRole("status")).toHaveTextContent("Loading truck");
  expect(await screen.findByRole("heading", { name: truck.name })).toBeInTheDocument();
  expect(fetchMock.mock.calls[0][0]).toBe("/api/vendors/-2");
  expect(screen.getByText("Location: Northridge")).toBeInTheDocument();
  expect(screen.getByText("Veggie Taco")).toBeInTheDocument();
  expect(screen.getByText("$4.50")).toBeInTheDocument();
  expect(screen.getByText("Currently unavailable")).toBeInTheDocument();
  expect(screen.queryByText(/Open until|Demo menu/)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Back to trucks/ })).toHaveAttribute("href", "/trucks");
});

it("shows an empty menu for a valid truck", async () => {
  fetchMock.mockResolvedValue(response({ ...truck, menu: [] }));
  open();
  expect(await screen.findByText("No menu available yet.")).toBeInTheDocument();
  expect(screen.getByText(/hasn.t posted its menu/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: truck.name })).toBeInTheDocument();
});

it.each([404, 400])("shows a return link for a missing or malformed truck (%s)", async (status) => {
  fetchMock.mockResolvedValue(response({}, status));
  open(status === 400 ? "invalid" : "999");
  expect(await screen.findByText("Truck not found.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Back to trucks/ })).toHaveAttribute("href", "/trucks");
});

it.each(["http", "network"])("recovers from a %s failure with Retry", async (kind) => {
  if (kind === "http") fetchMock.mockResolvedValueOnce(response({}, 503));
  else fetchMock.mockRejectedValueOnce(new Error("offline"));
  fetchMock.mockResolvedValue(response(truck));
  open();
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load this truck");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("heading", { name: truck.name })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("ignores a late response from a previous truck", async () => {
  let resolveOld!: (value: ReturnType<typeof response>) => void;
  fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
    .mockResolvedValue(response({ ...truck, id: 22, name: "Second Truck" }));
  render(<MemoryRouter initialEntries={["/trucks/11"]}>
    <Link to="/trucks/22">Next truck</Link>
    <Routes><Route path="/trucks/:id" element={<TruckMenuPage />} /></Routes>
  </MemoryRouter>);
  const oldSignal = fetchMock.mock.calls[0][1].signal;
  fireEvent.click(screen.getByRole("link", { name: "Next truck" }));
  expect(await screen.findByRole("heading", { name: "Second Truck" })).toBeInTheDocument();
  expect(oldSignal.aborted).toBe(true);
  await act(async () => resolveOld(response(truck)));
  expect(screen.queryByRole("heading", { name: truck.name })).not.toBeInTheDocument();
});

it("navigates from a database discovery card to its profile and back", async () => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(response(url.startsWith("/api/vendors?")
    ? { items: [truck], totalElements: 1, totalPages: 1, page: 0, size: 20 } : truck)));
  render(<MemoryRouter>{app}</MemoryRouter>);
  fireEvent.click(await screen.findByRole("link", { name: "View Profile & Menu" }));
  expect(await screen.findByText("Veggie Taco")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: /Back to trucks/ }));
  expect(await screen.findByRole("searchbox")).toBeInTheDocument();
});
