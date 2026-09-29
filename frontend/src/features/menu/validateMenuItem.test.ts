import { describe, expect, it } from "vitest";
import { parsePrice, validateMenuItem, type MenuItemFormValues } from "./validateMenuItem";

const valid: MenuItemFormValues = { name: "Veggie Taco", description: "Beans and salsa", price: "4.50", available: true };

describe("validateMenuItem", () => {
  it("returns trimmed values ready to send to the API", () => {
    expect(validateMenuItem({ ...valid, name: "  Veggie Taco ", description: "  Beans  ", price: " $4.5 " }))
      .toEqual({ ok: true, value: { name: "Veggie Taco", description: "Beans", price: 4.5, available: true } });
  });

  it("sends a blank description as null and keeps availability", () => {
    expect(validateMenuItem({ ...valid, description: "   ", available: false }))
      .toEqual({ ok: true, value: { name: "Veggie Taco", description: null, price: 4.5, available: false } });
  });

  it.each(["", "   ", "\t\n"])("requires a name that isn't only whitespace (%j)", (name) => {
    expect(validateMenuItem({ ...valid, name })).toEqual({ ok: false, errors: { name: "Enter a name for this item." } });
  });

  it("allows exactly 150 characters, counting emoji as one like PostgreSQL", () => {
    expect(validateMenuItem({ ...valid, name: "a".repeat(150) }).ok).toBe(true);
    expect(validateMenuItem({ ...valid, name: "🌮".repeat(150) }).ok).toBe(true);
    expect(validateMenuItem({ ...valid, name: "a".repeat(151) }))
      .toEqual({ ok: false, errors: { name: "Name must be 150 characters or fewer." } });
  });

  it("limits the description to 500 characters", () => {
    expect(validateMenuItem({ ...valid, description: "a".repeat(500) }).ok).toBe(true);
    expect(validateMenuItem({ ...valid, description: "a".repeat(501) }).ok).toBe(false);
  });

  it("reports every invalid field at once", () => {
    const result = validateMenuItem({ name: "", description: "a".repeat(501), price: "abc", available: true });
    expect(result.ok).toBe(false);
    expect(Object.keys(result.ok ? {} : result.errors).sort()).toEqual(["description", "name", "price"]);
  });
});

describe("parsePrice", () => {
  it.each([
    ["0", 0], ["4", 4], ["4.", 4], ["4.5", 4.5], ["4.50", 4.5], [".99", 0.99], ["$12.00", 12], ["$ 3", 3],
    ["99999999.99", 99_999_999.99],
  ])("accepts %j", (input, price) => {
    expect(parsePrice(input)).toEqual({ price });
  });

  it.each([
    ["", "Enter a price."],
    ["  ", "Enter a price."],
    ["-1", "Price can't be negative."],
    ["4.505", "Price can have at most 2 decimal places."],
    ["100000000", "Price must be $99,999,999.99 or less."],
    ["abc", "Enter a price using numbers only, like 4.50."],
    ["1,000", "Enter a price using numbers only, like 4.50."],
    ["1e3", "Enter a price using numbers only, like 4.50."],
    ["NaN", "Enter a price using numbers only, like 4.50."],
    ["Infinity", "Enter a price using numbers only, like 4.50."],
    ["4.5.0", "Enter a price using numbers only, like 4.50."],
  ])("rejects %j", (input, error) => {
    expect(parsePrice(input)).toEqual({ error });
  });
});
