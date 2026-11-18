import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

export async function auditOrderingPage(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations, JSON.stringify(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), null, 2)).toEqual([]);
  const viewport = page.viewportSize();
  try {
    for (const width of [320, 640]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Reflow at ${width}px`).toBe(true);
    }
  } finally { if (viewport) await page.setViewportSize(viewport); }
}

// Real Tab traversal, not locator.focus(), proves keyboard reachability.
export async function keyboardActivate(page: Page, target: Locator) {
  for (let i = 0; i < 100; i++) {
    if (await target.evaluate(element => element === document.activeElement)) {
      await expect(target).toBeVisible();
      await page.keyboard.press('Enter');
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error('Control was not reachable with Tab');
}
