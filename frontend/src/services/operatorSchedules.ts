import { WorkspaceError, type Page } from "./operatorWorkspace";

export type StopInput = { venueName: string; address: string; latitude: number; longitude: number; startsAt: string; endsAt: string; timeZone: string };
export type ManagedStop = StopInput & { id: number; vendorId: number; status: "scheduled" | "serving" | "ended" | "cancelled"; version: number; createdAt: string; updatedAt: string };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...options, credentials: "same-origin", headers: { Accept: "application/json", ...options.headers } });
  if (response.ok) return response.json();
  const messages: Record<number, string> = {
    400: "Check the stop details, dates and time zone.", 401: "Your session expired. Sign in again.",
    403: "Request denied. Refresh your session before trying again.", 404: "This schedule is not available to your account.",
    409: "Schedule conflict. Reload the schedule before trying again.",
  };
  let message = messages[response.status] ?? "The server is unavailable. Try again later.";
  if (response.status === 400 || response.status === 409) {
    const problem = await response.json().catch(() => null);
    if (typeof problem?.detail === "string") message = problem.detail;
  }
  throw new WorkspaceError(response.status, message);
}
async function write(path: string, method: string, body: object): Promise<ManagedStop> {
  const csrf = await request<{ headerName: string; token: string }>("/api/auth/csrf");
  return request(path, { method, headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token }, body: JSON.stringify(body) });
}
const base = (vendorId: number) => `/api/operator/vendors/${vendorId}/stops`;
export const listStops = (vendorId: number, page: number, signal?: AbortSignal) => request<Page<ManagedStop>>(`${base(vendorId)}?page=${page}&size=20`, { signal });
export const createStop = (vendorId: number, stop: StopInput) => write(base(vendorId), "POST", stop);
export const editStop = (vendorId: number, id: number, stop: StopInput, version: number) => write(`${base(vendorId)}/${id}`, "PUT", { stop, version });
export const cancelStop = (vendorId: number, id: number, version: number) => write(`${base(vendorId)}/${id}/cancel`, "POST", { version });
