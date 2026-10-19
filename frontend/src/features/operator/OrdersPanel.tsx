import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthApiError } from "../../services/auth";
import { getOwnerOrder, listOwnerOrders, updateOwnerOrder, type OrderStatus, type OwnerOrder, type OwnerOrderSummary } from "../../services/operatorOrders";
import type { Page } from "../../services/operatorWorkspace";
import "./orders.css";
import { PickupLocation } from "../orders/PickupLocation";

const labels: Record<OrderStatus, string> = { PLACED: "Placed", ACCEPTED: "Accepted", READY: "Ready", COMPLETED: "Completed", CANCELLED: "Cancelled" };
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const date = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const errorText = (error: unknown) => error instanceof AuthApiError ? error.message : "Connection interrupted. Refresh to check the latest order state.";

export default function OrdersPanel({ vendorId }: { vendorId: number }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<OrderStatus | "">("");
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<Page<OwnerOrderSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => { setLoading(true); setAttempt(value => value + 1); };
  useEffect(() => {
    const controller = new AbortController();
    listOwnerOrders(vendorId, page, filter, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setData(result); setError(""); setLoading(false);
    }, cause => {
      if (controller.signal.aborted) return;
      if (cause instanceof AuthApiError && cause.status === 401) navigate("/operator/login", { replace: true });
      else { setError(errorText(cause)); setLoading(false); setData(null); setSelected(null); }
    });
    return () => controller.abort();
  }, [vendorId, page, filter, attempt, navigate]);
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible" && !busy) { setLoading(true); setAttempt(value => value + 1); } };
    const timer = window.setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [busy]);

  return <section className="ow-panel ow-orders" aria-labelledby="orders-heading">
    <div className="ow-toolbar"><div><h2 id="orders-heading">Orders for your truck</h2><p>Real customer orders · newest first</p></div>
      <button className="od-button od-button-secondary" disabled={busy || loading} onClick={refresh}>Refresh orders</button></div>
    <label className="ow-order-filter">Order status<select value={filter} disabled={busy} onChange={event => {
      setLoading(true); setFilter(event.target.value as OrderStatus | ""); setPage(0); setData(null); setSelected(null);
    }}><option value="">All statuses</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <p className="ow-order-help">Updates every 30 seconds while this tab is visible. Times use your device’s time zone.</p>
    {loading && <p role="status">Refreshing orders…</p>}
    {error && <p role="alert" className="ow-error">{error}</p>}
    <div className="ow-order-layout">
      <div aria-label="Order queue">
        {data && <>
          <p>{data.totalElements} matching orders</p>
          {!data.items.length && <p>No orders match this filter.</p>}
          <ul className="ow-order-list">{data.items.map(order => <li key={order.id}>
            <div className="ow-order-row-heading"><strong>Order #{order.id}</strong><span className={`ow-order-status ow-order-${order.status.toLowerCase()}`}>{labels[order.status]}</span></div>
            <p><time dateTime={order.createdAt}>{date(order.createdAt)}</time></p>
            <div className="ow-order-row-heading"><strong>{money.format(order.total)}</strong><button disabled={busy}
              aria-pressed={selected === order.id} onClick={() => setSelected(order.id)}>View order #{order.id}</button></div>
          </li>)}</ul>
          <nav className="ow-pagination" aria-label="Order pages">
            <button disabled={busy || loading || page === 0} onClick={() => { setLoading(true); setPage(page - 1); setData(null); setSelected(null); }}>Previous orders</button>
            <span>Page {page + 1} of {Math.max(1, data.totalPages)}</span>
            <button disabled={busy || loading || page + 1 >= data.totalPages} onClick={() => { setLoading(true); setPage(page + 1); setData(null); setSelected(null); }}>Next orders</button>
          </nav>
        </>}
      </div>
      {selected !== null ? <OrderDetail key={`${vendorId}-${selected}`} vendorId={vendorId} orderId={selected}
        onBusy={setBusy} onSaved={refresh} /> : <div className="ow-order-placeholder"><h3>Order details</h3><p>Select an order to review its items and manage preparation.</p></div>}
    </div>
  </section>;
}

