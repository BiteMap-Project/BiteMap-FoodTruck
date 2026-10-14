import { AuthApiError, postWithCsrf } from "./auth";
export type OwnerApplication = {
  id: number; businessName: string; contactEmail: string; operatingArea: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submittedAt: string; reviewedAt: string | null; reviewedBy: number | null; reviewNote: string | null;
};
async function read<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  const response = await fetch(path, { credentials: "same-origin", headers: { Accept: "application/json" }, signal });
  if (response.status === 204) return null;
  if (!response.ok) throw new AuthApiError(response.status, response.status === 401 ? "Your session expired. Please sign in again." : response.status === 403 ? "You do not have access to this page." : "Unable to load applications. Please try again.");
  return response.json();
}
export const getOwnerApplication = (signal?: AbortSignal) => read<OwnerApplication>("/api/customer/owner-application", signal);
export const submitOwnerApplication = (body: { businessName: string; contactEmail: string; operatingArea: string }) =>
  postWithCsrf<OwnerApplication>("/api/customer/owner-application", body, "Unable to submit your application.");
export const getPendingApplications = async (page: number, signal?: AbortSignal) =>
  await read<OwnerApplication[]>(`/api/admin/owner-applications?page=${page}`, signal) ?? [];
export const reviewOwnerApplication = (id: number, decision: "APPROVED" | "REJECTED", note: string) =>
  postWithCsrf<OwnerApplication>(`/api/admin/owner-applications/${id}/review`, { decision, note }, "Unable to review this application. Reload before trying again.");
