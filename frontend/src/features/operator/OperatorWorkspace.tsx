import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { OperatorAccount } from "../../services/auth";
import { listOwnedVendors, listMenu, saveVendor, createMenuItem, editMenuItem, changeAvailability, uploadMenuImage, WorkspaceError, type Vendor, type MenuItem, type Page, type Availability } from "../../services/operatorWorkspace";
import { presetArtwork } from "../menu/menuImages";
import MenuPhoto from "../menu/MenuPhoto";
import { ItemForm, VendorForm } from "./WorkspaceForms";
import SchedulePanel from "./SchedulePanel";
import OrdersPanel from "./OrdersPanel";
import { previewState, readWorkspaceRestore, workspaceRoute, workspaceUrl, WORKSPACE_TABS, type WorkspaceTab } from "./ownerReturn";
import "./owner-design.css";
import "./workspace.css";

type Tab = WorkspaceTab;
type Load<T> = { kind: "loading" } | { kind: "error"; error: unknown } | { kind: "ready"; data: T };
const errorText = (error: unknown) => error instanceof WorkspaceError ? error.message : "Unable to reach the server. Check your connection and try again.";
const availabilityOptions: { value: Availability; label: string }[] = [
  { value: "ACTIVE", label: "Available" },
  { value: "INACTIVE", label: "Not on menu" },
  { value: "SOLD_OUT", label: "Sold out" },
];

