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
