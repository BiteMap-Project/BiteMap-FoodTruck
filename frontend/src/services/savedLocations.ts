import { WorkspaceError } from './operatorWorkspace';
import { reportAuthorizationResponse } from '../auth/authEvents';

export type SavedLocationInput = {
  name: string; venueName: string; address: string; latitude: number; longitude: number;
  timeZone: string; locationConfirmed: true;
};
export type SavedLocation = Omit<SavedLocationInput, 'locationConfirmed'> & {
  id: number; version: number; archived: boolean; updatedAt: string;
};
const base = '/api/operator/saved-locations';
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...options, credentials: 'same-origin', headers: { Accept: 'application/json', ...options.headers } });
  if (response.ok) return response.json();
  reportAuthorizationResponse(response.status);
  let message = response.status === 401 ? 'Your session expired. Sign in again.'
    : response.status === 403 ? 'Access denied. Refresh your session.'
    : response.status === 404 ? 'This saved location is not available to your account.' : 'Saved locations are unavailable. Try again later.';
  if ([400, 409].includes(response.status)) {
    const problem = await response.json().catch(() => null);
    if (typeof problem?.detail === 'string') message = problem.detail;
  }
  throw new WorkspaceError(response.status, message);
}
async function write(path: string, method: string, body: object): Promise<SavedLocation> {
  const csrf = await request<{ headerName: string; token: string }>('/api/auth/csrf');
  // Never automatically replay a write after a lost response.
  return request(path, { method, headers: { 'Content-Type': 'application/json', [csrf.headerName]: csrf.token }, body: JSON.stringify(body) });
}
export const listSavedLocations = (signal?: AbortSignal) => request<SavedLocation[]>(base, { signal });
export const createSavedLocation = (location: SavedLocationInput) => write(base, 'POST', location);
export const editSavedLocation = (id: number, location: SavedLocationInput, version: number) => write(`${base}/${id}`, 'PUT', { location, version });
export const archiveSavedLocation = (id: number, version: number) => write(`${base}/${id}/archive`, 'POST', { version });
