import { AuthApiError } from "./auth";

export async function recoverPassword(action: "forgot-password" | "reset-password", body: object): Promise<string> {
  const signal = AbortSignal.timeout(20_000);
  const csrfResponse = await fetch("/api/auth/csrf", { credentials: "same-origin", signal, headers: { Accept: "application/json" } });
  if (!csrfResponse.ok) throw new AuthApiError(csrfResponse.status, "Unable to start a secure request. Refresh and try again.");
  const csrf = await csrfResponse.json() as { headerName: string; token: string };
  const response = await fetch(`/api/auth/${action}`, {
    method: "POST", credentials: "same-origin", signal,
    headers: { Accept: "application/json", "Content-Type": "application/json", [csrf.headerName]: csrf.token },
    body: JSON.stringify(body),
  });
  if (response.status === 429) {
    const value = Number(response.headers.get("Retry-After"));
    throw new AuthApiError(429, "Too many requests. Please wait before trying again.", {}, Number.isFinite(value) && value > 0 ? Math.min(value, 86400) : 60);
  }
  if (!response.ok) {
    const fallback = response.status === 403 ? "Your secure session changed. Refresh and try again." : "Password recovery is unavailable. Please try again later.";
    let detail = fallback;
    try { const result = await response.json(); if (typeof result.detail === "string") detail = result.detail; } catch { /* safe fallback */ }
    throw new AuthApiError(response.status, detail);
  }
  return (await response.json() as { message: string }).message;
}
