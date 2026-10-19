import type { Page, Vendor, VendorProfile } from "../types/api";

export type { PublicMenuItem as MenuItem, Vendor, VendorProfile } from "../types/api";
export type VendorPage = Page<Vendor>;

export async function listVendors(q: string, page: number, signal: AbortSignal): Promise<VendorPage> {
  const params = new URLSearchParams({ q, page: String(page), size: "20" });
  const response = await fetch(`/api/vendors?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Unable to load vendors");
  return response.json();
}

export async function getVendor(id: string, signal: AbortSignal): Promise<VendorProfile | null> {
  const response = await fetch(`/api/vendors/${encodeURIComponent(id)}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw new Error("Unable to load truck");
  return response.json();
}
