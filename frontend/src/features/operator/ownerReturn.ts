/**
 * Lets an owner preview a public truck page and come back to where they were.
 *
 * The owner pages pass this through React Router's navigation state, so it never
 * appears in the URL and customers who open the same truck page never see it.
 * Browser history keeps the state, so it still works after a refresh.
 */

export const WORKSPACE_TABS = ["Overview", "Menu", "Schedule", "Truck Details", "Orders"] as const;
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

/** Where an owner came from before opening a public truck page. */
export type OwnerReturn =
  | { from: "workspace"; vendorId: number; tab: WorkspaceTab }
  | { from: "analytics" };

/** What the workspace should reopen when the owner comes back. */
export type WorkspaceRestore = { vendorId: number; tab: WorkspaceTab };

const isTab = (value: unknown): value is WorkspaceTab =>
  typeof value === "string" && (WORKSPACE_TABS as readonly string[]).includes(value);

const isId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);

/** Navigation state to attach to a "View customer menu" link. */
export const previewState = (ownerReturn: OwnerReturn) => ({ ownerReturn });

/** Reads and validates the owner return note from a page's location state. */
export function readOwnerReturn(state: unknown): OwnerReturn | null {
  const value = (state as { ownerReturn?: unknown } | null)?.ownerReturn as Record<string, unknown> | undefined;
  if (!value || typeof value !== "object") return null;
  if (value.from === "analytics") return { from: "analytics" };
  if (value.from === "workspace" && isId(value.vendorId) && isTab(value.tab)) {
    return { from: "workspace", vendorId: value.vendorId, tab: value.tab };
  }
  return null;
}

/** Reads the truck and tab the workspace should reopen, if any. */
export function readWorkspaceRestore(state: unknown): WorkspaceRestore | null {
  const value = (state as { restore?: unknown } | null)?.restore as Record<string, unknown> | undefined;
  if (!value || typeof value !== "object" || !isId(value.vendorId) || !isTab(value.tab)) return null;
  return { vendorId: value.vendorId, tab: value.tab };
}

/** Where the "back" link on a previewed truck page should go. */
export function ownerBackLink(ownerReturn: OwnerReturn) {
  return ownerReturn.from === "workspace"
    ? {
        to: "/operator",
        label: "← Back to your dashboard",
        state: { restore: { vendorId: ownerReturn.vendorId, tab: ownerReturn.tab } satisfies WorkspaceRestore },
      }
    : { to: "/operator/analytics", label: "← Back to business insights", state: undefined };
}
