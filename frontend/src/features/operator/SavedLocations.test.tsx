import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import SavedLocations from './SavedLocations';
import ScheduleForm from './ScheduleForm';
import type { SavedLocation } from '../../services/savedLocations';

const location: SavedLocation = { id: 8, name: 'Campus', venueName: 'Library entrance', address: '18111 Nordhoff St', latitude: 34.24, longitude: -118.53, timeZone: 'America/New_York', archived: false, version: 2, updatedAt: '2030-01-01T00:00Z' };
const response = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url === '/api/auth/csrf') return response(200, { headerName: 'X-CSRF-TOKEN', token: 'fresh' });
    if (options?.method) return response(200, location);
    return response(200, [location]);
  });
});
it('copies a saved location into a schedule draft and requires a fresh pin confirmation', async () => {
  const save = vi.fn(); render(<ScheduleForm busy={false} onSave={save} />);
  fireEvent.click(screen.getByRole('button', { name: 'Choose saved location' }));
  fireEvent.change(await screen.findByLabelText('Saved pickup location'), { target: { value: '8' } });
  expect(screen.getByLabelText('Venue name')).toHaveValue('Library entrance');
  expect(screen.getByLabelText('Venue name')).toHaveFocus();
  expect(screen.getByLabelText('Time zone')).toHaveValue('America/New_York');
  expect(screen.queryByLabelText('Street address')).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  fireEvent.submit(screen.getByRole('form', { name: 'Schedule stop' }));
  expect(save).not.toHaveBeenCalled();
  for (const [label, value] of [['Start date','2090-05-01'],['Start time','11:00'],['End date','2090-05-01'],['End time','13:00']])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.submit(screen.getByRole('form', { name: 'Schedule stop' }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ venueName: 'Library entrance', address: location.address, latitude: 34.24, timeZone: 'America/New_York', locationConfirmed: true }), undefined);
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method)).toHaveLength(0);
});
it('uses version and fresh CSRF when editing and reconfirms changed pins', async () => {
  render(<SavedLocations />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Campus' }));
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText('Pickup latitude'), { target: { value: '34.25' } });
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.submit(screen.getByRole('form', { name: 'Edit saved location' }));
  await screen.findByText('Location saved. Existing stops and orders are unchanged.');
  const write = fetchMock.mock.calls.find(([,options]) => options?.method === 'PUT')!;
  expect(write[0]).toBe('/api/operator/saved-locations/8');
  expect(write[1].headers['X-CSRF-TOKEN']).toBe('fresh');
  expect(JSON.parse(write[1].body)).toMatchObject({ version: 2, location: { latitude: 34.25, locationConfirmed: true } });
});
it('requires confirmation before archiving', async () => {
  render(<SavedLocations />);
  fireEvent.click(await screen.findByRole('button', { name: 'Archive Campus' }));
  expect(fetchMock.mock.calls.filter(([,options]) => options?.method)).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Keep location' }));
  expect(screen.queryByRole('button', { name: 'Confirm archive' })).not.toBeInTheDocument();
});
it('blocks replay after an unknown write outcome until reload', async () => {
  fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url === '/api/auth/csrf') return response(200, { headerName: 'X-CSRF-TOKEN', token: 'fresh' });
    if (options?.method) throw new TypeError('Lost response');
    return response(200, [location]);
  });
  render(<SavedLocations />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Campus' }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.submit(screen.getByRole('form', { name: 'Edit saved location' }));
  await screen.findByText(/Connection interrupted/);
  expect(screen.getByRole('button', { name: 'Save location' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Reload locations (discard draft)' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add location' })).toBeEnabled());
  expect(fetchMock.mock.calls.filter(([,options]) => options?.method)).toHaveLength(1);
});
it('aborts loading when the account-scoped workspace unmounts', async () => {
  let resolve!: (value: unknown) => void;
  fetchMock.mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = render(<SavedLocations />);
  const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
  view.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => resolve(response(200, [location])));
  expect(screen.queryByText('Campus')).not.toBeInTheDocument();
});
