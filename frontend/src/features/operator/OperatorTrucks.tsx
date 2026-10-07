import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthApiError } from '../../services/auth';
import { addMenuItem, createTruck, listOwnedTrucks } from '../../services/operator';
import type { Vendor, VendorPage } from '../../services/vendors';
import MenuItemForm from '../menu/MenuItemForm';

export default function OperatorTrucks() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<VendorPage | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeTruck, setActiveTruck] = useState<Vendor | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [fields, setFields] = useState({ name: '', category: '', location: '' });

  function sessionExpired(cause: unknown) {
    if (cause instanceof AuthApiError && cause.status === 401) {
      navigate('/operator/login', { replace: true });
      return true;
    }
    return false;
  }

  useEffect(() => {
    const controller = new AbortController();
    listOwnedTrucks(page, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult(data);
    }, (cause) => {
      if (controller.signal.aborted) return;
      if (cause instanceof AuthApiError && cause.status === 401) navigate('/operator/login', { replace: true });
      else setLoadError('Unable to load your trucks. Please try again.');
    });
    return () => controller.abort();
  }, [page, attempt, navigate]);

  function refresh(nextPage = page) {
    setResult(null);
    setLoadError('');
    setPage(nextPage);
    setAttempt((value) => value + 1);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError('');
    setNotice('');
    try {
      const truck = await createTruck({ name: fields.name.trim(), category: fields.category.trim(), location: fields.location.trim() });
      setFields({ name: '', category: '', location: '' });
      setActiveTruck(truck);
      setNotice(`${truck.name} is now visible in discovery. Add its first menu item below.`);
      refresh(0);
    } catch (cause) {
      if (!sessionExpired(cause)) setSaveError(cause instanceof Error ? cause.message : 'Unable to save. Check your truck list before retrying.');
    } finally { setSaving(false); }
  }

  return (
    <>
      <section aria-labelledby="my-trucks-title">
        <h2 id="my-trucks-title">My trucks</h2>
        <p>Create your truck, publish its menu, then view it as a customer.</p>
        {!result && !loadError && <p role="status">Loading your trucks…</p>}
        {loadError && <div role="alert"><p>{loadError}</p><button onClick={() => refresh()}>Retry truck list</button></div>}
        {result && <>
          {result.items.length === 0 && <p>{page === 0 ? 'No trucks yet. Add your first truck below.' : 'No trucks on this page.'}</p>}
          <ul className="owned-trucks">{result.items.map((truck) => (
            <li key={truck.id}>
              <h3>{truck.name}</h3><p>{truck.category} · {truck.location}</p>
              <div className="operator-actions">
                <button onClick={() => { setActiveTruck(truck); setNotice(''); }}>Add menu item to {truck.name}</button>
                <Link to={`/trucks/${truck.id}`}>View public menu</Link>
              </div>
            </li>
          ))}</ul>
          {(result.totalPages > 1 || page > 0) && <div className="operator-actions">
            <button disabled={page === 0} onClick={() => refresh(page - 1)}>Previous trucks</button>
            <span>Page {page + 1}</span>
            <button disabled={page + 1 >= result.totalPages} onClick={() => refresh(page + 1)}>Next trucks</button>
          </div>}
        </>}
      </section>
      <section aria-labelledby="create-truck-title">
        <h2 id="create-truck-title">Add a truck</h2>
        <p>Saving publishes this profile in public discovery.</p>
        <form className="operator-truck-form" onSubmit={submit}>
          <label htmlFor="truck-name">Truck name</label>
          <input id="truck-name" required maxLength={120} value={fields.name} onChange={(e) => setFields({ ...fields, name: e.target.value })} />
          <label htmlFor="truck-category">Food category</label>
          <input id="truck-category" required maxLength={80} value={fields.category} onChange={(e) => setFields({ ...fields, category: e.target.value })} />
          <label htmlFor="truck-location">Location</label>
          <input id="truck-location" required maxLength={200} value={fields.location} onChange={(e) => setFields({ ...fields, location: e.target.value })} />
          {saveError && <p role="alert">{saveError}</p>}
          <button disabled={saving}>{saving ? 'Publishing…' : 'Publish truck'}</button>
        </form>
      </section>
      {notice && <p className="auth-success" role="status">{notice}</p>}
      {activeTruck && <section aria-labelledby="add-menu-title">
        <h2 id="add-menu-title">Add to {activeTruck.name}’s menu</h2>
        <p><Link to={`/trucks/${activeTruck.id}`}>View published menu</Link></p>
        <MenuItemForm key={`${activeTruck.id}-${formVersion}`} submitLabel="Publish menu item" onSubmit={async (item) => {
          setNotice('');
          try { await addMenuItem(activeTruck.id, item); }
          catch (cause) { sessionExpired(cause); throw cause; }
          setNotice(`${item.name} was saved to ${activeTruck.name}’s menu.`);
          setFormVersion((value) => value + 1);
        }} />
      </section>}
    </>
  );
}
