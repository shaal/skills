#!/usr/bin/env node
/*
 * Render a flows data module into a user flow map.
 *
 *   node render-flow-map.mjs <flows.mjs> <out.svg>    animated SVG (GitHub, <img>, files)
 *   node render-flow-map.mjs <flows.mjs> <out.html>   interactive viewer (phones, zoom, focus)
 *
 * The data module format is documented in ../references/data-format.md, and
 * ../examples/acme-notes.flows.mjs is a complete example.
 *
 * SVG: one self-contained file with no script, no external fonts or images,
 * so it animates as a file, inside an <img>, and on GitHub. All motion is SMIL
 * on one shared clock, so a viewer can pause it and scrub with setCurrentTime().
 * With animation off, or with prefers-reduced-motion, the full map shows.
 *
 * HTML: one self-contained page with the same cards and labels, plus a flow
 * picker, Map/Focus layouts, step-by-step navigation, and pinch/drag zoom.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DataError, loadModel } from './lib/model.mjs';

const [, , dataArg, outArg] = process.argv;
if (!dataArg || !outArg) {
  console.error('Usage: node render-flow-map.mjs <flows.mjs> <out.svg|out.html>');
  process.exit(2);
}

let model;
try {
  model = await loadModel(dataArg);
} catch (err) {
  if (!(err instanceof DataError)) throw err;
  console.error(err.message);
  process.exit(1);
}

const out = resolve(outArg);
mkdirSync(dirname(out), { recursive: true });
if (out.endsWith('.html')) {
  const { renderHtml } = await import('./lib/html.mjs');
  const { html, stats } = renderHtml(model);
  writeFileSync(out, html);
  console.log(`Wrote ${out}: ${(html.length / 1024).toFixed(0)} KB, ${model.FLOWS.length} flows`);
  for (const line of stats) console.log(`  ${line}`);
} else {
  const { svg, times, T } = (await import('./lib/svg.mjs')).renderSvg(model, dataArg);
  writeFileSync(out, svg);
  console.log(`Wrote ${out}: ${model.WIDTH}x${model.HEIGHT}, ${(svg.length / 1024).toFixed(0)} KB, ${model.FLOWS.length} flows, ${T}s cycle`);
  for (const t of times) console.log(`  ${t.title}: plays ${t.start}-${t.end}s, fully drawn at ${t.done}s`);
}
