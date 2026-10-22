import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthContext";
import { RequireAccount } from "../auth/RouteGuards";
import AccountNavigation from "../features/discover/AccountNavigation";
import { validateDisplayName } from "../services/account";
import AccountSettingsPage from "./AccountSettingsPage";

const fetchMock = vi.fn();
const account = { id: 7, displayName: "Casey Customer", email: "casey@example.com", roles: ["ROLE_CUSTOMER"] };
const response = (status: number, body?: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const csrf = { headerName: "X-CSRF-TOKEN", token: "fresh-token" };

function show(path = "/account") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/account" element={<RequireAccount><AccountSettingsPage /><AccountNavigation /></RequireAccount>} />
          <Route path="/customer/login" element={<p>Customer login</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const patches = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

it("sends guests to customer sign-in", async () => {
  fetchMock.mockResolvedValue(response(401));
  show();
  expect(await screen.findByText("Customer login")).toBeInTheDocument();
});

it("shows the signed-in name and a read-only email", async () => {
  fetchMock.mockResolvedValue(response(200, account));
  show();
  const name = await screen.findByLabelText("Display name");
  expect(name).toHaveValue("Casey Customer");
  expect(screen.getByLabelText("Email")).toHaveValue("casey@example.com");
  expect(screen.getByLabelText("Email")).toHaveAttribute("readonly");
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
});

it("saves the trimmed name with CSRF and refreshes the navigation name", async () => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/me") return response(200, account);
    if (url === "/api/auth/csrf") return response(200, csrf);
    if (url === "/api/account/profile" && init?.method === "PATCH") return response(200, { ...account, displayName: "Casey C." });
    return response(500);
  });
  show();
  expect(await screen.findByText("Casey Customer", { selector: "strong" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "  Casey C.  " } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

  expect(await screen.findByRole("status")).toHaveTextContent("Your display name was saved.");
  const [url, init] = patches()[0];
  expect(url).toBe("/api/account/profile");
  expect(init).toMatchObject({ credentials: "same-origin", headers: expect.objectContaining({ "X-CSRF-TOKEN": "fresh-token" }) });
  expect(JSON.parse(init.body)).toEqual({ displayName: "Casey C." });
  // The navigation re-renders from the shared account, without a page reload.
  expect(screen.getByText("Casey C.", { selector: "strong" })).toBeInTheDocument();
  expect(screen.getByLabelText("Display name")).toHaveValue("Casey C.");
  expect(screen.getByRole("link", { name: "Account settings" })).toHaveAttribute("href", "/account");
});

it("blocks a blank name before calling the server", async () => {
  fetchMock.mockResolvedValue(response(200, account));
  show();
  fireEvent.change(await screen.findByLabelText("Display name"), { target: { value: "   " } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByText("Display name is required.")).toBeInTheDocument();
  expect(screen.getByLabelText("Display name")).toHaveAttribute("aria-invalid", "true");
  expect(patches()).toHaveLength(0);
});

it.each([
  [400, { detail: "Check your account details.", errors: { displayName: "Display name must be 120 characters or fewer." } },
    "Check your account details.", "Display name must be 120 characters or fewer."],
  [401, { detail: "Sign in to continue." }, "Your session ended. Sign in again to save changes.", null],
  [503, { detail: "Account settings are temporarily unavailable. Please try again later." },
    "Account settings are temporarily unavailable. Please try again later.", null],
])("shows a %s failure and keeps the typed name", async (status, body, alert, field) => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/me") return response(200, account);
    if (url === "/api/auth/csrf") return response(200, csrf);
    if (init?.method === "PATCH") return response(status, body);
    return response(500);
  });
  show();
  fireEvent.change(await screen.findByLabelText("Display name"), { target: { value: "Renamed" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  if (status === 401) {
    // A 401 signs the shared session out, so the guard sends the visitor to sign in.
    expect(await screen.findByText("Customer login")).toBeInTheDocument();
    return;
  }
  expect(await screen.findByRole("alert")).toHaveTextContent(alert);
  if (field) expect(screen.getByText(field)).toBeInTheDocument();
  expect(screen.getByLabelText("Display name")).toHaveValue("Renamed");
  await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled());
});

it("validates names the same way as the backend", () => {
  expect(validateDisplayName("Casey")).toBeUndefined();
  expect(validateDisplayName("  ")).toBe("Display name is required.");
  expect(validateDisplayName("x".repeat(120))).toBeUndefined();
  expect(validateDisplayName("x".repeat(121))).toBe("Display name must be 120 characters or fewer.");
  expect(validateDisplayName("Line\nbreak")).toBe("Display name cannot contain line breaks or control characters.");
});
