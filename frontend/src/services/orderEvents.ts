import { reportAuthorizationResponse } from '../auth/authEvents';

export type OrderSignal = { revision: string; createdCount: number; placedCount: number };
export type UpdateConnection = 'connecting' | 'live' | 'reconnecting' | 'paused' | 'unavailable';

/** Same-origin cookie-authenticated invalidations. Never send credentials in a URL. */
export function subscribeOrderEvents(url: string, snapshot: (signal: OrderSignal, reconnected: boolean) => void,
  status: (state: UpdateConnection) => void): () => void {
  if (typeof EventSource === 'undefined') { status('unavailable'); return () => {}; }
  let disposed = false;
  let source: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let revision: string | undefined;
  const stop = () => { clearTimeout(retry); clearTimeout(watchdog); source?.close(); source = null; };
  const failed = () => {
    if (disposed) return;
    stop(); status('reconnecting');
    retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(failures++, 5)) + Math.random() * 500);
  };
  function connect() {
    if (disposed || document.visibilityState === 'hidden') return;
    if(!navigator.onLine) { stop(); status('reconnecting'); return; }
    stop(); status(failures ? 'reconnecting' : 'connecting');
    const current = new EventSource(url);
    source = current;
    let first = true;
    watchdog = setTimeout(failed, 15_000);
    current.addEventListener('orders', event => {
      if (disposed || source !== current) return;
      let value: OrderSignal;
      try { value = JSON.parse((event as MessageEvent).data); } catch { failed(); return; }
      if (!value || typeof value.revision!=='string' || !/^\d+$/.test(value.revision) || !Number.isSafeInteger(value.createdCount)
        || value.createdCount < 0 || !Number.isSafeInteger(value.placedCount) || value.placedCount < 0) { failed(); return; }
      clearTimeout(watchdog); watchdog = setTimeout(failed, 15_000);
      failures = 0; status('live');
      if (first || revision !== value.revision) snapshot(value, first);
      revision = value.revision; first = false;
    });
    current.onerror = () => { if (!disposed && source === current) failed(); };
    current.addEventListener('access-ended',()=>{
      if(disposed || source!==current) return;
      stop(); status('unavailable');
      reportAuthorizationResponse(403); // Shared auth reloads /me and removes revoked/account-switched UI.
    });
  }
  const visibility = () => {
    if (document.visibilityState === 'hidden') { stop(); status('paused'); }
    else connect(); // Always reconcile on returning, even if revision has not changed.
  };
  const offline = () => { stop(); status('reconnecting'); };
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('online', visibility);
  window.addEventListener('offline', offline);
  if (document.visibilityState === 'hidden') status('paused'); else connect();
  return () => { disposed = true; stop(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('online', visibility); window.removeEventListener('offline', offline); };
}
