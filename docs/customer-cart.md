# Customer cart

The public truck menu now starts a pickup cart without requiring an account.
Available database menu items can be added, quantities can be changed, and the
cart shows an estimated item total. Unavailable items cannot be added.

The cart is limited to one truck because one operator must receive and fulfill
the whole order. It is stored in browser session storage, so it survives page
navigation, account registration, login, and a refresh. It does not become an
order in PostgreSQL yet.

Customer registration and login now use the unified account API. Anonymous
customers are sent to sign in from the cart and returned to the same cart after
login. Taxes, pickup-time selection, order submission, and payment are still
missing. The signed-in checkout control stays disabled and names the next step
instead of pretending an order was submitted.

## Suggested Jira update

Create a story named **Build anonymous customer pickup cart** with these acceptance
criteria:

- A visitor can add an available item from a public truck menu.
- The cart displays item prices, quantities, line totals and an estimated total.
- The visitor can update quantities, remove items and clear the cart.
- One cart cannot contain items from different trucks.
- Unavailable items cannot be added.
- The cart survives navigation during the browser session.
- Checkout sends an anonymous customer to registration or login.
- Registration creates a customer account, and login returns to the existing cart.
- A signed-in customer sees their name and the current order-submission limit.

Move that story to **In Review** after the feature branch is reviewed. Keep the
existing **Customer pickup order from cart to confirmation** story in the backlog;
that later story still owns server-side price validation, persisted orders and
operator order receipt.
