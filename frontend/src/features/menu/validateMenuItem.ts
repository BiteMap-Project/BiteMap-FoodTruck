/**
 * Client-side validation for creating or editing a menu item (SCRUM-37).
 *
 * The limits mirror V4__create_vendor_menu_items.sql so the form catches
 * everything the database would reject:
 *   name        VARCHAR(150), NOT NULL, not whitespace-only
 *   description TEXT, nullable
 *   price       NUMERIC(10, 2), NOT NULL, >= 0 (so at most 99,999,999.99)
 *   available   BOOLEAN, default true
 * The server must still validate on its own; this only gives faster feedback.
 */

export const NAME_MAX = 150;
/** Not a database limit; keeps descriptions readable on the menu page. */
export const DESCRIPTION_MAX = 500;
export const PRICE_MAX = 99_999_999.99;

export type MenuItemFormValues = {
  name: string;
  description: string;
  price: string;
  available: boolean;
};

export type MenuItemInput = {
  name: string;
  description: string | null;
  price: number;
  available: boolean;
};

export type MenuItemErrors = Partial<Record<"name" | "description" | "price", string>>;

export type ValidationResult =
  | { ok: true; value: MenuItemInput }
  | { ok: false; errors: MenuItemErrors };

// PostgreSQL counts characters (code points), not UTF-16 units, so "🌮" is 1.
const length = (text: string) => [...text].length;

export function validateName(raw: string): string | undefined {
  const name = raw.trim();
  if (!name) return "Enter a name for this item.";
  if (length(name) > NAME_MAX) return `Name must be ${NAME_MAX} characters or fewer.`;
  return undefined;
}

export function validateDescription(raw: string): string | undefined {
  if (length(raw.trim()) > DESCRIPTION_MAX) return `Description must be ${DESCRIPTION_MAX} characters or fewer.`;
  return undefined;
}

/** Accepts "4", "4.5", "4.50", ".99" and an optional leading "$". */
export function parsePrice(raw: string): { price: number } | { error: string } {
  const text = raw.trim().replace(/^\$\s*/, "");
  if (!text) return { error: "Enter a price." };
  if (/^-/.test(text)) return { error: "Price can't be negative." };
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(text)) return { error: "Enter a price using numbers only, like 4.50." };
  const [, cents = ""] = text.split(".");
  if (cents.length > 2) return { error: "Price can have at most 2 decimal places." };
  const price = Number(text);
  if (price > PRICE_MAX) return { error: "Price must be $99,999,999.99 or less." };
  return { price: Math.round(price * 100) / 100 };
}

export function validateMenuItem(values: MenuItemFormValues): ValidationResult {
  const errors: MenuItemErrors = {};
  const nameError = validateName(values.name);
  if (nameError) errors.name = nameError;
  const descriptionError = validateDescription(values.description);
  if (descriptionError) errors.description = descriptionError;
  const price = parsePrice(values.price);
  if ("error" in price) errors.price = price.error;

  if (Object.keys(errors).length > 0 || "error" in price) return { ok: false, errors };
  const description = values.description.trim();
  return {
    ok: true,
    value: {
      name: values.name.trim(),
      description: description === "" ? null : description,
      price: price.price,
      available: values.available,
    },
  };
}
