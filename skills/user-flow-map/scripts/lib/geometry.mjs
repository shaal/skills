// Pure geometry shared by every layout: anchors, edge paths, label points, sampling.

export const NORMAL = { T: [0, -1], B: [0, 1], L: [-1, 0], R: [1, 0] };

export const n2 = (v) => Math.round(v * 100) / 100;
export const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const toward = (from, to, d) => {
  const len = dist(from, to) || 1;
  return [from[0] + ((to[0] - from[0]) * d) / len, from[1] + ((to[1] - from[1]) * d) / len];
};

export function bezier([a, b, c, d], t) {
  const u = 1 - t;
  const f = (i) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i];
  return [f(0), f(1)];
}

/** Point on a side of a box. Gates attach at their tips, so offsets do not apply. */
export function anchorOf(box, kind, side, off = 0) {
  const o = kind === 'gate' ? 0 : off;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  if (side === 'T') return [cx + o, box.y];
  if (side === 'B') return [cx + o, box.y + box.h];
  if (side === 'L') return [box.x, cy + o];
  return [box.x + box.w, cy + o];
}

/** Default sides: side to side within a row, bottom to top between rows. */
export function autoSides(A, B) {
  const dx = B.x + B.w / 2 - (A.x + A.w / 2);
  const dy = B.y + B.h / 2 - (A.y + A.h / 2);
  if (Math.abs(dy) < 60) return dx > 0 ? ['R', 'L'] : ['L', 'R'];
  return dy > 0 ? ['B', 'T'] : ['T', 'B'];
}

/**
 * Edge geometry between two boxes: SVG path data, default label point, end
 * point and direction (for the arrowhead), the gap between side-to-side
 * cards (for label wrapping), and the segments (for sampling).
 */
export function edgeGeometry(edge, A, B, kindA, kindB) {
  const auto = autoSides(A, B);
  const fs = edge.fromSide ?? auto[0];
  const ts = edge.toSide ?? auto[1];
  const p0 = anchorOf(A, kindA, fs, edge.fromOff);
  const p3 = anchorOf(B, kindB, ts, edge.toOff);
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
  return { d, label: edge.labelAt ?? label, end, dir: [(end[0] - prev[0]) / len, (end[1] - prev[1]) / len], gap, segs };
}

/** Points along a path, for collision tests and label placement. */
export function samplePath(segs, perSeg = 24) {
  const out = [];
  for (const s of segs) {
    for (let i = 0; i <= perSeg; i++) {
      const t = i / perSeg;
      if (s.t === 'L') out.push([s.p[0][0] + (s.p[1][0] - s.p[0][0]) * t, s.p[0][1] + (s.p[1][1] - s.p[0][1]) * t]);
      else if (s.t === 'Q') {
        const u = 1 - t;
        const [a, c, b] = s.p;
        out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
      } else out.push(bezier(s.p, t));
    }
  }
  return out;
}

/** True when the point is inside the box shrunk by `inset` on every side. */
export const inside = ([x, y], b, inset = 0) =>
  x > b.x + inset && x < b.x + b.w - inset && y > b.y + inset && y < b.y + b.h - inset;

/** True when two boxes overlap by more than `slack` in both directions. */
export const overlaps = (a, b, slack = 0) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > slack && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > slack;
