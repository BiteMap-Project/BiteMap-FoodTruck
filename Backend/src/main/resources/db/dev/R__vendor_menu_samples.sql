-- Development-only menu fixtures. Negative IDs keep demo records separate
-- from operator-created data, and existing local edits are never overwritten.
INSERT INTO vendor_menu_items (id, vendor_id, name, description, price, availability_status)
OVERRIDING SYSTEM VALUE
VALUES
    (-101, -1, 'Tomato Soup', 'Creamy tomato soup', 8.99, 'ACTIVE'),
    (-102, -1, 'Bread', 'A warm slice of rustic bread served with whipped herb butter.', 2.00, 'ACTIVE'),
    (-103, -1, 'Lemonade', 'Fresh-squeezed lemonade made with real lemons and cane sugar.', 3.00, 'ACTIVE'),
    (-104, -2, 'Chicken Taco', 'Chicken, salsa, and onion', 4.50, 'ACTIVE'),
    (-105, -2, 'Veggie Taco', 'Beans, salsa, and avocado', 4.00, 'ACTIVE'),
    (-106, -2, 'Horchata', 'Creamy rice drink with cinnamon and vanilla, served over ice.', 3.50, 'INACTIVE'),
    (-107, -3, 'Latte', 'Double espresso with steamed milk and a thin layer of foam.', 5.00, 'ACTIVE'),
    (-108, -3, 'Cold Brew', 'Slow-steeped coffee served over ice with optional cream.', 4.50, 'ACTIVE'),
    (-109, -3, 'Muffin', 'A rotating bakery muffin baked fresh each morning.', 3.00, 'ACTIVE'),
    (-110, -4, 'Classic Smash Burger', 'Two griddled beef patties with American cheese, pickles, onions, and house sauce.', 11.50, 'ACTIVE'),
    (-111, -4, 'Mushroom Melt', 'Garlic mushrooms, Swiss cheese, caramelized onions, and pepper aioli on toasted sourdough.', 10.75, 'ACTIVE'),
    (-112, -4, 'Loaded Fries', 'Crispy fries topped with cheese sauce, grilled onions, jalapenos, and smoky ketchup.', 6.50, 'ACTIVE'),
    (-113, -5, 'Bulgogi Rice Bowl', 'Soy-marinated beef with steamed rice, cucumber, carrots, kimchi, and sesame.', 13.00, 'ACTIVE'),
    (-114, -5, 'Gochujang Chicken Bowl', 'Sweet-spicy chicken with rice, cabbage slaw, scallions, and toasted sesame.', 12.50, 'ACTIVE'),
    (-115, -5, 'Kimchi Fries', 'Seasoned fries with kimchi, gochujang crema, scallions, and a fried egg.', 8.00, 'SOLD_OUT'),
    (-116, -6, 'Tikka Masala Bowl', 'Roasted chicken in tomato cream sauce with basmati rice and warm naan.', 13.50, 'ACTIVE'),
    (-117, -6, 'Chana Masala Wrap', 'Spiced chickpeas, cucumber, tomato, pickled onion, and mint chutney in flatbread.', 10.00, 'ACTIVE'),
    (-118, -6, 'Mango Lassi', 'A chilled blend of mango, yogurt, cardamom, and a touch of honey.', 4.50, 'ACTIVE'),
    (-119, -7, 'Ahi Poke Bowl', 'Marinated ahi tuna with rice, edamame, cucumber, seaweed salad, and sesame ponzu.', 15.00, 'ACTIVE'),
    (-120, -7, 'Tofu Poke Bowl', 'Ginger-soy tofu with rice, avocado, cucumber, edamame, and crispy onions.', 12.00, 'ACTIVE'),
    (-121, -7, 'Spam Musubi', 'Grilled teriyaki Spam and rice wrapped with nori; two pieces per order.', 6.00, 'ACTIVE'),
    (-122, -8, 'Churro Sundae', 'Cinnamon churro bites with vanilla ice cream, chocolate sauce, and toasted almonds.', 8.50, 'ACTIVE'),
    (-123, -8, 'Strawberry Crepe', 'A warm crepe filled with strawberries, vanilla cream, and powdered sugar.', 9.00, 'ACTIVE'),
    (-124, -8, 'Chocolate Horchata', 'House rice milk with cinnamon, cocoa, and a light vanilla finish.', 4.25, 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- Fill descriptions added after the first fixture release without replacing
-- descriptions that a developer has already entered locally.
UPDATE vendor_menu_items AS item
SET description = fixture.description
FROM (VALUES
    (-102, 'A warm slice of rustic bread served with whipped herb butter.'),
    (-103, 'Fresh-squeezed lemonade made with real lemons and cane sugar.'),
    (-106, 'Creamy rice drink with cinnamon and vanilla, served over ice.'),
    (-107, 'Double espresso with steamed milk and a thin layer of foam.'),
    (-108, 'Slow-steeped coffee served over ice with optional cream.'),
    (-109, 'A rotating bakery muffin baked fresh each morning.')
) AS fixture(id, description)
WHERE item.id = fixture.id AND item.description IS NULL;
