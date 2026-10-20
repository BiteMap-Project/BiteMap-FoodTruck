import { useContext, useEffect, useSyncExternalStore } from "react";
import { AuthContext } from "../../auth/authState";
import { isSignedOut, listFavoriteIds, removeFavorite, saveFavorite } from "../../services/favorites";

/**
 * One shared copy of the signed-in customer's saved truck IDs, so every card on
 * a page can show Save or Saved without its own request. Who is signed in comes
 * from the shared AuthContext; the server stays the authority, so a button only
 * changes after the server confirms.
 */
export type FavoritesState = {
  /** "none": no AuthProvider (the button hides itself). */
  status: "none" | "loading" | "guest" | "ready" | "error";
  ids: ReadonlySet<number>;
  pending: ReadonlySet<number>;
};

const initial: FavoritesState = { status: "loading", ids: new Set(), pending: new Set() };
let state = initial;
/** Which session the current state belongs to, e.g. "customer:7", "guest" or "checking". */
let owner = "";
let generation = 0;
const listeners = new Set<() => void>();

function set(next: Partial<FavoritesState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

/** Points the store at a session; loads saved IDs when a customer is signed in. */
function follow(nextOwner: string, customerId: number | null) {
  if (nextOwner === owner) return;
  owner = nextOwner;
  const mine = ++generation;
  if (nextOwner === "none") { set({ status: "none", ids: new Set(), pending: new Set() }); return; }
  if (nextOwner === "checking") { set({ status: "loading", ids: new Set(), pending: new Set() }); return; }
  if (customerId === null) { set({ status: "guest", ids: new Set(), pending: new Set() }); return; }
  set({ status: "loading", ids: new Set(), pending: new Set() });
  listFavoriteIds().then(
    (ids) => { if (mine === generation) set({ status: "ready", ids: new Set(ids) }); },
    (error: unknown) => {
      if (mine !== generation) return;
      set(isSignedOut(error) ? { status: "guest", ids: new Set() } : { status: "error" });
    },
  );
}

/** Loads the saved IDs again (after an error). */
export function retryFavorites() {
  const previous = owner;
  owner = "";
  const id = previous.startsWith("customer:") ? Number(previous.slice("customer:".length)) : null;
  follow(previous, id);
}

/** Records a removal confirmed elsewhere (the Favorites page) so cards update too. */
export function forgetFavorite(vendorId: number) {
  if (!state.ids.has(vendorId)) return;
  const ids = new Set(state.ids);
  ids.delete(vendorId);
  set({ ids });
}

/** Test helper: forget everything between tests. */
export function resetFavorites() {
  generation++;
  owner = "";
  state = initial;
  listeners.forEach((listener) => listener());
}

export type ToggleResult = "saved" | "removed" | "sign-in";

/** Saves or removes a truck. Resolves "sign-in" when the visitor must sign in first. */
export async function toggleFavorite(vendorId: number): Promise<ToggleResult> {
  if (state.status === "guest") return "sign-in";
  if (state.pending.has(vendorId)) return state.ids.has(vendorId) ? "saved" : "removed";
  const saving = !state.ids.has(vendorId);
  const mine = generation;
  set({ pending: new Set(state.pending).add(vendorId) });
  const withoutPending = () => {
    const pending = new Set(state.pending);
    pending.delete(vendorId);
    return pending;
  };
  try {
    await (saving ? saveFavorite(vendorId) : removeFavorite(vendorId));
    if (mine !== generation) return saving ? "saved" : "removed"; // signed out meanwhile
    const ids = new Set(state.ids);
    if (saving) ids.add(vendorId); else ids.delete(vendorId);
    set({ ids, pending: withoutPending(), status: "ready" });
    return saving ? "saved" : "removed";
  } catch (error) {
    if (mine === generation) set({ pending: withoutPending() });
    // A 401 also tells AuthContext the session ended, which moves this store to "guest".
    if (isSignedOut(error)) return "sign-in";
    throw error;
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => state;

/** Current favorites for the signed-in account (or guest). */
export function useFavorites(): FavoritesState {
  const auth = useContext(AuthContext);
  const account = auth?.account ?? null;
  const customerId = account && account.roles.includes("ROLE_CUSTOMER") ? account.id : null;
  const nextOwner = !auth ? "none"
    : auth.status !== "ready" ? "checking"
      : customerId !== null ? `customer:${customerId}` : "guest";
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => { follow(nextOwner, customerId); }, [nextOwner, customerId]);
  // Until the effect runs for a new session, never show another session's IDs.
  return nextOwner === owner ? current : { ...initial, status: nextOwner === "none" ? "none" : "loading" };
}
