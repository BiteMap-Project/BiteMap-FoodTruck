import { AuthApiError, postWithCsrf } from './auth';
import type { Vendor, VendorPage } from './vendors';
import type { MenuItemInput } from '../features/menu/validateMenuItem';

export async function listOwnedTrucks(page: number, signal: AbortSignal): Promise<VendorPage> {
  const response = await fetch(`/api/operator/vendors?page=${page}&size=20`, {
    signal, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new AuthApiError(response.status, 'Unable to load your trucks.');
  return response.json();
}

export function createTruck(input: Omit<Vendor, 'id'>): Promise<Vendor> {
  return postWithCsrf('/api/operator/vendors', input, 'Unable to save the truck. Check your list before retrying.');
}

export function addMenuItem(vendorId: number, input: MenuItemInput) {
  return postWithCsrf(`/api/operator/vendors/${vendorId}/menu-items`, {
    name: input.name, description: input.description, price: input.price,
    status: input.available ? 'ACTIVE' : 'INACTIVE',
  }, 'Unable to save the item. Check the public menu before retrying.');
}
