export type Account = {
  id: number;
  displayName: string;
  email: string;
  roles: string[];
};

export type OperatorAccount = Account;

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

export function loginAccount(email: string, password: string): Promise<Account> {
  return postWithCsrf("/api/auth/login", { email, password }, "Unable to sign in. Please try again.");
}

export function registerAccount(displayName: string, email: string, password: string): Promise<Account> {
  return postWithCsrf(
    "/api/auth/register",
    { displayName, email, password },
    "Unable to create the account. Please try again.",
  );
}

export async function getCurrentAccount(signal?: AbortSignal): Promise<Account | null> {
  const response = await fetch("/api/auth/me", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (response.status === 401) return null;
  if (!response.ok) throw await readProblem(response, "Unable to check your session. Please try again.");
  return response.json();
}

export async function logoutAccount(): Promise<void> {
  const csrf = await csrfToken();
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: { [csrf.headerName]: csrf.token },
  });
  if (!response.ok) throw await readProblem(response, "Unable to sign out. Please try again.");
}

export function becomeOperator(): Promise<Account> {
  return postWithCsrf("/api/auth/become-operator", {}, "Unable to activate the owner workspace. Please try again.");
}

export const hasRole = (account: Account, role: "ROLE_CUSTOMER" | "ROLE_OPERATOR") => account.roles.includes(role);

// Compatibility names for the existing owner workspace while routes migrate to
// the unified account language.
export const loginOperator = loginAccount;
export const registerOperator = registerAccount;
export const getCurrentOperator = getCurrentAccount;
export const logoutOperator = logoutAccount;
