-- Development only: negative IDs keep fixtures separate from generated IDs.
-- Repeatable migrations rerun when their checksum changes. Preserve existing
-- rows (including developer edits) instead of overwriting them on a rerun.
INSERT INTO vendors (id, name, category, location)
OVERRIDING SYSTEM VALUE
VALUES
    (-1, 'Soup Stop', 'Soup', 'CSUN'),
    (-2, 'Taco Mobile', 'Tacos', 'Northridge'),
    (-3, 'Coffee Cart', 'Coffee', 'Reseda'),
    (-4, 'Griddle & Grain', 'Burgers', 'CSUN'),
    (-5, 'Seoul Street Bowls', 'Korean', 'Granada Hills'),
    (-6, 'Curry in a Hurry', 'Indian', 'Van Nuys'),
    (-7, 'Pacific Poke', 'Hawaiian', 'Encino'),
    (-8, 'Sweet Route', 'Desserts', 'Sherman Oaks'),
    (-9, 'Sonora Street Tacos', 'Tacos', 'North Hills'),
    (-10, 'Garden Griddle', 'Vegetarian', 'Studio City'),
    (-11, 'Little Napoli', 'Italian', 'Woodland Hills'),
    (-12, 'Noodle Nomad', 'Asian Fusion', 'Chatsworth')
ON CONFLICT (id) DO NOTHING;
