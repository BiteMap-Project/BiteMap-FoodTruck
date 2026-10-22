import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listFavorites, isSignedOut, removeFavorite, type FavoritePage } from "../services/favorites";
import { forgetFavorite } from "../features/favorites/favoritesStore";
import "./cart.css";
import "../features/favorites/favorites.css";

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: FavoritePage };

/** SCRUM-78: a signed-in customer's saved trucks. */
export default function FavoritesPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [removeError, setRemoveError] = useState("");
  const [removing, setRemoving] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listFavorites(page, controller.signal).then(
      (data) => { if (!controller.signal.aborted) setState({ kind: "ready", data }); },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (isSignedOut(error)) navigate("/customer/login", { replace: true, state: { returnTo: "/favorites" } });
        else setState({ kind: "error" });
      },
    );
    return () => controller.abort();
  }, [page, attempt, navigate]);

  function reload(next = page) {
    setState({ kind: "loading" });
    setPage(next);
    setAttempt((value) => value + 1);
  }

  async function remove(id: number, name: string) {
    if (removing !== null) return;
    setRemoveError("");
    setRemoving(id);
    try {
      // Removing is safe to repeat on the server, so a retry after a timeout is fine.
      await removeFavorite(id);
      forgetFavorite(id);
      const lastOnPage = state.kind === "ready" && state.data.items.length === 1 && page > 0;
      reload(lastOnPage ? page - 1 : page);
    } catch (error) {
      if (isSignedOut(error)) navigate("/customer/login", { state: { returnTo: "/favorites" } });
      else setRemoveError(`Couldn’t remove ${name}. Please try again.`);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="cart-site">
      <header className="cart-header">
        <Link className="cart-brand" to="/trucks">BiteMap<span>.</span></Link>
        <Link to="/trucks">Browse trucks</Link>
      </header>
      <main className="cart-page">
        <p className="cart-eyebrow">SAVED FOR LATER</p>
        <h1>Favorites</h1>
        <p>Your saved trucks, newest first. Open one to see its menu and where it’s headed next.</p>

        {state.kind === "loading" && <p role="status">Loading your favorites…</p>}
        {state.kind === "error" && (
          <div role="alert" className="cart-empty">
            <p>Unable to load your favorites. Please try again.</p>
            <button type="button" className="cart-primary favorites-retry" onClick={() => reload()}>Retry</button>
          </div>
        )}
        {removeError && <p role="alert" className="cart-order-error">{removeError}</p>}

        {state.kind === "ready" && (state.data.items.length === 0 ? (
          <section className="cart-empty">
            <h2>{page === 0 ? "No favorites yet." : "No favorites on this page."}</h2>
            <p>{page === 0 ? "Tap Save on any truck to keep it here." : "Your list changed since this page loaded."}</p>
            {page === 0
              ? <Link className="cart-primary" to="/trucks">Find a truck</Link>
              : <button type="button" className="cart-primary favorites-retry" onClick={() => reload(page - 1)}>Previous page</button>}
          </section>
        ) : (
          <>
            <p role="status" className="favorites-count">{state.data.totalElements} saved {state.data.totalElements === 1 ? "truck" : "trucks"}</p>
            <ul className="favorites-list">
              {state.data.items.map((truck) => (
                <li key={truck.id}>
                  <div>
                    <h2>{truck.name}</h2>
                    <p>{truck.category} · {truck.location}</p>
                  </div>
                  <div className="favorites-actions">
                    <Link className="cart-primary" to={`/trucks/${truck.id}`}>View {truck.name}</Link>
                    <button type="button" className="cart-clear" disabled={removing !== null}
                      onClick={() => remove(truck.id, truck.name)}>
                      {removing === truck.id ? "Removing…" : `Remove ${truck.name}`}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {(state.data.totalPages > 1 || page > 0) && (
              <nav className="favorites-pager" aria-label="Favorite pages">
                <button type="button" className="cart-primary" disabled={page === 0} onClick={() => reload(page - 1)}>Newer</button>
                <span>Page {page + 1} of {Math.max(1, state.data.totalPages)}</span>
                <button type="button" className="cart-primary" disabled={page + 1 >= state.data.totalPages || page >= 10000} onClick={() => reload(page + 1)}>Older</button>
              </nav>
            )}
          </>
        ))}
      </main>
    </div>
  );
}
