import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cartTotal, clearCart, readCart, setCartQuantity } from "../features/cart/cart";
import "./cart.css";
import { useAuth } from "../auth/authState";
import { createCustomerOrder } from "../services/orders";
import { PickupLocation } from "../features/orders/PickupLocation";
import { usePickupStop } from "../features/orders/usePickupStop";
import { readCheckoutAttempt } from '../features/cart/checkoutAttempt';
import { useCheckoutLock } from '../features/cart/useCheckoutLock';

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function CartPage() {
  const { account } = useAuth();
  return <CartContent key={account?.id ?? 'guest'} />;
}

function CartContent() {
  const navigate = useNavigate();
  const [draft, setCart] = useState(readCart);
  const { account } = useAuth();
  const locked = useCheckoutLock();
  const attempt = locked ? readCheckoutAttempt() : null;
  const recoveryBlocked = locked && (!attempt || attempt.accountId !== account?.id);
  const cart = recoveryBlocked ? null : attempt?.cart ?? draft;
  const mounted = useRef(true);
  const submittingRef = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState("");
  const stop = usePickupStop(cart?.vendorId);

  async function placeOrder() {
    if (!cart || !account || submittingRef.current || recoveryBlocked || (!attempt && (stop.loading || !stop.pickup))) return;
    submittingRef.current = true;
    setOrderError("");
    setSubmitting(true);
    try {
      const order = await createCustomerOrder(cart, attempt?.pickupStopId ?? stop.pickup!.stopId, account.id);
      if (!mounted.current) return;
      setCart(null);
      navigate(`/orders/${order.id}/confirmation`);
    } catch (cause) {
      if (!mounted.current) return;
      setOrderError(cause instanceof Error ? cause.message : "Unable to place the order. Please try again.");
      setSubmitting(false);
    } finally {
      submittingRef.current = false;
    }
  }

  return <div className="cart-site">
    <header className="cart-header"><Link className="cart-brand" to="/">BiteMap<span>.</span></Link><Link to="/trucks">Continue browsing</Link></header>
    <main className="cart-page">
      <p className="cart-eyebrow">PICKUP ORDER</p>
      <h1>Your cart</h1>
      {recoveryBlocked ? <section role="alert"><h2>Checkout needs recovery</h2><p>Sign in with the account that started checkout to recover its order. If recovery data is unavailable, check My orders and contact support before starting another order. Do not clear browser storage.</p><Link to="/customer/login">Customer sign in</Link></section>
      : !cart ? <section className="cart-empty"><h2>Your cart is empty.</h2><p>Choose an available item from a truck menu to get started.</p><Link className="cart-primary" to="/trucks">Find a food truck</Link></section> : <>
        {locked && <section className="cart-pickup" role="status"><h2>Recover your checkout</h2><p>Your original items and pickup stop are saved. The order may already exist. Recover it before changing your cart; recovery uses the same order reference.</p></section>}
        <section className="cart-summary" aria-labelledby="cart-truck"><div><p>Ordering from</p><h2 id="cart-truck">{cart.vendorName}</h2></div><Link to={`/trucks/${cart.vendorId}`}>Add more items</Link></section>
        <ul className="cart-items">
          {cart.items.map((item) => <li key={item.id}>
            <div><h3>{item.name}</h3><p>{dollars.format(item.price)} each</p></div>
            <label>Quantity for {item.name}<select disabled={locked || submitting} value={item.quantity} onChange={(event) => setCart(setCartQuantity(item.id, Number(event.target.value)))}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((quantity) => <option key={quantity} value={quantity}>{quantity}</option>)}</select></label>
            <strong>{dollars.format(item.price * item.quantity)}</strong>
            <button disabled={locked || submitting} className="cart-remove-item" type="button" aria-label={`Remove ${item.name}`} title="Remove item" onClick={() => setCart(setCartQuantity(item.id, 0))}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg>
            </button>
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
          ? <><p className="cart-signed-in">Signed in as {account.displayName}</p>{orderError && <p className="cart-order-error" role="alert">{orderError}</p>}<button className="cart-checkout" type="button" disabled={submitting || (!attempt && (stop.loading || !stop.pickup))} onClick={placeOrder}>{submitting ? "Placing order…" : attempt ? "Recover order" : "Place pickup order"}</button></>
          : <Link className="cart-checkout cart-checkout-link" to="/customer/login" state={{ returnTo: "/cart" }}>Sign in to continue</Link>}
        <button disabled={locked || submitting} className="cart-clear" type="button" onClick={() => { clearCart(); setCart(null); }}>Clear cart</button>
      </>}
    </main>
  </div>;
}
