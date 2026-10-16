import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AuthApiError } from "../services/auth";
import { listCustomerOrders, type CustomerOrderPage } from "../services/orders";
import "./cart.css";

const labels: Record<string, string> = { PLACED: "Placed", ACCEPTED: "Accepted", READY: "Ready for pickup", COMPLETED: "Collected", CANCELLED: "Cancelled" };
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
type State = { kind: "loading" } | { kind: "error"; login: boolean } | { kind: "ready"; data: CustomerOrderPage };

export default function CustomerOrdersPage() {
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ kind: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort(); setState({ kind: "error", login: false });
    }, 15000);
    listCustomerOrders(page, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ kind: "ready", data });
    }, error => {
      if (!controller.signal.aborted) setState({ kind: "error", login: error instanceof AuthApiError && error.status === 401 });
    }).finally(() => window.clearTimeout(timeout));
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [page, attempt]);
  function reload(next = page) { setState({ kind: "loading" }); setPage(next); setAttempt(value => value + 1); }
  return <div className="cart-site">
    <header className="cart-header"><Link className="cart-brand" to="/trucks">BiteMap<span>.</span></Link><Link to="/trucks">Browse trucks</Link></header>
    <main className="cart-page customer-order-history">
      <p className="cart-eyebrow">YOUR PICKUP ORDERS</p><h1>My orders</h1>
      <p>Reopen an order to follow its latest status or view its details.</p>
      <div className="customer-order-refresh"><button className="cart-primary" disabled={state.kind === "loading"} onClick={() => reload()}>Refresh orders</button></div>
      {state.kind === "loading" && <p role="status">Loading your orders…</p>}
      {state.kind === "error" && <><p role="alert">{state.login ? "Sign in to view your orders." : "Unable to load your orders. Please try again."}</p>
        {state.login && <Link className="cart-primary" to="/customer/login" state={{ returnTo: "/orders" }}>Customer sign in</Link>}</>}
      {state.kind === "ready" && <>
        {state.data.items.length === 0 ? <section className="cart-empty"><h2>{page === 0 ? "No orders yet." : "No orders on this page."}</h2><Link to="/trucks">Find a truck</Link></section>
          : <ul className="customer-order-list">{state.data.items.map(order => <li key={order.id}>
            <div><h2>{order.vendorName}</h2><p>Order #{order.id} · <time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleString()}</time></p>
              <p><strong>{labels[order.status] ?? "Status unavailable"}</strong> · {dollars.format(order.total)}</p></div>
            <Link className="cart-primary" to={`/orders/${order.id}/confirmation`}>View order #{order.id}</Link>
          </li>)}</ul>}
        <nav className="customer-order-refresh" aria-label="Order pages">
          <button className="cart-primary" disabled={page === 0} onClick={() => reload(page - 1)}>Newer orders</button>
          <span>Page {page + 1} of {Math.max(1, state.data.totalPages)}</span>
          <button className="cart-primary" disabled={page + 1 >= state.data.totalPages || page >= 10000} onClick={() => reload(page + 1)}>Older orders</button>
        </nav>
      </>}
    </main>
  </div>;
}
