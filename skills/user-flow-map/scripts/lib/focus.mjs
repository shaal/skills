// Focus layouts for the HTML viewer: only the boxes a flow uses, with the gaps removed.
//   column  - one box per row in step order (phones held upright). A box the flow
//             returns to appears again, marked as a repeat, so every arrow is a
//             short vertical drop with its label in the gap.
//   compact - the swimlane without empty columns and rows (wider screens). Edges
//             are routed through free channels and labels placed automatically.
import { dist, edgeGeometry, inside, overlaps, samplePath } from './geometry.mjs';
import { labelLayout } from './parts.mjs';

const COL = { M: 30, TAG: 18, GAP: 92, WIDTH: 200 };

/** Union of boxes. */
export const unionBox = (boxes) => {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
};
const pillBox = ([x, y], size) => ({ x: x - size.w / 2, y: y - size.h / 2, w: size.w, h: size.h });

export function columnLayout(model, flow) {
  const { EDGES, BOX } = model;
  const items = [];
  const seen = new Set();
  const jumps = [];
  const steps = [];
  const push = (node) => {
    const b = BOX[node];
    const y = items.length ? items[items.length - 1].y + items[items.length - 1].h + COL.GAP : COL.M + COL.TAG;
    items.push({ node, x: COL.M + (COL.WIDTH - b.w) / 2, y, w: b.w, h: b.h, repeat: seen.has(node) });
    seen.add(node);
  };
  flow.steps.forEach(([edgeId, , text]) => {
    const { from, to } = EDGES[edgeId];
    if (!items.length || items[items.length - 1].node !== from) {
      if (items.length) jumps.push(items.length - 1);
      push(from);
    }
    push(to);
    const a = items[items.length - 2];
    const b = items[items.length - 1];
    const x = COL.M + COL.WIDTH / 2;
    const y1 = a.y + a.h;
    const y2 = b.y;
    const size = labelLayout(text, Infinity, 30);
    const at = [x, (y1 + y2) / 2 - COL.TAG / 2 + 2];
    steps.push({ d: `M${x},${y1}L${x},${y2}`, end: [x, y2], dir: [0, 1], label: at, lbox: pillBox(at, size), labelChars: 30, from: items.length - 2, to: items.length - 1 });
  });
  const x = COL.M + COL.WIDTH / 2;
  const jumpPaths = jumps.map((i) => `M${x},${items[i].y + items[i].h}L${x},${items[i + 1].y}`);
  const last = items[items.length - 1];
  return { kind: 'column', w: COL.WIDTH + 2 * COL.M, h: last.y + last.h + COL.M, items, steps, jumps: jumpPaths, tagOffset: COL.TAG };
}

