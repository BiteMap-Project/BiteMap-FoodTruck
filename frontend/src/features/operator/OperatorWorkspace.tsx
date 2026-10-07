import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { OperatorAccount } from "../../services/auth";
import { listOwnedVendors, listMenu, saveVendor, createMenuItem, editMenuItem, changeAvailability, WorkspaceError, type Vendor, type MenuItem, type Page, type Availability } from "../../services/operatorWorkspace";
import { ItemForm, VendorForm } from "./WorkspaceForms";
import SchedulePanel from "./SchedulePanel";
import "./owner-design.css";
import "./workspace.css";

type Tab = "Overview" | "Menu" | "Schedule" | "Truck Details" | "Orders";
type Load<T> = { kind: "loading" } | { kind: "error"; error: unknown } | { kind: "ready"; data: T };
const errorText = (error: unknown) => error instanceof WorkspaceError ? error.message : "Unable to reach the server. Check your connection and try again.";

export default function OperatorWorkspace({ account, onSignOut, signingOut, logoutError }: { account: OperatorAccount; onSignOut: () => void; signingOut: boolean; logoutError: string }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("Overview");
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [vendors, setVendors] = useState<Load<Page<Vendor>>>({ kind: "loading" });
  const [selected, setSelected] = useState<Vendor | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    listOwnedVendors(page, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setVendors({ kind: "ready", data });
      setSelected(current => data.items.find(v => v.id === current?.id) ?? data.items[0] ?? null);
    }, error => {
      if (controller.signal.aborted) return;
      if (error instanceof WorkspaceError && error.status === 401) navigate("/operator/login", { replace: true });
      else setVendors({ kind: "error", error });
    });
    return () => controller.abort();
  }, [page, attempt, navigate]);

  function reload(nextPage = page) { setVendors({ kind: "loading" }); setSelected(null); setCreating(false); setPage(nextPage); setAttempt(a => a + 1); }
  return <div className="od-app ow-connected">
    <aside className="od-sidebar"><Link className="od-brand" to="/">BiteMap<span className="od-brand-dot">.</span></Link>
      <p className="od-sidebar-label">OWNER WORKSPACE</p><nav aria-label="Owner navigation">{(["Overview", "Menu", "Schedule", "Truck Details", "Orders"] as Tab[]).map(t => <button className={`od-nav-item ${tab === t ? "is-active" : ""}`} aria-current={tab === t ? "page" : undefined} key={t} onClick={() => { setTab(t); setCreating(false); }}>{t}</button>)}</nav>
      <div className="od-sidebar-tip"><strong>Your kitchen, connected.</strong><p>Truck and menu changes are saved to BiteMap, not this browser.</p><Link to="/analytics">Public truck insights →</Link></div>
      <div className="od-owner"><div><strong>{account.displayName}</strong><p>{account.email}</p><button type="button" className="od-button od-button-secondary" disabled={signingOut} onClick={onSignOut}>{signingOut ? "Signing out…" : "Sign out"}</button></div></div>
    </aside>
    <div className="od-workspace"><header className="od-topbar"><span>Workspace / {tab}</span><Link to="/">Browse trucks →</Link></header>
      <main className="od-main"><div className="od-page-heading"><div><p className="od-eyebrow">GOOD FOOD. YOUR BUSINESS.</p><h1>Welcome, {account.displayName}</h1><p>Manage only the trucks owned by your account.</p></div></div>
        {logoutError && <p role="alert" className="ow-error">{logoutError}</p>}
        {vendors.kind === "loading" && <p role="status">Loading your trucks…</p>}
        {vendors.kind === "error" && <div role="alert"><p>{errorText(vendors.error)}</p><button onClick={() => reload()}>Retry trucks</button></div>}
        {vendors.kind === "ready" && <>
          <div className="ow-toolbar"><label>Your truck<select aria-label="Your truck" value={selected?.id ?? ""} onChange={e => { setSelected(vendors.data.items.find(v => v.id === Number(e.target.value)) ?? null); setCreating(false); }}><option value="" disabled>Select a truck</option>{vendors.data.items.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label><button className="od-button od-button-primary" onClick={() => setCreating(true)}>New truck</button><button className="od-button od-button-secondary" onClick={() => reload()}>Refresh trucks</button></div>
          <Pager page={vendors.data.page} totalPages={vendors.data.totalPages} onPage={reload} label="Trucks" />
          {creating ? <NewVendor onSaved={() => reload(0)} onCancel={() => setCreating(false)} /> : selected ? <VendorWorkspace key={selected.id} vendor={selected} tab={tab} onSaved={v => { setSelected(v); setVendors({ kind: "ready", data: { ...vendors.data, items: vendors.data.items.map(old => old.id === v.id ? v : old) } }); }} /> : <section className="ow-panel"><h2>No trucks yet</h2><p>Create your first truck to start building its menu.</p></section>}
        </>}
      </main>
    </div>
  </div>;
}

