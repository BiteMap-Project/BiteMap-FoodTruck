import { useEffect, useRef, useState } from 'react';
import { getOrderingSettings, setOrderingSettings, type OrderingSettings, WorkspaceError } from '../../services/operatorWorkspace';

export default function OrderingControl({ vendorId }: { vendorId: number }) {
  const [settings, setSettings] = useState<OrderingSettings | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [cutoff, setCutoff] = useState('15');
  const lock = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    getOrderingSettings(vendorId, controller.signal).then(value => {
      if (!controller.signal.aborted) { setSettings(value); setCutoff(String(value.cutoffMinutes ?? 15)); setBlocked(false); setError(''); }
    }, () => { if (!controller.signal.aborted) setError('Unable to load ordering settings. Refresh to try again.'); });
    return () => controller.abort();
  }, [vendorId, attempt]);
  async function save(changeCutoff = false) {
    if (!settings || lock.current || blocked) return;
    if (changeCutoff && (!/^\d+$/.test(cutoff) || Number(cutoff) > 120)) {
      setError('Choose a whole number from 0 to 120 minutes.'); return;
    }
    lock.current = true; setBusy(true); setError('');
    try {
      const updated = await setOrderingSettings(vendorId, { acceptingOrders: changeCutoff ? settings.acceptingOrders : !settings.acceptingOrders, version: settings.version,
        ...(changeCutoff ? { cutoffMinutes: Number(cutoff) } : {}) });
      if (mounted.current) setSettings(updated);
    } catch (cause) {
      if (mounted.current) {
        setBlocked(true);
        if (cause instanceof WorkspaceError && [401,403,404].includes(cause.status)) setSettings(null);
        setError('Unable to confirm the change. Refresh ordering settings before trying again.');
      }
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  return <section className="ow-panel ow-ordering-control" aria-label="Incoming orders">
    <h2>Incoming orders</h2>
    {!settings && !error && <p role="status">Loading ordering settings…</p>}
    {settings && <><p role="status">{settings.acceptingOrders ? 'New orders enabled — an active pickup stop is still required.' : 'Temporarily not accepting orders.'}</p>
      <p className="ow-order-help">Pausing only blocks new orders. Continue preparing and completing existing orders.</p>
      <p>Current cutoff: {settings.cutoffMinutes ?? 15} minutes before pickup ends.</p></>}
    <div className="ow-ordering-actions">
    {settings && <button className="od-button od-button-primary" disabled={busy || blocked} onClick={() => void save()}>{busy ? 'Saving…' : settings.acceptingOrders ? 'Pause new orders' : 'Resume new orders'}</button>}
    <button className="od-button od-button-secondary" disabled={busy} onClick={() => { setSettings(null); setError(''); setAttempt(a => a + 1); }}>Refresh ordering settings</button>
    </div>
    {settings && <form className="ow-form ow-cutoff-form" aria-label="Ordering cutoff" onSubmit={event => { event.preventDefault(); void save(true); }}>
      <h3>Ordering cutoff</h3>
      <label>Close new orders before pickup ends (minutes)
        <input type="number" min="0" max="120" step="1" required value={cutoff} disabled={busy || blocked}
          onChange={event => setCutoff(event.target.value)} />
      </label>
      <p>Default: 15 minutes. Choose 0 to accept orders until closing. Existing orders and recovery of earlier checkouts are unaffected.</p>
      <button className="od-button od-button-secondary" disabled={busy || blocked || Number(cutoff) === (settings.cutoffMinutes ?? 15)}>Save cutoff</button>
    </form>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
