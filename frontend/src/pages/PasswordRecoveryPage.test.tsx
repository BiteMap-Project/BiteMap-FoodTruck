import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthContext";
import PasswordRecoveryPage from "./PasswordRecoveryPage";

const fetchMock=vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch",fetchMock); fetchMock.mockReset();
  fetchMock.mockImplementation(async (url:string) => url === "/api/auth/me" ? new Response(null,{status:401}) :
    new Response(JSON.stringify({headerName:"X-CSRF-TOKEN",token:"csrf-test"})));
});
function Location() { return <div data-testid="path">{useLocation().hash}</div>; }
function show(reset=false) {
  render(<MemoryRouter initialEntries={[reset ? `/reset-password#token=${"a".repeat(43)}` : "/forgot-password"]}>
    <AuthProvider><PasswordRecoveryPage reset={reset}/><Location/></AuthProvider></MemoryRouter>);
}
it("submits a CSRF-protected email request and shows only the generic confirmation",async()=>{
  const base=fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async(url:string,...args:unknown[])=>url.endsWith("forgot-password") ?
    new Response(JSON.stringify({message:"If an eligible account exists, check your email."}),{status:202}) : base(url,...args));
  show(); fireEvent.change(screen.getByLabelText("Email"),{target:{value:"person@example.test"}});
  fireEvent.click(screen.getByRole("button",{name:"Send reset link"}));
  expect(await screen.findByRole("status")).toHaveTextContent("If an eligible account exists");
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/forgot-password",expect.objectContaining({
    credentials:"same-origin",body:JSON.stringify({email:"person@example.test"}),
    headers:expect.objectContaining({"X-CSRF-TOKEN":"csrf-test"})}));
});
it("removes the token from the URL and rejects mismatched confirmation without sending",async()=>{
  show(true);
  await waitFor(()=>expect(screen.getByTestId("path")).toHaveTextContent(/^$/));
  fireEvent.change(screen.getByLabelText("New password",{exact:true}),{target:{value:"Long enough password!"}});
  fireEvent.change(screen.getByLabelText("Confirm new password"),{target:{value:"Different password!"}});
  fireEvent.click(screen.getByRole("button",{name:"Update password"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match");
  expect(fetchMock.mock.calls.filter(([url])=>url==="/api/auth/reset-password")).toHaveLength(0);
});
it("honors cooldown and does not retry automatically",async()=>{
  const base=fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async(url:string,...args:unknown[])=>url.endsWith("forgot-password") ?
    new Response("",{status:429,headers:{"Retry-After":"1"}}) : base(url,...args));
  show(); fireEvent.change(screen.getByLabelText("Email"),{target:{value:"person@example.test"}});
  fireEvent.click(screen.getByRole("button",{name:"Send reset link"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests");
  expect(screen.getByRole("button",{name:/Try again/})).toBeDisabled();
  await waitFor(()=>expect(screen.getByRole("button",{name:"Send reset link"})).toBeEnabled(),{timeout:2500});
  expect(fetchMock.mock.calls.filter(([url])=>url==="/api/auth/forgot-password")).toHaveLength(1);
});
it("shows a controlled invalid-token error without a false success",async()=>{
  const base=fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async(url:string,...args:unknown[])=>url.endsWith("reset-password") ?
    new Response(JSON.stringify({detail:"This reset link is invalid or expired. Request a new link."}),{status:400}) : base(url,...args));
  show(true);
  for(const label of ["New password","Confirm new password"]) fireEvent.change(screen.getByLabelText(label,{exact:true}),{target:{value:"Long enough password!"}});
  fireEvent.click(screen.getByRole("button",{name:"Update password"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("invalid or expired");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
