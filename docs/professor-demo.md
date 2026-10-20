# Professor demo: customer pickup order

## Before class

1. Open Docker Desktop.
2. From the repository root, run `docker compose up -d --build`.
3. Run `docker compose ps` and wait until the services are healthy.
4. Open `http://localhost:5173`. Keep this hostname for the whole demo.
5. Prepare two browser sessions: a normal window for the customer and a private
   window for the operator.
6. Use test accounts and a test passphrase. Do not use a personal password.

## Walkthrough

1. As the customer, open the homepage. Explain that food truck discovery and menus
   are public, so an account is not required yet.
2. Search for a truck with an active stop, open its menu, and point out the pickup
   location and time before adding an available item to the cart.
3. Open the cart and choose **Sign in to continue**. Register or sign in, then point
   out that the cart is still there.
4. Choose **Place pickup order**. Show the order number, truck, pickup instructions,
   quantity, total, and **Placed** status on the confirmation page.
5. In the operator window, sign in with the account that owns that truck. Open the
   truck's **Orders** tab and find the same order number.
6. Change the order to **Accepted**, then **Ready**.
7. Return to the customer window. Open **My orders** and refresh the order. Its
   status should now be **Ready**.
8. Mark the order **Completed** in the operator window. Refresh the customer order
   once more to show the final status.

## What to say

"BiteMap lets anyone discover food trucks and view menus. An account is required
when the customer is ready to order. Each order is tied to the truck's active
pickup stop and saved in PostgreSQL with the item name and price at checkout. The
owner sees orders only for trucks they own, and the customer sees status changes
in their order history. Payment is handled at pickup in this version."

## Backup plan

If a live account or order fails, use a truck with an active stop and an account
created during rehearsal.
Refresh the page once before restarting services. If the service is unavailable,
run `docker compose ps`, confirm that PostgreSQL and the backend are healthy, and
then reload the browser.

## Optional operator setup

If time allows, show owner onboarding separately: register, submit an owner
application, use an approved operator account, create a truck, and add a menu item.
Keep the main demo focused on the customer order lifecycle.
