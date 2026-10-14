import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import AccountNavigation from "./AccountNavigation";

const fetchMock = vi.fn();
const account = { id: 7, displayName: "Spicy Food", email: "owner@example.com", roles: ["ROLE_CUSTOMER"] };
const response = (status: number, body?: unknown) => ({ ok: status < 400, status, json: async () => body });
const show = () => render(<MemoryRouter><AccountNavigation /></MemoryRouter>);
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });

it("checks the backend before offering sign in to a guest", async () => {
  fetchMock.mockResolvedValue(response(401));
  show();
  expect(screen.getByText("Checking your session…")).toBeInTheDocument();
  expect(screen.queryByText("Customer sign in")).not.toBeInTheDocument();
  expect(await screen.findByText("Customer sign in")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", expect.objectContaining({ credentials: "same-origin" }));
});

it.each([false, true])("shows the server name and role-aware actions (operator: %s)", async (operator) => {
  fetchMock.mockResolvedValue(response(200, { ...account, roles: operator ? ["ROLE_CUSTOMER", "ROLE_OPERATOR"] : account.roles }));
  show();
  expect(await screen.findByText("Spicy Food")).toBeInTheDocument();
  expect(screen.getByText("Signed in · Customer")).toBeInTheDocument();
  expect(screen.queryByText("Customer sign in")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: operator ? "Access your truck" : "Owner application" })).toHaveAttribute("href", operator ? "/operator" : "/operator/onboarding");
});

it("does not mistake a server failure for a signed-out session and allows retry", async () => {
  fetchMock.mockResolvedValueOnce(response(503)).mockResolvedValueOnce(response(200, account));
  show();
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to check your session");
  expect(screen.queryByText("Customer sign in")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry session check" }));
  expect(await screen.findByText("Spicy Food")).toBeInTheDocument();
});

it("refreshes the session on window focus after expiration or another tab signs out", async () => {
  fetchMock.mockResolvedValueOnce(response(200, account)).mockResolvedValueOnce(response(401));
  show();
  await screen.findByText("Spicy Food");
  fireEvent(window, new Event("focus"));
  expect(await screen.findByText("Customer sign in")).toBeInTheDocument();
  expect(screen.queryByText("Spicy Food")).not.toBeInTheDocument();
});

it("signs out with a fresh CSRF token and confirms the session ended", async () => {
  fetchMock.mockResolvedValueOnce(response(200, account))
    .mockResolvedValueOnce(response(200, { headerName: "X-CSRF-TOKEN", token: "fresh" }))
    .mockResolvedValueOnce(response(204)).mockResolvedValueOnce(response(401));
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
  expect(await screen.findByText("Customer sign in")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST", headers: { "X-CSRF-TOKEN": "fresh" }, credentials: "same-origin" }));
});

it("keeps account information and permits retry when sign out fails", async () => {
  fetchMock.mockResolvedValueOnce(response(200, account)).mockResolvedValueOnce(response(503));
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to sign out");
  expect(screen.getByText("Spicy Food")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled());
});
