#!/usr/bin/env node
/*
 * Verify a user flow map in headless Chromium (Playwright).
 *
 *   node verify-flow-map.mjs <map.svg|viewer.html> [--out <dir>] [--browser chromium|webkit|firefox]
 *
 * Use --browser webkit to check the viewer in Safari's engine (iPhone, iPad, Mac);
 * install it once with `npx playwright install webkit`.
 *
 * For an HTML viewer, see lib/verify-html.mjs: viewer-checks.js at phone,
 * sideways phone, tablet, and desktop sizes, plus rotation and deep links.
 *
 * For an SVG:
 * 1. Runs checks.js with the system UI font and with Inter (must pass), then
 *    with a wide fallback font (warnings only).
 * 2. Scrubs to the moment each flow is fully drawn and saves one screenshot
 *    per flow, plus the overview and the reduced-motion (static) view.
 * 3. Fails when a check fails, when two flow screenshots are identical (the
 *    scrub did not apply), or when reduced motion does not hide the tour.
 *
 * Playwright is resolved from the current directory first, then from this
 * script's folder. Install it in a scratch folder (not the user's repo) and
 * run this script from there:
 *   mkdir -p /tmp/flow-map-verify && cd /tmp/flow-map-verify
 *   npm i playwright && npx playwright install chromium
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const svgArg = args.find((a, i) => !a.startsWith('--') && !['--out', '--browser'].includes(args[i - 1]));
const outIdx = args.indexOf('--out');
const browserIdx = args.indexOf('--browser');
const browserName = browserIdx >= 0 ? args[browserIdx + 1] : 'chromium';
if (!svgArg) {
  console.error('Usage: node verify-flow-map.mjs <map.svg|viewer.html> [--out <dir>]');
  process.exit(2);
}
const svgPath = resolve(svgArg);
const outDir = resolve(outIdx >= 0 ? args[outIdx + 1] : join(tmpdir(), `flow-map-shots-${Date.now()}`));
const here = dirname(fileURLToPath(import.meta.url));
const checksSource = readFileSync(join(here, 'checks.js'), 'utf8');

const FONTS = {
  system: { stack: '-apple-system,system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif', strict: true },
  inter: { stack: 'Inter,-apple-system,system-ui,sans-serif', strict: true },
  wide: { stack: 'Verdana,"DejaVu Sans",sans-serif', strict: false },
};

async function loadChromium() {
  for (const base of [join(process.cwd(), 'noop.js'), join(here, 'noop.js')]) {
    for (const name of ['playwright', '@playwright/test', 'playwright-core']) {
      try {
        const mod = await import(pathToFileURL(createRequire(base).resolve(name)).href);
        const type = mod[browserName] ?? mod.default?.[browserName];
        if (type) return type;
      } catch {
        // try the next candidate
      }
    }
  }
  return null;
}

const chromium = await loadChromium();
if (!chromium) {
  console.error(
    'Playwright not found in the current directory. Install it in a scratch folder and run from there:\n' +
      '  mkdir -p /tmp/flow-map-verify && cd /tmp/flow-map-verify\n' +
      '  npm i playwright && npx playwright install chromium\n' +
      '  node <skill_dir>/scripts/verify-flow-map.mjs /absolute/path/map.svg\n' +
      'Or load the SVG in any browser tool, evaluate scripts/checks.js, and call flowMapChecks(svg).',
  );
  process.exit(2);
}

if (svgPath.endsWith('.html')) {
  mkdirSync(outDir, { recursive: true });
  const { verifyHtml } = await import('./lib/verify-html.mjs');
  const errs = await verifyHtml(chromium, svgPath, outDir, here);
  for (const e of errs) console.log(`ERROR: ${e}`);
  console.log(errs.length ? `FAILED with ${errs.length} error(s).` : `PASSED. Screenshots in ${outDir}`);
  process.exit(errs.length ? 1 : 0);
}

const svgText = readFileSync(svgPath, 'utf8');
const width = Number(/<svg[^>]*\swidth="(\d+)"/.exec(svgText)?.[1]);
const height = Number(/<svg[^>]*\sheight="(\d+)"/.exec(svgText)?.[1]);
if (!width || !height) {
  console.error('The SVG has no numeric width/height attributes. Was it made by render-flow-map.mjs?');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const warnings = [];
try {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(pathToFileURL(svgPath).href);
  const actual = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
  if (actual[0] !== width || actual[1] !== height) errors.push(`viewport is ${actual.join('x')}, expected ${width}x${height}`);
  await page.evaluate(checksSource);

  // 1. Layout checks under each font stack.
  for (const [name, { stack, strict }] of Object.entries(FONTS)) {
    const result = await page.evaluate((fontStack) => {
      const svg = document.documentElement;
      svg.querySelector('style[data-verify]')?.remove();
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.setAttribute('data-verify', '');
      style.textContent = `svg *{font-family:${fontStack} !important}`;
      svg.appendChild(style);
      return globalThis.flowMapChecks(svg);
    }, stack);
    console.log(
      `[${name}] min slack: cards ${result.cardMinSlack.toFixed(1)}px, labels ${result.labelMinSlack.toFixed(1)}px, ` +
        `${result.issues.length} issue(s)`,
    );
    for (const issue of result.issues) (strict ? errors : warnings).push(`[${name}] ${issue}`);
  }
  await page.evaluate(() => document.querySelector('style[data-verify]')?.remove());

  // 2. Scrub to each flow and screenshot it.
  const times = JSON.parse((await page.evaluate(() => document.documentElement.getAttribute('data-flow-times'))) || '[]');
  const frames = [{ title: 'overview', t: 0.5 }, ...times.map((f) => ({ title: f.title, t: f.done }))];
  const hashes = new Map();
  for (const [i, frame] of frames.entries()) {
    const now = await page.evaluate((t) => {
      const svg = document.documentElement;
      svg.pauseAnimations();
      svg.setCurrentTime(t);
      return svg.getCurrentTime();
    }, frame.t);
    if (Math.abs(now - frame.t) > 0.05) errors.push(`scrub to ${frame.t}s landed at ${now}s`);
    await page.waitForTimeout(60);
    const file = join(outDir, i === 0 ? 'overview.png' : `flow-${String(i).padStart(2, '0')}.png`);
    const png = await page.screenshot({ path: file });
    const hash = createHash('md5').update(png).digest('hex');
    if (hashes.has(hash)) errors.push(`"${frame.title}" looks identical to "${hashes.get(hash)}": the scrub did not apply`);
    hashes.set(hash, frame.title);
    console.log(`  ${file}  (${frame.title}, t=${frame.t}s)`);
  }

  // 3. Reduced motion must hide the tour and show the static map.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll('.tour')].every((el) => getComputedStyle(el).display === 'none'),
  );
  if (!hidden) errors.push('prefers-reduced-motion does not hide the tour');
  await page.screenshot({ path: join(outDir, 'static.png') });
  console.log(`  ${join(outDir, 'static.png')}  (reduced motion)`);
} finally {
  await browser.close();
}

for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`ERROR: ${e}`);
console.log(errors.length ? `FAILED with ${errors.length} error(s).` : `PASSED. Screenshots in ${outDir}`);
process.exit(errors.length ? 1 : 0);
