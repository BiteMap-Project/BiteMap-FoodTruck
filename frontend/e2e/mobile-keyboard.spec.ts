import { test, expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const baseURL = "http://127.0.0.1:15173";
const password = "E2e-Disposable-Only-93!";

// Same safeguards as ordering.spec.ts: SQL is only for disposable fixtures.
function sql(statement: string) {
  const project = process.env.BITEMAP_E2E_PROJECT ?? "";
  if (!/^bitemap-e2e-[a-f0-9]{8}$/.test(project)) throw new Error("Disposable E2E project required");
  return execFileSync("docker", ["compose", "--env-file", "/dev/null", "-p", project,
    "-f", "docker-compose.e2e.yml", "exec", "-T", "postgres", "psql", "-U", "bitemap_e2e",
    "-d", "bitemap_e2e", "-v", "ON_ERROR_STOP=1", "-Atc", statement], { cwd: root, encoding: "utf8" }).trim();
}
async function write(api: APIRequestContext, path: string, data: object) {
  const csrf = await api.get("/api/auth/csrf");
  expect(csrf.ok()).toBeTruthy();
  const token = await csrf.json();
  return api.post(path, { data, headers: { [token.headerName]: token.token } });
}

// Never use locator.focus() to pass a keyboard-navigation assertion.
async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  await expect(target).toBeEnabled();
  for (let i = 0; i < 100; i++) {
    if (await target.evaluate(element => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
  expect(await target.evaluate(element => {
    const style = getComputedStyle(element);
    return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2;
  }), "Keyboard focus must have a visible outline").toBeTruthy();
}
async function activate(page: Page, target: Locator, keyboard: boolean) {
  if (keyboard) { await tabTo(page, target); await page.keyboard.press("Enter"); }
  else await target.tap();
}
async function enter(page: Page, target: Locator, value: string, keyboard: boolean) {
  if (keyboard) {
    await tabTo(page, target);
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText(value);
  } else await target.fill(value);
}
async function fits(page: Page, stage: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${stage}: horizontal page overflow`).toBeLessThanOrEqual(1);
}
async function usable(target: Locator) {
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height, "Primary control should be at least 44px tall").toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(await target.evaluate(element => {
    const box = element.getBoundingClientRect();
    return box.left >= -1 && box.right <= document.documentElement.clientWidth + 1;
  }), "Control must fit horizontally").toBeTruthy();
}
async function login(page: Page, email: string, owner: boolean, keyboard: boolean) {
  await page.goto(owner ? "/operator/login" : "/customer/login");
  await enter(page, page.getByLabel("Email", { exact: true }), email, keyboard);
  await enter(page, page.getByLabel("Password", { exact: true }), password, keyboard);
  if (keyboard) {
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  }
  await activate(page, page.getByRole("button", { name: owner ? "Sign in" : "Sign in and return to cart", exact: true }), keyboard);
  await expect(page).toHaveURL(owner ? /\/operator$/ : /\/cart$/);
}

const cases = [
  { name: "small phone", width: 320, height: 740, keyboard: false },
  { name: "phone", width: 390, height: 844, keyboard: false },
  { name: "tablet", width: 768, height: 1024, keyboard: false },
  { name: "keyboard on narrow screen", width: 390, height: 844, keyboard: true },
];
for (const device of cases) {
  test.describe(`SCRUM-99 ${device.name}`, () => {
    const options = {
      viewport: { width: device.width, height: device.height },
      isMobile: !device.keyboard, hasTouch: !device.keyboard, deviceScaleFactor: 1,
    };
    test.use(options);
    test("discovery, checkout recovery, owner acceptance and schedule form", async ({ page, context, browser }, testInfo) => {
      test.setTimeout(150_000);
      sql("DELETE FROM auth_rate_limits");
      const owner = await browser.newContext({ ...options, baseURL });
      try {
        const suffix = randomUUID();
        const ownerEmail = `mobile-owner-${suffix}@example.test`;
        const customerEmail = `mobile-customer-${suffix}@example.test`;
        for (const [api, email] of [[owner.request, ownerEmail], [context.request, customerEmail]] as const) {
          expect((await write(api, "/api/auth/register", { displayName: "Mobile Test", email, password })).status()).toBe(201);
        }
        sql(`INSERT INTO app_user_roles(user_id,role) SELECT id,'OPERATOR' FROM app_users WHERE email='${ownerEmail}';
          INSERT INTO operators(user_id) SELECT id FROM app_users WHERE email='${ownerEmail}';`);
        const ownerPage = await owner.newPage();
        await login(ownerPage, ownerEmail, true, device.keyboard);
        await login(page, customerEmail, false, device.keyboard);
        const name = `Campus Tacos ${suffix.slice(0, 8)}`;
        const createdVendor = await write(owner.request, "/api/operator/vendors", { name, category: "Tacos", location: "CSUN" });
        expect(createdVendor.status()).toBe(201);
        const vendor = await createdVendor.json();
        const createdItem = await write(owner.request, `/api/operator/vendors/${vendor.id}/menu-items`,
          { name: "Campus Taco", description: "Fresh lunch for pickup", price: 4.5, status: "ACTIVE" });
        expect(createdItem.status()).toBe(201);
        const item = await createdItem.json();
        sql(`INSERT INTO vendor_stops(vendor_id,venue_name,address,latitude,longitude,starts_at,ends_at,time_zone)
          VALUES (${Number(vendor.id)},'Orange Grove entrance','18111 Nordhoff St',34.24,-118.53,
          now()-interval '5 minutes',now()+interval '2 hours','America/Los_Angeles');`);

        await test.step("Discover a truck and add an item to the cart", async () => {
          await page.goto("/trucks");
          await enter(page, page.getByLabel("Search trucks, food, or location", { exact: true }), name, device.keyboard);
          const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name, exact: true }) });
          await expect(card).toBeVisible();
          await fits(page, "discovery");
          await activate(page, card.getByRole("link", { name: "View Profile & Menu" }), device.keyboard);
          const add = page.getByRole("button", { name: "Add Campus Taco to cart" });
          await usable(add);
          await fits(page, "menu");
          await activate(page, add, device.keyboard);
          await activate(page, page.getByRole("link", { name: /Cart \(/ }), device.keyboard);
          const quantity = page.getByLabel("Quantity for Campus Taco");
          if (device.keyboard) { await tabTo(page, quantity); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Tab"); }
          else await quantity.selectOption("2");
          await expect(quantity).toHaveValue("2");
          await expect(page.getByText("18111 Nordhoff St", { exact: true })).toBeVisible();
        });
        await test.step("Recover from a real checkout validation error", async () => {
          // Exercise a real server rejection, not a mocked checkout response.
          sql(`UPDATE vendor_menu_items SET availability_status='SOLD_OUT' WHERE id=${Number(item.id)}`);
          const checkout = page.getByRole("button", { name: "Place pickup order" });
          await expect(checkout).toBeEnabled();
          await usable(checkout);
          await activate(page, checkout, device.keyboard);
          const error = page.getByRole("alert").filter({ hasText: "sold out" });
          await expect(error).toBeVisible();
          await expect(error).toBeFocused();
          await fits(page, "checkout error");
          await expect(page.getByLabel("Quantity for Campus Taco")).toHaveValue("2");
          await page.screenshot({ path: testInfo.outputPath("checkout-error.png"), fullPage: true });
          sql(`UPDATE vendor_menu_items SET availability_status='ACTIVE' WHERE id=${Number(item.id)}`);
          await activate(page, checkout, device.keyboard);
          await expect(page).toHaveURL(/\/orders\/\d+\/confirmation$/);
          await expect(page.getByRole("region", { name: "Order status", exact: true }).getByRole("status"))
            .toHaveText("Your order has been placed.");
          await fits(page, "confirmation");
        });
        const orderId = Number(new URL(page.url()).pathname.split("/")[2]);
        await test.step("Accept the order on the owner's narrow screen", async () => {
          await ownerPage.goto(`/operator/vendors/${vendor.id}/orders`);
          await activate(ownerPage, ownerPage.getByRole("button", { name: `View order #${orderId}`, exact: true }), device.keyboard);
          await expect(ownerPage.getByRole("heading", { name: `Order #${orderId} details` })).toBeFocused();
          const accept = ownerPage.getByRole("button", { name: "Accept order", exact: true });
          await expect(accept).toBeEnabled();
          await usable(accept);
          await fits(ownerPage, "owner order details");
          await activate(ownerPage, accept, device.keyboard);
          await expect(ownerPage.getByRole("status").filter({ hasText: `Order #${orderId} updated to Accepted.` })).toBeVisible();
          await expect(ownerPage.getByRole("heading", { name: `Order #${orderId} details` })).toBeFocused();
          await ownerPage.screenshot({ path: testInfo.outputPath("owner-accepted.png"), fullPage: true });
          await activate(page, page.getByRole("button", { name: "Refresh status", exact: true }), device.keyboard);
          await expect(page.getByRole("region", { name: "Order status", exact: true }).getByRole("status"))
            .toHaveText("Your order has been accepted.");
          await activate(page, page.getByRole("link", { name: "← My orders", exact: true }), device.keyboard);
          await expect(page.getByRole("heading", { name: "My orders", exact: true })).toBeVisible();
          await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
          await fits(page, "My orders");
          await activate(page, page.getByRole("link", { name: `View order #${orderId}`, exact: true }), device.keyboard);
          await expect(page).toHaveURL(`/orders/${orderId}/confirmation`);
        });
        await test.step("Use labelled schedule fields, correct an error and save", async () => {
          await activate(ownerPage, ownerPage.getByRole("button", { name: "Schedule", exact: true }), device.keyboard);
          const addStop = ownerPage.getByRole("button", { name: "Add stop", exact: true });
          await expect(addStop).toBeEnabled();
          await activate(ownerPage, addStop, device.keyboard);
          const form = ownerPage.getByRole("form", { name: "Schedule stop" });
          await enter(ownerPage, form.getByLabel("Venue name", { exact: true }), "Mobile lunch stop", device.keyboard);
          await enter(ownerPage, form.getByLabel("Street address", { exact: true }), "18111 Nordhoff St", device.keyboard);
          await enter(ownerPage, form.getByLabel("City", { exact: true }), "Northridge", device.keyboard);
          // Only the external Census address lookup is stubbed. Schedule writes
          // still go to the real API/database; CI must not depend on Census uptime.
          await ownerPage.route("**/api/operator/schedule-addresses?*", route => route.fulfill({ json: [
            { address: "18111 Nordhoff St, Northridge, CA 91325", latitude: 34.24, longitude: -118.53 },
          ] }));
          await activate(ownerPage, form.getByRole("button", { name: "Find address", exact: true }), device.keyboard);
          await activate(ownerPage, form.getByRole("button", { name: /^Use 18111 Nordhoff St/ }), device.keyboard);
          const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
          const values = { "Start date": day(3), "Start time": "11:00", "End date": day(3), "End time": "10:00" };
          for (const [label, value] of Object.entries(values)) {
            const input = form.getByLabel(label, { exact: true });
            if (device.keyboard) await tabTo(ownerPage, input);
            // Native date/time widgets differ by OS; fill sets their standard value.
            await input.fill(value);
          }
          const save = form.getByRole("button", { name: "Save stop", exact: true });
          await usable(save);
          await activate(ownerPage, save, device.keyboard);
          const error = form.getByRole("alert");
          await expect(error).toContainText("End must be later");
          await expect(error).toBeFocused();
          await fits(ownerPage, "schedule validation");
          await ownerPage.screenshot({ path: testInfo.outputPath("schedule-error.png"), fullPage: true });
          await activate(ownerPage, form.getByRole("button", { name: "Set end: +2 hours", exact: true }), device.keyboard);
          await activate(ownerPage, save, device.keyboard);
          await expect(ownerPage.getByRole("status").filter({ hasText: "Schedule saved to BiteMap." })).toBeVisible();
          await expect(ownerPage.getByRole("heading", { name: "Mobile lunch stop", exact: true })).toBeVisible();
          await fits(ownerPage, "saved schedule");
          const saved = await owner.request.get(`/api/operator/vendors/${vendor.id}/stops?page=0&size=20`);
          expect(saved.ok()).toBeTruthy();
          expect((await saved.json()).items.some((stop: { venueName: string }) => stop.venueName === "Mobile lunch stop")).toBeTruthy();
        });
      } finally { await owner.close(); }
    });
  });
}
