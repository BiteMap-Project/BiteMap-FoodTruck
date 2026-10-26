import { useCallback, useEffect, useRef, useState } from "react";
import { AuthApiError } from "../services/auth";

/** UX only. The server remains authoritative across reloads, tabs and API clients. */
export function useAuthCooldown() {
  const deadline = useRef(0);
  const [seconds, setSeconds] = useState(0);
  const active = seconds > 0;
  const handleRateLimit = useCallback((cause: unknown) => {
    if (!(cause instanceof AuthApiError) || cause.status !== 429) return;
    const delay = cause.retryAfterSeconds ?? 60;
    deadline.current = Date.now() + delay * 1000;
    setSeconds(delay);
  }, []);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setSeconds(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))), 250);
    return () => window.clearInterval(timer);
  }, [active]);
  return { seconds, handleRateLimit };
}
