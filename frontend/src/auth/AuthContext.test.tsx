import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "./authState";
import { reportAuthorizationResponse } from "./authEvents";
import { RequireAdmin, RequireOperator } from "./RouteGuards";

const fetchMock = vi.fn();
const response = (status: number, body?: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const customer = { id: 7, displayName: "Casey", email: "casey@example.com", roles: ["ROLE_CUSTOMER"] };
const operator = { ...customer, roles: ["ROLE_CUSTOMER", "ROLE_OPERATOR"] };

beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });

function AccountProbe({ label }: { label: string }) {
  const { account, status } = useAuth();
  return <p>{label}: {status === "ready" ? account?.displayName ?? "signed out" : status}</p>;
}

it("loads one session and shares it with every consumer", async () => {
  fetchMock.mockResolvedValue(response(200, customer));
  render(<AuthProvider><AccountProbe label="nav" /><AccountProbe label="cart" /></AuthProvider>);
  expect(await screen.findByText("nav: Casey")).toBeInTheDocument();
  expect(screen.getByText("cart: Casey")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("clears protected account state when an API reports an expired session", async () => {
  fetchMock.mockResolvedValue(response(200, operator));
  render(<AuthProvider><AccountProbe label="session" /></AuthProvider>);
  await screen.findByText("session: Casey");
  reportAuthorizationResponse(401);
  expect(await screen.findByText("session: signed out")).toBeInTheDocument();
});

it("refreshes roles when access is denied", async () => {
  fetchMock.mockResolvedValueOnce(response(200, customer)).mockResolvedValueOnce(response(200, operator));
  function RoleProbe() {
    const { account } = useAuth();
    return <p>{account?.roles.join(",")}</p>;
  }
  render(<AuthProvider><RoleProbe /></AuthProvider>);
  await screen.findByText("ROLE_CUSTOMER");
  reportAuthorizationResponse(403);
  expect(await screen.findByText("ROLE_CUSTOMER,ROLE_OPERATOR")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("routes customers to onboarding and lets operators enter protected routes", async () => {
  fetchMock.mockResolvedValue(response(200, customer));
  const view = render(<MemoryRouter initialEntries={["/operator"]}><AuthProvider><Routes>
    <Route path="/operator" element={<RequireOperator><p>Owner workspace</p></RequireOperator>} />
    <Route path="/operator/onboarding" element={<p>Owner onboarding</p>} />
  </Routes></AuthProvider></MemoryRouter>);
  expect(await screen.findByText("Owner onboarding")).toBeInTheDocument();
  view.unmount();

  fetchMock.mockReset();
  fetchMock.mockResolvedValue(response(200, operator));
  render(<MemoryRouter initialEntries={["/operator"]}><AuthProvider><Routes>
    <Route path="/operator" element={<RequireOperator><p>Owner workspace</p></RequireOperator>} />
  </Routes></AuthProvider></MemoryRouter>);
  expect(await screen.findByText("Owner workspace")).toBeInTheDocument();
});

it("does not render administrator content for a non-admin account", async () => {
  fetchMock.mockResolvedValue(response(200, customer));
  render(<MemoryRouter><AuthProvider><RequireAdmin><p>Private reviews</p></RequireAdmin></AuthProvider></MemoryRouter>);
  expect(await screen.findByRole("alert")).toHaveTextContent("Administrator access required");
  expect(screen.queryByText("Private reviews")).not.toBeInTheDocument();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
});
