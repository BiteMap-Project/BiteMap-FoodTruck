import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import OrderingControl from './OrderingControl';
const fetchMock = vi.fn();
const response = (status: number, body: unknown) => ({ok: status === 200, status, json: async () => body});
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/csrf') return response(200, {headerName: 'X-CSRF-TOKEN', token: 'fresh'});
    return response(200, {acceptingOrders: init?.method ? false : true, version: init?.method ? 1 : 0});
  });
});
it('pauses with a version and fresh CSRF, then reflects the server state', async () => {
  render(<OrderingControl vendorId={7} />);
  fireEvent.click(await screen.findByRole('button', {name:'Pause new orders'}));
  expect(await screen.findByRole('button', {name:'Resume new orders'})).toBeEnabled();
  expect(fetchMock).toHaveBeenCalledWith('/api/operator/vendors/7/ordering', expect.objectContaining({
    method:'PUT', body:'{"acceptingOrders":false,"version":0}', headers: expect.objectContaining({'X-CSRF-TOKEN':'fresh'})
  }));
});
it('blocks further writes after an uncertain response until settings are reloaded', async () => {
  render(<OrderingControl vendorId={7} />);
  await screen.findByRole('button', {name:'Pause new orders'});
  fetchMock.mockResolvedValueOnce(response(200, {headerName:'X-CSRF-TOKEN', token:'fresh'})).mockRejectedValueOnce(new Error('lost'));
  fireEvent.click(screen.getByRole('button', {name:'Pause new orders'}));
  await screen.findByRole('alert');
  expect(screen.getByRole('button', {name:'Pause new orders'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button', {name:'Refresh ordering settings'}));
  expect(await screen.findByRole('button', {name:'Pause new orders'})).toBeEnabled();
});