export default function OperatorWorkspace({ account, onSignOut, signingOut, logoutError }: { account: OperatorAccount; onSignOut: () => void; signingOut: boolean; logoutError: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Coming back from "View customer menu" reopens the same truck and tab.
  const route = workspaceRoute(location.pathname);
  const restore = route ?? readWorkspaceRestore(location.state);
  const requestedId = restore?.vendorId ?? null;
  const tab: Tab = restore?.tab ?? "Overview";
  const invalidRoute = location.pathname.startsWith("/operator/vendors/") && !route;
  const setTab = (next: Tab) => { if (selected) navigate(workspaceUrl(selected.id, next)); };
  const compactLayout = tab === "Schedule" || tab === "Orders";
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [vendors, setVendors] = useState<Load<Page<Vendor>>>({ kind: "loading" });
  const [selected, setSelected] = useState<Vendor | null>(null);
  const [creating, setCreating] = useState(false);
  const loaded = useRef<{ key: string; data: Page<Vendor> } | null>(null);
  const paging = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const key = `${page}:${attempt}`;
    if (loaded.current?.key === key && requestedId !== null && loaded.current.data.items.some(v => v.id === requestedId)) {
      setVendors({ kind: "ready", data: loaded.current.data });
      setSelected(loaded.current.data.items.find(v => v.id === requestedId)!);
      return;
    }
    setVendors({ kind: "loading" });
    setSelected(null);
    async function load() {
      let data = await listOwnedVendors(page, controller.signal);
      // Resolve deep links only against the authenticated owner's trucks.
      if (!paging.current && requestedId !== null && !data.items.some(v => v.id === requestedId)) {
        const totalPages = data.totalPages;
        for (let index = 0; index < totalPages; index++) {
          if (index === page) continue;
          const candidate = await listOwnedVendors(index, controller.signal);
          if (candidate.items.some(v => v.id === requestedId)) { data = candidate; break; }
        }
      }
      return data;
    }
    load().then(data => {
      if (controller.signal.aborted) return;
      setVendors({ kind: "ready", data });
      loaded.current = { key, data };
      if (paging.current) {
        paging.current = false;
        setSelected(data.items[0] ?? null);
        if (data.items[0]) navigate(workspaceUrl(data.items[0].id, tab), { replace: true });
        return;
      }
      setSelected(requestedId !== null ? data.items.find(v => v.id === requestedId) ?? null : data.items[0] ?? null);
    }, error => {
      if (controller.signal.aborted) return;
      if (error instanceof WorkspaceError && error.status === 401) navigate("/operator/login", { replace: true });
      else setVendors({ kind: "error", error });
    });
    return () => controller.abort();
  }, [page, attempt, navigate, requestedId, tab]);

  function reload(nextPage = vendors.kind === "ready" ? vendors.data.page : page) { paging.current = nextPage !== (vendors.kind === "ready" ? vendors.data.page : page); setVendors({ kind: "loading" }); setSelected(null); setCreating(false); setPage(nextPage); setAttempt(a => a + 1); }
  if (invalidRoute) return <main><h1>Workspace page not found</h1><Link to="/operator">Back to overview</Link></main>;
  return <div className="od-app ow-connected">
    <aside className="od-sidebar"><Link className="od-brand" to="/">BiteMap<span className="od-brand-dot">.</span></Link>
      <p className="od-sidebar-label">OWNER WORKSPACE</p><nav aria-label="Owner navigation">{WORKSPACE_TABS.map(t => <button className={`od-nav-item ${tab === t ? "is-active" : ""}`} aria-current={tab === t ? "page" : undefined} key={t} onClick={() => { setTab(t); setCreating(false); }}>{t}</button>)}</nav>
      <div className="od-sidebar-tip"><strong>Your kitchen, connected.</strong><p>Truck and menu changes are saved to BiteMap, not this browser.</p><Link to="/operator/analytics">My business insights →</Link></div>
      <div className="od-owner"><div><strong>{account.displayName}</strong><p>{account.email}</p><button type="button" className="od-button od-button-secondary" disabled={signingOut} onClick={onSignOut}>{signingOut ? "Signing out…" : "Sign out"}</button></div></div>
    </aside>
    <div className="od-workspace"><header className="od-topbar"><span>Workspace / {tab}</span><Link to="/">Browse trucks →</Link></header>
      <main className="od-main">{compactLayout ? <h1>{tab}</h1> : <div className="od-page-heading"><div><p className="od-eyebrow">GOOD FOOD. YOUR BUSINESS.</p><h1>Welcome, {account.displayName}</h1><p>Manage only the trucks owned by your account.</p></div></div>}
        {logoutError && <p role="alert" className="ow-error">{logoutError}</p>}
        {vendors.kind === "loading" && <p role="status">Loading your trucks…</p>}
        {vendors.kind === "error" && <div role="alert"><p>{errorText(vendors.error)}</p><button onClick={() => reload()}>Retry trucks</button></div>}
        {vendors.kind === "ready" && <>
          <div className="ow-toolbar"><label>Your truck<select aria-label="Your truck" value={selected?.id ?? ""} onChange={e => { navigate(workspaceUrl(Number(e.target.value), tab)); setCreating(false); }}><option value="" disabled>Select a truck</option>{vendors.data.items.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>{(!compactLayout || vendors.data.totalElements === 0) && <button className="od-button od-button-primary" onClick={() => setCreating(true)}>{vendors.data.totalElements === 0 ? "Create your first truck" : "New truck"}</button>}{!compactLayout && <button className="od-button od-button-secondary" onClick={() => reload()}>Refresh trucks</button>}</div>
          {(!compactLayout || vendors.data.totalPages > 1) && <Pager page={vendors.data.page} totalPages={vendors.data.totalPages} onPage={reload} label="Trucks" />}
          {creating ? <NewVendor onSaved={() => reload(0)} onCancel={() => setCreating(false)} /> : selected ? <VendorWorkspace key={selected.id} vendor={selected} tab={tab} onSaved={v => { if (loaded.current) loaded.current.data = { ...loaded.current.data, items: loaded.current.data.items.map(old => old.id === v.id ? v : old) }; setSelected(v); setVendors({ kind: "ready", data: { ...vendors.data, items: vendors.data.items.map(old => old.id === v.id ? v : old) } }); }} /> : <section className="ow-panel"><h2>{requestedId !== null ? "Truck unavailable" : "No trucks yet"}</h2><p>{requestedId !== null ? "This truck is not available to your account." : "Create your first truck to start building its menu."}</p></section>}
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
    {tab !== "Schedule" && tab !== "Orders" && <section className="od-hero"><div className="od-hero-copy"><span className="od-label">YOUR TRUCK</span><h2>{vendor.name}</h2><p>{vendor.category} · {vendor.location}</p><div className="od-hero-bottom"><Link className="od-button od-button-secondary" to={`/trucks/${vendor.id}`} state={previewState({ from: "workspace", vendorId: vendor.id, tab })}>View customer menu →</Link></div></div></section>}
    {message && <p role="status" className="ow-message">{message}</p>}{error && <p role="alert" className="ow-error">{error}</p>}
    {tab === "Overview" && <section className="ow-panel"><h2>Your workspace is connected</h2><p>Use Menu to add items, edit prices and change availability. Use Truck Details to update this truck’s public profile. Use Schedule to publish, edit and cancel planned stops. Use Orders to review customer orders and manage preparation.</p><p>Revenue and opening-hours controls are not available yet.</p></section>}
    {tab === "Schedule" && <SchedulePanel key={vendor.id} vendorId={vendor.id} />}
    {tab === "Orders" && <OrdersPanel key={vendor.id} vendorId={vendor.id} />}
    {tab === "Truck Details" && <section className="ow-panel"><h2>Truck details</h2><VendorForm key={`${vendor.id}-${vendor.name}-${vendor.category}-${vendor.location}`} initial={vendor} busy={unavailable} onSave={input => mutate(() => saveVendor(input, vendor.id), result => onSaved(result as Vendor))} />{blocked && <p>Refresh trucks to reload your access before retrying.</p>}</section>}
    {tab === "Menu" && <section className="ow-panel ow-menu-panel"><div className="ow-menu-heading"><div><span className="ow-menu-eyebrow">YOUR MENU</span><h2>Menu items</h2><p>Choose what customers can order from your current menu.</p></div><div className="ow-menu-heading-actions"><button className="od-button od-button-primary" disabled={unavailable || menu.kind !== "ready"} onClick={() => setEditor("new")}>Add menu item</button><button disabled={busy} className="od-button od-button-secondary" onClick={() => reload()}>Reload menu</button></div></div>
      {menu.kind === "loading" && <p role="status">Loading menu…</p>}
      {menu.kind === "error" && <p role="alert">{errorText(menu.error)}</p>}
      {menu.kind === "ready" && <>
        <p className="ow-menu-count">{menu.data.totalElements} menu {menu.data.totalElements === 1 ? "item" : "items"}</p>
        {editor !== null && <section className="ow-editor"><h3>{editor === "new" ? "New item" : `Edit ${editor.name}`}</h3><ItemForm key={editor === "new" ? "new" : `${editor.id}-${editor.version}`} initial={editor === "new" ? undefined : editor} busy={unavailable} onSave={(input, status, imageFile) => mutate(async () => {
          const saved = editor === "new" ? await createMenuItem(vendor.id, { ...input, imagePreset: input.imagePreset ?? "GENERIC", status }) : await editMenuItem(vendor.id, editor.id, { ...input, version: editor.version });
          if (!imageFile) return saved;
          try { return await uploadMenuImage(vendor.id, saved.id, saved.version, imageFile); }
          catch (error) {
            // The details POST/PUT already committed. Retrying must edit that item,
            // not create a duplicate or reuse its stale pre-save version.
            if (mounted.current) setEditor(saved);
            throw new WorkspaceError(error instanceof WorkspaceError ? error.status : 503,
              `Item details were saved, but the photo was not confirmed. Reload the menu to check before retrying. ${errorText(error)}`);
          }
        }, () => reload(editor === "new" ? 0 : page))} /><button disabled={busy} onClick={() => setEditor(null)}>Cancel editing</button></section>}
        {!menu.data.items.length && <p>No items on this page. Add an item or return to the previous page.</p>}
        {menu.data.items.map(item => <article className="ow-menu-row" key={item.id}><div className="ow-menu-thumbnail"><MenuPhoto src={item.hasCustomImage ? `/api/vendors/${vendor.id}/menu-items/${item.id}/image?v=${item.version}` : undefined} fallback={presetArtwork(item.imagePreset).icon} /></div><div className="ow-menu-item-copy"><div className="ow-menu-name"><h3>{item.name}</h3><span className={`ow-status-badge is-${item.status.toLowerCase()}`}>{availabilityOptions.find(option => option.value === item.status)?.label}</span></div><p>{item.description}</p><strong>${item.price.toFixed(2)}</strong></div><div className="ow-item-actions"><span className="ow-status-label" id={`availability-${item.id}`}>Customer menu status</span><div className="ow-status-buttons" role="group" aria-labelledby={`availability-${item.id}`}>{availabilityOptions.map(option => <button type="button" key={option.value} className={item.status === option.value ? "is-selected" : ""} aria-pressed={item.status === option.value} disabled={unavailable || editor !== null} onClick={() => { if (item.status === option.value) return; void mutate(() => changeAvailability(vendor.id, item.id, option.value, item.version), () => reload()); }}>{option.label}</button>)}</div><button className="ow-edit-item" disabled={unavailable || editor !== null} onClick={() => setEditor(item)}>Edit {item.name}</button></div></article>)}
        <Pager page={menu.data.page} totalPages={menu.data.totalPages} onPage={reload} label="Menu" disabled={busy || editor !== null} />
      </>}
    </section>}
  </>;
}

function Pager({ page, totalPages, onPage, label, disabled = false }: { page: number; totalPages: number; onPage: (page: number) => void; label: string; disabled?: boolean }) {
  return <div className="ow-pagination" aria-label={`${label} pages`}><button disabled={disabled || page === 0} onClick={() => onPage(page - 1)}>Previous {label.toLowerCase()}</button><span>Page {page + 1} of {Math.max(1, totalPages)}</span><button disabled={disabled || page + 1 >= totalPages} onClick={() => onPage(page + 1)}>Next {label.toLowerCase()}</button></div>;
}
