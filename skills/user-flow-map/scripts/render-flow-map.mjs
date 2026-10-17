#!/usr/bin/env node
/*
 * Render a flows data module into an animated swimlane user flow map (SVG).
 *
 *   node render-flow-map.mjs <flows.mjs> <out.svg>
 *
 * The data module format is documented in ../references/data-format.md, and
 * ../examples/acme-notes.flows.mjs is a complete example.
 *
 * Output: one self-contained SVG. No script, no external fonts or images, so it
 * animates as a file, inside an <img>, and on GitHub. All motion is SMIL on one
 * shared clock, so a viewer can pause it and scrub with setCurrentTime().
 * With animation off, or with prefers-reduced-motion, the full map shows.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , dataArg, outArg] = process.argv;
if (!dataArg || !outArg) {
  console.error('Usage: node render-flow-map.mjs <flows.mjs> <out.svg>');
  process.exit(2);
}
const data = await import(pathToFileURL(resolve(dataArg)).href);
const { LANES, ACTORS, NODES, FLOWS } = data;
const META = data.META ?? {};
const LAYOUT = {
  X0: 220, P: 300, W: 196, HEADER: 192, ROW_GAP: 48, LANE_PAD_TOP: 18, LANE_PAD_BOTTOM: 40, LANE_GAP: 8, RIGHT: 90,
  MIN_WIDTH: 1760, // keeps room for the header legend on small maps
  ...(data.LAYOUT ?? {}),
};
const TIMING = { overview: 5, lead: 0.6, step: 0.7, hold: 2.6, fade: 0.35, ...(data.TIMING ?? {}) };
const { X0, P, W, HEADER } = LAYOUT;
const INK = '#2C2620';
const MUTED = '#6B6259';
const LINE = '#B8B0A3';
const BG = '#FAFAF7';
const BORDER = '#D9D1C4';
const CHAR_W = 6.5; // label width estimate, generous for SF Pro / Segoe UI / Inter at 10.5px semibold

// ---------- validate nodes, then lay out lanes and rows ----------
const errors = [];
const laneById = new Map(LANES.map((l) => [l.id, l]));
const slots = new Map();
for (const [id, n] of Object.entries(NODES)) {
  const lane = laneById.get(n.lane);
  if (!lane) errors.push(`node ${id}: unknown lane "${n.lane}"`);
  else if ((n.row ?? 0) >= (lane.rows ?? 1)) errors.push(`node ${id}: row ${n.row} but lane "${n.lane}" has ${lane.rows ?? 1} row(s)`);
  if (typeof n.col !== 'number') errors.push(`node ${id}: col must be a number`);
  if (!['gate', 'end'].includes(n.kind) && !n.route) errors.push(`node ${id}: missing route`);
  const slot = `${n.lane}/${n.row ?? 0}/${n.col}`;
  if (slots.has(slot)) errors.push(`nodes ${slots.get(slot)} and ${id} share lane/row/col ${slot}`);
  slots.set(slot, id);
}
if (errors.length) fail(errors);

const cardH = (n) => (n.kind === 'gate' ? 110 : n.kind === 'end' ? 60 : 51 + 15 * (n.actions?.length ?? 0));
const ROWS = {};
let cursor = HEADER + 4;
LANES.forEach((lane, li) => {
  const top = cursor;
  const y = [];
  const bottom = [];
  let ry = top + LAYOUT.LANE_PAD_TOP;
  for (let r = 0; r < (lane.rows ?? 1); r++) {
    const inRow = Object.values(NODES).filter((n) => n.lane === lane.id && (n.row ?? 0) === r);
    const h = Math.max(60, ...inRow.map((n) => cardH(n) + (n.dy ?? 0)));
    y.push(ry);
    bottom.push(ry + h);
    ry += h + LAYOUT.ROW_GAP;
  }
  const notesH = 70 + (lane.notes?.length ?? 0) * 15;
  const laneBottom = Math.max(bottom[bottom.length - 1] + LAYOUT.LANE_PAD_BOTTOM, top + notesH);
  ROWS[lane.id] = { index: li, top, bottom: laneBottom, y, rowBottom: bottom };
  cursor = laneBottom + LAYOUT.LANE_GAP;
});
const HEIGHT = Math.ceil(cursor - LAYOUT.LANE_GAP + 34);
const maxCol = Math.max(...Object.values(NODES).map((n) => n.col));
const WIDTH = Math.max(LAYOUT.MIN_WIDTH, Math.ceil(X0 + maxCol * P + W + LAYOUT.RIGHT));

function boxOf(n) {
  const x = X0 + n.col * P;
  const y = ROWS[n.lane].y[n.row ?? 0] + (n.dy ?? 0);
  if (n.kind === 'gate') return { x: x + W / 2 - 100, y, w: 200, h: 110 };
  return { x, y, w: W, h: cardH(n) };
}
const BOX = Object.fromEntries(Object.entries(NODES).map(([id, n]) => [id, boxOf(n)]));

const NORMAL = { T: [0, -1], B: [0, 1], L: [-1, 0], R: [1, 0] };
function anchor(id, side, off = 0) {
  const b = BOX[id];
  const o = NODES[id].kind === 'gate' ? 0 : off;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  if (side === 'T') return [cx + o, b.y];
  if (side === 'B') return [cx + o, b.y + b.h];
  if (side === 'L') return [b.x, cy + o];
  return [b.x + b.w, cy + o];
}

// Layout helper passed to EDGES(L), for routing `via` points through free channels.
const nextLaneTop = (laneId) => {
  const next = LANES[ROWS[laneId].index + 1];
  return next ? ROWS[next.id].y[0] : undefined;
};
const L = {
  WIDTH, HEIGHT,
  col: (c) => X0 + c * P,
  mid: (c) => X0 + c * P + W / 2,
  gapX: (c) => X0 + (c + 1) * P - (P - W) / 2,
  left: X0 - 16,
  right: (track = 0) => WIDTH - LAYOUT.RIGHT + 30 + track * 26,
  laneTop: (lane) => ROWS[lane].top,
  laneBottom: (lane) => ROWS[lane].bottom,
  rowTop: (lane, r = 0) => ROWS[lane].y[r],
  rowBottom: (lane, r = 0) => ROWS[lane].rowBottom[r],
  below: (lane, r = 0, track = 0) => {
    const R = ROWS[lane];
    const next = r + 1 < R.y.length ? R.y[r + 1] : nextLaneTop(lane) ?? R.bottom;
    return (R.rowBottom[r] + next) / 2 + track * 12;
  },
  box: (id) => BOX[id],
  cx: (id) => BOX[id].x + BOX[id].w / 2,
  cy: (id) => BOX[id].y + BOX[id].h / 2,
  anchor,
};
const EDGES = typeof data.EDGES === 'function' ? data.EDGES(L) : data.EDGES;
for (const [id, e] of Object.entries(EDGES)) {
  for (const end of ['from', 'to']) if (!NODES[e[end]]) errors.push(`edge ${id}: unknown ${end} node "${e[end]}"`);
}
FLOWS.forEach((f, i) =>
  f.steps.forEach(([edgeId, actor], k) => {
    if (!EDGES[edgeId]) errors.push(`flow ${i + 1} step ${k + 1}: unknown edge "${edgeId}"`);
    if (!ACTORS[actor]) errors.push(`flow ${i + 1} step ${k + 1}: unknown actor "${actor}"`);
  }),
);
if (errors.length) fail(errors);

// ---------- timeline ----------
let clock = TIMING.overview;
const WINDOWS = FLOWS.map((flow) => {
  const s = clock;
  clock += TIMING.lead + flow.steps.length * TIMING.step + TIMING.hold;
  return { s, e: clock, done: s + TIMING.lead + flow.steps.length * TIMING.step + 0.3 };
});
const T = Math.round(clock * 100) / 100;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n2 = (v) => Math.round(v * 100) / 100;
const k5 = (t) => Math.round((t / T) * 1e5) / 1e5;

/** SMIL <animate> on the shared clock. pts = [[seconds, value], ...]. */
function animate(attr, pts) {
  const out = [];
  for (const [time, value] of pts) {
    let k = Math.round(Math.min(Math.max(time / T, 0), 1) * 1e5) / 1e5;
    if (out.length && k <= out[out.length - 1][0]) {
      if (out[out.length - 1][0] >= 1) continue;
      k = Math.min(out[out.length - 1][0] + 1e-5, 1);
    }
    out.push([k, value]);
  }
  if (out[0][0] !== 0) out.unshift([0, out[0][1]]);
  if (out[out.length - 1][0] !== 1) out.push([1, out[out.length - 1][1]]);
  return `<animate attributeName="${attr}" dur="${T}s" repeatCount="indefinite" keyTimes="${out
    .map(([k]) => k)
    .join(';')}" values="${out.map(([, v]) => v).join(';')}"/>`;
}

