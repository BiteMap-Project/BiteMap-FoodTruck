import type { Account } from "../types/api";
import { sendWithCsrf } from "./apiRequest";

export const DISPLAY_NAME_MAX = 120;

/** Same rules as the backend; the server still validates every request. */
export function validateDisplayName(raw: string): string | undefined {
  const name = raw.trim();
  if (!name) return "Display name is required.";
  if (name.length > DISPLAY_NAME_MAX) return `Display name must be ${DISPLAY_NAME_MAX} characters or fewer.`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return "Display name cannot contain line breaks or control characters.";
  return undefined;
}

/** SCRUM-79: changes the signed-in account's display name. Identity comes from the session only. */
export function updateDisplayName(displayName: string): Promise<Account> {
  return sendWithCsrf<Account>("PATCH", "/api/account/profile", { displayName: displayName.trim() },
    "Unable to save your account details. Please try again.");
}
