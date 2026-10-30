import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import App from "../App";
import { AuthProvider } from "../auth/AuthContext";
import { reportAuthorizationResponse } from "../auth/authEvents";

const fetchMock = vi.fn();
const alice = { id: 1, displayName: "Alice", email: "alice@example.test", roles: ["ROLE_CUSTOMER"] };
const bob = { ...alice, id: 2, displayName: "Bob", email: "bob@example.test" };
const order = { id: 42, vendorId: 7, vendorName: "Alice private truck", status: "COMPLETED", total: 8,
  createdAt: "2026-10-15T18:00:00Z", items: [], pickup: null };
const reply = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body }) as Response;
const routes = ["/orders", "/orders/42/confirmation"];
const payload = (path: string) => path === "/orders" ? { items: [order], page: 0, totalPages: 1 } : order;
const show = (path: string) => render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);

beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });

it.each(routes)("removes private data when a focus check discovers account switching on %s", async path => {
  let account = alice;
  fetchMock.mockImplementation((url: string) => Promise.resolve(url === "/api/auth/me" ? reply(account)
    : account.id === alice.id ? reply(payload(path)) : path === "/orders" ? reply({ items: [], page: 0, totalPages: 0 }) : reply({}, 404)));
  show(path);
  await screen.findByText(/Alice private truck/);
  account = bob;
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(screen.queryByText(/Alice private truck/)).not.toBeInTheDocument());
  if (path === "/orders") expect(await screen.findByText("No orders yet.")).toBeInTheDocument();
  else expect(await screen.findByRole("alert")).toHaveTextContent("not available to your account");
});

it.each(routes)("clears even completed order data after session expiration on %s", async path => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(reply(url === "/api/auth/me" ? alice : payload(path))));
  show(path);
  await screen.findByText(/Alice private truck/);
  act(() => reportAuthorizationResponse(401));
  expect(await screen.findByRole("heading", { name: "Customer sign in" })).toBeInTheDocument();
  expect(screen.queryByText(/Alice private truck/)).not.toBeInTheDocument();
});

it.each(routes)("aborts old requests and ignores late success after account switch on %s", async path => {
  let account = alice;
  let resolve!: (response: Response) => void;
  let signal!: AbortSignal;
  fetchMock.mockImplementation((url: string, init: RequestInit) => {
    if (url === "/api/auth/me") return Promise.resolve(reply(account));
    if (account.id === bob.id) return Promise.resolve(path === "/orders" ? reply({ items: [], page: 0, totalPages: 0 }) : reply({}, 404));
    signal = init.signal as AbortSignal;
    return new Promise<Response>(done => { resolve = done; });
  });
  show(path);
  await waitFor(() => expect(signal).toBeDefined());
  account = bob;
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(signal.aborted).toBe(true));
  await act(async () => resolve(reply(payload(path))));
  expect(screen.queryByText(/Alice private truck/)).not.toBeInTheDocument();
});

it.each(routes)("hides private orders if session verification fails on %s", async path => {
  let failed = false;
  fetchMock.mockImplementation((url: string) => Promise.resolve(url === "/api/auth/me"
    ? failed ? reply({}, 503) : reply(alice) : reply(payload(path))));
  show(path);
  await screen.findByText(/Alice private truck/);
  failed = true;
  fireEvent(window, new Event("focus"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to check your session");
  expect(screen.queryByText(/Alice private truck/)).not.toBeInTheDocument();
});

it.each(routes)("aborts an in-flight order read on logout and ignores its late failure on %s", async path => {
  let reject!: (cause: Error) => void;
  let signal!: AbortSignal;
  let signedOut = false;
  fetchMock.mockImplementation((url: string, init: RequestInit) => {
    if (url === "/api/auth/me") return Promise.resolve(signedOut ? reply({}, 401) : reply(alice));
    signal = init.signal as AbortSignal;
    return new Promise<Response>((_resolve, fail) => { reject = fail; });
  });
  show(path);
  await waitFor(() => expect(signal).toBeDefined());
  signedOut = true;
  fireEvent(window, new Event("focus"));
  await screen.findByRole("heading", { name: "Customer sign in" });
  expect(signal.aborted).toBe(true);
  await act(async () => reject(new TypeError("Network response arrived after logout")));
  expect(screen.queryByText("Unable to load your orders. Please try again.")).not.toBeInTheDocument();
  expect(screen.queryByText(/Alice private truck/)).not.toBeInTheDocument();
});

it.each(routes)("does not request private order data before session verification on %s", async path => {
  let resolve!: (response: Response) => void;
  fetchMock.mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
  show(path);
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/auth/me"]);
  await act(async () => resolve(reply({}, 401)));
  await screen.findByRole("heading", { name: "Customer sign in" });
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/auth/me"]);
});