export function compactLayout(model, flow) {
  const { EDGES, NODES, BOX, LANES, LAYOUT } = model;
  const P = LAYOUT.P;
  const W = LAYOUT.W;
  const X0 = 30;
  const active = [...new Set(flow.steps.flatMap(([e]) => [EDGES[e].from, EDGES[e].to]))];
  // Columns come from the cards; a gate sits between its neighbours (col 1.5 -> between
  // the compacted columns of 1 and 2) unless it would overlap a card in its row.
  const cols = [...new Set(active.filter((id) => NODES[id].kind !== 'gate').map((id) => NODES[id].col))].sort((a, b) => a - b);
  const colIndex = new Map(cols.map((c, i) => [c, i]));
  const gateIndex = (c) => {
    const lo = cols.filter((x) => x <= c).length - 1;
    if (cols[lo] === c) return lo;
    return lo < 0 ? -0.5 : lo === cols.length - 1 ? lo + 0.5 : lo + 0.5;
  };
  for (const id of active.filter((i) => NODES[i].kind === 'gate')) colIndex.set(id, gateIndex(NODES[id].col));

  // Lanes and rows that hold active nodes, top to bottom.
  const rows = []; // { lane, row, y, bottom }
  const lanes = []; // { id, top, bottom }
  let cursor = 0;
  for (const lane of LANES) {
    const laneRows = [...new Set(active.filter((id) => NODES[id].lane === lane.id).map((id) => NODES[id].row ?? 0))].sort((a, b) => a - b);
    if (!laneRows.length) continue;
    const top = cursor;
    let y = top + 40;
    for (const r of laneRows) {
      const h = Math.max(...active.filter((id) => NODES[id].lane === lane.id && (NODES[id].row ?? 0) === r).map((id) => BOX[id].h));
      rows.push({ lane: lane.id, row: r, y, bottom: y + h });
      y += h + 64;
    }
    const bottom = y - 64 + 40;
    lanes.push({ id: lane.id, top, bottom });
    cursor = bottom + 8;
  }
  const rowOf = (id) => rows.findIndex((r) => r.lane === NODES[id].lane && r.row === (NODES[id].row ?? 0));
  const pos = {};
  const boxes = {};
  for (const id of active) {
    const r = rows[rowOf(id)];
    const x = X0 + (NODES[id].kind === 'gate' ? colIndex.get(id) : colIndex.get(NODES[id].col)) * P;
    const b = BOX[id];
    boxes[id] = NODES[id].kind === 'gate' ? { x: x + W / 2 - 100, y: r.y, w: b.w, h: b.h } : { x, y: r.y, w: b.w, h: b.h };
    pos[id] = [boxes[id].x, boxes[id].y];
  }
  // A gate placed between columns must not overlap a card in its row; if it does, shift it to a free side.
  for (const id of active.filter((i) => NODES[i].kind === 'gate')) {
    const clash = () => active.some((o) => o !== id && overlaps(boxes[id], boxes[o], 0));
    for (const dx of [0, P / 2, -P / 2, P, -P]) {
      boxes[id] = { ...boxes[id], x: boxes[id].x + dx };
      if (!clash()) break;
      boxes[id] = { ...boxes[id], x: boxes[id].x - dx };
    }
    pos[id] = [boxes[id].x, boxes[id].y];
  }
  const minX = Math.min(...active.map((id) => boxes[id].x));
  if (minX < X0) for (const id of active) { boxes[id] = { ...boxes[id], x: boxes[id].x + X0 - minX }; pos[id] = [boxes[id].x, boxes[id].y]; }
  const width = Math.max(...active.map((id) => boxes[id].x + boxes[id].w)) + X0;
  const height = cursor - 8;

  // Channels: horizontal runs between rows, vertical runs between columns.
  const below = (ri) => (ri + 1 < rows.length ? (rows[ri].bottom + rows[ri + 1].y) / 2 : rows[ri].bottom + 22);
  const above = (ri) => (ri > 0 ? (rows[ri - 1].bottom + rows[ri].y) / 2 : rows[ri].y - 22);
  const gapLeft = (c) => X0 + c * P - (P - W) / 2;
  const used = new Map();
  const track = (key, base) => {
    const n = used.get(key) ?? 0;
    used.set(key, n + 1);
    return base + (n === 0 ? 0 : (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 10);
  };
  const hits = (segs, ends) => {
    const others = active.filter((id) => !ends.includes(id)).map((id) => boxes[id]);
    return samplePath(segs, 30).filter((p) => others.some((b) => inside(p, b, 2))).length;
  };
  const geomOf = (e) => edgeGeometry(e, boxes[e.from], boxes[e.to], NODES[e.from].kind, NODES[e.to].kind);

  const routes = {};
  const routeStats = [];
  // Edges that join the same two boxes (either direction) are spread 28 units apart.
  const flowEdges = [...new Set(flow.steps.map(([e]) => e))];
  const pairKey = (e) => [EDGES[e].from, EDGES[e].to].sort().join('|');
  const spread = {};
  for (const e of flowEdges) {
    const group = flowEdges.filter((o) => pairKey(o) === pairKey(e));
    spread[e] = (group.indexOf(e) - (group.length - 1) / 2) * 28;
  }
  for (const edgeId of flowEdges) {
    const src = EDGES[edgeId];
    const off = spread[edgeId];
    const base = { from: src.from, to: src.to, alt: src.alt, fromOff: off, toOff: off };
    const A = boxes[src.from];
    const B = boxes[src.to];
    const ra = rowOf(src.from);
    const rb = rowOf(src.to);
    const ax = A.x + A.w / 2 + off;
    const bx = B.x + B.w / 2 + off;
    const cands = [{ ...base }];
    if (ra === rb) {
      cands.push({ ...base, fromSide: 'B', toSide: 'B', via: [[ax, track(`b${ra}`, below(ra))], [bx, track(`b${ra}`, below(ra))]] });
      cands.push({ ...base, fromSide: 'T', toSide: 'T', via: [[ax, track(`a${ra}`, above(ra))], [bx, track(`a${ra}`, above(ra))]] });
    } else {
      const down = rb > ra;
      const y1 = down ? below(ra) : above(ra);
      const y2 = down ? above(rb) : below(rb);
      const [fs, ts] = down ? ['B', 'T'] : ['T', 'B'];
      const colOf = (id) => Math.round((boxes[id].x + boxes[id].w / 2 - W / 2 - X0) / P);
      const cb = colOf(src.to);
      const ca = colOf(src.from);
      const gB = bx > ax ? gapLeft(cb) : gapLeft(cb + 1);
      const gA = bx > ax ? gapLeft(ca + 1) : gapLeft(ca);
      const t1 = track(`h${y1}`, y1);
      cands.push({ ...base, fromSide: fs, toSide: ts, via: [[ax, t1], [bx, t1]] });
      cands.push({ ...base, fromSide: fs, toSide: ts, via: [[ax, t1], [gB, t1], [gB, y2], [bx, y2]] });
      cands.push({ ...base, fromSide: fs, toSide: ts, via: [[ax, t1], [gA, t1], [gA, y2], [bx, y2]] });
    }
    let best;
    for (const c of cands) {
      const g = geomOf(c);
      const h = hits(g.segs, [src.from, src.to]);
      if (!best || h < best.h) best = { g, h };
      if (h === 0) break;
    }
    routes[edgeId] = best.g;
    if (best.h) routeStats.push(`${edgeId} crosses a card`);
  }

  // Labels: walk along the path until the pill clears every card and earlier label.
  const placed = [];
  const steps = flow.steps.map(([edgeId, , text]) => {
    const g = routes[edgeId];
    const size = labelLayout(text, g.gap, 26);
    const pts = samplePath(g.segs, 40);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    const at = (f) => pts[Math.max(0, cum.findIndex((c) => c >= f * cum[cum.length - 1]))];
    // Try points on the line first, then beside it (pill edge 6 units from the line).
    const cands = [];
    for (const f of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82]) cands.push(at(f));
    for (const f of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      const [x, y] = at(f);
      cands.push([x + size.w / 2 + 6, y], [x - size.w / 2 - 6, y], [x, y - size.h / 2 - 6], [x, y + size.h / 2 + 6]);
    }
    let best;
    for (const point of cands) {
      const box = pillBox(point, size);
      const bad =
        active.filter((id) => overlaps(box, boxes[id], 2)).length + placed.filter((p) => overlaps(box, p, 0)).length +
        (box.x < 0 || box.x + box.w > width || box.y < 0 || box.y + box.h > height ? 1 : 0);
      if (!best || bad < best.bad) best = { box, point, bad };
      if (!bad) break;
    }
    placed.push(best.box);
    if (best.bad) routeStats.push(`label "${text}" could not find a clear spot`);
    return { d: g.d, end: g.end, dir: g.dir, label: best.point, lbox: best.box, gap: g.gap, labelChars: 26 };
  });
  return { kind: 'compact', w: width, h: height, lanes, pos, boxes, steps, issues: routeStats };
}

