// Load a flows data module, validate it, and lay out the full map.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { anchorOf, edgeGeometry } from './geometry.mjs';

/** Thrown when the data file has errors; `list` holds one message per error. */
export class DataError extends Error {
  constructor(list) {
    super(`Cannot render. Fix the data file:\n  ${list.join('\n  ')}`);
    this.list = list;
  }
}

export const cardH = (n) => (n.kind === 'gate' ? 110 : n.kind === 'end' ? 60 : 51 + 15 * (n.actions?.length ?? 0));

export async function loadModel(dataPath) {
  const data = await import(pathToFileURL(resolve(dataPath)).href);
  const { LANES, ACTORS, NODES, FLOWS } = data;
  const META = data.META ?? {};
  const LAYOUT = {
    X0: 220, P: 300, W: 196, HEADER: 192, ROW_GAP: 48, LANE_PAD_TOP: 18, LANE_PAD_BOTTOM: 40, LANE_GAP: 8, RIGHT: 90,
    MIN_WIDTH: 1760, // keeps room for the header legend on small maps
    ...(data.LAYOUT ?? {}),
  };
  const TIMING = { overview: 5, lead: 0.6, step: 0.7, hold: 2.6, fade: 0.35, ...(data.TIMING ?? {}) };
  const { X0, P, W, HEADER } = LAYOUT;

  // ---------- validate nodes, then lay out lanes and rows ----------
  const errors = [];
  const laneById = new Map(LANES.map((l) => [l.id, l]));
  const slots = new Map();
  for (const [id, n] of Object.entries(NODES)) {
    const lane = laneById.get(n.lane);
    if (!lane) errors.push(`node ${id}: unknown lane "${n.lane}"`);
    else if (!Number.isInteger(n.row ?? 0) || (n.row ?? 0) < 0 || (n.row ?? 0) >= (lane.rows ?? 1))
      errors.push(`node ${id}: row must be an integer from 0 to ${(lane.rows ?? 1) - 1} (lane "${n.lane}"), got ${n.row}`);
    if (typeof n.col !== 'number') errors.push(`node ${id}: col must be a number`);
    if (!['gate', 'end'].includes(n.kind) && !n.route) errors.push(`node ${id}: missing route`);
    const slot = `${n.lane}/${n.row ?? 0}/${n.col}`;
    if (slots.has(slot)) errors.push(`nodes ${slots.get(slot)} and ${id} share lane/row/col ${slot}`);
    slots.set(slot, id);
  }
  if (errors.length) throw new DataError(errors);

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

  const boxOf = (n) => {
    const x = X0 + n.col * P;
    const y = ROWS[n.lane].y[n.row ?? 0] + (n.dy ?? 0);
    if (n.kind === 'gate') return { x: x + W / 2 - 100, y, w: 200, h: 110 };
    return { x, y, w: W, h: cardH(n) };
  };
  const BOX = Object.fromEntries(Object.entries(NODES).map(([id, n]) => [id, boxOf(n)]));
  const anchor = (id, side, off = 0) => anchorOf(BOX[id], NODES[id].kind, side, off);

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
  if (errors.length) throw new DataError(errors);
  const usedEdges = new Set(FLOWS.flatMap((f) => f.steps.map(([edgeId]) => edgeId)));
  const unused = Object.keys(EDGES).filter((id) => !usedEdges.has(id));
  if (unused.length) console.warn(`warning: no flow uses these edges, so they show only as gray lines: ${unused.join(', ')}`);

  const GEO = Object.fromEntries(
    Object.entries(EDGES).map(([id, e]) => [id, edgeGeometry(e, BOX[e.from], BOX[e.to], NODES[e.from].kind, NODES[e.to].kind)]),
  );

  return { data, META, LAYOUT, TIMING, LANES, ACTORS, NODES, FLOWS, EDGES, laneById, ROWS, BOX, WIDTH, HEIGHT, GEO, L };
}
