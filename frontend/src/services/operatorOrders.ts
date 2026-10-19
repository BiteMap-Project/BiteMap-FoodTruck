import { AuthApiError } from "./auth";
import type { Page } from "./operatorWorkspace";
import type { PickupDetails } from "./orders";

export type OrderStatus = "PLACED" | "ACCEPTED" | "READY" | "COMPLETED" | "CANCELLED";
export type OwnerOrderSummary = {
  id: number; vendorId: number; status: OrderStatus; total: number;
  createdAt: string; updatedAt: string; version: number; cancellationReason: string | null;
};
export type OwnerOrder = OwnerOrderSummary & {
  pickup?: PickupDetails | null;
  items: { menuItemId: number; name: string; unitPrice: number; quantity: number; lineTotal: number }[];
};
export type StatusCommand = { status: OrderStatus; version: number; cancellationReason?: string };
const base = (vendorId: number) => `/api/operator/vendors/${vendorId}/orders`;

async function checked<T>(response: Response): Promise<T> {
  if (response.ok) return response.json();
  const defaults: Record<number, string> = {
    401: "Your session expired. Sign in again.",
    403: "You no longer have permission for this action. Refresh your session.",
    404: "This truck or order is no longer available to your account.",
    409: "This order changed elsewhere. Refresh its details before acting.",
  };
  let message = defaults[response.status] ?? "Order management is unavailable. Please try again.";
  try { const body = await response.json(); if (typeof body.detail === "string") message = body.detail; } catch { /* Safe fallback for non-JSON responses. */ }
  throw new AuthApiError(response.status, message);
}
async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  return checked<T>(await fetch(path, { credentials: "same-origin", headers: { Accept: "application/json" }, signal }));
}
export function listOwnerOrders(vendorId: number, page: number, status: OrderStatus | "", signal?: AbortSignal) {
  const query = new URLSearchParams({ page: String(page), size: "20" });
  if (status) query.set("status", status);
  return read<Page<OwnerOrderSummary>>(`${base(vendorId)}?${query}`, signal);
}
export const getOwnerOrder = (vendorId: number, orderId: number, signal?: AbortSignal) =>
  read<OwnerOrder>(`${base(vendorId)}/${orderId}`, signal);
export async function updateOwnerOrder(vendorId: number, orderId: number, command: StatusCommand): Promise<OwnerOrder> {
  const csrf = await read<{ headerName: string; token: string }>("/api/auth/csrf");
  // Never auto-retry PATCH: an interrupted response may already have committed.
  return checked<OwnerOrder>(await fetch(`${base(vendorId)}/${orderId}/status`, {
    method: "PATCH", credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json", [csrf.headerName]: csrf.token },
    body: JSON.stringify(command),
  }));
}
