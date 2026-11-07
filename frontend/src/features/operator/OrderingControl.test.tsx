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
it('offers only allowed acceptance windows and saves twenty minutes separately from the cutoff', async () => {
  render(<OrderingControl vendorId={7} />);
  const select = await screen.findByLabelText('Time to accept new orders');
  expect(select).toHaveValue('5');
  expect(Array.from(select.querySelectorAll('option')).map(option=>option.value)).toEqual(['3','5','10','15','20']);
  fireEvent.change(select,{target:{value:'20'}});
  fireEvent.click(screen.getByRole('button',{name:'Save acceptance timeout'}));
  await screen.findByRole('button',{name:'Resume new orders'});
  expect(fetchMock).toHaveBeenCalledWith('/api/operator/vendors/7/ordering',expect.objectContaining({
    method:'PUT',body:'{"acceptingOrders":true,"version":0,"acceptanceMinutes":20}',
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
it('saves a cutoff without changing whether orders are enabled', async () => {
  render(<OrderingControl vendorId={7} />);
  const input = await screen.findByLabelText('Close new orders before pickup ends (minutes)');
  fireEvent.change(input, { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save cutoff' }));
  await screen.findByRole('button', { name: 'Resume new orders' });
  expect(fetchMock).toHaveBeenCalledWith('/api/operator/vendors/7/ordering', expect.objectContaining({
    method: 'PUT', body: '{"acceptingOrders":true,"version":0,"cutoffMinutes":0}',
  }));
});
