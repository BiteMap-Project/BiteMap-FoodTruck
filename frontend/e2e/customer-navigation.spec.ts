import { test, expect } from "@playwright/test";

test("shared customer navigation preserves checkout recovery and follows account changes", async ({ page }) => {
  // Deterministic UI contract test; real checkout is covered by ordering.spec.ts.
  let account = { id: 1, displayName: "Navigation A", email: "nav@example.test", roles: ["ROLE_CUSTOMER", "ROLE_OPERATOR"] };
  const cart = { vendorId: 7, vendorName: "Navigation Truck", items: [{ id: 3, name: "Rice bowl", price: 10, quantity: 3 }] };
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(path === "/api/auth/me" ? account : { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/orders");
  await page.evaluate(value => sessionStorage.setItem("bitemap.customer-cart", JSON.stringify(value)), cart);
  await page.reload();
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  const panel = page.getByRole("dialog", { name: "Your BiteMap menu" });
  await expect(page.getByRole("link", { name: "My cart, 3 items", exact: true })).toBeVisible();
  for (const [name, path] of [["Favorites", "/favorites"], ["Account settings", "/account"], ["My orders", "/orders"], ["My cart", "/cart"]]) {
    await menu.click();
    await panel.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(panel).toBeHidden();
    await menu.click();
    await expect(panel.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
  }
  await page.goBack();
  await expect(page).toHaveURL(/\/orders$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "My orders", exact: true })).toBeVisible();
  await menu.click();
  await expect(panel.getByRole("link", { name: "Access your truck", exact: true })).toBeVisible();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    expect(await panel.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  account = { ...account, id: 2, displayName: "Navigation B", roles: ["ROLE_CUSTOMER"] };
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(panel).toBeHidden();
  await menu.click();
  await expect(panel.getByText("Navigation B", { exact: true })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Access your truck", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  const attempt = { accountId: 2, key: "11111111-1111-4111-8111-111111111111", cart, pickupStopId: 4 };
  await page.evaluate(value => sessionStorage.setItem("bitemap.checkout-attempt.v1", JSON.stringify(value)), attempt);
  await page.getByRole("link", { name: "My cart, 3 items", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recover your checkout" })).toBeVisible();
  await menu.click();
  await panel.getByRole("link", { name: "Favorites", exact: true }).click();
  await page.goBack();
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("bitemap.checkout-attempt.v1")!))).toEqual(attempt);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("bitemap.customer-cart")!))).toEqual(cart);
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await expect(menu).toBeHidden();
  await expect(page.getByRole("link", { name: "My orders", exact: true })).toBeVisible();
});
