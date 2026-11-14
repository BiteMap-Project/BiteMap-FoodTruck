import { test, expect, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
function sql(statement: string) {
  const project = process.env.BITEMAP_E2E_PROJECT;
  if (!/^bitemap-e2e-[a-f0-9]{8}$/.test(project ?? '')) throw new Error('Unsafe test target');
  return execFileSync('docker', ['compose', '--env-file', '/dev/null', '-p', project!, '-f', 'docker-compose.e2e.yml',
    'exec', '-T', 'postgres', 'psql', '-U', 'bitemap_e2e', '-d', 'bitemap_e2e', '-v', 'ON_ERROR_STOP=1', '-Atc', statement], { cwd: root, encoding: 'utf8' }).trim();
}
async function write(api: APIRequestContext, path: string, data: object, method = 'POST') {
  const csrf = await (await api.get('/api/auth/csrf')).json();
  return api.fetch(path, { method, data, headers: { [csrf.headerName]: csrf.token } });
}
test('owner saves, reuses, edits and archives locations without changing published stops', async ({ page, browser }, info) => {
  sql('DELETE FROM auth_rate_limits');
  const email = `saved-${randomUUID()}@example.test`, password = 'Disposable-test-password-93!';
  expect((await write(page.request, '/api/auth/register', { displayName: 'Saved location owner', email, password })).status()).toBe(201);
  sql(`INSERT INTO app_user_roles(user_id,role) SELECT id,'OPERATOR' FROM app_users WHERE email='${email}';
    INSERT INTO operators(user_id) SELECT id FROM app_users WHERE email='${email}';`);
  expect((await write(page.request, '/api/auth/login', { email, password })).status()).toBe(200);
  const truck = await (await write(page.request, '/api/operator/vendors', { name: 'Saved location truck', category: 'Lunch', location: 'Northridge' })).json();
  // Only the third-party address lookup is stubbed. Auth, saved locations and schedules use real PostgreSQL.
  await page.route('**/api/operator/schedule-addresses?*', route => route.fulfill({ json: [{ address: '18111 Nordhoff St, Northridge, CA', latitude: 34.24, longitude: -118.53 }] }));
  await page.goto(`/operator/vendors/${truck.id}/schedule`);
  await page.getByRole('button', { name: 'Saved locations', exact: true }).click();
  await page.getByRole('button', { name: 'Add location', exact: true }).click();
  const form = page.getByRole('form', { name: 'New saved location' });
  await form.getByLabel('Location nickname').fill('CSUN library');
  await form.getByLabel('Venue or pickup landmark').fill('Library entrance');
  await form.getByLabel('Street address', { exact: true }).fill('18111 Nordhoff St');
  await form.getByLabel('City', { exact: true }).fill('Northridge');
  await form.getByRole('button', { name: 'Find address', exact: true }).click();
  await form.getByRole('button', { name: /Use 18111/ }).click();
  await form.getByRole('checkbox', { name: /I checked the pin/ }).check();
  await form.getByRole('button', { name: 'Save location', exact: true }).click();
  await expect(page.getByText('Location saved. Existing stops and orders are unchanged.')).toBeVisible();
  let locations = await (await page.request.get('/api/operator/saved-locations')).json();
  expect(locations).toHaveLength(1);
  const id = locations[0].id;
  await page.getByRole('button', { name: 'Saved locations', exact: true }).click();
  await page.getByRole('button', { name: 'Add stop', exact: true }).click();
  await page.getByRole('button', { name: 'Choose saved location', exact: true }).click();
  await page.getByLabel('Saved pickup location').selectOption(String(id));
  await expect(page.getByLabel('Venue name', { exact: true })).toHaveValue('Library entrance');
  await expect(page.getByRole('checkbox', { name: /I checked the pin/ })).not.toBeChecked();
  for (const [label, value] of [['Start date','2090-05-01'],['Start time','11:00'],['End date','2090-05-01'],['End time','13:00']]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('checkbox', { name: /I checked the pin/ }).check();
  await page.getByRole('button', { name: 'Save stop', exact: true }).click();
  await expect(page.getByText('Schedule saved to BiteMap.')).toBeVisible();
  const stopsBefore = await (await page.request.get(`/api/operator/vendors/${truck.id}/stops`)).json();
  expect(stopsBefore.items[0].address).toBe('18111 Nordhoff St, Northridge, CA');
  await page.getByRole('button', { name: 'Saved locations', exact: true }).click();
  await page.getByRole('button', { name: 'Edit CSUN library', exact: true }).click();
  const edit = page.getByRole('form', { name: 'Edit saved location' });
  await edit.getByLabel('Venue or pickup landmark').fill('West entrance');
  await edit.getByLabel('Pickup latitude').fill('34.25');
  await edit.getByRole('checkbox').check();
  await edit.getByRole('button', { name: 'Save location', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit CSUN library', exact: true })).toBeEnabled();
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: info.outputPath('saved-locations-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 850 });
  await page.screenshot({ path: info.outputPath('saved-locations-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Archive CSUN library', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm archive', exact: true }).click();
  await expect(page.getByText('Location archived. Existing stops and orders are unchanged.')).toBeVisible();
  locations = await (await page.request.get('/api/operator/saved-locations')).json();
  expect(locations).toHaveLength(0);
  expect(await (await page.request.get(`/api/operator/vendors/${truck.id}/stops`)).json()).toEqual(stopsBefore);
  // A second operator cannot use IDs from the first operator's address book.
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:15173' });
  try {
    const otherEmail = `saved-other-${randomUUID()}@example.test`;
    await write(other.request, '/api/auth/register', { displayName: 'Other owner', email: otherEmail, password });
    sql(`INSERT INTO app_user_roles(user_id,role) SELECT id,'OPERATOR' FROM app_users WHERE email='${otherEmail}'; INSERT INTO operators(user_id) SELECT id FROM app_users WHERE email='${otherEmail}';`);
    await write(other.request, '/api/auth/login', { email: otherEmail, password });
    expect((await other.request.get(`/api/operator/saved-locations/${id}`)).status()).toBe(404);
    expect((await write(other.request, `/api/operator/saved-locations/${id}/archive`, { version: 0 })).status()).toBe(404);
  } finally { await other.close(); }
});
