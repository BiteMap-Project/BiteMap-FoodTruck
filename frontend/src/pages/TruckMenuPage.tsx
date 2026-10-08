import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { getVendor, type VendorProfile } from "../services/vendors";
import { EmptyState, ErrorState, LoadingState } from "../components/StatusViews";
import "./truck-profile.css";
import { addCartItem, cartItemCount, readCart } from "../features/cart/cart";
import { ownerBackLink, readOwnerReturn } from "../features/operator/ownerReturn";

type Result =
  | { status: "loading"; id: string }
  | { status: "success"; id: string; truck: VendorProfile }
  | { status: "missing"; id: string }
  | { status: "error"; id: string };

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function TruckMenuPage() {
  const { id = "" } = useParams();
  // Set only when an owner opens this page from their dashboard or insights.
  const ownerReturn = readOwnerReturn(useLocation().state);
  const back = ownerReturn ? ownerBackLink(ownerReturn) : null;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result>({ status: "loading", id });
  const [cartCount, setCartCount] = useState(() => cartItemCount(readCart()));
  const [cartMessage, setCartMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getVendor(id, controller.signal).then(
      (truck) => {
        if (!controller.signal.aborted) {
          setResult(truck ? { status: "success", id, truck } : { status: "missing", id });
        }
      },
      () => {
        if (!controller.signal.aborted) setResult({ status: "error", id });
      },
    );
    return () => controller.abort();
  }, [id, attempt]);

  // Never show the previous truck while a different route is loading.
  const current: Result = result.id === id ? result : { status: "loading", id };

  return (
    <div className="truck-site">
      <header className="truck-site-header"><Link className="truck-site-brand" to="/trucks">BiteMap<span>.</span></Link><nav aria-label="Truck page navigation"><Link to="/trucks">Discover trucks</Link><Link to="/cart">Cart ({cartCount})</Link><Link to="/operator">Owner workspace →</Link></nav></header>
    <main className="truck-profile">
      {back ? (
        <>
          <Link to={back.to} state={back.state}>{back.label}</Link>
          <p className="owner-preview-note" role="note">You’re previewing this menu the way customers see it.</p>
        </>
      ) : (
        <Link to="/trucks">← Back to trucks</Link>
      )}
      {current.status === "loading" && <LoadingState label="Loading truck…" />}
      {current.status === "missing" && (
        <>
          <h1>Truck not found.</h1>
          <p>This truck may have left BiteMap, or the link may be wrong.</p>
        </>
      )}
      {current.status === "error" && (
        <ErrorState
          message="Unable to load this truck. Please try again."
          onRetry={() => {
            setResult({ status: "loading", id });
            setAttempt((value) => value + 1);
          }}
        />
      )}
      {current.status === "success" && (
        <>
          <div className="truck-profile-hero">
          <p className="truck-eyebrow">MEET YOUR NEXT FAVORITE</p>
          <h1>{current.truck.name}</h1>
          <p>Category: {current.truck.category}</p>
          <p>Location: {current.truck.location}</p>
          <a className="truck-menu-jump" href="#menu-heading">Explore the menu ↓</a>
          </div>
          <section aria-labelledby="menu-heading">
            <h2 id="menu-heading">Menu</h2>
            {cartMessage && <p className="cart-message" role="status">{cartMessage}</p>}
            {current.truck.menu.length === 0 ? (
              <EmptyState title="No menu available yet." hint="This truck hasn't posted its menu. Check back later." />
            ) : (
              <ul className="menu-items">
                {current.truck.menu.map((item) => (
                  <li key={item.id}>
                    <div className="menu-item-heading">
                      <h3>{item.name}</h3>
                      <span>{dollars.format(item.price)}</span>
                    </div>
                    {item.description && <p>{item.description}</p>}
                    {item.available ? <button className="add-to-cart" type="button" onClick={() => {
                      const next = addCartItem(current.truck.id, current.truck.name, { id: item.id, name: item.name, price: item.price });
                      if (!next) setCartMessage("Your cart contains items from another truck. Clear that cart before starting a new order.");
                      else { setCartCount(cartItemCount(next)); setCartMessage(`${item.name} added to your cart.`); }
                    }}>Add {item.name} to cart</button> : <p className="unavailable">Currently unavailable</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
    <footer className="truck-site-footer">BiteMap · Good food is worth finding.</footer>
    </div>
  );
}

export default TruckMenuPage;
