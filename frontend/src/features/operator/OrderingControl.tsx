import { useEffect, useRef, useState } from 'react';
import { getOrderingSettings, setOrderingSettings, type OrderingSettings, WorkspaceError } from '../../services/operatorWorkspace';

export default function OrderingControl({ vendorId }: { vendorId: number }) {
  const [settings, setSettings] = useState<OrderingSettings | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [cutoff, setCutoff] = useState('15');
  const [acceptance, setAcceptance] = useState('5');
  const [message, setMessage] = useState('');
  const lock = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    getOrderingSettings(vendorId, controller.signal).then(value => {
      if (!controller.signal.aborted) { setSettings(value); setCutoff(String(value.cutoffMinutes ?? 15)); setAcceptance(String(value.acceptanceMinutes ?? 5)); setBlocked(false); setError(''); }
    }, () => { if (!controller.signal.aborted) setError('Unable to load ordering settings. Refresh to try again.'); });
    return () => controller.abort();
  }, [vendorId, attempt]);
  async function save(mode: 'pause' | 'cutoff' | 'acceptance' = 'pause') {
    if (!settings || lock.current || blocked) return;
    const changeCutoff = mode === 'cutoff';
    if (changeCutoff && (!/^\d+$/.test(cutoff) || Number(cutoff) > 120)) {
      setError('Choose a whole number from 0 to 120 minutes.'); return;
    }
    if (mode === 'acceptance' && !['3','5','10','15','20'].includes(acceptance)) { setError('Choose 3, 5, 10, 15, or 20 minutes.'); return; }
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const updated = await setOrderingSettings(vendorId, { acceptingOrders: mode !== 'pause' ? settings.acceptingOrders : !settings.acceptingOrders, version: settings.version,
        ...(changeCutoff ? { cutoffMinutes: Number(cutoff) } : {}), ...(mode === 'acceptance' ? { acceptanceMinutes: Number(acceptance) } : {}) });
      if (mounted.current) { setSettings(updated); if (mode === 'acceptance') setMessage('Acceptance timeout saved. Existing order deadlines are unchanged.'); }
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
    {settings && <form className="ow-form ow-cutoff-form" aria-label="Ordering cutoff" onSubmit={event => { event.preventDefault(); void save('cutoff'); }}>
      <h3>Ordering cutoff</h3>
      <label>Close new orders before pickup ends (minutes)
        <input type="number" min="0" max="120" step="1" required value={cutoff} disabled={busy || blocked}
          onChange={event => setCutoff(event.target.value)} />
      </label>
      <p>Default: 15 minutes. Choose 0 to accept orders until closing. Existing orders and recovery of earlier checkouts are unaffected.</p>
      <button className="od-button od-button-secondary" disabled={busy || blocked || Number(cutoff) === (settings.cutoffMinutes ?? 15)}>Save cutoff</button>
    </form>}
    {settings && <form className="ow-form ow-cutoff-form" aria-label="Acceptance timeout" onSubmit={event=>{event.preventDefault(); void save('acceptance');}}>
      <h3>Time to accept orders</h3>
      <p>Current acceptance window: {settings.acceptanceMinutes ?? 5} minutes.</p>
      <label>Time to accept new orders<select value={acceptance} disabled={busy || blocked} onChange={event=>setAcceptance(event.target.value)}>
        {[3,5,10,15,20].map(minutes=><option key={minutes} value={minutes}>{minutes} minutes</option>)}
      </select></label>
      <p>Unaccepted orders automatically cancel when this time runs out, or when pickup closes—whichever comes first. Preparation time is separate. Changes apply only to new orders.</p>
      <button className="od-button od-button-secondary" disabled={busy || blocked || Number(acceptance)===(settings.acceptanceMinutes ?? 5)}>Save acceptance timeout</button>
    </form>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
