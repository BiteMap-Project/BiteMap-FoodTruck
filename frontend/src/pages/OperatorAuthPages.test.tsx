import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import OperatorHomePage from "./OperatorHomePage";
import OperatorLoginPage from "./OperatorLoginPage";
import OperatorRegisterPage from "./OperatorRegisterPage";

const fetchMock = vi.fn();
const response = (status: number, body?: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn(async () => body),
}) as unknown as Response;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

it("logs in and opens the operator route", async () => {
  fetchMock
    .mockResolvedValueOnce(response(200, { headerName: "X-CSRF-TOKEN", token: "token" }))
    .mockResolvedValueOnce(response(200, { id: 2, displayName: "Owner", email: "owner@example.com" }));
  render(
    <MemoryRouter initialEntries={["/operator/login"]}>
      <Routes>
        <Route path="/operator/login" element={<OperatorLoginPage />} />
        <Route path="/operator" element={<p>Operator route</p>} />
      </Routes>
    </MemoryRouter>,
  );

  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a private password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

  expect(await screen.findByText("Operator route")).toBeInTheDocument();
});

it("shows a local confirmation error without sending the passwords", async () => {
  render(
    <MemoryRouter>
      <OperatorRegisterPage />
    </MemoryRouter>,
  );

  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "first password value" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "different password" } });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));

  expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("redirects an anonymous operator session to login", async () => {
  fetchMock.mockResolvedValue(response(401));
  render(
    <MemoryRouter initialEntries={["/operator"]}>
      <Routes>
        <Route path="/operator" element={<OperatorHomePage />} />
        <Route path="/operator/login" element={<p>Sign-in route</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(await screen.findByText("Sign-in route")).toBeInTheDocument();
});

it("restores an operator session and logs out with a fresh CSRF token", async () => {
  fetchMock
    .mockResolvedValueOnce(response(200, { id: 2, displayName: "Food Truck Owner", email: "owner@example.com" }))
    .mockResolvedValueOnce(response(200, { items: [], page: 0, totalPages: 0 }))
    .mockResolvedValueOnce(response(200, { headerName: "X-CSRF-TOKEN", token: "logout-token" }))
    .mockResolvedValueOnce(response(204));
  render(
    <MemoryRouter initialEntries={["/operator"]}>
      <Routes>
        <Route path="/operator" element={<OperatorHomePage />} />
        <Route path="/operator/login" element={<p>Signed out</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(await screen.findByRole("heading", { name: "Welcome, Food Truck Owner" })).toBeInTheDocument();
  await screen.findByText("No trucks yet. Add your first truck below.");
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(await screen.findByText("Signed out")).toBeInTheDocument();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
});
