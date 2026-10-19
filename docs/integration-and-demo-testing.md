# SCRUM-32: Integration and demo testing

## Demo use case

A customer finds a food truck, adds an available item to the cart, signs in, and
places a pickup order. The truck operator receives the same order and moves it
through **Placed**, **Accepted**, **Ready**, and **Completed**. The customer can
open order history and see the updated status.

## Customer checks

1. Open the homepage without signing in.
2. Search for a truck and open its menu.
3. Add two items from that truck to the cart.
4. Try to add an item from another truck. Confirm that BiteMap asks the customer
   to clear the current cart first.
5. Open the cart and choose **Sign in to continue**.
6. Register or sign in as a customer. Confirm that the cart is still present.
7. Place the pickup order and record the order number.
8. Refresh the confirmation page. The saved order should still appear.
9. Open **My orders** and confirm that the order is listed as **Placed**.

## Operator checks

1. Sign in as the operator who owns the selected truck.
2. Open the truck's **Orders** tab.
3. Find the customer's order by its order number.
4. Change it from **Placed** to **Accepted**, then **Ready**.
5. Use a customer window to refresh the order. It should now show **Ready**.
6. Return to the operator window and mark it **Completed**.
7. Confirm that another operator cannot open or update this truck's orders.

## Expected result

The same database order is visible to the customer and the truck owner. Menu
prices and item names are saved with the order, so later menu edits do not change
the receipt. Order status changes are limited to the owned truck and use the
allowed sequence. The customer sees the latest status in order history.

## Automated coverage

`EndToEndOrderDemoTests` follows the full API workflow from public menu lookup to
customer order placement, operator processing, and customer history. The focused
customer and operator test classes cover validation, ownership, price snapshots,
duplicate submissions, invalid status changes, and stale updates.
