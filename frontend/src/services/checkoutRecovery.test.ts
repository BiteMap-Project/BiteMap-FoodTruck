import { beforeEach, expect, it, vi } from 'vitest';
import { createCustomerOrder } from './orders';
import { addCartItem, readCart, setCartQuantity, clearCart } from '../features/cart/cart';
import { checkoutLocked, readCheckoutAttempt } from '../features/cart/checkoutAttempt';

const fetchMock = vi.fn();
const cart = {vendorId:1,vendorName:'Truck',items:[{id:2,name:'Taco',price:5,quantity:1}]};
const response = (status: number, body: unknown) => new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json'}});
let orderStatus: number | null;
beforeEach(() => {
  sessionStorage.clear(); fetchMock.mockReset(); vi.stubGlobal('fetch',fetchMock); orderStatus = null;
  fetchMock.mockImplementation(async (url:string) => {
    if (url === '/api/auth/me') return response(200,{id:7});
    if (url === '/api/auth/csrf') return response(200,{headerName:'X-CSRF-TOKEN',token:'test'});
    if (orderStatus !== null) return response(orderStatus, orderStatus === 201 ? {id:42} : {detail:'Rejected'});
    throw new TypeError('Connection interrupted');
  });
});
const requests = () => fetchMock.mock.calls.filter(([url]) => url === '/api/customer/orders').map(([,options]) => JSON.parse(options.body));
it('preserves the original snapshot and key even if the requested cart or stop changes', async () => {
  await expect(createCustomerOrder(cart,3,7)).rejects.toThrow();
  await expect(createCustomerOrder({...cart,items:[{...cart.items[0],quantity:5}]},4,7)).rejects.toThrow();
  expect(requests()).toHaveLength(2);
  expect(requests()[1]).toEqual(requests()[0]);
  expect(requests()[0]).not.toHaveProperty('total');
});
it('does not replay an unresolved attempt under another account', async () => {
  await expect(createCustomerOrder(cart,3,7)).rejects.toThrow();
  await expect(createCustomerOrder(cart,3,8)).rejects.toThrow();
  expect(requests()).toHaveLength(1);
});
it('locks all cart mutations after an unknown outcome', async () => {
  addCartItem(1,'Truck',cart.items[0]);
  await expect(createCustomerOrder(cart,3,7)).rejects.toThrow();
  setCartQuantity(2,5); clearCart(); addCartItem(1,'Truck',{id:9,name:'Other',price:3});
  expect(readCart()).toEqual(cart);
});
it('retains an unknown attempt even if its retry receives a rejection', async () => {
  await expect(createCustomerOrder(cart,3,7)).rejects.toThrow();
  orderStatus = 409;
  await expect(createCustomerOrder(cart,3,7)).rejects.toThrow();
  orderStatus = 201;
  await createCustomerOrder(cart,4,7);
  expect(requests()[2]).toEqual(requests()[0]);
});
it('allows a new attempt after a definitive first-request rejection', async () => {
  orderStatus = 400;
  await expect(createCustomerOrder(cart,3,7)).rejects.toThrow();
  orderStatus = 201;
  await createCustomerOrder(cart,4,7);
  expect(requests()[1].idempotencyKey).not.toBe(requests()[0].idempotencyKey);
});

it('coalesces concurrent clicks into one submission and clears cart only on confirmed success', async () => {
  let release!: (value:Response) => void;
  fetchMock.mockImplementation((url:string) => url === '/api/auth/csrf'
    ? Promise.resolve(response(200,{headerName:'X-CSRF-TOKEN',token:'test'}))
    : new Promise<Response>(resolve => {release = resolve;}));
  addCartItem(1,'Truck',cart.items[0]);
  const first = createCustomerOrder(cart,3,7);
  const second = createCustomerOrder(cart,4,7);
  expect(first).toBe(second);
  await vi.waitFor(() => expect(requests()).toHaveLength(1));
  expect(checkoutLocked()).toBe(true);
  expect(readCheckoutAttempt()?.accountId).toBe(7);
  expect(fetchMock.mock.calls.find(([url]) => url === '/api/customer/orders')![1].headers['X-Checkout-Account-Id']).toBe('7');
  release(response(201,{id:42}));
  await first;
  expect(checkoutLocked()).toBe(false);
  expect(readCart()).toBeNull();
});

it.each([500,503])('retains the attempt after HTTP %s', async status => {
  orderStatus = status;
  await expect(createCustomerOrder(cart,3,7)).rejects.toThrow('could not confirm');
  expect(checkoutLocked()).toBe(true);
});

it('blocks submission when storage cannot persist the attempt', async () => {
  const failure = vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => {throw new Error('Storage unavailable');});
  try { await expect(createCustomerOrder(cart,3,7)).rejects.toThrow(); expect(requests()).toHaveLength(0); }
  finally { failure.mockRestore(); }
});

it('fails closed for corrupt or legacy attempts instead of minting a new key', async () => {
  sessionStorage.setItem('bitemap.pending-order-key', JSON.stringify({key:crypto.randomUUID(),signature:'legacy'}));
  await expect(createCustomerOrder(cart,3,7)).rejects.toThrow('recovery data');
  expect(requests()).toHaveLength(0);
});