// ---------- edge geometry ----------
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const toward = (from, to, d) => {
  const len = dist(from, to) || 1;
  return [from[0] + ((to[0] - from[0]) * d) / len, from[1] + ((to[1] - from[1]) * d) / len];
};
function autoSides(a, b) {
  const A = BOX[a];
  const B = BOX[b];
  const dx = B.x + B.w / 2 - (A.x + A.w / 2);
  const dy = B.y + B.h / 2 - (A.y + A.h / 2);
  if (Math.abs(dy) < 60) return dx > 0 ? ['R', 'L'] : ['L', 'R'];
  return dy > 0 ? ['B', 'T'] : ['T', 'B'];
}
function bezier([a, b, c, d], t) {
  const u = 1 - t;
  const f = (i) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i];
  return [f(0), f(1)];
}
/** Edge geometry: SVG path data, default label point, end point + direction, side gap. */
function geometry(edge) {
  const auto = autoSides(edge.from, edge.to);
  const fs = edge.fromSide ?? auto[0];
  const ts = edge.toSide ?? auto[1];
  const p0 = anchor(edge.from, fs, edge.fromOff);
  const p3 = anchor(edge.to, ts, edge.toOff);
  const segs = [];
  if (edge.via) {
    // Rounded orthogonal route through the via points.
    const pts = [p0, ...edge.via, p3];
    let cur = p0;
    for (let i = 1; i < pts.length - 1; i++) {
      const r = Math.min(14, dist(pts[i - 1], pts[i]) / 2, dist(pts[i], pts[i + 1]) / 2);
      const a = toward(pts[i], pts[i - 1], r);
      const b = toward(pts[i], pts[i + 1], r);
      segs.push({ t: 'L', p: [cur, a] }, { t: 'Q', p: [a, pts[i], b] });
      cur = b;
    }
    segs.push({ t: 'L', p: [cur, p3] });
  } else {
    const k = Math.min(Math.max(dist(p0, p3) * 0.45, 28), 150);
    const [n0, n3] = [NORMAL[fs], NORMAL[ts]];
    segs.push({ t: 'C', p: [p0, [p0[0] + n0[0] * k, p0[1] + n0[1] * k], [p3[0] + n3[0] * k, p3[1] + n3[1] * k], p3] });
  }
  const d =
    `M${n2(p0[0])},${n2(p0[1])}` +
    segs.map((s) => `${s.t}${s.p.slice(1).map((q) => `${n2(q[0])},${n2(q[1])}`).join(' ')}`).join('');
  let label;
  if (edge.via) {
    const longest = segs.filter((s) => s.t === 'L').sort((a, b) => dist(...b.p) - dist(...a.p))[0];
    label = [(longest.p[0][0] + longest.p[1][0]) / 2, (longest.p[0][1] + longest.p[1][1]) / 2];
  } else label = bezier(segs[0].p, 0.5);
  const last = segs[segs.length - 1].p;
  const end = last[last.length - 1];
  const prev = last[last.length - 2];
  const len = dist(prev, end) || 1;
  const sideToSide = (fs === 'R' && ts === 'L') || (fs === 'L' && ts === 'R');
  const gap = !edge.via && sideToSide ? Math.abs(p3[0] - p0[0]) : Infinity;
  return { d, label: edge.labelAt ?? label, end, dir: [(end[0] - prev[0]) / len, (end[1] - prev[1]) / len], gap };
}
const GEO = Object.fromEntries(Object.entries(EDGES).map(([id, e]) => [id, geometry(e)]));

