# SCRUM-32: Integration / Demo Testing

### Purpose
The purpose of this task is to test the main BiteMap features used during the Sprint 1 demonstration.

### OWNER'S SIDE:
---
### Owner Dashboard Testing

The Owner dashboard should display the truck's information clearly.

Test the following:

- The Owner page loads successfully.
- The truck name is displayed.
- The truck's food category is displayed.
- The business hours are displayed.
- The truck can show whether it is open for business.
- Completed sales are displayed.
- Active orders are displayed.
- Orders can appear in the Order Queue.
- The Menu section can be accessed.
- The Orders section can be accessed.
- The My Truck section can be accessed.

### Example Test Data
---

Truck Name:
The Rolling Kitchen

Food Type:
Tacos & Bowls

Business Hours:
11:00 AM - 8:00 PM

Business Status:
Open for business

Example Completed Sales:
$119.00

Example Active Orders:
1

### Expected Result

The Owner should be able to open the dashboard and see the truck information, sales information, and order information without errors.

---

### CUSTOMER'S SIDE:
---

### Main Test Scenario – Ordering From One Food Truck Only:

1. The customer visits the food truck discovery page.
2. The customer selects a specific food truck.
3. The customer views the available food items from that truck.
4. The customer adds an item to the order.
5. The customer opens the cart and confirms that the selected item belongs to the correct food truck.
6. The customer attempts to select an item from a different food truck.
7. The system should prevent the customer from combining items from different trucks in the same order.

8. The system should display a clear message such as:

"You can only order from one food truck at a time. Please finish or clear your current order before ordering from another truck."

9. The customer can either:
Continue with the current food truck, or
Clear the current cart and start a new order from the other food truck.
10. Confirm that the cart and checkout continue to show only items from the selected food truck.

Expected Result:
The system allows customers to add multiple items from the same food truck, but prevents items from a different food truck from being added to the same order.

Example:

- Customer selects Taco Truck.
- Adds tacos and a drink → Allowed.
- Customer then selects Coffee Truck and tries to add coffee → Not allowed.
- The system displays the one-truck-only message.
- Customer must either continue ordering from Taco Truck or clear the cart before ordering from Coffee Truck.

### Integration Testing Areas:

- Food truck selection → food menu
- Food menu → shopping cart
- Shopping cart → checkout
- Food truck information → order information
- Cart validation → one-truck-only restriction
- Error/message display when a second truck is selected

### Demo Goal:
Demonstrate a complete customer ordering flow using one food truck and show that the system correctly prevents a customer from mixing food items from two different trucks in one order.

