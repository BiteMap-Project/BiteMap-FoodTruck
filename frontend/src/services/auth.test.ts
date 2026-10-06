import { beforeEach, expect, it, vi } from "vitest";
import { AuthApiError, getCurrentOperator, loginOperator, logoutOperator, registerOperator } from "./auth";

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

it("gets a CSRF token before login and keeps the request in the same browser session", async () => {
  fetchMock
    .mockResolvedValueOnce(response(200, { headerName: "X-CSRF-TOKEN", token: "safe-token" }))
    .mockResolvedValueOnce(response(200, { id: 7, displayName: "Owner", email: "owner@example.com" }));

  await expect(loginOperator("owner@example.com", "a private password")).resolves.toMatchObject({ id: 7 });

  expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/auth/csrf", expect.objectContaining({ credentials: "same-origin" }));
  expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/login", expect.objectContaining({
    method: "POST",
    credentials: "same-origin",
    headers: expect.objectContaining({ "X-CSRF-TOKEN": "safe-token" }),
    body: JSON.stringify({ email: "owner@example.com", password: "a private password" }),
  }));
});

it("returns registration field errors from the safe problem response", async () => {
  fetchMock
    .mockResolvedValueOnce(response(200, { headerName: "X-CSRF-TOKEN", token: "token" }))
    .mockResolvedValueOnce(response(400, {
      detail: "Check the registration fields.",
      errors: { email: "must be a well-formed email address" },
    }));

  const request = registerOperator("Owner", "wrong", "a password long enough");
  await expect(request).rejects.toMatchObject({
    status: 400,
    fieldErrors: { email: "must be a well-formed email address" },
  });
  await expect(request).rejects.toBeInstanceOf(AuthApiError);
});

it("treats an unauthorized session check as signed out", async () => {
  fetchMock.mockResolvedValue(response(401));
  await expect(getCurrentOperator()).resolves.toBeNull();
});

it("handles the empty successful logout response", async () => {
  fetchMock
    .mockResolvedValueOnce(response(200, { headerName: "X-CSRF-TOKEN", token: "new-token" }))
    .mockResolvedValueOnce(response(204));
  await expect(logoutOperator()).resolves.toBeUndefined();
  expect(fetchMock).toHaveBeenLastCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
});
