-- Development only: negative IDs keep fixtures separate from generated IDs.
-- Repeatable migrations rerun when their checksum changes. Preserve existing
-- rows (including developer edits) instead of overwriting them on a rerun.
INSERT INTO vendors (id, name, category, location)
OVERRIDING SYSTEM VALUE
VALUES
    (-1, 'Soup Stop', 'Soup', 'CSUN'),
    (-2, 'Taco Mobile', 'Tacos', 'Northridge'),
    (-3, 'Coffee Cart', 'Coffee', 'Reseda')
ON CONFLICT (id) DO NOTHING;
