import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const baseURL = "http://127.0.0.1:15173";
const password = "E2e-Disposable-Only-93!";

test("menu photos validate real bytes, normalize uploads and fall back in owner/customer browsers", async ({ browser }, testInfo) => {
  const owner = await browser.newContext({ baseURL });
  const customer = await browser.newContext({ baseURL });
  try {
    const email = `photo-${randomUUID()}@example.test`;
    expect((await write(owner.request, "/api/auth/register", { displayName: "Photo Owner", email, password })).status()).toBe(201);
    sql(`INSERT INTO app_user_roles(user_id,role) SELECT id,'OPERATOR' FROM app_users WHERE email='${email}';
      INSERT INTO operators(user_id) SELECT id FROM app_users WHERE email='${email}';`);
    const page = await owner.newPage();
    await login(page, email, true);
    const created = await write(owner.request, "/api/operator/vendors", { name: "Photo Test Truck", category: "Tacos", location: "CSUN" });
    expect(created.status()).toBe(201);
    const vendor = await created.json();
    await page.goto(`/operator/vendors/${vendor.id}/menu`);
    await page.getByRole("button", { name: "Add menu item", exact: true }).click();
    await page.getByLabel("Item name", { exact: true }).fill("Photo Taco");
    await page.getByLabel("Price (USD)").fill("4.50");
    await page.getByLabel("Upload a photo").setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
    await page.getByRole("button", { name: "Add item", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Item details were saved");
    await expect(page.getByRole("alert")).toContainText("valid, non-animated");
    await expect(page.getByRole("form", { name: "Edit menu item" })).toBeVisible();
    // Retry the already-created item with a real 1x1 lossless WebP, not another POST.
    await page.getByLabel("Upload a photo").setInputFiles({ name: "dish.webp", mimeType: "image/webp",
      buffer: Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64") });
    await page.getByRole("button", { name: "Save item", exact: true }).click();
    await expect(page.getByText("Saved to BiteMap.", { exact: true })).toBeVisible();
    const listed = await (await owner.request.get(`/api/operator/vendors/${vendor.id}/menu-items`)).json();
    expect(listed.totalElements).toBe(1);
    const item = listed.items[0];
    const photoPath = `/api/vendors/${vendor.id}/menu-items/${item.id}/image`;
    const photo = await customer.request.get(photoPath);
    expect(photo.status()).toBe(200);
    expect(photo.headers()["content-type"]).toBe("image/jpeg");
    expect(photo.headers()["x-content-type-options"]).toBe("nosniff");
    const ownerCard = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Photo Taco", exact: true }) });
    await expect.poll(() => ownerCard.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
    await page.screenshot({ path: testInfo.outputPath("owner-valid-photo.png"), fullPage: true });
    const publicPage = await customer.newPage();
    await publicPage.goto(`/trucks/${vendor.id}`);
    const publicCard = publicPage.getByRole("listitem").filter({ has: publicPage.getByRole("heading", { name: "Photo Taco", exact: true }) });
    await publicCard.scrollIntoViewIfNeeded();
    await expect.poll(() => publicCard.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
    const missing = await customer.request.get(`/api/vendors/${vendor.id}/menu-items/9223372036854775807/image`);
    expect(missing.status()).toBe(404);
    expect((await missing.json()).status).toBe(404);
    // Simulate a lost/deleted photo while retaining the API's hasCustomImage flag.
    for (const target of [page, publicPage]) {
      await target.route(`**${photoPath}*`, route => route.fulfill({ status: 404, contentType: "application/problem+json", body: '{"status":404}' }));
      await target.reload();
      if (target === publicPage) await publicCard.scrollIntoViewIfNeeded();
      await expect(target.getByTestId("menu-photo-fallback")).toBeVisible();
      await target.screenshot({ path: testInfo.outputPath(target === page ? "owner-photo-fallback.png" : "customer-photo-fallback.png"), fullPage: true });
    }
  } finally { await owner.close(); await customer.close(); }
});
const root = fileURLToPath(new URL("../../", import.meta.url));

function sql(statement: string) {
  const project = process.env.BITEMAP_E2E_PROJECT;
  if (!/^bitemap-e2e-[a-f0-9]{8}$/.test(project ?? "")) throw new Error("Unsafe test target");
  return execFileSync("docker", ["compose", "--env-file", "/dev/null", "-p", project!,
    "-f", "docker-compose.e2e.yml", "exec", "-T", "postgres",
    "psql", "-U", "bitemap_e2e", "-d", "bitemap_e2e", "-v", "ON_ERROR_STOP=1", "-Atc", statement],
  { cwd: root, encoding: "utf8" }).trim();
}

async function write(api: APIRequestContext, path: string, data: object, method = "POST") {
  const csrf = await api.get("/api/auth/csrf");
  expect(csrf.ok()).toBeTruthy();
  const token = await csrf.json();
  return api.fetch(path, { method, data, headers: { [token.headerName]: token.token } });
}

async function login(page: Page, email: string, owner = false) {
  await page.goto(owner ? "/operator/login" : "/customer/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: owner ? "Sign in" : "Sign in and return to cart", exact: true }).click();
  await expect(page).toHaveURL(owner ? /\/operator$/ : /\/cart$/);
}

test("real customer checkout, lost response retry, owner processing, tracking and isolation", async ({ browser }) => {
  const customer = await browser.newContext({ baseURL });
  const owner = await browser.newContext({ baseURL });
  const outsider = await browser.newContext({ baseURL });
  const anonymous = await browser.newContext({ baseURL });
  try {
    const suffix = randomUUID();
    const customerEmail = `customer-${suffix}@example.test`;
    const ownerEmail = `owner-${suffix}@example.test`;
    const outsiderEmail = `other-${suffix}@example.test`;
    for (const [context, email] of [[customer, customerEmail], [owner, ownerEmail], [outsider, outsiderEmail]] as const) {
      expect((await write(context.request, "/api/auth/register", { displayName: "E2E Account", email, password })).status()).toBe(201);
      expect((await context.request.get("/api/auth/me")).status()).toBe(401);
    }
    // Test-only provisioning in the disposable DB, never an application backdoor.
    // A second real operator exercises ownership checks, not just role rejection.
    for (const email of [ownerEmail, outsiderEmail]) {
      sql(`INSERT INTO app_user_roles(user_id,role) SELECT id,'OPERATOR' FROM app_users WHERE email='${email}';
        INSERT INTO operators(user_id) SELECT id FROM app_users WHERE email='${email}';`);
    }
    const ownerPage = await owner.newPage();
    const customerPage = await customer.newPage();
    await login(ownerPage, ownerEmail, true);
    await login(customerPage, customerEmail);
    expect((await write(outsider.request, "/api/auth/login", { email: outsiderEmail, password })).status()).toBe(200);

    const name = `Journey Tacos ${suffix.slice(0, 8)}`;
    const vendorResponse = await write(owner.request, "/api/operator/vendors", { name, category: "Tacos", location: "CSUN" });
    expect(vendorResponse.status()).toBe(201);
    const vendor = await vendorResponse.json();
    const menuResponse = await write(owner.request, `/api/operator/vendors/${vendor.id}/menu-items`,
      { name: "Campus Taco", description: "Fresh test taco", price: 4.5, status: "ACTIVE" });
    expect(menuResponse.status()).toBe(201);
    const item = await menuResponse.json();
    sql(`INSERT INTO vendor_stops(vendor_id,venue_name,address,latitude,longitude,starts_at,ends_at,time_zone)
      VALUES (${Number(vendor.id)},'Orange Grove entrance','18111 Nordhoff St',34.24,-118.53,
      now()-interval '5 minutes',now()+interval '2 hours','America/Los_Angeles');`);

    await customerPage.goto("/trucks");
    await customerPage.getByRole("article").filter({ has: customerPage.getByRole("heading", { name, exact: true }) })
      .getByRole("link", { name: "View Profile & Menu" }).click();
    await customerPage.getByRole("button", { name: "Add Campus Taco to cart" }).click();
    await customerPage.getByRole("link", { name: /Cart \(/ }).click();
    await customerPage.getByLabel("Quantity for Campus Taco").selectOption("2");
    await expect(customerPage.getByText("18111 Nordhoff St", { exact: true })).toBeVisible();

    let submitted: { vendorId: number; pickupStopId: number; idempotencyKey: string; items: object[] } | undefined;
    let savedId = 0;
    let releaseCheckout!: () => void;
    const checkoutGate = new Promise<void>(resolve => { releaseCheckout = resolve; });
    // Let the server commit, then lose only the response. This is not a mocked order.
    await customerPage.route("**/api/customer/orders", async route => {
      if (route.request().method() !== "POST") return route.continue();
      await checkoutGate;
      submitted = route.request().postDataJSON();
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      savedId = (await response.json()).id;
      await route.abort("failed");
    }, { times: 1 });
    await customerPage.getByRole("button", { name: "Place pickup order" }).click();
    const pendingButton = customerPage.getByRole("button", { name: "Placing order…" });
    await expect(pendingButton).toBeDisabled();
    await pendingButton.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    releaseCheckout();
    await expect(customerPage.getByRole("alert")).toBeVisible();
    expect(savedId).toBeGreaterThan(0);
    await expect(customerPage.getByLabel("Quantity for Campus Taco")).toHaveValue("2");
    await customerPage.getByRole("button", { name: "Place pickup order" }).click();
    await expect(customerPage).toHaveURL(`/orders/${savedId}/confirmation`);
    await expect(customerPage.getByRole("region", { name: "Order status", exact: true }).getByRole("status")).toHaveText("Your order has been placed.");
    const history = await (await customer.request.get("/api/customer/orders")).json();
    expect(history.totalElements).toBe(1);
    expect(history.items[0].id).toBe(savedId);
    const detail = await (await customer.request.get(`/api/customer/orders/${savedId}`)).json();
    expect(detail.total).toBe(9);
    expect(detail.items[0].unitPrice).toBe(4.5);
    expect(detail.pickup.address).toBe("18111 Nordhoff St");
    expect(submitted).toBeDefined();
    // Concurrent transport retries must all resolve to that exact same order.
    const duplicates = await Promise.all(Array.from({ length: 3 }, () =>
      write(customer.request, "/api/customer/orders", submitted!)));
    for (const response of duplicates) {
      expect(response.ok()).toBeTruthy();
      expect((await response.json()).id).toBe(savedId);
    }
    expect((await (await customer.request.get("/api/customer/orders")).json()).totalElements).toBe(1);
    expect((await write(customer.request, "/api/customer/orders",
      { ...submitted, items: [{ menuItemId: item.id, quantity: 3 }] })).status()).toBe(409);

    const path = `/api/operator/vendors/${vendor.id}/orders`;
    expect((await anonymous.request.get(`/api/customer/orders/${savedId}`)).status()).toBe(401);
    expect((await outsider.request.get(`/api/customer/orders/${savedId}`)).status()).toBe(404);
    expect((await outsider.request.get(path)).status()).toBe(404);
    expect((await outsider.request.get(`${path}/${savedId}`)).status()).toBe(404);
    expect((await write(outsider.request, `${path}/${savedId}/status`, { status: "ACCEPTED", version: 0 }, "PATCH")).status()).toBe(404);
    expect((await customer.request.get(path)).status()).toBe(403);
    expect((await owner.request.patch(`${path}/${savedId}/status`, { data: { status: "ACCEPTED", version: 0 } })).status()).toBe(403);

    await ownerPage.reload();
    await ownerPage.getByRole("button", { name: "Orders", exact: true }).click();
    await ownerPage.getByRole("button", { name: "Pause new orders", exact: true }).click();
    await expect(ownerPage.getByRole("button", { name: "Resume new orders", exact: true })).toBeEnabled();
    expect((await write(outsider.request, `/api/operator/vendors/${vendor.id}/ordering`,
      { acceptingOrders: true, version: 1 }, "PUT")).status()).toBe(404);
    expect((await write(customer.request, "/api/customer/orders", { ...submitted, idempotencyKey: randomUUID() })).status()).toBe(409);
    const replayWhilePaused = await write(customer.request, "/api/customer/orders", submitted!);
    expect(replayWhilePaused.status()).toBe(201);
    expect((await replayWhilePaused.json()).id).toBe(savedId);
    const pausedCart = await customer.newPage();
    await pausedCart.goto(`/trucks/${vendor.id}`);
    await pausedCart.getByRole("button", { name: "Add Campus Taco to cart" }).click();
    await pausedCart.getByRole("link", { name: /Cart \(/ }).click();
    await expect(pausedCart.getByText("Temporarily not accepting orders.", {exact: true})).toBeVisible();
    await expect(pausedCart.getByRole("button", {name:"Place pickup order"})).toBeDisabled();
    await ownerPage.getByRole("button", { name: `View order #${savedId}`, exact: true }).click();
    for (const [button, message] of [
      ["Accept order", "Your order has been accepted."],
      ["Mark ready", "Your order is ready for pickup."],
      ["Mark collected", "Your order has been collected."],
    ]) {
      await ownerPage.getByRole("button", { name: button, exact: true }).click();
      // No reload/click on the customer page: verify actual automatic polling.
      await expect(customerPage.getByRole("region", { name: "Order status", exact: true }).getByRole("status")).toHaveText(message, { timeout: 25_000 });
    }
    expect((await write(owner.request, `${path}/${savedId}/status`, { status: "ACCEPTED", version: 0 }, "PATCH")).status()).toBe(409);
    await customerPage.reload();
    await expect(customerPage.getByRole("region", { name: "Order status", exact: true }).getByRole("status")).toHaveText("Your order has been collected.");
    await customerPage.getByRole("link", { name: "← My orders" }).click();
    await customerPage.getByRole("link", { name: `View order #${savedId}`, exact: true }).click();
    await expect(customerPage.getByRole("region", { name: "Order status", exact: true }).getByRole("status")).toHaveText("Your order has been collected.");

    await ownerPage.getByRole("button", { name: "Resume new orders", exact: true }).click();
    await expect(ownerPage.getByRole("button", { name: "Pause new orders", exact: true })).toBeEnabled();
    await pausedCart.getByRole("button", { name: "Refresh pickup details" }).click();
    await expect(pausedCart.getByRole("button", {name:"Place pickup order"})).toBeEnabled();
    await pausedCart.close();
    // Competing first submissions (not merely retries after an existing order).
    const nextCommand = { ...submitted, idempotencyKey: randomUUID(), total: 0,
      items: [{ menuItemId: item.id, quantity: 2, unitPrice: 0 }] };
    const concurrent = await Promise.all([write(customer.request, "/api/customer/orders", nextCommand),
      write(customer.request, "/api/customer/orders", nextCommand)]);
    const secondOrders = await Promise.all(concurrent.map(async response => {
      expect(response.status()).toBe(201);
      return response.json();
    }));
    expect(secondOrders[0].id).toBe(secondOrders[1].id);
    expect(secondOrders[0].total).toBe(9); // Client money is never authoritative.
    expect((await (await customer.request.get("/api/customer/orders")).json()).totalElements).toBe(2);
    const secondId = secondOrders[0].id;
    await customerPage.goto(`/orders/${secondId}/confirmation`);
    await ownerPage.getByRole("button", { name: "Refresh orders", exact: true }).click();
    await ownerPage.getByRole("button", { name: `View order #${secondId}`, exact: true }).click();
    await ownerPage.getByRole("button", { name: "Cancel order", exact: true }).click();
    await ownerPage.getByLabel("Reason visible to the customer").fill("Kitchen closed unexpectedly.");
    await ownerPage.getByRole("button", { name: "Confirm cancellation", exact: true }).click();
    await expect(customerPage.getByRole("region", { name: "Order status", exact: true }).getByRole("status"))
      .toHaveText("Your order was cancelled.", { timeout: 25_000 });
    await expect(customerPage.getByText("Kitchen closed unexpectedly.", { exact: true })).toBeVisible();
    await customer.clearCookies();
    await customerPage.reload();
    await expect(customerPage.getByRole("link", { name: "Customer sign in", exact: true })).toBeVisible();
    await expect(customerPage.getByText("Kitchen closed unexpectedly.", { exact: true })).toHaveCount(0);
  } finally {
    await Promise.all([customer, owner, outsider, anonymous].map(context => context.close()));
  }
});

test("negative fixture IDs work; sold-out items and inactive pickup stops fail closed", async ({ page }) => {
  const email = `negative-${randomUUID()}@example.test`;
  expect((await write(page.request, "/api/auth/register", { displayName: "Fixture Customer", email, password })).status()).toBe(201);
  sql(`INSERT INTO vendors(id,name,category,location) OVERRIDING SYSTEM VALUE
      VALUES (-900001,'Fixture Truck','Tacos','CSUN');
    INSERT INTO vendor_menu_items(id,vendor_id,name,price,availability_status) OVERRIDING SYSTEM VALUE
      VALUES (-900001,-900001,'Fixture Taco',3.25,'ACTIVE');
    INSERT INTO vendor_stops(id,vendor_id,venue_name,address,latitude,longitude,starts_at,ends_at,time_zone)
      OVERRIDING SYSTEM VALUE VALUES (-900001,-900001,'Fixture pickup','18111 Nordhoff St',34.24,-118.53,
      now()-interval '5 minutes',now()+interval '2 hours','America/Los_Angeles');`);
  await login(page, email);
  await page.goto("/trucks/-900001");
  await page.getByRole("button", { name: "Add Fixture Taco to cart" }).click();
  await page.getByRole("link", { name: /Cart \(/ }).click();
  await expect(page.getByRole("button", { name: "Place pickup order" })).toBeEnabled();
  sql("UPDATE vendor_menu_items SET availability_status='SOLD_OUT' WHERE id=-900001;");
  await page.getByRole("button", { name: "Place pickup order" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect((await (await page.request.get("/api/customer/orders")).json()).totalElements).toBe(0);
  await expect(page.getByLabel("Quantity for Fixture Taco")).toHaveValue("1");
  sql("UPDATE vendor_menu_items SET availability_status='ACTIVE' WHERE id=-900001; UPDATE vendor_stops SET status='cancelled' WHERE id=-900001;");
  await page.getByRole("button", { name: "Refresh pickup details" }).click();
  await expect(page.getByRole("button", { name: "Place pickup order" })).toBeDisabled();
  const forged = await write(page.request, "/api/customer/orders", { vendorId: -900001, pickupStopId: -900001,
    idempotencyKey: randomUUID(), items: [{ menuItemId: -900001, quantity: 1 }] });
  expect(forged.status()).toBe(409);
  expect((await (await page.request.get("/api/customer/orders")).json()).totalElements).toBe(0);
  sql("UPDATE vendor_stops SET status='scheduled' WHERE id=-900001;");
  await page.getByRole("button", { name: "Refresh pickup details" }).click();
  await expect(page.getByRole("button", { name: "Place pickup order" })).toBeEnabled();
  await page.getByRole("button", { name: "Place pickup order" }).click();
  await expect(page).toHaveURL(/\/orders\/\d+\/confirmation$/);
  await expect(page.getByRole("region", { name: "Order status", exact: true }).getByRole("status")).toHaveText("Your order has been placed.");
  const history = await (await page.request.get("/api/customer/orders")).json();
  expect(history.totalElements).toBe(1);
  expect(history.items[0].total).toBe(3.25);
});
