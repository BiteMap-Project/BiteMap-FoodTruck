# Professor walkthrough: publish a truck and discover its menu

## What works in this change

A visitor can browse without an account. An operator can register, sign in, create
an owned truck, publish a menu item, and inspect private truck metrics and CSV.
The published profile and menu are saved in PostgreSQL and visible to anonymous
visitors. `/owner` now leads to the real `/operator` workspace instead of the
localStorage prototype; the prototype's source files remain for the team to reuse.

## Before class

1. Open Docker Desktop. From the repository root run `docker compose up -d --build`.
2. Run `docker compose ps` and wait for all three services to be healthy.
3. Open `http://localhost:5173` using the same hostname throughout the demo.
4. Have a normal browser and a private window ready for the operator/visitor roles.
5. Rehearse CSV download in that browser. Do not reset the database volume.

## Let the professor do the clicks (about five minutes)

1. Browse the homepage anonymously. Search for a truck and view its menu.
2. Return home, choose **Join as a truck owner**, and register a fresh test operator
   account with a passphrase of at least 15 characters. Do not reuse a real password.
3. Sign in. The new workspace should show **No trucks yet**, not another user's trucks.
4. Publish a truck named **Professor Tacos**, food category **Tacos**, location **CSUN**.
   Explain that Publish immediately makes the profile visible to visitors.
5. In the newly opened menu form, enter **Campus Taco**, price **4.50**, then choose
   **Publish menu item**. Use **View published menu** to inspect the result.
6. In the private visitor window, search for **Professor Tacos** and open its menu.
   The same item and price should appear without signing in.
7. Back in the operator window, open **View my business insights**. Expect one truck,
   one available item, an average menu price of $4.50, and zero scheduled stops.
   Select that truck and export CSV. An account used in earlier rehearsals may have
   more trucks; use a fresh account if demonstrating the one-truck result.
8. Sign out through the workspace. Private insights should require sign-in again;
   the public menu remains visible. Refresh the public page to show the saved data.

## Honest limits and the next customer story

The customer flow proposed by the team is consistent: browse anonymously, add items
to a cart, sign in/create a customer account at checkout, then submit an order.
The operator role must come from the server account, not a client-side role switch.
A customer login must return to the original cart instead of losing it.

Customer accounts, carts, orders, payment, and order status are not implemented by
this change. Do not present the existing prototype's sample orders as real orders.
For the next demo slice, agree on pickup-only orders paid at pickup. This gives the
professor a complete order/confirmation/operator-receipt use case without introducing
card processing or delivery into the first ordering story. The team must agree on
order states and who owns that backend work before coding it.

## Jira updates

- Add a follow-up to SCRUM-53: **Restrict business insights to the signed-in operator**.
  Acceptance: backend ownership filtering, no public analytics, no-store responses,
  empty new account, owned-truck selector/CSV, cross-owner and role tests.
- Add **Complete operator onboarding and menu publishing walkthrough** as a new
  integration story assigned to Aniket. Link SCRUM-26, SCRUM-28, SCRUM-37, SCRUM-51,
  and SCRUM-52 as existing work reused; coordinate review with Hayk and Carlin.
  Acceptance: register/login → create owned truck → add menu item → anonymous
  visitor can find it → operator can see only their metrics → logout blocks access.
- Keep both in review until the team reviews and rehearses the feature branch.
- Add a backlog story **Customer pickup order from cart to confirmation**.
  Acceptance: anonymous browsing/cart; customer registration/login preserving cart;
  server-validated item availability and prices; one truck per order; prevent duplicate
  submission; persist order and line-item price snapshots; customer confirmation;
  owner sees only their truck's orders. Explicitly state pay at pickup/no online payment.
  Estimate and assign this with the team instead of claiming it complete.

## Verification for this branch

- 214 existing/updated backend tests passed; the added full-session walkthrough
  test passed in a separate run (215 total).
- 100 frontend tests passed; production build passed.
- Browser rehearsal passed: anonymous analytics redirected to sign-in, the operator
  created a truck and menu item, own-only insights showed $4.50, logout succeeded,
  and the public menu remained visible without authentication.
- The temporary browser-test account and its records were removed afterward.
- One pre-existing lint warning remains in the original owner dashboard prototype.
