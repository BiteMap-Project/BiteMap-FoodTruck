# Customer cart

The public truck menu now starts a pickup cart without requiring an account.
Available database menu items can be added, quantities can be changed, and the
cart shows an estimated item total. Unavailable items cannot be added.

The cart is limited to one truck because one operator must receive and fulfill
the whole order. It is stored in browser session storage, so it survives page
navigation, account registration, login, and a refresh.

Customer registration and login now use the unified account API. Anonymous
customers are sent to sign in from the cart and returned to the same cart after
login. A signed-in customer can submit the cart as a pickup order and open a
confirmation page again after a refresh. The backend checks the current menu
prices and availability, saves price snapshots, and prevents a retry from
creating a duplicate order. Payment remains pay at pickup for this demo.

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
- A signed-in customer can submit the cart and view the saved confirmation.
- The server checks prices, availability, quantities, and the one-truck rule.
- Retrying the same submission does not create a second order.

Move **Customer pickup order from cart to confirmation** to **In Review** after
the feature branch is reviewed. Customer order persistence and confirmation are
complete. Operator order receipt and status updates remain separate follow-up work.
