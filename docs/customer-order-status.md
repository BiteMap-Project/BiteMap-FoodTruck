# Customer order-status tracking

The existing /orders/{id}/confirmation page now shows the current preparation
status, saved item prices, and cancellation reason. The server remains authoritative.
SSE notifications trigger authorized reads, with periodic polling as a fallback.
These are in-app updates, not WebSockets, GPS, email, or push notifications.

## Refresh policy

- Read GET /api/customer/orders/{id} using the session cookie and cache: no-store.
- Refresh PLACED, ACCEPTED and READY orders 10 seconds after each successful read.
- Pause when hidden; abort pending reads and refresh on becoming visible.
- Stop automatic reads for COMPLETED, CANCELLED or unknown statuses.
- Offer a manual Refresh status button, including on terminal orders.
- Allow only one in-flight request; time out a read after 15 seconds.
- Back off transient failures to 20, 40 and then 60 seconds; reset after success.
- Retain last known details on transient errors with a visible stale-data warning.
- Clear order details and stop polling on 401/403/404. A 401 offers customer login
  with a return destination to the same order page.
- Abort and ignore late responses on navigation, visibility changes and unmount.
- No polling operation creates an order or performs any mutation.

## Customer messages

PLACED: Your order has been placed.
ACCEPTED: Your order has been accepted.
READY: Your order is ready for pickup.
COMPLETED: Your order has been collected.
CANCELLED: **Order cancelled** replaces the page heading. The live status region
shows the server-recorded cancellation source and saved reason as plain text:

| `cancellationSource` | Message |
| --- | --- |
| `CUSTOMER` | You cancelled this order. |
| `OWNER` | The truck cancelled your order. |
| `ACCEPTANCE_TIMEOUT` | The truck did not accept in time. |
| null, omitted, or unrecognized | Your order was cancelled. |

The customer is told that the order will not be prepared and can choose
**Browse available trucks**. This link never reorders or modifies the cart.
Pickup verification and preparation controls disappear. Original pickup information
is available in a collapsed historical section, without an active directions action.
No payment or refund promise is made by this change.

The progress indicator is semantic, responsive and does not rely on color alone.
Status changes are announced politely to screen readers; timestamps are not live
announcements. Unknown states are not interpreted as a successful completion.
The status region stays mounted across refreshes; unchanged responses do not
replace its content or create repeated toast/alert announcements. The cancellation
reason is part of the same atomic polite announcement. History cards are not live regions.

## Manual testing

1. Place an order as a customer and leave its confirmation page visible.
2. Use a separate browser profile or private window for the owning operator:
   ordinary tabs share cookies, so signing into another account in the same
   browser session would also change the customer's account.
3. Accept the order in the owner workspace. Within approximately 10 seconds plus
   request latency, the customer sees Accepted without a reload.
4. Mark Ready, then verify the customer's pickup code to mark Collected. Check the message and progress indicator at each
   step. Automatic polling stops after collection.
5. Cancel another PLACED or ACCEPTED order as owner with a reason. Verify that the customer
   sees **The truck cancelled your order.** and that exact reason, without instructions to collect it.
6. Hide/reopen the customer tab; verify refresh resumes for active orders.
7. Simulate connection failure: last known data stays visible with a warning.
   Restore connectivity and use Refresh status.
8. Sign out or try another customer's order: no private order details remain.
9. Cancel a PLACED order as its customer. Check **You cancelled this order.**
   in tracking and My orders. Reopen it and refresh twice: the message remains,
   no new order is created, and the reason does not disappear.
10. Let a new order reach its saved acceptance deadline without accepting it.
    After the background worker runs, check the timeout-specific message and reason.
    Test while disconnected, then reconnect/refresh; never show cancellation based
    only on a client-side timer. Existing orders without a deadline do not expire.
11. Check cancellation on a narrow phone screen and with keyboard navigation.
    Verify the browse link is reachable and the historical pickup section opens with Enter.
12. Switch accounts in a second tab and return to cancelled tracking/history:
    the previous customer's reason must disappear as soon as the new account is recognized.

Run npm test, npm run build and npm run lint from frontend.
CustomerOrderStatus.test.tsx covers transitions, terminal states, reason rendering,
manual refresh, visibility, stale responses, authorization, timeout and backoff.
OrderFlow.test.tsx preserves checkout-to-confirmation behavior.

## Cancellation source contract and migration

V24 adds nullable `customer_orders.cancellation_source`. Existing rows are untouched.
Historical reasons are preserved, but their source remains null: a shared user ID
or free-form reason is not reliable evidence of customer versus owner action.

New customer, owner, and timeout cancellations record their source in the same
transaction as status, reason, version, audit history, and existing update signals.
The source is assigned by the server's action path, never submitted by the client.
This correctly distinguishes an owner cancelling their own purchase as an owner
from cancelling it through the customer action. No new endpoint or N+1 audit lookup is added.

Customer detail responses now include `cancellationSource`. History summaries include
both `cancellationSource` and `cancellationReason`. These fields remain protected by
the existing authenticated-customer ownership scope; no actor IDs are exposed.
Old servers or legacy rows use the neutral UI fallback. Existing CSRF, version/race,
idempotency, and expiry rules are unchanged.

## Reopening orders

Signed-in customers can select **My orders** in the truck-discovery header, or visit `/orders` directly.
The page fetches `GET /api/customer/orders?page=0&size=20`, newest first, and links each order to its existing live-status page.
The status page includes a **My orders** back link. After signing in, customers return to the history page.
History is stored in PostgreSQL, not browser storage, so closing the tab does not lose it.

The endpoint takes identity only from the authenticated session, filters by enabled customer ownership, returns `Cache-Control: no-store`, and uses two bounded queries (count and summaries), not a query per order.
Pagination accepts page 0–10000 and size 1–100. Existing customer/date indexes support ordering.
The history list refreshes on opening or using **Refresh orders**; automatic status polling runs on the detail page.
