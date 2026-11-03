import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useOrderNotifications } from './useOrderNotifications';
import type { OrderSignal, UpdateConnection } from '../../services/orderEvents';

const subscriptions=vi.hoisted(()=>[] as {url:string; snapshot:(s:OrderSignal)=>void; state:(s:UpdateConnection)=>void; close:ReturnType<typeof vi.fn>}[]);
vi.mock('../../services/orderEvents',()=>({subscribeOrderEvents:(url:string,snapshot:(s:OrderSignal)=>void,state:(s:UpdateConnection)=>void)=>{
  const close=vi.fn(); subscriptions.push({url,snapshot,state,close}); return close;
}}));
const start=vi.fn();
class Audio {
  state='running'; currentTime=0; destination={};
  close=vi.fn(async()=>{}); resume=vi.fn(async()=>{});
  createOscillator(){return {connect:vi.fn(),disconnect:vi.fn(),frequency:{value:0},start,stop:vi.fn(),onended:null};}
  createGain(){return {connect:vi.fn(),disconnect:vi.fn(),gain:{setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()}};}
}
const signal=(revision:number,createdCount:number,placedCount:number)=>({revision:String(revision),createdCount,placedCount});
beforeEach(()=>{subscriptions.length=0; start.mockClear(); vi.stubGlobal('AudioContext',Audio);});
it('sound requires explicit opt-in; baselines/replays/cancellation are silent',async()=>{
  const {result}=renderHook(()=>useOrderNotifications(1,7));
  act(()=>subscriptions[0].snapshot(signal(1,1,1)));
  expect(result.current.count).toBe(1); expect(start).not.toHaveBeenCalled();
  await act(()=>result.current.toggleSound()); expect(start).toHaveBeenCalledTimes(1); // preview
  act(()=>subscriptions[0].snapshot(signal(2,2,2))); expect(start).toHaveBeenCalledTimes(2);
  act(()=>subscriptions[0].snapshot(signal(2,2,2))); expect(start).toHaveBeenCalledTimes(2);
  act(()=>subscriptions[0].snapshot(signal(3,2,1))); expect(start).toHaveBeenCalledTimes(2);
  expect(result.current.count).toBe(1);
});
it('switching trucks closes the previous stream and keeps independent silent baselines',()=>{
  const {result,rerender,unmount}=renderHook(({truck})=>useOrderNotifications(1,truck),{initialProps:{truck:7}});
  act(()=>subscriptions[0].snapshot(signal(2,2,2)));
  rerender({truck:8}); expect(subscriptions[0].close).toHaveBeenCalled(); expect(result.current.count).toBe(0);
  act(()=>subscriptions[1].snapshot(signal(4,4,1))); expect(result.current.count).toBe(1);
  expect(subscriptions[1].url).toBe('/api/operator/vendors/8/order-events');
  unmount(); expect(subscriptions[1].close).toHaveBeenCalled();
});
