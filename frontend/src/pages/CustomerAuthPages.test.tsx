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

it.each([
  ["/cart", "Sign in and return to cart"],
  ["/trucks", "Sign in and browse trucks"],
])("signs in with a shared owner account and returns to %s", async (returnTo, buttonLabel) => {
  addCartItem(4, "Taco Truck", { id: 8, name: "Taco", price: 4.5 });
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/auth/me") return response(401);
    if (url === "/api/auth/csrf") return response(200, { headerName: "X-CSRF-TOKEN", token: "token" });
    if (url === "/api/auth/login") return response(200, {
      id: 7,
      displayName: "Casey",
      email: "casey@example.com",
      roles: ["ROLE_CUSTOMER", "ROLE_OPERATOR"],
    });
    return response(500);
  });
  render(
    <MemoryRouter initialEntries={[{ pathname: "/customer/login", state: { returnTo } }]}>
      <Routes>
        <Route path="/customer/login" element={<CustomerLoginPage />} />
        <Route path={returnTo} element={<p>Returned to destination</p>} />
      </Routes>
    </MemoryRouter>,
  );

  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "casey@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a private password" } });
  fireEvent.click(screen.getByRole("button", { name: buttonLabel }));

  expect(await screen.findByText("Returned to destination")).toBeInTheDocument();
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
  expect(screen.getByRole("link", { name: "Customer sign in" })).toHaveAttribute("href", "/customer/login");
  expect(screen.getByText(/even as a truck owner/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "casey@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a private password" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "a private password" } });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));

  expect(await screen.findByText("Customer login route")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/register", expect.objectContaining({ method: "POST" }));
});

it("submits an application without activating owner tools", async () => {
  let submitted = false;
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/auth/me") return response(200, {
      id: 7,
      displayName: "Casey",
      email: "casey@example.com",
      roles: ["ROLE_CUSTOMER"],
    });
    if (url === "/api/auth/csrf") return response(200, { headerName: "X-CSRF-TOKEN", token: "token" });
    if (url === "/api/customer/owner-application") {
      if (!submitted) { submitted = true; return response(204); }
      return response(201, { id: 1, businessName: "Casey Foods", status: "PENDING" });
    }
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

  fireEvent.change(await screen.findByLabelText("Business name"), { target: { value: "Casey Foods" } });
  fireEvent.change(screen.getByLabelText("Operating area"), { target: { value: "CSUN" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit application" }));
  expect(await screen.findByRole("heading", { name: "Application pending" })).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith("/api/customer/owner-application", expect.objectContaining({ method: "POST" }));
  expect(fetchMock.mock.calls.some(([url]) => url === "/api/auth/become-operator")).toBe(false);
});
