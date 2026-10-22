import { reportAuthorizationResponse } from "../auth/authEvents";

/** An API call failed. `message` is safe to show; `fieldErrors` maps form fields to messages. */
export class ApiError extends Error {
  status: number;
  fieldErrors: Record<string, string>;

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

type Problem = { detail?: unknown; errors?: unknown };

async function failure(response: Response, fallback: string): Promise<ApiError> {
  reportAuthorizationResponse(response.status);
  try {
    const body = (await response.json()) as Problem;
    const detail = typeof body?.detail === "string" && body.detail ? body.detail : fallback;
    const errors = body?.errors && typeof body.errors === "object" ? (body.errors as Record<string, string>) : {};
    return new ApiError(response.status, detail, errors);
  } catch {
    return new ApiError(response.status, fallback);
  }
}

/** GET a JSON resource with the session cookie. */
export async function getJson<T>(path: string, fallback: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", headers: { Accept: "application/json" }, signal });
  if (!response.ok) throw await failure(response, fallback);
  return response.json();
}

/**
 * Sends a state-changing request with a fresh CSRF token, as the backend requires.
 * Resolves with the JSON body, or `undefined` for 204 No Content.
 */
export async function sendWithCsrf<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body: object | undefined,
  fallback: string,
): Promise<T> {
  const tokenResponse = await fetch("/api/auth/csrf", { credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!tokenResponse.ok) throw await failure(tokenResponse, "Unable to start the secure request. Please try again.");
  const csrf = (await tokenResponse.json()) as { headerName: string; token: string };
  const headers: Record<string, string> = { Accept: "application/json", [csrf.headerName]: csrf.token };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw await failure(response, fallback);
  return (response.status === 204 ? undefined : await response.json()) as T;
}
