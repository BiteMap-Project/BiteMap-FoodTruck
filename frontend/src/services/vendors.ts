export type Vendor = {
  id: number;
  name: string;
  category: string;
  location: string;
};

export type VendorPage = {
  items: Vendor[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export async function listVendors(q: string, page: number, signal: AbortSignal): Promise<VendorPage> {
  const params = new URLSearchParams({ q, page: String(page), size: "20" });
  const response = await fetch(`/api/vendors?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Unable to load vendors");
  return response.json();
}

export type MenuItem = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  available: boolean;
};

export type VendorProfile = Vendor & { menu: MenuItem[] };

export async function getVendor(id: string, signal: AbortSignal): Promise<VendorProfile | null> {
  const response = await fetch(`/api/vendors/${encodeURIComponent(id)}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw new Error("Unable to load truck");
  return response.json();
}
