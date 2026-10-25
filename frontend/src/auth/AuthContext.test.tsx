import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "./authState";
import { reportAuthorizationResponse } from "./authEvents";
import { RequireAccount, RequireAdmin, RequireOperator } from "./RouteGuards";

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

function DraftEditor() {
  const [name, setName] = useState("");
  return <form aria-label="Draft editor">
    <input aria-label="Draft name" value={name} onChange={event => setName(event.target.value)} />
    <input aria-label="Draft photo" type="file" />
  </form>;
}

function SessionActions() {
  const { account, signOut } = useAuth();
  return <><button onClick={() => void signOut()}>Sign out</button>
    <output aria-label="Current roles">{account?.roles.join(",")}</output></>;
}

function renderDraft(Guard: (props: { children: ReactNode }) => ReactNode = RequireOperator) {
  return render(<MemoryRouter initialEntries={["/protected"]}><AuthProvider><AccountProbe label="session" /><SessionActions /><Routes>
    <Route path="/protected" element={<Guard><DraftEditor /></Guard>} />
    <Route path="/operator/login" element={<p>Sign in again</p>} />
    <Route path="/customer/login" element={<p>Sign in again</p>} />
    <Route path="/operator/onboarding" element={<p>Apply for owner access</p>} />
  </Routes></AuthProvider></MemoryRouter>);
}

async function startFocusCheck(Guard = RequireOperator) {
  let resolve!: (value: Response) => void;
  fetchMock.mockResolvedValueOnce(response(200, { ...operator, roles: [...operator.roles, "ROLE_ADMIN"] }))
    .mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
  renderDraft(Guard);
  const form = await screen.findByRole("form", { name: "Draft editor" });
  fireEvent.change(screen.getByLabelText("Draft name"), { target: { value: "Chicken Rice Bowl" } });
  const photo = screen.getByLabelText("Draft photo");
  const file = new File(["fixture"], "ricebowl.jpg", { type: "image/jpeg" });
  fireEvent.change(photo, { target: { files: [file] } });
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  return { form, photo, file, resolve };
}

it.each([RequireOperator, RequireAccount, RequireAdmin])("keeps the protected draft and file input mounted during file-picker focus checks (%#)", async Guard => {
  const { form, photo, file, resolve } = await startFocusCheck(Guard);
  expect(screen.getByRole("form", { name: "Draft editor" })).toBe(form);
  await act(async () => resolve(response(200, { ...operator, roles: [...operator.roles, "ROLE_ADMIN"] })));
  expect(screen.getByRole("form", { name: "Draft editor" })).toBe(form);
  expect(screen.getByLabelText("Draft name")).toHaveValue("Chicken Rice Bowl");
  expect(screen.getByLabelText("Draft photo")).toBe(photo);
  expect((photo as HTMLInputElement).files?.[0]).toBe(file);
});

it("removes the protected editor when the background check discovers expiration", async () => {
  const { resolve } = await startFocusCheck();
  await act(async () => resolve(response(401)));
  expect(await screen.findByText("Sign in again")).toBeInTheDocument();
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});

it("removes the protected editor when the background check discovers revoked owner access", async () => {
  const { resolve } = await startFocusCheck();
  await act(async () => resolve(response(200, customer)));
  expect(await screen.findByText("Apply for owner access")).toBeInTheDocument();
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});

it("blocks the editor on a failed background session check instead of pretending it succeeded", async () => {
  const { resolve } = await startFocusCheck();
  await act(async () => resolve(response(503)));
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to check your session");
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});

it.each([RequireOperator, RequireAccount, RequireAdmin])("discards a previous account's draft when the session identity changes (%#)", async Guard => {
  const { form, resolve } = await startFocusCheck(Guard);
  await act(async () => resolve(response(200, { ...operator, id: 99, roles: [...operator.roles, "ROLE_ADMIN"] })));
  expect(screen.getByRole("form", { name: "Draft editor" })).not.toBe(form);
  expect(screen.getByLabelText("Draft name")).toHaveValue("");
});

it("does not restore a session from a stale focus response after a 401", async () => {
  const { resolve } = await startFocusCheck();
  act(() => reportAuthorizationResponse(401));
  await act(async () => resolve(response(200, operator)));
  expect(await screen.findByText("Sign in again")).toBeInTheDocument();
  expect(screen.getByText("session: signed out")).toBeInTheDocument();
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});

it("does not restore a session from a stale focus response after logout", async () => {
  const { resolve } = await startFocusCheck();
  fetchMock.mockResolvedValueOnce(response(200, { headerName: "X-CSRF-TOKEN", token: "test" }))
    .mockResolvedValueOnce(response(204));
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByText("session: signed out");
  await act(async () => resolve(response(200, operator)));
  expect(screen.getByText("session: signed out")).toBeInTheDocument();
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});

it("ignores an older focus check after a newer check revokes owner access", async () => {
  const { resolve } = await startFocusCheck();
  fetchMock.mockResolvedValueOnce(response(200, customer));
  fireEvent(window, new Event("focus"));
  await screen.findByText("Apply for owner access");
  await act(async () => resolve(response(200, operator)));
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  // A refresh consumer must observe the newer customer-only account as well.
  expect(screen.getByLabelText("Current roles")).toHaveTextContent(/^ROLE_CUSTOMER$/);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
