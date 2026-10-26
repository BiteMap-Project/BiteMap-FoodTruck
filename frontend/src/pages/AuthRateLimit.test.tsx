import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthContext";
import CustomerLoginPage from "./CustomerLoginPage";
import OperatorLoginPage from "./OperatorLoginPage";
import CustomerRegisterPage from "./CustomerRegisterPage";
import OperatorRegisterPage from "./OperatorRegisterPage";

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });

it.each([CustomerLoginPage, OperatorLoginPage, CustomerRegisterPage, OperatorRegisterPage])(
  "shows cooldown and re-enables submission without automatically retrying (%#)", async Page => {
    let writes = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/me") return new Response(null, { status: 401 });
      if (url === "/api/auth/csrf") return new Response(JSON.stringify({ headerName: "X-CSRF-TOKEN", token: "test" }));
      writes++;
      return new Response(JSON.stringify({ detail: "Too many authentication attempts. Please wait before trying again." }),
        { status: 429, headers: { "Retry-After": "1" } });
    });
    render(<MemoryRouter><AuthProvider><Page /></AuthProvider></MemoryRouter>);
    const name = screen.queryByLabelText("Display name");
    if (name) fireEvent.change(name, { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "test@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Private test password" } });
    const confirm = screen.queryByLabelText("Confirm password");
    if (confirm) fireEvent.change(confirm, { target: { value: "Private test password" } });
    const submit = screen.getByRole("button", { name: /^(Sign in|Create account)/ });
    fireEvent.click(submit);
    await screen.findByRole("alert");
    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent("Try again in");
    fireEvent.submit(submit.closest("form")!);
    expect(writes).toBe(1);
    await waitFor(() => expect(submit).toBeEnabled(), { timeout: 2500 });
    expect(writes).toBe(1);
    expect(screen.getByLabelText("Email")).toHaveValue("test@example.test");
  });
