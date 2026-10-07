import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import OperatorTrucks from './OperatorTrucks';

const fetchMock = vi.fn();
const truck = { id: 42, name: 'Professor Tacos', category: 'Tacos', location: 'CSUN' };
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const csrf = { headerName: 'X-CSRF-TOKEN', token: 'test-token' };

beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });

it('publishes an owned truck then a menu item through the real API contract', async () => {
  fetchMock.mockResolvedValueOnce(reply({ items: [], totalPages: 0 }))
    .mockResolvedValueOnce(reply(csrf)).mockResolvedValueOnce(reply(truck, 201))
    .mockResolvedValueOnce(reply({ items: [truck], totalPages: 1 }))
    .mockResolvedValueOnce(reply(csrf)).mockResolvedValueOnce(reply({ id: 5 }, 201));
  render(<MemoryRouter><OperatorTrucks /></MemoryRouter>);
  await screen.findByText('No trucks yet. Add your first truck below.');
  fireEvent.change(screen.getByLabelText('Truck name'), { target: { value: truck.name } });
  fireEvent.change(screen.getByLabelText('Food category'), { target: { value: truck.category } });
  fireEvent.change(screen.getByLabelText('Location'), { target: { value: truck.location } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish truck' }));
  await screen.findByRole('heading', { name: /Add to Professor Tacos/ });
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ name: truck.name, category: truck.category, location: truck.location });
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Campus taco' } });
  fireEvent.change(screen.getByLabelText(/^Price/), { target: { value: '4.50' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish menu item' }));
  await screen.findByText('Campus taco was saved to Professor Tacos’s menu.');
  const call = fetchMock.mock.calls.find(([url]) => url === '/api/operator/vendors/42/menu-items');
  expect(call?.[1].headers['X-CSRF-TOKEN']).toBe('test-token');
  expect(JSON.parse(call?.[1].body)).toEqual({ name: 'Campus taco', description: null, price: 4.5, status: 'ACTIVE' });
  expect(screen.getByRole('link', { name: 'View published menu' })).toHaveAttribute('href', '/trucks/42');
});

it('keeps creation failures visible without announcing publication', async () => {
  fetchMock.mockResolvedValueOnce(reply({ items: [], totalPages: 0 }))
    .mockResolvedValueOnce(reply(csrf)).mockResolvedValueOnce(reply({ detail: 'Provide valid vendor fields.' }, 400));
  render(<MemoryRouter><OperatorTrucks /></MemoryRouter>);
  await screen.findByText('No trucks yet. Add your first truck below.');
  fireEvent.submit(screen.getByRole('button', { name: 'Publish truck' }).closest('form')!);
  expect(await screen.findByRole('alert')).toHaveTextContent('Provide valid vendor fields.');
  expect(screen.queryByText(/is now visible/)).not.toBeInTheDocument();
});

it('sends expired sessions back to sign in', async () => {
  fetchMock.mockResolvedValue(reply({}, 401));
  render(<MemoryRouter><Routes><Route path="/" element={<OperatorTrucks />} />
    <Route path="/operator/login" element={<p>Sign in again</p>} /></Routes></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Sign in again')).toBeInTheDocument());
});
