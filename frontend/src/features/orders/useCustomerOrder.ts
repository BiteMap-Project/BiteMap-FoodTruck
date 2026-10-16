import { useEffect, useRef, useState } from "react";
import { AuthApiError } from "../../services/auth";
import { getCustomerOrder, type CustomerOrder } from "../../services/orders";

const active = new Set(["PLACED", "ACCEPTED", "READY"]);
type State = { order: CustomerOrder | null; loading: boolean; error: string; denied: number | null; checkedAt: Date | null; paused: boolean };

/** One bounded read at a time. Never creates orders or retries a mutation. */
export function useCustomerOrder(id: number) {
  const [state, setState] = useState<State>({ order: null, loading: true, error: "", denied: null, checkedAt: null, paused: document.visibilityState !== "visible" });
  const refreshRef = useRef<() => void>(() => {});
  useEffect(() => {
    let disposed = false;
    let terminal = false;
    let denied = false;
    let pending: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const clear = () => { clearTimeout(timer); clearTimeout(timeout); };
    async function read() {
      if (disposed || denied || pending || document.visibilityState !== "visible") return;
      clearTimeout(timer);
      const controller = new AbortController();
      pending = controller;
      let timedOut = false;
      timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
      setState(old => ({ ...old, loading: true, paused: false }));
      try {
        const order = await getCustomerOrder(id, controller.signal);
        if (disposed || pending !== controller || controller.signal.aborted) return;
        failures = 0;
        terminal = !active.has(order.status);
        setState({ order, loading: false, error: "", denied: null, checkedAt: new Date(), paused: false });
      } catch (cause) {
        if (disposed || pending !== controller || (controller.signal.aborted && !timedOut)) return;
        const status = cause instanceof AuthApiError ? cause.status : 0;
        denied = [401, 403, 404].includes(status);
        failures++;
        if (denied) {
          setState({ order: null, loading: false, checkedAt: null, paused: false, denied: status,
            error: status === 401 ? "Your session expired. Sign in to view your order." : "This order is not available to your account." });
        } else {
          setState(old => ({ ...old, loading: false,
            error: old.order ? "We could not refresh your order. Showing the last known status." : "We could not load your order. Check your connection and try again." }));
        }
      } finally {
        // A hidden-tab abort may finish after a new visible-tab request started.
        // It must not clear that request's timeout or schedule a second poll.
        if (pending === controller) {
          clearTimeout(timeout);
          pending = null;
          if (!disposed && !denied && !terminal && document.visibilityState === "visible") {
            timer = setTimeout(() => void read(), Math.min(10000 * 2 ** Math.min(failures, 3), 60000));
          }
        }
      }
    }
    const visibility = () => {
      const hidden = document.visibilityState !== "visible";
      if (hidden) { clear(); pending?.abort(); pending = null; }
      setState(old => ({ ...old, paused: hidden, loading: hidden ? false : old.loading }));
      if (!hidden && !terminal && !denied) void read();
    };
    refreshRef.current = () => void read();
    document.addEventListener("visibilitychange", visibility);
    void read();
    return () => {
      disposed = true; clear(); pending?.abort();
      document.removeEventListener("visibilitychange", visibility);
      refreshRef.current = () => {};
    };
  }, [id]);
  return { ...state, refresh: () => refreshRef.current() };
}
