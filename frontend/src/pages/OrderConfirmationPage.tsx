import { Link, useParams } from "react-router-dom";
import { useCustomerOrder } from "../features/orders/useCustomerOrder";
import "./cart.css";
import { PickupLocation } from "../features/orders/PickupLocation";
import CustomerCancellation from '../features/orders/CustomerCancellation';
import AcceptanceDeadline from '../features/orders/AcceptanceDeadline';
import { cancellationMessage } from '../features/orders/cancellationMessage';

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const steps = ["PLACED", "ACCEPTED", "READY", "COMPLETED"];
const labels = ["Placed", "Accepted", "Ready for pickup", "Collected"];
const messages: Record<string, string> = {
  PLACED: "Your order has been placed.",
  ACCEPTED: "Your order has been accepted.",
  READY: "Your order is ready for pickup.",
  COMPLETED: "Your order has been collected.",
  CANCELLED: "Your order was cancelled.",
};

export default function OrderConfirmationPage() {
  const id = Number(useParams().id);
  const valid = Number.isSafeInteger(id) && id > 0;
  return <div className="cart-site">
    <nav className="customer-page-links" aria-label="Page navigation"><Link to="/trucks">Browse trucks</Link></nav>
    <main className="cart-page order-confirmation">
      <Link to="/orders">← My orders</Link>
      {valid ? <OrderDetails key={id} id={id} /> : <section className="cart-empty"><h1>We couldn’t load this order.</h1><p role="alert">Order not found.</p><Link className="cart-primary" to="/trucks">Return to trucks</Link></section>}
    </main>
  </div>;
}

function OrderDetails({ id }: { id: number }) {
  const { order, loading, error, denied, checkedAt, paused, refresh, applyOrder, connection } = useCustomerOrder(id);
  const current = order ? steps.indexOf(order.status) : -1;
  const active = order && ["PLACED", "ACCEPTED", "READY"].includes(order.status);
  const readyTime = order?.estimatedReadyAt ? new Date(order.estimatedReadyAt) : null;
  const cancelled = order?.status === 'CANCELLED';
  return <>
    {!denied && <div className="customer-order-refresh"><button className="cart-primary" disabled={loading || paused} onClick={refresh}>Refresh status</button>
      <span>{loading ? "Checking order…" : checkedAt ? `Last checked ${checkedAt.toLocaleTimeString()}` : ""}</span></div>}
    {error && <p role="alert" className="cart-order-error">{error}</p>}
    {denied === 401 && <Link className="cart-primary" to="/customer/login" state={{ returnTo: `/orders/${id}/confirmation` }}>Customer sign in</Link>}
    {!order && loading && <p role="status">Loading your order…</p>}
    {denied && <Link className="cart-primary" to="/trucks">Return to trucks</Link>}
    {order && <>
      <p className="cart-eyebrow">YOUR PICKUP ORDER</p>
      <h1>{cancelled ? 'Order cancelled' : order.status === "PLACED" ? "Thanks, your pickup order is in." : "Your order updates"}</h1>
      <p className="confirmation-number">Order #{order.id} · {order.vendorName}</p>
      {active && <p className="cart-note">{connection==='live' ? 'Live order updates connected.' : connection==='connecting' ? 'Connecting live updates…' : 'Live updates disconnected or paused. Periodic status checks remain available while this page is visible.'}</p>}
      {!cancelled && <PickupLocation pickup={order.pickup} />}
      <AcceptanceDeadline status={order.status} deadline={order.acceptanceDeadline} />
      <section className={`customer-order-status ${order.status === "CANCELLED" ? "is-cancelled" : ""}`} aria-label="Order status">
        <div role="status" aria-live="polite" aria-atomic="true">
          <h2>{cancelled ? cancellationMessage(order.cancellationSource) : messages[order.status] ?? "Order status is unavailable."}</h2>
          {cancelled && <><h3>Cancellation reason</h3><p className="customer-cancellation-reason">{order.cancellationReason || "No cancellation reason was recorded."}</p></>}
        </div>
        {cancelled && <div className="customer-cancellation-next">
          <p>This order will not be prepared. Browse available trucks when you are ready to place a new order.</p>
          <Link className="cart-primary" to="/trucks">Browse available trucks</Link>
        </div>}
        {current >= 0 && <ol className="customer-order-progress" aria-label="Preparation progress">{steps.map((step, index) =>
          <li key={step} className={index <= current ? "is-reached" : ""} aria-current={index === current ? "step" : undefined}>
            <span aria-hidden="true">{index < current ? "✓" : index + 1}</span>{labels[index]}
          </li>)}</ol>}
        {order.status === "PLACED" && <p>Waiting for the truck to accept your order.</p>}
        {order.status === "ACCEPTED" && <p>The truck is preparing your food.</p>}
        {active && <section className="customer-pickup-code" aria-label="Pickup verification">
          <h3>Your pickup code</h3>
          {order.pickupCode ? <strong aria-label={`Pickup code ${order.pickupCode.split('').join(' ')}`}>{order.pickupCode}</strong>
            : <p>Refresh your order to load your pickup code.</p>}
          <p>Share this code with the truck only when you collect your food. You can find it again in My orders.</p>
        </section>}
        {readyTime && ["PLACED", "ACCEPTED"].includes(order.status) && <p className="customer-ready-estimate">
          <span>Estimated ready time</span><strong><time dateTime={order.estimatedReadyAt!}>{readyTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></strong>
        </p>}
        <p className="cart-note">{active ? paused ? "Automatic updates paused while this tab is hidden." : "This page updates automatically every 10 seconds while it is open." : "Automatic updates have stopped. You can still refresh manually."}</p>
      </section>
      {cancelled && order.pickup && <details className="customer-cancelled-pickup">
        <summary>Original pickup location</summary><p>This pickup is no longer active for this order.</p>
        <PickupLocation pickup={order.pickup} showDirections={false} />
      </details>}
      {order.status === 'PLACED' && <CustomerCancellation order={order} loading={loading || paused}
        onSaved={applyOrder} onRefresh={refresh}/>}
      <ul className="cart-items">{order.items.map(item => <li key={item.menuItemId}>
        <div><h3>{item.name}</h3><p>{dollars.format(item.unitPrice)} × {item.quantity}</p></div><strong>{dollars.format(item.lineTotal)}</strong>
      </li>)}</ul>
      <section className="cart-total"><span>Order total</span><strong>{dollars.format(order.total)}</strong></section>
      <p className="cart-note">Online payment is not recorded here. Order status tracks preparation, not live truck GPS.</p>
      {!cancelled && <Link className="cart-primary" to="/trucks">Find another truck</Link>}
    </>}
  </>;
}
