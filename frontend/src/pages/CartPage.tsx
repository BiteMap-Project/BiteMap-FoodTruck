import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cartTotal, clearCart, readCart, setCartQuantity } from "../features/cart/cart";
import "./cart.css";
import { getCurrentAccount, type Account } from "../services/auth";

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function CartPage() {
  const [cart, setCart] = useState(readCart);
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getCurrentAccount(controller.signal).then(setAccount, () => {});
    return () => controller.abort();
  }, []);

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
        <p className="cart-note">Pickup time, taxes and payment will be confirmed when ordering is connected.</p>
        {account
          ? <><p className="cart-signed-in">Signed in as {account.displayName}</p><button className="cart-checkout" type="button" disabled>Order submission is coming next</button></>
          : <Link className="cart-checkout cart-checkout-link" to="/customer/login" state={{ returnTo: "/cart" }}>Sign in to continue</Link>}
        <button className="cart-clear" type="button" onClick={() => { clearCart(); setCart(null); }}>Clear cart</button>
      </>}
    </main>
  </div>;
}
