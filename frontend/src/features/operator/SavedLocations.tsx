import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { archiveSavedLocation, createSavedLocation, editSavedLocation, listSavedLocations, type SavedLocation, type SavedLocationInput } from '../../services/savedLocations';
import { WorkspaceError } from '../../services/operatorWorkspace';
import ActionError from '../../components/ActionError';
import ScheduleAddressFields, { type ScheduleAddress } from './ScheduleAddressFields';
import PickupPinConfirmation from './PickupPinConfirmation';
import './savedLocations.css';

function LocationForm({ initial, busy, blocked, onSave }: { initial?: SavedLocation; busy: boolean; blocked: boolean; onSave: (input: SavedLocationInput) => Promise<void> }) {
  const [address, setAddress] = useState<ScheduleAddress | null>(initial ? { ...initial, confirmed: false } : null);
  const [error, setError] = useState('');
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || blocked) return;
    if (!address?.confirmed) { setError('Select an address and confirm the pickup pin before saving.'); return; }
    const fields = new FormData(event.currentTarget);
    setError('');
    void onSave({ name: String(fields.get('name')).trim(), venueName: String(fields.get('venueName')).trim(),
      address: address.address, latitude: address.latitude, longitude: address.longitude,
      timeZone: String(fields.get('timeZone')).trim(), locationConfirmed: true });
  }
  return <form className="ow-form sf-form" aria-label={initial ? 'Edit saved location' : 'New saved location'} onSubmit={submit}>
    <fieldset disabled={busy || blocked}>
      <label>Location nickname<input name="name" required maxLength={80} defaultValue={initial?.name} placeholder="CSUN library" /></label>
      <label>Venue or pickup landmark<input name="venueName" required maxLength={160} defaultValue={initial?.venueName} placeholder="Library entrance, beside the fountain" /></label>
      <ScheduleAddressFields value={address} onChange={value => { setAddress(value); setError(''); }} />
      {address && <PickupPinConfirmation value={address} onChange={value => { setAddress(value); setError(''); }} />}
      <label>Location time zone<input name="timeZone" required maxLength={80} defaultValue={initial?.timeZone ?? 'America/Los_Angeles'} list="saved-location-zones"
        onChange={() => setAddress(value => value ? { ...value, confirmed: false } : null)} /></label>
      <datalist id="saved-location-zones">{['America/Los_Angeles','America/Denver','America/Phoenix','America/Chicago','America/New_York','Pacific/Honolulu','America/Anchorage','UTC'].map(zone => <option key={zone} value={zone} />)}</datalist>
      <p className="sf-hint">Use an IANA zone such as America/Los_Angeles. Each new stop still needs its own dates, times and pin confirmation.</p>
      <button className="od-button od-button-primary" type="submit">{busy ? 'Saving…' : 'Save location'}</button>
    </fieldset>
    <ActionError message={error} />
  </form>;
}

export default function SavedLocations() {
  const [items, setItems] = useState<SavedLocation[] | null>(null);
  const [editor, setEditor] = useState<SavedLocation | 'new' | null>(null);
  const [confirm, setConfirm] = useState<SavedLocation | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const lock = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    listSavedLocations(controller.signal).then(result => {
      if (!controller.signal.aborted) { setItems(result); setBlocked(false); }
    }, () => { if (!controller.signal.aborted) setError('Unable to load saved locations. Reload to try again.'); });
    return () => controller.abort();
  }, [attempt]);
  function reload() { setItems(null); setEditor(null); setConfirm(null); setError(''); setAttempt(a => a + 1); }
  async function mutate(action: () => Promise<SavedLocation>) {
    if (lock.current || blocked) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const result = await action();
      if (mounted.current) { reload(); setMessage(result.archived ? 'Location archived. Existing stops and orders are unchanged.' : 'Location saved. Existing stops and orders are unchanged.'); }
    } catch (cause) {
      if (!mounted.current) return;
      setError(cause instanceof WorkspaceError ? cause.message : 'Connection interrupted. Reload to check whether the change was saved.');
      if (!(cause instanceof WorkspaceError) || cause.status !== 400) setBlocked(true);
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  return <section className="sl-manager" aria-label="Saved pickup locations">
    <div className="sl-toolbar"><h3>Saved pickup locations</h3>
      <button className="od-button od-button-primary" disabled={!items || busy || blocked || editor !== null || confirm !== null || items.length >= 100} onClick={() => setEditor('new')}>Add location</button>
      <button className="od-button od-button-secondary" disabled={busy || (editor !== null && !blocked)} onClick={reload}>Reload locations{blocked ? ' (discard draft)' : ''}</button></div>
    <p>Private to your operator account and reusable across your trucks. Save up to 100 active locations. Editing or archiving one never changes published stops or orders.</p>
    <ActionError message={error + (blocked ? ' Reload before making another change.' : '')} />
    {message && <p role="status">{message}</p>}
    {!items && !error && <p role="status">Loading saved locations…</p>}
    {editor !== null && <div className="sl-editor"><LocationForm key={editor === 'new' ? 'new' : `${editor.id}-${editor.version}`}
      initial={editor === 'new' ? undefined : editor} busy={busy} blocked={blocked}
      onSave={input => mutate(() => editor === 'new' ? createSavedLocation(input) : editSavedLocation(editor.id, input, editor.version))} />
      <button className="od-button od-button-secondary" disabled={busy} onClick={() => setEditor(null)}>Discard location draft</button></div>}
    {items?.length === 0 && <p>No saved locations yet. Add a frequent pickup spot to make scheduling quicker.</p>}
    {items?.map(item => <article key={item.id} className="sl-card"><div><h4>{item.name}</h4><p>{item.venueName}</p><p>{item.address}</p><p>{item.timeZone}</p></div>
      <div className="sl-actions"><button className="od-button od-button-secondary" disabled={busy || blocked || editor !== null || confirm !== null} onClick={() => setEditor(item)}>Edit {item.name}</button>
        <button className="od-button od-button-secondary" disabled={busy || blocked || editor !== null || confirm !== null} onClick={() => setConfirm(item)}>Archive {item.name}</button></div>
      {confirm?.id === item.id && <div className="sl-confirm"><p>Archive {item.name}? It will no longer appear in the location picker. Published stops and existing orders stay unchanged.</p>
        <div className="sl-actions"><button className="od-button od-button-primary" disabled={busy || blocked} onClick={() => void mutate(() => archiveSavedLocation(item.id, item.version))}>Confirm archive</button>
          <button className="od-button od-button-secondary" disabled={busy} onClick={() => setConfirm(null)}>Keep location</button></div></div>}
    </article>)}
  </section>;
}