function OrderDetail({ vendorId, orderId, onBusy, onSaved }: {
  vendorId: number; orderId: number; onBusy: (value: boolean) => void; onSaved: () => void;
}) {
  const navigate = useNavigate();
  const [order, setOrder] = useState<OwnerOrder | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const lock = useRef(false);
  const mounted = useRef(false);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { mounted.current = true; title.current?.focus(); return () => { mounted.current = false; onBusy(false); }; }, [onBusy]);
  useEffect(() => {
    const controller = new AbortController();
    getOwnerOrder(vendorId, orderId, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setOrder(result); setLoading(false); setBlocked(false); setCancelling(false); setReason("");
    }, cause => {
      if (controller.signal.aborted) return;
      if (cause instanceof AuthApiError && cause.status === 401) navigate("/operator/login", { replace: true });
      else { setError(errorText(cause)); setLoading(false); }
    });
    return () => controller.abort();
  }, [vendorId, orderId, attempt, navigate]);
  async function change(status: OrderStatus) {
    if (!order || lock.current || blocked || loading) return;
    if (status === "CANCELLED" && (!reason.trim() || reason.length > 500)) return;
    lock.current = true; setBusy(true); onBusy(true); setError(""); setMessage("");
    try {
      const updated = await updateOwnerOrder(vendorId, orderId, {
        status, version: order.version, ...(status === "CANCELLED" ? { cancellationReason: reason.trim() } : {}),
      });
      if (!mounted.current) return;
      setOrder(updated); setCancelling(false); setReason(""); setMessage(`Order #${orderId} updated to ${labels[updated.status]}.`); onSaved();
    } catch (cause) {
      if (!mounted.current) return;
      if (cause instanceof AuthApiError && cause.status === 401) navigate("/operator/login", { replace: true });
      else { setError(errorText(cause)); setBlocked(true); }
    } finally {
      lock.current = false;
      if (mounted.current) { setBusy(false); onBusy(false); }
    }
  }
  const next: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
    PLACED: { status: "ACCEPTED", label: "Accept order" }, ACCEPTED: { status: "READY", label: "Mark ready" }, READY: { status: "COMPLETED", label: "Mark collected" },
  };
  const action = order ? next[order.status] : undefined;
  return <section className="ow-order-detail" aria-labelledby="order-detail-heading">
    <h3 id="order-detail-heading" tabIndex={-1} ref={title}>Order #{orderId} details</h3>
    <button disabled={busy || loading} onClick={() => {
      setLoading(true); setOrder(null); setError(""); setMessage(""); setAttempt(value => value + 1);
    }}>Refresh order details</button>
    {loading && <p role="status">Loading order details…</p>}
    {error && <p role="alert" className="ow-error">{error}</p>}
    {blocked && <p>Refresh order details before taking another action. The previous request may already have succeeded.</p>}
    {message && <p role="status" className="ow-message">{message}</p>}
    {order && <>
      <p><span className={`ow-order-status ow-order-${order.status.toLowerCase()}`}>{labels[order.status]}</span></p>
      <p>Placed <time dateTime={order.createdAt}>{date(order.createdAt)}</time></p>
      <ul className="ow-order-items">{order.items.map(item => <li key={item.menuItemId}>
        <div><strong>{item.name}</strong><div>{item.quantity} × {money.format(item.unitPrice)}</div></div><strong>{money.format(item.lineTotal)}</strong>
      </li>)}</ul>
      <p className="ow-order-total"><span>Order total</span><strong>{money.format(order.total)}</strong></p>
      <p className="ow-order-help">Saved checkout prices. No online payment is recorded here.</p>
      <PickupLocation pickup={order.pickup} />
      {order.cancellationReason && <div><strong>Cancellation reason</strong><p>{order.cancellationReason}</p></div>}
      <div className="ow-order-actions">
        {action && !cancelling && <button className="od-button od-button-primary" disabled={busy || blocked || loading} onClick={() => void change(action.status)}>{action.label}</button>}
        {["PLACED", "ACCEPTED"].includes(order.status) && !cancelling && <button disabled={busy || blocked || loading} onClick={() => setCancelling(true)}>Cancel order</button>}
      </div>
      {cancelling && <form aria-label="Cancel order" onSubmit={event => { event.preventDefault(); void change("CANCELLED"); }}>
        <p>Cancel order #{orderId}? This cannot be undone.</p>
        <label>Reason visible to the customer<textarea value={reason} maxLength={500} required disabled={busy || blocked}
          onChange={event => setReason(event.target.value)} /></label>
        <p className="ow-order-help">{reason.length}/500 characters</p>
        <div className="ow-order-actions"><button className="od-button od-button-primary" disabled={busy || blocked || !reason.trim() || reason.length > 500}>Confirm cancellation</button>
          <button type="button" disabled={busy} onClick={() => setCancelling(false)}>Keep order</button></div>
      </form>}
      {order.status === "COMPLETED" && <p>This order is completed. No further changes are allowed.</p>}
      {order.status === "CANCELLED" && <p>This order is cancelled. No further changes are allowed.</p>}
      <p className="ow-order-help">Last changed {date(order.updatedAt)} · Version {order.version}</p>
    </>}
  </section>;
}
