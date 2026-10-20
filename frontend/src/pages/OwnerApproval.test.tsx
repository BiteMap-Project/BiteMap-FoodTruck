import { fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import OperatorOnboardingPage from "./OperatorOnboardingPage";
import AdminApplicationsPage from "./AdminApplicationsPage";
import { RequireAdmin } from "../auth/RouteGuards";
import AuthTestHarness from "../test/AuthTestHarness";
const render = (ui: ReactElement) => rtlRender(<AuthTestHarness>{ui}</AuthTestHarness>);
const fetchMock = vi.fn();
const response = (status: number, body?: unknown) => ({ ok: status < 400, status, json: async () => body });
const account = { id: 1, displayName: "Casey", email: "casey@example.com", roles: ["ROLE_CUSTOMER"] };
const application = { id: 5, businessName: "Casey Foods", contactEmail: "casey@example.com", operatingArea: "CSUN", status: "PENDING" };
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch",fetchMock); });
const show = (admin = false) => render(<MemoryRouter><Routes><Route path="/" element={admin ? <RequireAdmin><AdminApplicationsPage /></RequireAdmin> : <OperatorOnboardingPage />} /><Route path="/operator" element={<p>Owner workspace destination</p>} /></Routes></MemoryRouter>);
it("pending applicants keep customer access but have no activation button", async () => {
  fetchMock.mockResolvedValueOnce(response(200,account)).mockResolvedValueOnce(response(200,application)); show();
  expect(await screen.findByRole("heading",{ name:"Application pending" })).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Access your truck"})).not.toBeInTheDocument();
  expect(screen.getByRole("link",{name:"Continue as a customer"})).toHaveAttribute("href","/trucks");
});
it("approved customers explicitly refresh their session before entering owner tools", async () => {
  fetchMock.mockResolvedValueOnce(response(200,account)).mockResolvedValueOnce(response(200,{...application,status:"APPROVED"}))
    .mockResolvedValueOnce(response(200,{headerName:"X-CSRF-TOKEN",token:"fresh"})).mockResolvedValueOnce(response(200,{...account,roles:["ROLE_CUSTOMER","ROLE_OPERATOR"]})); show();
  fireEvent.click(await screen.findByRole("button",{name:"Access your truck"}));
  expect(await screen.findByText("Owner workspace destination")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/become-operator",expect.objectContaining({method:"POST"}));
});
it("shows the rejection reason without granting access", async () => {
  fetchMock.mockResolvedValueOnce(response(200,account)).mockResolvedValueOnce(response(200,{...application,status:"REJECTED",reviewNote:"Business details need clarification."})); show();
  expect(await screen.findByText("Business details need clarification.")).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Access your truck"})).not.toBeInTheDocument();
});
it("does not request private review data for a customer", async () => {
  fetchMock.mockResolvedValue(response(200,account)); show(true);
  expect(await screen.findByRole("alert")).toHaveTextContent("Administrator access required");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("requires a confirmed review and sends it with CSRF", async () => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if(url==="/api/auth/me") return response(200,{...account,roles:["ROLE_CUSTOMER","ROLE_ADMIN"]});
    if(url==="/api/auth/csrf") return response(200,{headerName:"X-CSRF-TOKEN",token:"fresh"});
    if(init?.method==="POST") return response(200,{...application,status:"APPROVED"});
    return response(200,[application]);
  }); show(true);
  const save=await screen.findByRole("button",{name:"Save review"}); expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Review note (visible to applicant)"),{target:{value:"Business verified"}});
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(save);
  await waitFor(()=>expect(fetchMock).toHaveBeenCalledWith("/api/admin/owner-applications/5/review",expect.objectContaining({method:"POST",body:JSON.stringify({decision:"APPROVED",note:"Business verified"}),headers:expect.objectContaining({"X-CSRF-TOKEN":"fresh"})})));
});
it("keeps the application form hidden when status cannot be loaded",async()=>{
  fetchMock.mockResolvedValueOnce(response(200,account)).mockResolvedValueOnce(response(503));show();
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Submit application"})).not.toBeInTheDocument();
});
