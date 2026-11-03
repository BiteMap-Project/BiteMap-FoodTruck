import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import OrderConfirmationPage from './OrderConfirmationPage';
import { useCustomerOrder } from '../features/orders/useCustomerOrder';
import type { CustomerOrder } from '../services/orders';

const order = {id:42,vendorId:7,vendorName:'Truck',status:'PLACED',version:0,total:5,
  createdAt:'2026-11-01T12:00:00Z',items:[{menuItemId:1,name:'Taco',quantity:1,unitPrice:5,lineTotal:5}]};
const fetchMock = vi.fn();
const response = (status:number, body:unknown) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
let current = {...order};
beforeEach(() => {
  current = {...order}; fetchMock.mockReset(); vi.stubGlobal('fetch',fetchMock);
  fetchMock.mockImplementation(async(url:string) => {
    if (url.endsWith('/csrf')) return response(200,{headerName:'X-CSRF-TOKEN',token:'test'});
    if (url.endsWith('/cancel')) { current = {...order,status:'CANCELLED',version:1}; return response(200,current); }
    return response(200,current);
  });
});
function open() { render(<MemoryRouter initialEntries={['/orders/42/confirmation']}><Routes>
  <Route path="/orders/:id/confirmation" element={<OrderConfirmationPage/>}/>
</Routes></MemoryRouter>); }
it('requires explicit confirmation, sends version and CSRF, and updates status', async () => {
  open(); fireEvent.click(await screen.findByRole('button',{name:'Cancel order'}));
  expect(fetchMock.mock.calls.some(([url])=>url.endsWith('/cancel'))).toBe(false);
  expect(screen.getByRole('button',{name:'Keep order'})).toHaveClass('cart-primary');
  fireEvent.click(screen.getByRole('button',{name:'Keep order'}));
  expect(screen.queryByRole('button',{name:'Confirm cancellation'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Cancel order'}));
  fireEvent.click(screen.getByRole('button',{name:'Confirm cancellation'}));
  expect(await screen.findByText('Your order was cancelled.')).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Cancel order'})).not.toBeInTheDocument();
  const write = fetchMock.mock.calls.find(([url])=>url.endsWith('/cancel'))![1];
  expect(JSON.parse(write.body)).toEqual({version:0});
  expect(write.headers['X-CSRF-TOKEN']).toBe('test');
});
it.each(['ACCEPTED','READY','COMPLETED','CANCELLED'])('hides cancellation for %s',async status => {
  current.status=status; open(); await screen.findByText('Order #42 · Truck');
  expect(screen.queryByRole('button',{name:'Cancel order'})).not.toBeInTheDocument();
});
it('refreshes on a conflict without automatically retrying cancellation', async () => {
  fetchMock.mockImplementation(async(url:string) => {
    if(url.endsWith('/csrf')) return response(200,{headerName:'X-CSRF-TOKEN',token:'test'});
    if(url.endsWith('/cancel')) {current={...order,status:'ACCEPTED',version:1}; return response(409,{detail:'This order has changed. Refresh before cancelling.'});}
    return response(200,current);
  });
  open(); fireEvent.click(await screen.findByRole('button',{name:'Cancel order'}));
  fireEvent.click(screen.getByRole('button',{name:'Confirm cancellation'}));
  await waitFor(()=>expect(screen.getByText('Your order has been accepted.')).toBeInTheDocument());
  expect(fetchMock.mock.calls.filter(([url])=>url.endsWith('/cancel'))).toHaveLength(1);
});
it('locks duplicate confirmations and recovers a committed cancellation after a lost response', async () => {
  let rejectWrite!: (cause:Error)=>void;
  fetchMock.mockImplementation(async(url:string) => {
    if(url.endsWith('/csrf')) return response(200,{headerName:'X-CSRF-TOKEN',token:'test'});
    if(url.endsWith('/cancel')) return new Promise<Response>((_resolve,reject)=>{rejectWrite=reject;});
    return response(200,current);
  });
  open(); fireEvent.click(await screen.findByRole('button',{name:'Cancel order'}));
  const confirm = screen.getByRole('button',{name:'Confirm cancellation'});
  fireEvent.click(confirm); fireEvent.click(confirm);
  await waitFor(()=>expect(fetchMock.mock.calls.filter(([url])=>url.endsWith('/cancel'))).toHaveLength(1));
  expect(screen.getByRole('button',{name:'Cancelling…'})).toBeDisabled();
  current={...order,status:'CANCELLED',version:1};
  rejectWrite(new TypeError('Network interrupted'));
  expect(await screen.findByText('Your order was cancelled.')).toBeInTheDocument();
  expect(fetchMock.mock.calls.filter(([url])=>url.endsWith('/cancel'))).toHaveLength(1);
});
it('does not restore Placed when an older read completes after cancellation', async () => {
  const {result} = renderHook(()=>useCustomerOrder(42));
  await waitFor(()=>expect(result.current.order?.status).toBe('PLACED'));
  let finishRead!: (value:Response)=>void;
  fetchMock.mockImplementationOnce(()=>new Promise<Response>(resolve=>{finishRead=resolve;}));
  act(()=>result.current.refresh());
  await waitFor(()=>expect(result.current.loading).toBe(true));
  act(()=>result.current.applyOrder({...order,status:'CANCELLED',version:1} as CustomerOrder));
  await act(async()=>{finishRead(response(200,order));});
  expect(result.current.order?.status).toBe('CANCELLED');
  expect(result.current.order?.version).toBe(1);
});
