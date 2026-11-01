import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/authState';
import { saveCheckoutAttempt, readCheckoutAttempt } from '../features/cart/checkoutAttempt';
import { addCartItem, readCart } from '../features/cart/cart';
import CartPage from './CartPage';

const cart = {vendorId:1,vendorName:'Original private truck',items:[{id:2,name:'Taco',price:5,quantity:2}]};
const key = '11340e79-3f1a-4d22-9c01-3725b254fed8';
const fetchMock = vi.fn();
const response = (status:number, body?:unknown) => ({ok:status>=200 && status<300,status,json:async()=>body});
function open(accountId:number) {
  const auth = {account:{id:accountId,displayName:'Customer',email:'test@example.test',roles:['ROLE_CUSTOMER']},status:'ready'} as AuthContextValue;
  return render(<AuthContext.Provider value={auth}><MemoryRouter initialEntries={['/cart']}><Routes>
    <Route path="/cart" element={<CartPage/>}/>
    <Route path="/orders/:id/confirmation" element={<h1>Recovered order</h1>}/>
  </Routes></MemoryRouter></AuthContext.Provider>);
}
beforeEach(() => {
  sessionStorage.clear(); fetchMock.mockReset(); vi.stubGlobal('fetch',fetchMock);
  addCartItem(1,'Original private truck',cart.items[0]);
  saveCheckoutAttempt({accountId:7,key,cart,pickupStopId:3});
  fetchMock.mockImplementation(async(url:string) => {
    if (url.includes('pickup-stop')) return response(204);
    if (url.includes('csrf')) return response(200,{headerName:'X-CSRF-TOKEN',token:'test'});
    return response(201,{id:42});
  });
});
it('restores a snapshot after remount and recovers even when no stop is active now', async () => {
  const first = open(7); first.unmount(); open(7);
  expect(screen.getByLabelText('Quantity for Taco')).toHaveValue('2');
  expect(screen.getByLabelText('Quantity for Taco')).toBeDisabled();
  expect(screen.getByRole('button',{name:'Remove Taco'})).toBeDisabled();
  expect(screen.getByRole('button',{name:'Clear cart'})).toBeDisabled();
  await screen.findByText(/No active pickup stop/);
  fireEvent.click(screen.getByRole('button',{name:'Recover order'}));
  expect(await screen.findByRole('heading',{name:'Recovered order'})).toBeInTheDocument();
  const post = fetchMock.mock.calls.find(([url]) => url === '/api/customer/orders')![1];
  expect(JSON.parse(post.body)).toEqual({vendorId:1,pickupStopId:3,idempotencyKey:key,items:[{menuItemId:2,quantity:2}]});
  expect(readCart()).toBeNull();
});
it('hides the old snapshot and blocks recovery for a different account', () => {
  open(8);
  expect(screen.getByRole('alert')).toHaveTextContent('account that started checkout');
  expect(screen.queryByText('Original private truck')).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Recover order'})).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/customer/orders')).toHaveLength(0);
});
it('keeps recovery available after a retry fails, without unlocking edits', async () => {
  fetchMock.mockImplementation(async(url:string) => {
    if (url.includes('pickup-stop')) return response(204);
    if (url.includes('csrf')) return response(200,{headerName:'X-CSRF-TOKEN',token:'test'});
    throw new TypeError('Lost response');
  });
  open(7);
  fireEvent.click(screen.getByRole('button',{name:'Recover order'}));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('may already be placed'));
  expect(screen.getByRole('button',{name:'Recover order'})).toBeEnabled();
  expect(screen.getByLabelText('Quantity for Taco')).toBeDisabled();
  expect(readCheckoutAttempt()?.key).toBe(key);
});
