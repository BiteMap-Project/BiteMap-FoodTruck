import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getCustomerOrder, type CustomerOrder } from "../services/orders";
import "./cart.css";

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function OrderConfirmationPage() {
  const id = Number(useParams().id);
  const invalidId = !Number.isSafeInteger(id) || id <= 0;
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    if (invalidId) return () => controller.abort();
    getCustomerOrder(id, controller.signal).then(setOrder, (cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load the order.");
    });
    return () => controller.abort();
  }, [id, invalidId]);

  return <div className="cart-site">
    <header className="cart-header"><Link className="cart-brand" to="/">BiteMap<span>.</span></Link><Link to="/trucks">Browse more trucks</Link></header>
    <main className="cart-page order-confirmation">
      {invalidId || error ? <section className="cart-empty"><h1>We couldn’t load this order.</h1><p role="alert">{invalidId ? "Order not found." : error}</p><Link className="cart-primary" to="/trucks">Return to trucks</Link></section>
        : !order ? <p role="status">Loading your order…</p>
          : <>
            <p className="cart-eyebrow">ORDER CONFIRMED</p>
            <h1>Thanks, your pickup order is in.</h1>
            <p className="confirmation-number">Order #{order.id} · {order.vendorName}</p>
            <ul className="cart-items">{order.items.map((item) => <li key={item.menuItemId}>
              <div><h3>{item.name}</h3><p>{dollars.format(item.unitPrice)} × {item.quantity}</p></div>
              <strong>{dollars.format(item.lineTotal)}</strong>
            </li>)}</ul>
            <section className="cart-total"><span>Total due at pickup</span><strong>{dollars.format(order.total)}</strong></section>
            <p className="cart-note">The truck will prepare your order for pickup. Online payment is not part of this demo.</p>
            <Link className="cart-primary" to="/trucks">Find another truck</Link>
          </>}
    </main>
  </div>;
}
