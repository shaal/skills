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
      // Run the checks in the page's own fonts, then in the system UI font (Inter is rarely installed).
      for (const font of [null, '-apple-system,system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif']) {
        const result = await page.evaluate((f) => {
          document.getElementById('font-override')?.remove();
          if (f) {
            const st = document.createElement('style');
            st.id = 'font-override';
            st.textContent = `#canvas, #canvas * { font-family: ${f} !important; }`;
            document.head.appendChild(st);
          }
          return globalThis.flowViewerChecks();
        }, font);
        console.log(
          `[${dev.name} ${width}x${height}${font ? ' system font' : ''}] min slack: cards ${result.cardMinSlack.toFixed(1)}px, ` +
            `labels ${result.labelMinSlack.toFixed(1)}px, ${result.issues.length} issue(s)`,
        );
        for (const issue of result.issues) errors.push(`[${dev.name}${font ? ' system font' : ''}] ${issue}`);
      }
      await page.evaluate(() => document.getElementById('font-override')?.remove());
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

      // Live interaction: draw-on, arrowhead, camera tween, and a swipe (mouse drag uses the same code).
      await page.evaluate((i) => window.flowViewer.set({ flow: i, view: 'focus', steps: 'step', step: 0 }), longest);
      await page.evaluate(() => document.getElementById('next').click());
      await page.waitForTimeout(1000);
      const live = await page.evaluate(() => {
        const info = window.flowViewer.info();
        const path = document.querySelector('#flowlines path.draw');
        const near = (a, b) => Math.abs(a - b) < 0.5;
        return {
          step: info.state.step,
          dash: path ? parseFloat(getComputedStyle(path).strokeDashoffset) : 0,
          late: document.querySelectorAll('#flowlines .late').length,
          framed: ['x', 'y', 'w', 'h'].every((k) => near(info.viewBox[k], info.fit[k])),
        };
      });
      if (live.step !== 1) errors.push(`[${dev.name}] the › button moved to step ${live.step + 1}, expected 2`);
      if (live.dash > 0.01) errors.push(`[${dev.name}] the current step's line did not finish drawing (dashoffset ${live.dash})`);
      if (live.late) errors.push(`[${dev.name}] the current step's arrowhead never appeared`);
      if (!live.framed) errors.push(`[${dev.name}] the camera did not end on the step frame`);
      const box = await page.locator('#canvas').boundingBox();
      await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.52, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(700);
      const swiped = await page.evaluate(() => window.flowViewer.info().state.step);
      if (swiped !== 2) errors.push(`[${dev.name}] a right-to-left swipe moved to step ${swiped + 1}, expected 3`);

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
