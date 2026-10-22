import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { retryFavorites, toggleFavorite, useFavorites } from "./favoritesStore";
import "./favorites.css";

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className="favorite-heart"
      fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 21s-8.5-5.3-8.5-11.2A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 8.5 3.2C20.5 15.7 12 21 12 21Z" />
    </svg>
  );
}

/**
 * SCRUM-78: Save / Unsave a truck. Guests are sent to customer sign-in and
 * brought back to this page afterwards.
 */
export default function FavoriteButton({ vendorId, vendorName }: { vendorId: number; vendorName: string }) {
  const favorites = useFavorites();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  if (favorites.status === "none") return null; // rendered outside the app's AuthProvider
  const saved = favorites.ids.has(vendorId);
  const pending = favorites.pending.has(vendorId) || favorites.status === "loading";

  function signIn() {
    navigate("/customer/login", { state: { returnTo: location.pathname + location.search } });
  }

  async function click() {
    setError("");
    if (favorites.status === "guest") { signIn(); return; }
    if (favorites.status === "error") { retryFavorites(); return; }
    try {
      if ((await toggleFavorite(vendorId)) === "sign-in") signIn();
    } catch {
      setError(saved ? "Couldn’t remove this truck. Try again." : "Couldn’t save this truck. Try again.");
    }
  }

  // Just a heart: outlined when not saved, filled when saved. A stable name plus
  // aria-pressed means screen readers hear "Save Taco Truck, toggle button, pressed".
  return (
    <span className="favorite-control">
      <button
        type="button"
        className={`favorite-button${saved ? " is-saved" : ""}`}
        aria-pressed={saved}
        aria-label={`Save ${vendorName}`}
        title={saved ? "Saved to your favorites. Select to remove." : "Save to your favorites"}
        disabled={pending}
        onClick={click}
      >
        <HeartIcon filled={saved} />
      </button>
      {error && <span role="alert" className="favorite-error">{error}</span>}
    </span>
  );
}
