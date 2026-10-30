import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const baseURL = "http://127.0.0.1:15173";
const password = "E2e-Disposable-Only-93!";

test("password recovery through real email revokes old sessions and rejects token reuse", async ({ browser, request }, testInfo) => {
  const oldCustomer = await browser.newContext({ baseURL });
  const oldOwner = await browser.newContext({ baseURL });
  const recovery = await browser.newContext({ baseURL });
  try {
    const email = `recovery-${randomUUID()}@example.test`;
    expect((await write(oldCustomer.request, "/api/auth/register", { displayName: "Recovery Test", email, password })).status()).toBe(201);
    sql(`INSERT INTO app_user_roles(user_id,role) SELECT id,'OPERATOR' FROM app_users WHERE email='${email}';
      INSERT INTO operators(user_id) SELECT id FROM app_users WHERE email='${email}';`);
    for (const context of [oldCustomer, oldOwner]) expect((await write(context.request, "/api/auth/login", { email, password })).status()).toBe(200);
    const page = await recovery.newPage();
    await page.goto("/customer/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    // Both routes have an Email field. Wait for the destination to render before
    // filling, otherwise React can discard a fill made on the old login page.
    await expect(page).toHaveURL(`${baseURL}/forgot-password`);
    const recoveryForm = page.getByRole("region", { name: "Forgot password?", exact: true });
    await expect(recoveryForm).toBeVisible();
    await recoveryForm.getByLabel("Email", { exact: true }).fill(email);
    await expect(recoveryForm.getByLabel("Email", { exact: true })).toHaveValue(email);
    const [resetRequest] = await Promise.all([
      page.waitForResponse(response => response.url() === `${baseURL}/api/auth/forgot-password`
        && response.request().method() === "POST"),
      recoveryForm.getByRole("button", { name: "Send reset link" }).click(),
    ]);
    expect(resetRequest.status(), "Password recovery request must be accepted").toBe(202);
    await expect(page.getByRole("status")).toContainText("If an eligible account exists");
    await page.screenshot({ path: testInfo.outputPath("recovery-requested.png"), fullPage: true });
    let mailId = "";
    await expect.poll(async () => {
      const inbox = await (await request.get("http://127.0.0.1:18025/api/v1/messages")).json();
      const message = inbox.messages.find((m: { ID: string; Subject: string; To: { Address: string }[] }) =>
        m.Subject === "Reset your BiteMap password" && m.To.some(to => to.Address === email));
      mailId = message?.ID ?? "";
      return Boolean(mailId);
    }, { timeout: 20000 }).toBe(true);
    const mail = await (await request.get(`http://127.0.0.1:18025/api/v1/message/${mailId}`)).json();
    const link = mail.Text.match(/http:\/\/127\.0\.0\.1:15173\/reset-password#token=[A-Za-z0-9_-]{43}/)?.[0];
    expect(Boolean(link)).toBe(true);
    await page.goto(link);
    await expect(page).toHaveURL(`${baseURL}/reset-password`);
    const newPassword = "Fresh disposable password-42!";
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password", { exact: true }).fill(newPassword);
    await page.screenshot({ path: testInfo.outputPath("recovery-form.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("recovery-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByRole("status")).toContainText("Password updated");
    await page.screenshot({ path: testInfo.outputPath("recovery-completed.png"), fullPage: true });
    for (const context of [oldCustomer, oldOwner]) expect((await context.request.get("/api/auth/me")).status()).toBe(401);
    expect((await recovery.request.get("/api/auth/me")).status()).toBe(401);
    expect((await write(recovery.request, "/api/auth/login", { email, password })).status()).toBe(401);
    await page.getByRole("link", { name: "Customer sign in", exact: true }).click();
    await expect(page).toHaveURL(`${baseURL}/customer/login`);
    await expect(page.getByRole("heading", { name: "Customer sign in", exact: true })).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Sign in and return to cart", exact: true }).click();
    await expect(page).toHaveURL(/\/cart$/);
    const me = await (await recovery.request.get("/api/auth/me")).json();
    expect(me.roles).toEqual(["ROLE_CUSTOMER", "ROLE_OPERATOR"]);
    expect((await recovery.request.get("/api/operator/vendors")).status()).toBe(200);
    await page.goto(link);
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByRole("alert")).toContainText("invalid or expired");
  } finally { await oldCustomer.close(); await oldOwner.close(); await recovery.close(); }
});

// The suite uses a single local proxy IP. Reset only the disposable limiter
// fixtures between independent tests, never disable enforcement in the app.
test.beforeEach(() => { sql("DELETE FROM auth_rate_limits"); });

test("real login throttling shows a cooldown and recovers without automatic retries", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ baseURL });
  try {
    const email = `throttle-${randomUUID()}@example.test`;
    expect((await write(context.request, "/api/auth/register", { displayName: "Throttle Test", email, password })).status()).toBe(201);
    for (let i = 0; i < 10; i++) {
      expect((await write(context.request, "/api/auth/login", { email, password: "Incorrect password" })).status()).toBe(401);
    }
    const rejected = await write(context.request, "/api/auth/login", { email, password });
    expect(rejected.status()).toBe(429);
    expect(Number(rejected.headers()["retry-after"])).toBeGreaterThan(0);
    expect((await context.request.get("/api/auth/me")).status()).toBe(401);
    // Fast-forward only the isolated fixture's refill baseline so the browser
    // exercises real recovery without spending a minute sleeping in CI.
    sql("UPDATE auth_rate_limits SET updated_at=clock_timestamp()-interval '55 seconds' WHERE scope='login-account'");
    const page = await context.newPage();
    await page.goto("/customer/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    let submissions = 0;
    page.on("request", request => { if (request.url().endsWith("/api/auth/login")) submissions++; });
    await page.getByRole("button", { name: "Sign in and return to cart", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Too many authentication attempts");
    await expect(page.getByRole("button", { name: /Try again in/ })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath("login-cooldown.png"), fullPage: true });
    await expect(page.getByRole("button", { name: "Sign in and return to cart", exact: true })).toBeEnabled({ timeout: 10000 });
    expect(submissions).toBe(1);
    await page.getByRole("button", { name: "Sign in and return to cart", exact: true }).click();
    await expect(page).toHaveURL(/\/cart$/);
    expect((await context.request.get("/api/auth/me")).status()).toBe(200);
  } finally { await context.close(); }
});

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
    // Optional local reproduction file is uploaded only to this disposable stack.
    // CI uses a self-contained real WebP fixture, never a developer's private file.
    const validPhoto = process.env.BITEMAP_E2E_PHOTO || { name: "dish.webp", mimeType: "image/webp",
      buffer: Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64") };
    // File-dialog close can deliver focus before or after the input change.
    // Exercise both orders: setInputFiles alone never tested this lifecycle.
    for (const focusFirst of [true, false]) {
      let releaseSession!: () => void;
      let sessionStarted!: () => void;
      const sessionGate = new Promise<void>(resolve => { releaseSession = resolve; });
      const started = new Promise<void>(resolve => { sessionStarted = resolve; });
      await page.route("**/api/auth/me", async route => {
        sessionStarted();
        await sessionGate;
        await route.continue(); // Real session response; no mocked authorization.
      }, { times: 1 });
      const input = page.getByLabel("Upload a photo");
      await input.evaluate(node => node.setAttribute("data-picker-draft", "original"));
      const chooserEvent = page.waitForEvent("filechooser");
      await input.click();
      const chooser = await chooserEvent;
      try {
        if (!focusFirst) await chooser.setFiles(validPhoto);
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await started;
        await expect(page.getByRole("form", { name: "Edit menu item" })).toBeVisible();
        await expect(input).toHaveAttribute("data-picker-draft", "original");
        if (focusFirst) await chooser.setFiles(validPhoto);
        await expect.poll(() => input.evaluate((node: HTMLInputElement) => node.files?.length)).toBe(1);
        const checked = page.waitForResponse(response => response.url().endsWith("/api/auth/me"));
        releaseSession();
        expect((await checked).status()).toBe(200);
        await expect(page.getByLabel("Item name", { exact: true })).toHaveValue("Photo Taco");
        await expect(input).toHaveAttribute("data-picker-draft", "original");
      } finally { releaseSession(); }
    }
    await page.screenshot({ path: testInfo.outputPath("photo-picker-draft-retained.png"), fullPage: true });
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
    await expect.poll(() => ownerCard.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath("owner-valid-photo.png"), fullPage: true });
    const publicPage = await customer.newPage();
    await publicPage.goto(`/trucks/${vendor.id}`);
    const publicCard = publicPage.getByRole("listitem").filter({ has: publicPage.getByRole("heading", { name: "Photo Taco", exact: true }) });
    await publicCard.scrollIntoViewIfNeeded();
    await expect.poll(() => publicCard.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await publicPage.screenshot({ path: testInfo.outputPath("customer-valid-photo.png"), fullPage: true });
    // Lose the upload response AFTER the server commits. The UI must stop waiting,
    // require a reload, and never blindly retry or create a second menu item.
    await page.getByRole("button", { name: "Edit Photo Taco", exact: true }).click();
    await page.getByLabel("Upload a photo").setInputFiles(validPhoto);
    let releaseResponse!: () => void;
    const delayedResponse = new Promise<void>(resolve => { releaseResponse = resolve; });
    let uploads = 0;
    await page.route(`**/api/operator/vendors/${vendor.id}/menu-items/${item.id}/image?*`, async route => {
      uploads++;
      // Chromium interception can omit file bytes from multipart postData.
      // Replay the exact fixture through the context's real API client instead.
      const committed = await owner.request.post(route.request().url(), {
        headers: { "X-CSRF-TOKEN": route.request().headers()["x-csrf-token"] },
        multipart: { file: typeof validPhoto === "string"
          ? { name: "photo.jpg", mimeType: "image/jpeg", buffer: readFileSync(validPhoto) }
          : validPhoto },
      });
      expect(committed.status()).toBe(200);
      await delayedResponse;
      await route.fulfill({ response: committed }).catch(() => {}); // Client may have aborted.
    }, { times: 1 });
    try {
      await page.getByRole("button", { name: "Save item", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("Saving timed out", { timeout: 40_000 });
      await expect(page.getByRole("button", { name: "Save item", exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Reload menu", exact: true })).toBeEnabled();
      expect(uploads).toBe(1);
      await page.screenshot({ path: testInfo.outputPath("upload-timeout-recovery.png"), fullPage: true });
    } finally { releaseResponse(); }
    await page.getByRole("button", { name: "Reload menu", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Photo Taco", exact: true })).toBeVisible();
    expect((await (await owner.request.get(`/api/operator/vendors/${vendor.id}/menu-items`)).json()).totalElements).toBe(1);
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
    await expect(customerPage).toHaveURL(/\/customer\/login$/);
    await expect(customerPage.getByRole("heading", { name: "Customer sign in", exact: true })).toBeVisible();
    await expect(customerPage.getByText("Kitchen closed unexpectedly.", { exact: true })).toHaveCount(0);
  } finally {
    await Promise.all([customer, owner, outsider, anonymous].map(context => context.close()));
  }
});

test("customer order privacy survives account switching and logout in a second tab", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ baseURL });
  try {
    const emailA = `privacy-a-${randomUUID()}@example.test`;
    const emailB = `privacy-b-${randomUUID()}@example.test`;
    for (const email of [emailA, emailB]) {
      expect((await write(context.request, "/api/auth/register", { displayName: "Privacy fixture", email, password })).status()).toBe(201);
    }
    // Completed fixture deliberately never polls; no application database is used.
    sql(`WITH truck AS (
      INSERT INTO vendors(name,category,location) VALUES ('Privacy fixture truck','Food','Test location') RETURNING id
    ) INSERT INTO customer_orders(customer_user_id,vendor_id,idempotency_key,total,status)
      SELECT u.id,t.id,'${randomUUID()}',0,'COMPLETED' FROM app_users u CROSS JOIN truck t WHERE u.email='${emailA}';`);
    const ordersTab = await context.newPage();
    const sessionTab = await context.newPage();
    await login(sessionTab, emailA);
    const history = await (await context.request.get("/api/customer/orders")).json();
    const orderId = history.items[0].id;
    for (const path of ["/orders", `/orders/${orderId}/confirmation`]) {
      await ordersTab.goto(path);
      await expect(ordersTab.getByText(/Privacy fixture truck/)).toBeVisible();
      await sessionTab.goto("/trucks");
      await sessionTab.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(sessionTab.getByRole("link", { name: "Customer sign in", exact: true })).toBeVisible();
      await login(sessionTab, emailB);
      await ordersTab.bringToFront();
      // Explicit focus also makes this deterministic in headless Chromium.
      const checked = ordersTab.waitForResponse(r => r.url().endsWith("/api/auth/me"));
      await ordersTab.evaluate(() => window.dispatchEvent(new Event("focus")));
      await checked;
      await expect(ordersTab.getByText(/Privacy fixture truck/)).toHaveCount(0);
      if (path === "/orders") await expect(ordersTab.getByText("No orders yet.")).toBeVisible();
      else await expect(ordersTab.getByRole("alert")).toContainText("not available to your account");
      expect((await context.request.get(`/api/customer/orders/${orderId}`)).status()).toBe(404);
      await ordersTab.screenshot({ path: testInfo.outputPath(path === "/orders" ? "switched-order-history.png" : "switched-completed-order.png"), fullPage: true });

      await sessionTab.goto("/trucks");
      await sessionTab.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(sessionTab.getByRole("link", { name: "Customer sign in", exact: true })).toBeVisible();
      await login(sessionTab, emailA);
    }
    await ordersTab.goto(`/orders/${orderId}/confirmation`);
    await expect(ordersTab.getByText("Your order has been collected.")).toBeVisible();
    await sessionTab.goto("/trucks");
    await sessionTab.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(sessionTab.getByRole("link", { name: "Customer sign in", exact: true })).toBeVisible();
    await ordersTab.bringToFront();
    await ordersTab.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(ordersTab).toHaveURL(/\/customer\/login$/);
    await expect(ordersTab.getByText(/Privacy fixture truck/)).toHaveCount(0);
  } finally { await context.close(); }
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
