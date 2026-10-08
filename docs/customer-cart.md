# Customer cart

The public truck menu now starts a pickup cart without requiring an account.
Available database menu items can be added, quantities can be changed, and the
cart shows an estimated item total. Unavailable items cannot be added.

The cart is limited to one truck because one operator must receive and fulfill
the whole order. It is stored in browser session storage, so it survives page
navigation and a refresh but does not become an order in PostgreSQL.

Customer registration, login, taxes, pickup-time selection, order submission,
and payment are still missing. The checkout control stays disabled and names the
next step instead of pretending an order was submitted.

## Suggested Jira update

Create a story named **Build anonymous customer pickup cart** with these acceptance
criteria:

- A visitor can add an available item from a public truck menu.
- The cart displays item prices, quantities, line totals and an estimated total.
- The visitor can update quantities, remove items and clear the cart.
- One cart cannot contain items from different trucks.
- Unavailable items cannot be added.
- The cart survives navigation during the browser session.
- Checkout states that customer sign-in is the next dependency.

Move that story to **In Review** after the feature branch is reviewed. Keep the
existing **Customer pickup order from cart to confirmation** story in the backlog;
that later story owns customer accounts, server-side price validation, persisted
orders and operator order receipt.
