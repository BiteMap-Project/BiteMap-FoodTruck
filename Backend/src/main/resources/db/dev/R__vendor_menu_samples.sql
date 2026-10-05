-- Development-only menu fixtures for the three development vendors.
INSERT INTO vendor_menu_items (id, vendor_id, name, description, price, availability_status)
OVERRIDING SYSTEM VALUE
VALUES
    (-101, -1, 'Tomato Soup', 'Creamy tomato soup', 8.99, 'ACTIVE'),
    (-102, -1, 'Bread', NULL, 2.00, 'ACTIVE'),
    (-103, -1, 'Lemonade', NULL, 3.00, 'ACTIVE'),
    (-104, -2, 'Chicken Taco', 'Chicken, salsa, and onion', 4.50, 'ACTIVE'),
    (-105, -2, 'Veggie Taco', 'Beans, salsa, and avocado', 4.00, 'ACTIVE'),
    (-106, -2, 'Horchata', NULL, 3.50, 'INACTIVE'),
    (-107, -3, 'Latte', NULL, 5.00, 'ACTIVE'),
    (-108, -3, 'Cold Brew', NULL, 4.50, 'ACTIVE'),
    (-109, -3, 'Muffin', NULL, 3.00, 'ACTIVE')
ON CONFLICT (id) DO NOTHING;
