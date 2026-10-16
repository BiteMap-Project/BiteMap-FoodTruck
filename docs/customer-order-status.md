# Customer order-status tracking

The existing /orders/{id}/confirmation page now shows the current preparation
status, saved item prices, and cancellation reason. The server remains authoritative.
This is near-real-time polling, not WebSockets, GPS, email or push notifications.

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
CANCELLED: Your order was cancelled. Show the saved reason as plain text.

The progress indicator is semantic, responsive and does not rely on color alone.
Status changes are announced politely to screen readers; timestamps are not live
announcements. Unknown states are not interpreted as a successful completion.

## Manual testing

1. Place an order as a customer and leave its confirmation page visible.
2. Use a separate browser profile or private window for the owning operator:
   ordinary tabs share cookies, so signing into another account in the same
   browser session would also change the customer's account.
3. Accept the order in the owner workspace. Within approximately 10 seconds plus
   request latency, the customer sees Accepted without a reload.
4. Mark Ready, then Collected. Check the message and progress indicator at each
   step. Automatic polling stops after collection.
5. Cancel another PLACED or ACCEPTED order with a reason. Verify that the customer
   sees Cancelled and that exact reason, without instructions to collect it.
6. Hide/reopen the customer tab; verify refresh resumes for active orders.
7. Simulate connection failure: last known data stays visible with a warning.
   Restore connectivity and use Refresh status.
8. Sign out or try another customer's order: no private order details remain.

Run npm test, npm run build and npm run lint from frontend.
CustomerOrderStatus.test.tsx covers transitions, terminal states, reason rendering,
manual refresh, visibility, stale responses, authorization, timeout and backoff.
OrderFlow.test.tsx preserves checkout-to-confirmation behavior.

No database migration or backend contract change is required. The cancellation
reason field was added by owner order management. The My orders history page is
separate work; customers can revisit their existing order confirmation URL.
## Reopening orders

Signed-in customers can select **My orders** in the truck-discovery header, or visit `/orders` directly.
The page fetches `GET /api/customer/orders?page=0&size=20`, newest first, and links each order to its existing live-status page.
The status page includes a **My orders** back link. After signing in, customers return to the history page.
History is stored in PostgreSQL, not browser storage, so closing the tab does not lose it.

The endpoint takes identity only from the authenticated session, filters by enabled customer ownership, returns `Cache-Control: no-store`, and uses two bounded queries (count and summaries), not a query per order.
Pagination accepts page 0–10000 and size 1–100. Existing customer/date indexes support ordering. No migration is required.
The history list refreshes on opening or using **Refresh orders**; automatic status polling runs on the detail page.
