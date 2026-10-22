import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cartTotal, clearCart, readCart, setCartQuantity } from "../features/cart/cart";
import "./cart.css";
import { useAuth } from "../auth/authState";
import { createCustomerOrder } from "../services/orders";
import { PickupLocation } from "../features/orders/PickupLocation";
import { usePickupStop } from "../features/orders/usePickupStop";

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function CartPage() {
  const navigate = useNavigate();
  const [cart, setCart] = useState(readCart);
  const { account } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState("");
  const stop = usePickupStop(cart?.vendorId);

  async function placeOrder() {
    if (!cart || submitting || stop.loading || !stop.pickup) return;
    setOrderError("");
    setSubmitting(true);
    try {
      const order = await createCustomerOrder(cart, stop.pickup.stopId);
      clearCart();
      setCart(null);
      navigate(`/orders/${order.id}/confirmation`);
    } catch (cause) {
      setOrderError(cause instanceof Error ? cause.message : "Unable to place the order. Please try again.");
      setSubmitting(false);
    }
  }

  return <div className="cart-site">
    <header className="cart-header"><Link className="cart-brand" to="/">BiteMap<span>.</span></Link><Link to="/trucks">Continue browsing</Link></header>
    <main className="cart-page">
      <p className="cart-eyebrow">PICKUP ORDER</p>
      <h1>Your cart</h1>
      {!cart ? <section className="cart-empty"><h2>Your cart is empty.</h2><p>Choose an available item from a truck menu to get started.</p><Link className="cart-primary" to="/trucks">Find a food truck</Link></section> : <>
        <section className="cart-summary" aria-labelledby="cart-truck"><div><p>Ordering from</p><h2 id="cart-truck">{cart.vendorName}</h2></div><Link to={`/trucks/${cart.vendorId}`}>Add more items</Link></section>
        <ul className="cart-items">
          {cart.items.map((item) => <li key={item.id}>
            <div><h3>{item.name}</h3><p>{dollars.format(item.price)} each</p></div>
            <label>Quantity for {item.name}<select value={item.quantity} onChange={(event) => setCart(setCartQuantity(item.id, Number(event.target.value)))}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((quantity) => <option key={quantity} value={quantity}>{quantity}</option>)}</select></label>
            <strong>{dollars.format(item.price * item.quantity)}</strong>
            <button type="button" onClick={() => setCart(setCartQuantity(item.id, 0))}>Remove {item.name}</button>
          </li>)}
        </ul>
        <section className="cart-total"><span>Estimated total</span><strong>{dollars.format(cartTotal(cart))}</strong></section>
        <section className={`cart-pickup ${stop.error ? "is-error" : stop.pickup ? "is-active" : "is-unavailable"}`} aria-label="Pickup availability">
          {stop.pickup ? <PickupLocation pickup={stop.pickup} /> : <div className="cart-pickup-message">
            <span className="cart-pickup-icon" aria-hidden="true">{stop.loading ? "…" : stop.error ? "!" : "×"}</span>
            <div>
              <p className="cart-pickup-label">Pickup availability</p>
              {stop.loading ? <p role="status">Checking current pickup location…</p>
                : stop.error ? <p role="alert">{stop.error}</p>
                : <p role="status">No active pickup stop. You can keep browsing, but this truck is not accepting orders right now.</p>}
            </div>
          </div>}
          <button className="cart-pickup-refresh" type="button" disabled={stop.loading || submitting} onClick={stop.refresh}>Refresh pickup details</button>
        </section>
        <p className="cart-note">Your order total is calculated using current menu prices when you place your order. No online payment is collected here.</p>
        {account
          ? <><p className="cart-signed-in">Signed in as {account.displayName}</p>{orderError && <p className="cart-order-error" role="alert">{orderError}</p>}<button className="cart-checkout" type="button" disabled={submitting || stop.loading || !stop.pickup} onClick={placeOrder}>{submitting ? "Placing order…" : "Place pickup order"}</button></>
          : <Link className="cart-checkout cart-checkout-link" to="/customer/login" state={{ returnTo: "/cart" }}>Sign in to continue</Link>}
        <button className="cart-clear" type="button" onClick={() => { clearCart(); setCart(null); }}>Clear cart</button>
      </>}
    </main>
  </div>;
}
