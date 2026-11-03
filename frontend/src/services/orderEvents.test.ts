import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { subscribeOrderEvents } from './orderEvents';
import { AUTH_ACCESS_EVENT } from '../auth/authEvents';

class FakeSource {
  static instances: FakeSource[]=[];
  listeners=new Map<string,(event:MessageEvent)=>void>();
  onerror: (()=>void) | null=null;
  close=vi.fn();
  url:string;
  constructor(url:string) {this.url=url; FakeSource.instances.push(this);}
  addEventListener(name:string, callback:(event:MessageEvent)=>void) {this.listeners.set(name,callback);}
  emit(revision='1') {this.listeners.get('orders')?.({data:JSON.stringify({revision,createdCount:1,placedCount:1})} as MessageEvent);}
}
let cleanup=()=>{};
beforeEach(()=>{vi.useFakeTimers(); FakeSource.instances=[]; vi.stubGlobal('EventSource',FakeSource);});
afterEach(()=>cleanup());
it('deduplicates heartbeats but reconciles the first snapshot after reconnect',()=>{
  const snapshot=vi.fn(), status=vi.fn();
  cleanup=subscribeOrderEvents('/private-stream',snapshot,status);
  const source=FakeSource.instances[0]; source.emit(); source.emit();
  expect(snapshot).toHaveBeenCalledTimes(1);
  source.onerror?.(); expect(status).toHaveBeenLastCalledWith('reconnecting');
  vi.advanceTimersByTime(1500);
  const next=FakeSource.instances[1]; next.emit();
  expect(snapshot).toHaveBeenCalledTimes(2);
  next.emit('2'); expect(snapshot).toHaveBeenCalledTimes(3);
  source.emit('99'); expect(snapshot).toHaveBeenCalledTimes(3);
});
it('detects a silent dead stream and never reconnects after cleanup/logout',()=>{
  const snapshot=vi.fn(),status=vi.fn(); cleanup=subscribeOrderEvents('/private-stream',snapshot,status);
  const source=FakeSource.instances[0]; source.emit();
  vi.advanceTimersByTime(15_000);
  expect(status).toHaveBeenLastCalledWith('reconnecting');
  cleanup(); source.emit('2'); vi.advanceTimersByTime(60_000);
  expect(snapshot).toHaveBeenCalledTimes(1);
  expect(FakeSource.instances).toHaveLength(1);
});
it('rejects malformed payloads and closes the connection',()=>{
  const snapshot=vi.fn(),status=vi.fn(); cleanup=subscribeOrderEvents('/private-stream',snapshot,status);
  const source=FakeSource.instances[0];
  source.listeners.get('orders')?.({data:'{"revision":"1","createdCount":-1,"placedCount":0}'} as MessageEvent);
  expect(snapshot).not.toHaveBeenCalled(); expect(source.close).toHaveBeenCalled();
});
it('immediately marks offline and reconciles after the online event',()=>{
  const snapshot=vi.fn(),status=vi.fn(); cleanup=subscribeOrderEvents('/private-stream',snapshot,status);
  const source=FakeSource.instances[0]; source.emit();
  window.dispatchEvent(new Event('offline'));
  expect(source.close).toHaveBeenCalled(); expect(status).toHaveBeenLastCalledWith('reconnecting');
  source.emit('99'); expect(snapshot).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event('online'));
  FakeSource.instances[1].emit(); expect(snapshot).toHaveBeenCalledTimes(2);
});
it('refreshes shared authorization when the server ends access',()=>{
  const authorization=vi.fn(); window.addEventListener(AUTH_ACCESS_EVENT,authorization);
  try {
    const snapshot=vi.fn(),status=vi.fn(); cleanup=subscribeOrderEvents('/private-stream',snapshot,status);
    const source=FakeSource.instances[0]; source.emit();
    source.listeners.get('access-ended')?.({data:'refresh-session'} as MessageEvent);
    expect(status).toHaveBeenLastCalledWith('unavailable'); expect(authorization).toHaveBeenCalledTimes(1);
    source.emit('2'); vi.advanceTimersByTime(60_000);
    expect(snapshot).toHaveBeenCalledTimes(1); expect(FakeSource.instances).toHaveLength(1);
  } finally {window.removeEventListener(AUTH_ACCESS_EVENT,authorization);}
});
