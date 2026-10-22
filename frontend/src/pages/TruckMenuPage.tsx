import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { getVendor, type VendorProfile } from "../services/vendors";
import { EmptyState, ErrorState, LoadingState } from "../components/StatusViews";
import "./truck-profile.css";
import { addCartItem, cartItemCount, readCart } from "../features/cart/cart";
import { ownerBackLink, readOwnerReturn } from "../features/operator/ownerReturn";
import { presetArtwork } from "../features/menu/menuImages";

type Result =
  | { status: "loading"; id: string }
  | { status: "success"; id: string; truck: VendorProfile }
  | { status: "missing"; id: string }
  | { status: "error"; id: string };

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function menuArtwork(name: string, preset?: import("../types/api").MenuImagePreset) {
  if (preset && preset !== "GENERIC") {
    const choice = presetArtwork(preset);
    const tones = { DRINK: "sage", TACO: "gold", INDIAN: "sage", DESSERT: "berry" } as const;
    return { icon: choice.icon, tone: tones[preset] };
  }
  const value = name.toLowerCase();
  if (value.includes("taco")) return { icon: "🌮", tone: "gold" };
  if (value.includes("quesadilla")) return { icon: "🫓", tone: "wheat" };
  if (value.includes("burger") || value.includes("melt")) return { icon: "🍔", tone: "amber" };
  if (value.includes("soup")) return { icon: "🍲", tone: "tomato" };
  if (value.includes("bread")) return { icon: "🥖", tone: "wheat" };
  if (value.includes("coffee") || value.includes("latte") || value.includes("brew")) return { icon: "☕", tone: "coffee" };
  if (value.includes("muffin")) return { icon: "🧁", tone: "berry" };
  if (value.includes("fries")) return { icon: "🍟", tone: "gold" };
  if (value.includes("bowl") || value.includes("masala")) return { icon: "🍛", tone: "sage" };
  if (value.includes("wrap")) return { icon: "🌯", tone: "wheat" };
  if (value.includes("poke")) return { icon: "🍱", tone: "ocean" };
  if (value.includes("musubi")) return { icon: "🍙", tone: "sage" };
  if (value.includes("sundae") || value.includes("ice cream")) return { icon: "🍨", tone: "berry" };
  if (value.includes("crepe")) return { icon: "🥞", tone: "wheat" };
  if (value.includes("pizza")) return { icon: "🍕", tone: "tomato" };
  if (value.includes("sandwich")) return { icon: "🥪", tone: "sage" };
  if (value.includes("noodle")) return { icon: "🍜", tone: "tomato" };
  if (value.includes("lemonade") || value.includes("horchata") || value.includes("lassi")) return { icon: "🥤", tone: "sage" };
  return { icon: "🍽️", tone: "sage" };
}

function ChefBearIllustration() {
  return (
    <svg className="truck-chef-bear" viewBox="0 0 150 150" aria-hidden="true">
      <circle cx="75" cy="75" r="68" fill="#f4d19e" />
      <g stroke="#293c31" strokeWidth="4" strokeLinejoin="round">
        <circle cx="48" cy="62" r="15" fill="#b66f47" />
        <circle cx="102" cy="62" r="15" fill="#b66f47" />
        <path d="M43 43v-5h10c0-12 10-20 22-20s22 8 22 20h10v5Z" fill="#fff8e7" />
        <path d="M52 43h46" fill="none" strokeLinecap="round" />
        <circle cx="75" cy="72" r="34" fill="#b66f47" />
        <circle cx="64" cy="69" r="3" fill="#293c31" stroke="none" />
        <circle cx="86" cy="69" r="3" fill="#293c31" stroke="none" />
        <ellipse cx="75" cy="83" rx="14" ry="11" fill="#f8dfbd" stroke="none" />
        <path d="m69 79 6-4 6 4-6 6Z" fill="#293c31" stroke="none" />
        <path d="M75 85v2m-7 0c4 5 10 5 14 0" fill="none" strokeLinecap="round" />
        <path d="M43 142v-15c0-21 14-34 32-34s32 13 32 34v15Z" fill="#b66f47" />
        <circle cx="42" cy="119" r="14" fill="#b66f47" />
        <circle cx="108" cy="119" r="14" fill="#b66f47" />
        <circle cx="42" cy="119" r="5" fill="#f8dfbd" stroke="none" />
        <circle cx="108" cy="119" r="5" fill="#f8dfbd" stroke="none" />
        <path d="m60 101 15 12 15-12" fill="none" stroke="#b64923" strokeWidth="7" />
      </g>
    </svg>
  );
}

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
            <div className="truck-profile-copy">
              <p className="truck-eyebrow">MEET YOUR NEXT FAVORITE</p>
              <h1>{current.truck.name}</h1>
              <p>Category: {current.truck.category}</p>
              <p>Location: {current.truck.location}</p>
              <a className="truck-menu-jump" href="#menu-heading">Explore the menu ↓</a>
            </div>
            <ChefBearIllustration />
          </div>
          <section aria-labelledby="menu-heading">
            <div className="truck-menu-heading">
              <div><p className="truck-eyebrow">TODAY'S MENU</p><h2 id="menu-heading">Pick your favorite</h2></div>
              <span>{current.truck.menu.length} {current.truck.menu.length === 1 ? "item" : "items"}</span>
            </div>
            {cartMessage && <p className="cart-message" role="status">{cartMessage}</p>}
            {current.truck.menu.length === 0 ? (
              <EmptyState title="No menu available yet." hint="This truck hasn't posted its menu. Check back later." />
            ) : (
              <ul className="menu-items">
                {current.truck.menu.map((item) => (
                  <li key={item.id}>
                    <div className={`menu-item-art menu-item-art-${menuArtwork(item.name, item.imagePreset).tone}`} role="img" aria-label={`${item.name} image`}>
                      {item.hasCustomImage ? <img src={`/api/vendors/${current.truck.id}/menu-items/${item.id}/image`} alt="" /> : <span aria-hidden="true">{menuArtwork(item.name, item.imagePreset).icon}</span>}
                    </div>
                    <div className="menu-item-content">
                      <div className="menu-item-heading">
                        <h3>{item.name}</h3>
                        <span>{dollars.format(item.price)}</span>
                      </div>
                      {item.description && <p>{item.description}</p>}
                      {item.available ? <button className="add-to-cart" type="button" aria-label={`Add ${item.name} to cart`} onClick={() => {
                        const next = addCartItem(current.truck.id, current.truck.name, { id: item.id, name: item.name, price: item.price });
                        if (!next) setCartMessage("Your cart contains items from another truck. Clear that cart before starting a new order.");
                        else { setCartCount(cartItemCount(next)); setCartMessage(`${item.name} added to your cart.`); }
                      }}>Add to cart</button> : <p className="unavailable">Currently unavailable</p>}
                    </div>
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
