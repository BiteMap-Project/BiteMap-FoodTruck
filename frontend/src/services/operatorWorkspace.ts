export type Vendor = { id: number; name: string; category: string; location: string };
export type VendorInput = Omit<Vendor, "id">;
export type Availability = "ACTIVE" | "INACTIVE" | "SOLD_OUT";
export type MenuItem = { id: number; vendorId: number; name: string; description: string | null; price: number; status: Availability; version: number };
export type MenuDetails = Pick<MenuItem, "name" | "description" | "price">;
export type Page<T> = { items: T[]; page: number; size: number; totalElements: number; totalPages: number };

export class WorkspaceError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function checked(response: Response): Promise<Response> {
  if (response.ok) return response;
  const messages: Record<number, string> = {
    400: "Check the entered values and try again.",
    401: "Your session expired. Sign in again.",
    403: "Request denied. Refresh your session before trying again.",
    404: "This vendor or menu item is no longer available to your account.",
    409: "This item changed elsewhere. Reload the menu before editing again.",
  };
  throw new WorkspaceError(response.status, messages[response.status] ?? "The server is unavailable. Try again later.");
}

async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  return (await checked(await fetch(path, { credentials: "same-origin", headers: { Accept: "application/json" }, signal }))).json();
}

async function write<T>(path: string, method: string, body: object): Promise<T> {
  // Fetch after login and for every mutation; never persist session/CSRF tokens in localStorage.
  const csrf = await read<{ headerName: string; token: string }>("/api/auth/csrf");
  return (await checked(await fetch(path, {
    method, credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json", [csrf.headerName]: csrf.token },
    body: JSON.stringify(body),
  }))).json();
}

const vendors = "/api/operator/vendors";
const menu = (vendorId: number) => `${vendors}/${vendorId}/menu-items`;
export const listOwnedVendors = (page: number, signal?: AbortSignal) => read<Page<Vendor>>(`${vendors}?page=${page}&size=20`, signal);
export const saveVendor = (input: VendorInput, id?: number) => write<Vendor>(id === undefined ? vendors : `${vendors}/${id}`, id === undefined ? "POST" : "PUT", input);
export const listMenu = (vendorId: number, page: number, signal?: AbortSignal) => read<Page<MenuItem>>(`${menu(vendorId)}?page=${page}&size=20`, signal);
export const createMenuItem = (vendorId: number, input: MenuDetails & { status: Availability }) => write<MenuItem>(menu(vendorId), "POST", input);
export const editMenuItem = (vendorId: number, itemId: number, input: MenuDetails & { version: number }) => write<MenuItem>(`${menu(vendorId)}/${itemId}`, "PUT", input);
export const changeAvailability = (vendorId: number, itemId: number, status: Availability, version: number) => write<MenuItem>(`${menu(vendorId)}/${itemId}/availability`, "PATCH", { status, version });
