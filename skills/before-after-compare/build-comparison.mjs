#!/usr/bin/env node
/*
 * Build a self-contained before/after comparison HTML page from a manifest.
 *
 *   node build-comparison.mjs <manifest.json> <out.html>
 *
 * Images are inlined as base64 data URIs, so the output is ONE portable file
 * you can move, attach, or open from anywhere — no sibling PNGs required.
 *
 * Manifest schema (JSON):
 * {
 *   "title":    "Sprint 12 — before & after",        // page H1 (optional)
 *   "subtitle": "Before = staging · After = local",   // sub-line (optional, HTML ok)
 *   "sections": [
 *     {
 *       "id":          "WEB-123",                      // badge (optional)
 *       "title":       "Pricing — heading font",       // section title
 *       "desc":        "Switched to <b>Inter 600</b>.", // one-liner, HTML allowed
 *       "before":      "shots/B1.png",                 // path (rel to manifest), data: or http(s) URL
 *       "after":       "shots/A1.png",
 *       "beforeLabel": "staging — Arial Bold",         // small caption (optional)
 *       "afterLabel":  "Inter 600"                     // small caption (optional)
 *     }
 *   ]
 * }
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve, dirname } from 'node:path';

const [, , manifestPath, outPath] = process.argv;
if (!manifestPath || !outPath) {
  console.error('Usage: node build-comparison.mjs <manifest.json> <out.html>');
  process.exit(1);
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

let manifest;
try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch (err) {
  fail(`Cannot read manifest "${manifestPath}": ${err.code || err.message}`);
}
if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || !Array.isArray(manifest.sections ?? [])) {
  fail('Manifest must be a JSON object whose "sections" is an array.');
}
const baseDir = dirname(resolve(manifestPath));

const ok = (v) => typeof v === 'string' && v.length > 0;
const sectionName = (s, i) => `Section ${i + 1} ("${[s?.title, s?.id].find(ok) || 'untitled'}")`;

// A section without both images would render an empty panel: a comparison that proves nothing.
(manifest.sections || []).forEach((s, i) => {
  if (!ok(s?.before) || !ok(s?.after)) fail(`${sectionName(s, i)} needs both "before" and "after".`);
});

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function dataUri(p) {
  if (/^(data:|https?:)/i.test(p)) return p;           // already a URI — leave it
  const abs = resolve(baseDir, p);
  let buf;
  try { buf = readFileSync(abs); } catch (err) {
    fail(`Cannot read image "${p}" (resolved to ${abs}): ${err.code || err.message}`);
  }
  const mime = MIME[extname(abs).toLowerCase()] || 'application/octet-stream';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const sections = (manifest.sections || []).map((s, i) => {
  const before = dataUri(s.before), after = dataUri(s.after);
  // Byte-identical images mean the same page was captured twice (see SKILL.md).
  const payload = (u) => (/^data:/i.test(u) ? u.slice(u.indexOf(',') + 1) : u);
  if (payload(before) === payload(after)) fail(`${sectionName(s, i)}: "before" and "after" are the same image. Re-capture one side.`);
  return `
  <section class="cmp">
    <div class="head">
      <div>${s.id ? `<span class="id">${esc(s.id)}</span>` : ''}<span class="title">${esc(s.title || '')}</span></div>
      ${s.desc ? `<p class="desc">${s.desc}</p>` : '' /* desc is intentionally NOT escaped — author may use <b>, <code>, etc. */}
    </div>
    <div class="pair">
      <div class="col before"><h3>Before${s.beforeLabel ? ` <span class="tag">${esc(s.beforeLabel)}</span>` : ''}</h3><img loading="lazy" src="${esc(before)}" alt="before"></div>
      <div class="col after"><h3>After${s.afterLabel ? ` <span class="tag">${esc(s.afterLabel)}</span>` : ''}</h3><img loading="lazy" src="${esc(after)}" alt="after"></div>
    </div>
  </section>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(manifest.title || 'Before / after comparison')}</title>
<style>
  :root { --navy:#12365E; --ink:#1c2733; --line:#e2e6ea; --bg:#f6f8fa; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:var(--ink); background:var(--bg); }
  header { background:var(--navy); color:#fff; padding:28px 32px; }
  header h1 { margin:0 0 4px; font-size:22px; }
  header p { margin:0; opacity:.85; font-size:14px; }
  main { max-width:1500px; margin:0 auto; padding:24px 24px 64px; }
  .cmp { background:#fff; border:1px solid var(--line); border-radius:10px; margin:22px 0; overflow:hidden; box-shadow:0 1px 2px rgba(0,0,0,.04); }
  .cmp > .head { padding:16px 20px; border-bottom:1px solid var(--line); }
  .cmp .id { display:inline-block; font-weight:700; color:#fff; background:var(--navy); border-radius:5px; padding:2px 9px; font-size:13px; letter-spacing:.02em; margin-right:10px; }
  .cmp .title { font-weight:600; font-size:15px; }
  .cmp .desc { margin:8px 0 0; font-size:14px; line-height:1.5; color:#42505c; }
  .cmp .desc b { color:var(--navy); }
  .cmp code { background:#eef1f4; border-radius:4px; padding:1px 5px; font-size:.92em; }
  .pair { display:grid; grid-template-columns:1fr 1fr; gap:0; }
  .col { padding:14px 16px 18px; }
  .col + .col { border-left:1px solid var(--line); }
  .col h3 { margin:0 0 10px; font-size:12px; text-transform:uppercase; letter-spacing:.06em; }
  .col.before h3 { color:#b22; }
  .col.after h3 { color:#1a8a3c; }
  .col h3 .tag { font-weight:400; text-transform:none; letter-spacing:0; color:#8794a0; }
  img { width:100%; height:auto; display:block; border:1px solid var(--line); border-radius:6px; background:#fff; }
  @media (max-width:860px){ .pair{grid-template-columns:1fr} .col+.col{border-left:0;border-top:1px solid var(--line)} }
</style>
</head>
<body>
<header>
  <h1>${esc(manifest.title || 'Before / after comparison')}</h1>
  ${manifest.subtitle ? `<p>${manifest.subtitle}</p>` : ''}
</header>
<main>
${sections}
</main>
</body>
</html>
`;

try { writeFileSync(outPath, html); } catch (err) {
  fail(`Cannot write "${outPath}": ${err.code || err.message}`);
}
console.log(`Wrote ${outPath} — ${(manifest.sections || []).length} section(s), ${(html.length / 1024).toFixed(0)} KB`);