function NewVendor({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const navigate = useNavigate();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <section className="ow-panel"><h2>Create your truck</h2><p>Ownership comes from your signed-in account.</p>
    <VendorForm busy={busy} onSave={async input => {
      if (lock.current) return; lock.current = true; setBusy(true); setError("");
      try { await saveVendor(input); onSaved(); } catch (e) { if (e instanceof WorkspaceError && e.status === 401) navigate("/operator/login", { replace: true }); else setError(errorText(e)); } finally { lock.current = false; setBusy(false); }
    }} />{error && <p role="alert" className="ow-error">{error}</p>}<button disabled={busy} onClick={onCancel}>Cancel</button></section>;
}

function VendorWorkspace({ vendor, tab, onSaved }: { vendor: Vendor; tab: Tab; onSaved: (v: Vendor) => void }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [menu, setMenu] = useState<Load<Page<MenuItem>>>({ kind: "loading" });
  const [editor, setEditor] = useState<MenuItem | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    listMenu(vendor.id, page, controller.signal).then(data => { if (!controller.signal.aborted) { setMenu({ kind: "ready", data }); setBlocked(false); } }, e => {
      if (controller.signal.aborted) return;
      if (e instanceof WorkspaceError && e.status === 401) navigate("/operator/login", { replace: true });
      else setMenu({ kind: "error", error: e });
    });
    return () => controller.abort();
  }, [vendor.id, page, attempt, navigate]);
  function reload(nextPage = page) { setMenu({ kind: "loading" }); setEditor(null); setError(""); setPage(nextPage); setAttempt(a => a + 1); }
  async function mutate(action: () => Promise<unknown>, done: (result: unknown) => void) {
    if (lock.current || blocked) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try { const result = await action(); if (mounted.current) { done(result); setMessage("Saved to BiteMap."); } }
    catch (e) {
      if (!mounted.current) return;
      if (e instanceof WorkspaceError && e.status === 401) navigate("/operator/login", { replace: true });
      else { setError(errorText(e)); if (e instanceof WorkspaceError && [403, 404, 409].includes(e.status)) setBlocked(true); }
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  const unavailable = busy || blocked;
  return <>
    <section className="od-hero"><div className="od-hero-copy"><span className="od-label">YOUR TRUCK</span><h2>{vendor.name}</h2><p>{vendor.category} · {vendor.location}</p><div className="od-hero-bottom"><Link className="od-button od-button-secondary" to={`/trucks/${vendor.id}`}>View customer menu →</Link></div></div></section>
    {message && <p role="status" className="ow-message">{message}</p>}{error && <p role="alert" className="ow-error">{error}</p>}
    {tab === "Overview" && <section className="ow-panel"><h2>Your workspace is connected</h2><p>Use Menu to add items, edit prices and change availability. Use Truck Details to update this truck’s public profile. Use Schedule to publish, edit and cancel planned stops.</p><p>Orders, revenue and opening-hours controls are not available yet.</p></section>}
    {tab === "Schedule" && <SchedulePanel key={vendor.id} vendorId={vendor.id} />}
    {tab === "Orders" && <section className="ow-panel"><h2>Orders are not connected yet</h2><p>No order or revenue backend is available. This workspace does not show simulated sales.</p></section>}
    {tab === "Truck Details" && <section className="ow-panel"><h2>Truck details</h2><VendorForm key={`${vendor.id}-${vendor.name}-${vendor.category}-${vendor.location}`} initial={vendor} busy={unavailable} onSave={input => mutate(() => saveVendor(input, vendor.id), result => onSaved(result as Vendor))} />{blocked && <p>Refresh trucks to reload your access before retrying.</p>}</section>}
    {tab === "Menu" && <section className="ow-panel"><div className="ow-toolbar"><h2>Your menu</h2><button className="od-button od-button-primary" disabled={unavailable || menu.kind !== "ready"} onClick={() => setEditor("new")}>Add menu item</button><button disabled={busy} className="od-button od-button-secondary" onClick={() => reload()}>Reload menu</button></div>
      <p>Active items are available. Inactive and sold-out items appear as unavailable on the current customer menu.</p>
      {menu.kind === "loading" && <p role="status">Loading menu…</p>}
      {menu.kind === "error" && <p role="alert">{errorText(menu.error)}</p>}
      {menu.kind === "ready" && <>
        <p>{menu.data.totalElements} menu items</p>
        {editor !== null && <section className="ow-editor"><h3>{editor === "new" ? "New item" : `Edit ${editor.name}`}</h3><ItemForm key={editor === "new" ? "new" : `${editor.id}-${editor.version}`} initial={editor === "new" ? undefined : editor} busy={unavailable} onSave={(input, status) => mutate(() => editor === "new" ? createMenuItem(vendor.id, { ...input, status }) : editMenuItem(vendor.id, editor.id, { ...input, version: editor.version }), () => reload(editor === "new" ? 0 : page))} /><button disabled={busy} onClick={() => setEditor(null)}>Cancel editing</button></section>}
        {!menu.data.items.length && <p>No items on this page. Add an item or return to the previous page.</p>}
        {menu.data.items.map(item => <article className="ow-menu-row" key={item.id}><div><h3>{item.name}</h3><p>{item.description}</p><strong>${item.price.toFixed(2)}</strong></div><div className="ow-item-actions"><label>Availability for {item.name}<select value={item.status} disabled={unavailable || editor !== null} onChange={e => { const status = e.target.value as Availability; void mutate(() => changeAvailability(vendor.id, item.id, status, item.version), () => reload()); }}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="SOLD_OUT">Sold out</option></select></label><button disabled={unavailable || editor !== null} onClick={() => setEditor(item)}>Edit {item.name}</button></div></article>)}
        <Pager page={menu.data.page} totalPages={menu.data.totalPages} onPage={reload} label="Menu" disabled={busy || editor !== null} />
      </>}
    </section>}
  </>;
}

function Pager({ page, totalPages, onPage, label, disabled = false }: { page: number; totalPages: number; onPage: (page: number) => void; label: string; disabled?: boolean }) {
  return <div className="ow-pagination" aria-label={`${label} pages`}><button disabled={disabled || page === 0} onClick={() => onPage(page - 1)}>Previous {label.toLowerCase()}</button><span>Page {page + 1} of {Math.max(1, totalPages)}</span><button disabled={disabled || page + 1 >= totalPages} onClick={() => onPage(page + 1)}>Next {label.toLowerCase()}</button></div>;
}
