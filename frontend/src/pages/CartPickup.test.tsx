import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { addCartItem } from '../features/cart/cart';
import CartPage from './CartPage';

const fetchMock=vi.fn();
const response=(status:number,body?:unknown)=>({ok:status>=200 && status<300,status,json:async()=>body}) as Response;
const pickup={stopId:9,venueName:'Orange Grove entrance',address:'18111 Nordhoff St',latitude:34.24,longitude:-118.53,
  startsAt:'2026-01-01T00:00:00Z',endsAt:'2099-01-01T00:00:00Z',timeZone:'America/Los_Angeles'};
beforeEach(()=>{
  sessionStorage.clear(); fetchMock.mockReset(); vi.stubGlobal('fetch',fetchMock);
  addCartItem(4,'Taco Truck',{id:8,name:'Taco',price:4.5});
});
function setup(pickupResponse:Response) {
  fetchMock.mockImplementation(async(url:string)=>url==='/api/auth/me'
    ?response(200,{id:1,displayName:'Customer',roles:['ROLE_CUSTOMER']}):pickupResponse);
  render(<MemoryRouter><CartPage/></MemoryRouter>);
}
it('blocks checkout without a current stop and allows a retry',async()=>{
  setup(response(204));
  expect(await screen.findByText(/No active pickup stop/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Place pickup order'})).toBeDisabled();
  fetchMock.mockResolvedValue(response(200,pickup));
  fireEvent.click(screen.getByRole('button',{name:'Refresh pickup details'}));
  expect(await screen.findByText(pickup.address)).toBeInTheDocument();
  await waitFor(()=>expect(screen.getByRole('button',{name:'Place pickup order'})).toBeEnabled());
});
it('fails closed on pickup lookup errors without clearing the cart',async()=>{
  setup(response(503));
  expect(await screen.findByText(/Unable to load pickup details/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Place pickup order'})).toBeDisabled();
  expect(screen.getByRole('heading',{name:'Taco'})).toBeInTheDocument();
});
it('shows the exact address and coordinate-based directions',async()=>{
  setup(response(200,pickup));
  expect(await screen.findByText(pickup.address)).toBeInTheDocument();
  expect(screen.getByRole('link',{name:'Get directions'})).toHaveAttribute('href','https://www.google.com/maps/dir/?api=1&destination=34.24%2C-118.53');
  expect(screen.getByText(/America\/Los_Angeles/)).toBeInTheDocument();
});
