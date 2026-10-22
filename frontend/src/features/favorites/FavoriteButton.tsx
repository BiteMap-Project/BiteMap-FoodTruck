import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { retryFavorites, toggleFavorite, useFavorites } from "./favoritesStore";
import "./favorites.css";

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="favorite-heart"
      fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
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

  // A stable name plus aria-pressed: screen readers hear "Save Taco Truck, toggle button, pressed".
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
        <span aria-hidden="true">{saved ? "Saved" : "Save"}</span>
      </button>
      {error && <span role="alert" className="favorite-error">{error}</span>}
    </span>
  );
}
