import { beforeEach, expect, it, vi } from 'vitest';
import { createCustomerOrder } from './orders';

const fetchMock=vi.fn();
const cart={vendorId:1,vendorName:'Truck',items:[{id:2,name:'Taco',price:5,quantity:1}]};
beforeEach(()=>{ sessionStorage.clear(); fetchMock.mockReset(); vi.stubGlobal('fetch',fetchMock); });
it('reuses the key after an interrupted request but changes it for a different pickup stop',async()=>{
  fetchMock.mockImplementation(async(url:string)=>{
    if(url==='/api/auth/csrf') return {ok:true,status:200,json:async()=>({headerName:'X-CSRF-TOKEN',token:'test'})};
    throw new TypeError('Connection interrupted');
  });
  await expect(createCustomerOrder(cart,3)).rejects.toThrow();
  await expect(createCustomerOrder(cart,3)).rejects.toThrow();
  await expect(createCustomerOrder(cart,4)).rejects.toThrow();
  const requests=fetchMock.mock.calls.filter(([url])=>url==='/api/customer/orders').map(([,options])=>JSON.parse(options.body));
  expect(requests[0].idempotencyKey).toBe(requests[1].idempotencyKey);
  expect(requests[2].idempotencyKey).not.toBe(requests[0].idempotencyKey);
  expect(requests[0].pickupStopId).toBe(3);
  expect(requests[0]).not.toHaveProperty('total');
});
