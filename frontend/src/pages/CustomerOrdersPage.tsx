import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState, SuccessNotice } from "../components/StatusViews";
import { AuthApiError } from "../services/auth";
import { listCustomerOrders, type CustomerOrderPage } from "../services/orders";
import "./cart.css";
import { cancellationMessage } from '../features/orders/cancellationMessage';

const labels: Record<string, string> = { PLACED: "Placed", ACCEPTED: "Accepted", READY: "Ready for pickup", COMPLETED: "Collected", CANCELLED: "Cancelled" };
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
type State = { kind: "loading" } | { kind: "error"; login: boolean } | { kind: "ready"; data: CustomerOrderPage };

export default function CustomerOrdersPage() {
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [notice, setNotice] = useState("");
  const successAfterLoad = useRef("");
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort(); setState({ kind: "error", login: false });
    }, 15000);
    listCustomerOrders(page, controller.signal).then(data => {
      if (!controller.signal.aborted) {
        setState({ kind: "ready", data });
        setNotice(successAfterLoad.current);
        successAfterLoad.current = "";
      }
    }, error => {
      if (!controller.signal.aborted) setState({ kind: "error", login: error instanceof AuthApiError && error.status === 401 });
    }).finally(() => window.clearTimeout(timeout));
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [page, attempt]);
  function reload(next = page, successMessage = "") {
    successAfterLoad.current = successMessage;
    setNotice("");
    setState({ kind: "loading" });
    setPage(next);
    setAttempt(value => value + 1);
  }
  return <div className="cart-site">
    <nav className="customer-page-links" aria-label="Page navigation"><Link to="/trucks">Browse trucks</Link></nav>
    <main className="cart-page customer-order-history">
      <p className="cart-eyebrow">YOUR PICKUP ORDERS</p><h1>My orders</h1>
      <p>Reopen an order to follow its latest status or view its details.</p>
      <div className="customer-order-refresh"><button className="cart-primary" disabled={state.kind === "loading"} onClick={() => reload(page, "Orders refreshed.")}>Refresh orders</button></div>
      {notice && <SuccessNotice message={notice} />}
      {state.kind === "loading" && <LoadingState label="Loading your orders…" />}
      {state.kind === "error" && <ErrorState
        message={state.login ? "Sign in to view your orders." : "We couldn't load your orders. Check your connection and try again."}
        onRetry={state.login ? undefined : () => reload()}
      >
        {state.login && <Link className="cart-primary" to="/customer/login" state={{ returnTo: "/orders" }}>Customer sign in</Link>}
      </ErrorState>}
      {state.kind === "ready" && <>
        {state.data.items.length === 0 ? <EmptyState
          title={page === 0 ? "No orders yet." : "No orders on this page."}
          hint={page === 0 ? "Your pickup orders will appear here after checkout." : "Return to a newer page or refresh your orders."}
        >
          {page === 0 ? <Link className="cart-primary" to="/trucks">Find a truck</Link>
            : <button type="button" onClick={() => reload(page - 1)}>View newer orders</button>}
        </EmptyState>
          : <ul className="customer-order-list">{state.data.items.map(order => <li key={order.id}>
            <div><h2>{order.vendorName}</h2><p>Order #{order.id} · <time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleString()}</time></p>
              <p><strong>{labels[order.status] ?? "Status unavailable"}</strong> · {dollars.format(order.total)}</p>
              {order.status === 'CANCELLED' && <div className="customer-order-cancellation-summary">
                <strong>{cancellationMessage(order.cancellationSource)}</strong>
                <p>{order.cancellationReason || 'No cancellation reason was recorded.'}</p>
              </div>}</div>
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
