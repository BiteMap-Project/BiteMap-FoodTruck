ALTER TABLE vendor_menu_items
    ADD COLUMN image_preset VARCHAR(24) NOT NULL DEFAULT 'GENERIC',
    ADD COLUMN image_data BYTEA,
    ADD COLUMN image_media_type VARCHAR(32);

ALTER TABLE vendor_menu_items
    ADD CONSTRAINT vendor_menu_items_image_preset_check
        CHECK (image_preset IN ('GENERIC', 'DRINK', 'TACO', 'INDIAN', 'DESSERT')),
    ADD CONSTRAINT vendor_menu_items_image_data_check
        CHECK ((image_data IS NULL) = (image_media_type IS NULL));

-- Give existing demo and operator items a useful starting illustration.
UPDATE vendor_menu_items SET image_preset = 'DRINK'
WHERE lower(name) ~ '(coffee|latte|brew|lemonade|horchata|lassi|tea|juice)';
UPDATE vendor_menu_items SET image_preset = 'TACO'
WHERE lower(name) ~ '(taco|quesadilla|burrito)';
UPDATE vendor_menu_items SET image_preset = 'INDIAN'
WHERE lower(name) ~ '(masala|curry|naan|biryani|tikka)';
UPDATE vendor_menu_items SET image_preset = 'DESSERT'
WHERE lower(name) ~ '(sundae|ice cream|crepe|muffin|cake|churro)';
