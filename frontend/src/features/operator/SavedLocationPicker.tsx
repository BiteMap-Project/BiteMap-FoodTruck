import { useEffect, useState } from 'react';
import { listSavedLocations, type SavedLocation } from '../../services/savedLocations';
import ActionError from '../../components/ActionError';

export default function SavedLocationPicker({ onChoose }: { onChoose: (location: SavedLocation) => void }) {
  const [items, setItems] = useState<SavedLocation[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    listSavedLocations(controller.signal).then(result => {
      if (!controller.signal.aborted) setItems(result);
    }, () => { if (!controller.signal.aborted) setError('Unable to load saved locations. Retry or enter a new address.'); });
    return () => controller.abort();
  }, [attempt]);
  return <section className="sl-picker" aria-label="Choose saved location">
    <p>Copy a location into this draft. Check the pin before publishing; changes here do not update your saved location.</p>
    {!items && !error && <p role="status">Loading saved locations…</p>}
    <ActionError message={error} />
    {error && <button type="button" onClick={() => { setError(''); setAttempt(a => a + 1); }}>Retry locations</button>}
    {items && (items.length ? <label>Saved pickup location<select defaultValue="" onChange={event => {
      const location = items.find(item => item.id === Number(event.target.value));
      if (location) onChoose(location);
    }}><option value="" disabled>Choose a location</option>{items.map(item => <option key={item.id} value={item.id}>{item.name} — {item.address}</option>)}</select></label>
      : <p>No saved locations yet. Close this draft and use Saved locations to add one, or enter a new address below.</p>)}
  </section>;
}
