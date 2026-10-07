export type OperatorAccount = {
  id: number;
  displayName: string;
  email: string;
};

type CsrfToken = {
  headerName: string;
  token: string;
};

type ProblemResponse = {
  detail?: string;
  errors?: Record<string, string>;
};

export class AuthApiError extends Error {
  status: number;
  fieldErrors: Record<string, string>;

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

async function readProblem(response: Response, fallback: string): Promise<AuthApiError> {
  try {
    const body = await response.json() as ProblemResponse;
    return new AuthApiError(response.status, body.detail || fallback, body.errors || {});
  } catch {
    return new AuthApiError(response.status, fallback);
  }
}

async function csrfToken(): Promise<CsrfToken> {
  const response = await fetch("/api/auth/csrf", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw await readProblem(response, "Unable to start the secure request. Please try again.");
  return response.json();
}

export async function postWithCsrf<T>(path: string, body: object, fallback: string): Promise<T> {
  const csrf = await csrfToken();
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      [csrf.headerName]: csrf.token,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await readProblem(response, fallback);
  return response.json();
}

export function loginOperator(email: string, password: string): Promise<OperatorAccount> {
  return postWithCsrf("/api/auth/login", { email, password }, "Unable to sign in. Please try again.");
}

export function registerOperator(displayName: string, email: string, password: string): Promise<OperatorAccount> {
  return postWithCsrf(
    "/api/auth/register",
    { displayName, email, password },
    "Unable to create the account. Please try again.",
  );
}

export async function getCurrentOperator(signal?: AbortSignal): Promise<OperatorAccount | null> {
  const response = await fetch("/api/auth/me", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (response.status === 401) return null;
  if (!response.ok) throw await readProblem(response, "Unable to check your session. Please try again.");
  return response.json();
}

export async function logoutOperator(): Promise<void> {
  const csrf = await csrfToken();
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: { [csrf.headerName]: csrf.token },
  });
  if (!response.ok) throw await readProblem(response, "Unable to sign out. Please try again.");
}
