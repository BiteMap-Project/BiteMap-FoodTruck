import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { addCartItem, readCart } from "../features/cart/cart";
import CustomerLoginPage from "./CustomerLoginPage";
import CustomerRegisterPage from "./CustomerRegisterPage";
import OperatorOnboardingPage from "./OperatorOnboardingPage";

const fetchMock = vi.fn();
const response = (status: number, body?: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn(async () => body),
}) as unknown as Response;

beforeEach(() => {
  sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

it("signs in and returns to the existing cart", async () => {
  addCartItem(4, "Taco Truck", { id: 8, name: "Taco", price: 4.5 });
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/auth/me") return response(401);
    if (url === "/api/auth/csrf") return response(200, { headerName: "X-CSRF-TOKEN", token: "token" });
    if (url === "/api/auth/login") return response(200, {
      id: 7,
      displayName: "Casey",
      email: "casey@example.com",
      roles: ["ROLE_CUSTOMER"],
    });
    return response(500);
  });
  render(
    <MemoryRouter initialEntries={[{ pathname: "/customer/login", state: { returnTo: "/cart" } }]}>
      <Routes>
        <Route path="/customer/login" element={<CustomerLoginPage />} />
        <Route path="/cart" element={<p>Returned to cart</p>} />
      </Routes>
    </MemoryRouter>,
  );

  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "casey@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a private password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in and return to cart" }));

  expect(await screen.findByText("Returned to cart")).toBeInTheDocument();
  expect(readCart()?.items[0].name).toBe("Taco");
});

it("registers a customer and sends them to sign in", async () => {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/auth/csrf") return response(200, { headerName: "X-CSRF-TOKEN", token: "token" });
    if (url === "/api/auth/register") return response(201, {
      id: 7,
      displayName: "Casey",
      email: "casey@example.com",
      roles: ["ROLE_CUSTOMER"],
    });
    return response(500);
  });
  render(
    <MemoryRouter initialEntries={["/customer/register"]}>
      <Routes>
        <Route path="/customer/register" element={<CustomerRegisterPage />} />
        <Route path="/customer/login" element={<p>Customer login route</p>} />
      </Routes>
    </MemoryRouter>,
  );

  fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Casey" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "casey@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a private password" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "a private password" } });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));

  expect(await screen.findByText("Customer login route")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/register", expect.objectContaining({ method: "POST" }));
});

it("activates owner tools for a signed-in customer", async () => {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/auth/me") return response(200, {
      id: 7,
      displayName: "Casey",
      email: "casey@example.com",
      roles: ["ROLE_CUSTOMER"],
    });
    if (url === "/api/auth/csrf") return response(200, { headerName: "X-CSRF-TOKEN", token: "token" });
    if (url === "/api/auth/become-operator") return response(200, {
      id: 7,
      displayName: "Casey",
      email: "casey@example.com",
      roles: ["ROLE_CUSTOMER", "ROLE_OPERATOR"],
    });
    return response(500);
  });
  render(
    <MemoryRouter initialEntries={["/operator/onboarding"]}>
      <Routes>
        <Route path="/operator/onboarding" element={<OperatorOnboardingPage />} />
        <Route path="/operator" element={<p>Operator workspace</p>} />
      </Routes>
    </MemoryRouter>,
  );

  fireEvent.click(await screen.findByRole("button", { name: "Activate owner workspace" }));

  expect(await screen.findByText("Operator workspace")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/become-operator", expect.objectContaining({ method: "POST" }));
});