function arrowHead([x, y], [dx, dy], fill, size = 10) {
  const [bx, by] = [x - dx * size, y - dy * size];
  const [px, py] = [-dy * size * 0.5, dx * size * 0.5];
  return `<polygon points="${n2(x)},${n2(y)} ${n2(bx + px)},${n2(by + py)} ${n2(bx - px)},${n2(by - py)}" fill="${fill}"`;
}
function wrap(text, max) {
  const lines = [];
  let cur = '';
  for (const word of String(text).split(' ')) {
    if (cur && `${cur} ${word}`.length > max) {
      lines.push(cur);
      cur = word;
    } else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------- base map ----------
function laneSvg(lane) {
  const R = ROWS[lane.id];
  const h = R.bottom - R.top;
  return (
    `<rect x="8" y="${R.top}" width="${WIDTH - 16}" height="${h}" rx="14" fill="${lane.tint}"/>` +
    `<rect x="8" y="${R.top}" width="176" height="${h}" rx="14" fill="${lane.color}" opacity="0.07"/>` +
    `<text x="24" y="${R.top + 32}" class="lane" style="fill:${lane.color}">${esc(lane.name)}</text>` +
    (lane.notes ?? []).map((t, i) => `<text x="24" y="${R.top + 54 + i * 15}" class="note">${esc(t)}</text>`).join('')
  );
}

function cardSvg(id) {
  const n = NODES[id];
  const b = BOX[id];
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const actions = n.actions ?? [];
  if (n.kind === 'gate') {
    return (
      `<g id="n-${id}"><polygon points="${cx},${b.y} ${b.x + b.w},${cy} ${cx},${b.y + b.h} ${b.x},${cy}" fill="#fff" stroke="${INK}" stroke-width="1.5"/>` +
      `<text x="${cx}" y="${cy - (actions.length ? 9 : -4)}" class="name" text-anchor="middle">${esc(n.name)}</text>` +
      actions.map((a, i) => `<text x="${cx}" y="${cy + 7 + i * 13}" class="act" text-anchor="middle">${esc(a)}</text>`).join('') +
      `</g>`
    );
  }
  if (n.kind === 'end') {
    return (
      `<g id="n-${id}"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.h / 2}" fill="${INK}"/>` +
      `<text x="${cx}" y="${cy + (actions.length ? -3 : 5)}" class="name" style="fill:#fff" text-anchor="middle">${esc(n.name)}</text>` +
      (actions.length ? `<text x="${cx}" y="${cy + 14}" class="act" style="fill:#D9D1C4" text-anchor="middle">${esc(actions[0])}</text>` : '') +
      `</g>`
    );
  }
  const color = laneById.get(n.lane).color;
  const stroke = n.kind === 'service' ? color : BORDER;
  const dash = n.kind === 'modal' ? ' stroke-dasharray="5 4"' : '';
  return (
    `<g id="n-${id}"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10" fill="#fff" stroke="${stroke}" stroke-width="1.2"${dash}/>` +
    `<text x="${b.x + 12}" y="${b.y + 17}" class="route" style="fill:${color}">${esc(n.route)}</text>` +
    `<text x="${b.x + 12}" y="${b.y + 35}" class="name">${esc(n.name)}</text>` +
    actions
      .map(
        (a, i) =>
          `<circle cx="${b.x + 15}" cy="${b.y + 50.5 + i * 15}" r="1.8" fill="${color}"/>` +
          `<text x="${b.x + 22}" y="${b.y + 54 + i * 15}" class="act">${esc(a)}</text>`,
      )
      .join('') +
    `</g>`
  );
}

// ---------- header: chapter pills + legend ----------
const serviceNode = Object.values(NODES).find((n) => n.kind === 'service');
const SERVICE_COLOR = serviceNode ? laneById.get(serviceNode.lane).color : ACTORS.system?.color ?? '#0F8B7E';
const PILL_X = Math.round(Math.max(640, WIDTH * 0.385));
const PILL_W = Math.min(170, Math.floor((WIDTH - 24 - PILL_X) / FLOWS.length) - 6);
const CAPTION_CHARS = Math.floor((PILL_X - 70) / 6.9);
const pillX = (i) => PILL_X + i * (PILL_W + 6);
function pill(i, filled) {
  const full = `${i + 1} · ${FLOWS[i].title}`;
  const max = Math.floor((PILL_W - 14) / 6.6);
  const text = full.length > max ? `${full.slice(0, Math.max(1, max - 1)).trimEnd()}…` : full;
  return (
    `<rect x="${pillX(i)}" y="22" width="${PILL_W}" height="26" rx="13" fill="${filled ? INK : '#fff'}" stroke="${filled ? INK : BORDER}"/>` +
    `<text x="${pillX(i) + PILL_W / 2}" y="39.5" class="pill" style="fill:${filled ? '#fff' : INK}" text-anchor="middle">${esc(text)}</text>`
  );
}
function legendSvg() {
  const x0 = PILL_X + 120;
  const avail = WIDTH - 24 - x0;
  const actors = Object.values(ACTORS);
  const aStep = Math.min(190, avail / actors.length);
  const row = (y, items, step) =>
    items.map(([shape, label], i) => {
      const x = x0 + i * step;
      return `<g transform="translate(${n2(x)} ${y})">${shape}</g><text x="${n2(x + 40)}" y="${y}" class="legend">${esc(label)}</text>`;
    }).join('');
  const actorItems = actors.map((a) => [
    `<line x1="0" y1="-4" x2="28" y2="-4" stroke="${a.color}" stroke-width="3" stroke-linecap="round"/><circle cx="14" cy="-4" r="4.5" fill="${a.color}" stroke="#fff" stroke-width="1.5"/>`,
    a.label,
  ]);
  const shapes = [
    [`<rect x="0" y="-12" width="30" height="20" rx="4" fill="#fff" stroke="${BORDER}"/>`, 'Page (route + actions)'],
    [`<rect x="0" y="-12" width="30" height="20" rx="4" fill="#fff" stroke="${BORDER}" stroke-dasharray="4 3"/>`, 'Dialog on a page'],
    [`<rect x="0" y="-12" width="30" height="20" rx="4" fill="#fff" stroke="${SERVICE_COLOR}"/>`, 'Service (no UI)'],
    [`<polygon points="15,-14 32,-2 15,10 -2,-2" fill="#fff" stroke="${INK}" stroke-width="1.3"/>`, 'Gate / decision'],
    [`<rect x="0" y="-11" width="30" height="18" rx="9" fill="${INK}"/>`, 'End state'],
  ];
  const lines = [
    [`<line x1="0" y1="-4" x2="28" y2="-4" stroke="${LINE}" stroke-width="1.4"/>`, 'Every possible move'],
    [`<line x1="0" y1="-4" x2="28" y2="-4" stroke="${INK}" stroke-width="3"/>`, 'Flow playing now (numbered)'],
    [`<line x1="0" y1="-4" x2="28" y2="-4" stroke="${INK}" stroke-width="2.5" stroke-dasharray="6 5"/>`, 'Failure branch'],
  ];
  return (
    `<text x="${PILL_X}" y="80" class="legend-h">Who acts</text>${row(80, actorItems, aStep)}` +
    `<text x="${PILL_X}" y="116" class="legend-h">Shapes</text>${row(116, shapes, Math.min(190, avail / shapes.length))}` +
    `<text x="${PILL_X}" y="152" class="legend-h">Lines</text>${row(152, lines, Math.min(250, avail / lines.length))}`
  );
}

// ---------- tour ----------
const stepTimes = (w, k) => {
  const a = w.s + TIMING.lead + k * TIMING.step;
  return { a, b: a + TIMING.step * 0.85 };
};
function labelSvg([x, y], num, text, color, gap) {
  const lines = wrap(text, Number.isFinite(gap) ? Math.floor((gap - 36) / CHAR_W) : 18);
  const w = Math.max(...lines.map((l) => l.length)) * CHAR_W + 34;
  const h = 8 + lines.length * 12.5;
  const left = x - w / 2;
  return (
    `<rect x="${n2(left)}" y="${n2(y - h / 2)}" width="${n2(w)}" height="${h}" rx="9" fill="#fff" stroke="${color}" stroke-width="1.3"/>` +
    `<circle cx="${n2(left + 11)}" cy="${n2(y)}" r="8" fill="${color}"/>` +
    `<text x="${n2(left + 11)}" y="${n2(y + 3.4)}" class="num" text-anchor="middle">${num}</text>` +
    lines.map((l, j) => `<text x="${n2(left + 24)}" y="${n2(y - h / 2 + 14 + j * 12.5)}" class="lbl">${esc(l)}</text>`).join('')
  );
}

function flowSvg(flow, i) {
  const w = WINDOWS[i];
  const { fade } = TIMING;
  const win = animate('opacity', [[w.s - fade, 0], [w.s, 1], [w.e - fade, 1], [w.e, 0]]);
  const reach = new Map(); // node -> [time it lights up, ring colour]
  flow.steps.forEach(([edgeId, actor], k) => {
    const { a, b } = stepTimes(w, k);
    const e = EDGES[edgeId];
    if (!reach.has(e.from)) reach.set(e.from, [k === 0 ? w.s + 0.2 : a, ACTORS[actor].color]);
    if (!reach.has(e.to)) reach.set(e.to, [b, ACTORS[actor].color]);
  });
  let edges = '';
  let dots = '';
  let labels = '';
  flow.steps.forEach(([edgeId, actor, text, opts], k) => {
    const { a, b } = stepTimes(w, k);
    const g = GEO[edgeId];
    const color = ACTORS[actor].color;
    const pid = `f${i}s${k}`;
    edges += EDGES[edgeId].alt
      ? `<path id="${pid}" d="${g.d}" fill="none" stroke="${color}" stroke-width="2.6" stroke-dasharray="7 5" opacity="0">${animate('opacity', [[a, 0], [a + 0.25, 1]])}</path>`
      : `<path id="${pid}" d="${g.d}" pathLength="1" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="1 2" stroke-dashoffset="1.05">${animate('stroke-dashoffset', [[a, 1.05], [b, 0]])}</path>`;
    edges += `${arrowHead(g.end, g.dir, color, 11)} opacity="0">${animate('opacity', [[b, 0], [b + 0.1, 1]])}</polygon>`;
    dots +=
      `<circle r="6.5" fill="${color}" stroke="#fff" stroke-width="2" opacity="0">${animate('opacity', [[a, 0], [a + 0.05, 1], [b, 1], [b + 0.2, 0]])}` +
      `<animateMotion dur="${T}s" repeatCount="indefinite" calcMode="linear" keyPoints="0;0;1;1" keyTimes="0;${k5(a)};${k5(b)};1">` +
      `<mpath href="#${pid}" xlink:href="#${pid}"/></animateMotion></circle>`;
    const at = opts?.labelAt ?? g.label;
    labels += `<g opacity="0">${animate('opacity', [[a, 0], [a + 0.2, 1]])}${labelSvg(at, k + 1, text, color, opts?.labelAt ? Infinity : g.gap)}</g>`;
  });
  let nodes = '';
  for (const [id, [t, color]] of reach) {
    const b = BOX[id];
    const kind = NODES[id].kind;
    const ring =
      kind === 'gate'
        ? `<polygon points="${b.x + 100},${b.y - 5} ${b.x + b.w + 8},${b.y + 55} ${b.x + 100},${b.y + b.h + 5} ${b.x - 8},${b.y + 55}" fill="none" stroke="${color}" stroke-width="2.6"/>`
        : `<rect x="${b.x - 3.5}" y="${b.y - 3.5}" width="${b.w + 7}" height="${b.h + 7}" rx="${kind === 'end' ? b.h / 2 + 3.5 : 13}" fill="none" stroke="${color}" stroke-width="2.6"/>`;
    nodes += `<g opacity="0">${animate('opacity', [[t, 0], [t + 0.25, 1]])}<use href="#n-${id}" xlink:href="#n-${id}"/>${ring}</g>`;
  }
  const desc = wrap(flow.desc ?? '', CAPTION_CHARS);
  if (desc.length > 2) console.warn(`warning: flow ${i + 1} description wraps to ${desc.length} lines; keep it to 2`);
  const caption =
    `<rect x="16" y="84" width="${PILL_X - 24}" height="106" fill="${BG}"/>` +
    `<text x="24" y="108" class="cap1">${i + 1} / ${FLOWS.length} · ${esc(flow.title)}</text>` +
    `<text x="24" y="130" class="cap2">${esc(flow.who ?? '')}</text>` +
    desc.map((l, j) => `<text x="24" y="${151 + j * 17}" class="cap3">${esc(l)}</text>`).join('') +
    `<rect x="24" y="183" height="3" rx="1.5" width="0" fill="${INK}">${animate('width', [[w.s, 0], [w.e, PILL_X - 60]])}</rect>` +
    pill(i, true);
  return `<g class="tour" opacity="0">${win}${caption}${edges}${nodes}${dots}${labels}</g>`;
}

// ---------- assemble ----------
const baseEdges = Object.values(GEO)
  .map((g) => `<path d="${g.d}" fill="none" stroke="${LINE}" stroke-width="1.4" marker-end="url(#arr)"/>`)
  .join('');
const screens = Object.values(NODES).filter((n) => !['gate', 'end'].includes(n.kind)).length;
const veil =
  `<rect class="tour" x="186" y="${HEADER + 2}" width="${WIDTH - 194}" height="${HEIGHT - HEADER - 34}" fill="${BG}" opacity="0">` +
  `${animate('opacity', [[TIMING.overview - TIMING.fade, 0], [TIMING.overview, 0.8], [T - TIMING.fade, 0.8], [T, 0]])}</rect>`;
const times = FLOWS.map((f, i) => ({ title: f.title, start: n2(WINDOWS[i].s), end: n2(WINDOWS[i].e), done: n2(WINDOWS[i].done) }));
const title = META.title ?? 'User flow map';
const subtitle = META.subtitle ?? 'Every screen (box), every action on it (bullets), every user type (line colour).';
const footer = META.footer ?? `Data: ${dataArg}`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="t d" data-flow-times="${esc(JSON.stringify(times))}" data-caption-max="${PILL_X - 16}" data-header="${HEADER}">
<title id="t">${esc(title)}</title>
<desc id="d">Swimlane user flow map. Lanes: ${esc(LANES.map((l) => l.name).join(', '))}. ${FLOWS.length} flows play in turn: ${esc(FLOWS.map((f) => f.title).join(', '))}.</desc>
<style>
svg{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.title{font-size:26px;font-weight:700;fill:${INK}}.sub{font-size:12.5px;fill:${MUTED}}
.lane{font-size:17px;font-weight:700}.note{font-size:11px;fill:${MUTED}}
.route{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10.5px}
.name{font-size:13px;font-weight:700;fill:${INK}}.act{font-size:11px;fill:#3D362F}
.pill{font-size:11.5px;font-weight:600}.legend{font-size:11.5px;fill:#3D362F}.legend-h{font-size:11.5px;font-weight:700;fill:${INK}}
.cap1{font-size:20px;font-weight:700;fill:${INK}}.cap2{font-size:13px;font-weight:600;fill:${MUTED}}.cap3{font-size:13px;fill:#3D362F}
.lbl{font-size:10.5px;font-weight:600;fill:${INK}}.num{font-size:9.5px;font-weight:700;fill:#fff}.foot{font-size:11px;fill:${MUTED}}
@media (prefers-reduced-motion: reduce){.tour{display:none}}
</style>
<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="${LINE}"/></marker></defs>
<rect width="${WIDTH}" height="${HEIGHT}" fill="${BG}"/>
<text x="24" y="46" class="title">${esc(title)}</text>
<text x="24" y="70" class="sub">${esc(subtitle)}</text>
<text x="24" y="108" class="cap1">Overview · ${FLOWS.length} flows · ${screens} screens and services</text>
<text x="24" y="130" class="cap2">Each flow plays in turn. Numbered steps follow the moving dot.</text>
<text x="24" y="151" class="cap3">Gray lines: every possible move. Bullets: the actions on that page. Full cycle: ${Math.round(T)} s.</text>
${FLOWS.map((_, i) => pill(i, false)).join('')}
${legendSvg()}
${LANES.map(laneSvg).join('')}
${baseEdges}
${Object.keys(NODES).map(cardSvg).join('')}
${veil}
${FLOWS.map(flowSvg).join('\n')}
<text x="24" y="${HEIGHT - 12}" class="foot">${esc(footer)}</text>
</svg>
`;

const out = resolve(outArg);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, svg);
console.log(`Wrote ${out}: ${WIDTH}x${HEIGHT}, ${(svg.length / 1024).toFixed(0)} KB, ${FLOWS.length} flows, ${T}s cycle`);
for (const t of times) console.log(`  ${t.title}: plays ${t.start}-${t.end}s, fully drawn at ${t.done}s`);

function fail(list) {
  console.error(`Cannot render. Fix the data file:\n  ${list.join('\n  ')}`);
  process.exit(1);
}
