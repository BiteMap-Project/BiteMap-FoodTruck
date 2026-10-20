export const AUTH_ACCESS_EVENT = "bitemap:authorization-response";

export function reportAuthorizationResponse(status: number) {
  if (status === 401 || status === 403) {
    window.dispatchEvent(new CustomEvent(AUTH_ACCESS_EVENT, { detail: { status } }));
  }
}
