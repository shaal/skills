// HTML viewer verification for verify-flow-map.mjs: runs viewer-checks.js at
// phone, sideways phone, tablet, and desktop sizes, tests rotation and deep
// links, and saves sample screenshots.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEVICES = [
  { name: 'phone', focus: 'column', opts: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  { name: 'phone-sideways', focus: 'compact', opts: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  { name: 'tablet', focus: 'compact', opts: { viewport: { width: 820, height: 1180 }, hasTouch: true, deviceScaleFactor: 2 } },
  { name: 'desktop', focus: 'compact', opts: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
];

export async function verifyHtml(chromium, htmlPath, outDir, here) {
  const checks = readFileSync(join(here, 'viewer-checks.js'), 'utf8');
  const url = pathToFileURL(htmlPath).href;
  const errors = [];
  const browser = await chromium.launch();
  try {
    for (const dev of DEVICES) {
      const ctx = await browser.newContext(dev.opts);
      const page = await ctx.newPage();
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()));
      await page.goto(url);
      const { width, height } = dev.opts.viewport;
      const actual = await page.evaluate(() => [innerWidth, innerHeight]);
      if (actual[0] !== width || actual[1] !== height) {
        errors.push(`[${dev.name}] viewport is ${actual.join('x')}, expected ${width}x${height}`);
        await ctx.close();
        continue;
      }
      await page.evaluate(checks);
      const result = await page.evaluate(() => globalThis.flowViewerChecks());
      console.log(
        `[${dev.name} ${width}x${height}] min slack: cards ${result.cardMinSlack.toFixed(1)}px, labels ` +
          `${result.labelMinSlack.toFixed(1)}px, ${result.issues.length} issue(s)`,
      );
      for (const issue of result.issues) errors.push(`[${dev.name}] ${issue}`);
      const focus = await page.evaluate(() => window.flowViewer.set({ flow: 0, view: 'focus', steps: 'all' }).layout);
      if (focus !== dev.focus) errors.push(`[${dev.name}] Focus uses the ${focus} layout, expected ${dev.focus}`);

      // Sample screenshots; distinct states must give distinct images.
      const longest = await page.evaluate(() => {
        const f = window.flowViewer.flows;
        return f.reduce((best, x, i) => (x.steps > f[best].steps ? i : best), 0);
      });
      const shots = [
        ['overview', { flow: -1 }],
        ['flow1-map', { flow: 0, view: 'map', steps: 'all' }],
        ['flow1-focus', { flow: 0, view: 'focus', steps: 'all' }],
        ['flow1-step1', { flow: 0, view: 'focus', steps: 'step', step: 0 }],
        [`flow${longest + 1}-step3`, { flow: longest, view: 'focus', steps: 'step', step: 2 }],
        [`flow${longest + 1}-map-step3`, { flow: longest, view: 'map', steps: 'step', step: 2 }],
      ];
      const hashes = new Map();
      for (const [name, st] of shots) {
        await page.evaluate((s) => window.flowViewer.set(s), st);
        await page.waitForTimeout(80);
        const file = join(outDir, `${dev.name}-${name}.png`);
        const png = await page.screenshot({ path: file });
        const hash = createHash('md5').update(png).digest('hex');
        if (hashes.has(hash)) errors.push(`[${dev.name}] "${name}" looks identical to "${hashes.get(hash)}"`);
        hashes.set(hash, name);
        console.log(`  ${file}`);
      }

      // Deep link: the hash opens a specific step.
      const steps = await page.evaluate((i) => window.flowViewer.flows[i].steps, longest);
      await page.goto(`${url}#flow=${longest + 1}&view=focus&steps=step&step=2`);
      const st = await page.evaluate(() => window.flowViewer.info().state);
      const want = Math.min(1, steps - 1);
      if (st.flow !== longest || st.view !== 'focus' || st.steps !== 'step' || st.step !== want)
        errors.push(`[${dev.name}] deep link opened ${JSON.stringify(st)}`);

      // Rotation: Focus must switch between column (upright phone) and compact.
      if (dev.name === 'phone') {
        await page.evaluate(() => window.flowViewer.set({ flow: 0, view: 'focus', steps: 'all' }));
        await page.setViewportSize({ width: 844, height: 390 });
        await page.waitForTimeout(400);
        const turned = await page.evaluate(() => window.flowViewer.info().layout);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(400);
        const back = await page.evaluate(() => window.flowViewer.info().layout);
        if (turned !== 'compact' || back !== 'column') errors.push(`[phone] rotating gave ${turned} then ${back}, expected compact then column`);
      }
      for (const e of pageErrors) errors.push(`[${dev.name}] page error: ${e}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return errors;
}
