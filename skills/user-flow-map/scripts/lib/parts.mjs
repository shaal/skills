// SVG markup shared by the animated SVG and the HTML viewer, so the two cannot drift.
import { n2 } from './geometry.mjs';

export const INK = '#2C2620';
export const MUTED = '#6B6259';
export const LINE = '#B8B0A3';
export const BG = '#FAFAF7';
export const BORDER = '#D9D1C4';
export const CHAR_W = 6.5; // label width estimate, generous for SF Pro / Segoe UI / Inter at 10.5px semibold

export const FONT_STACK = 'Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
/** Text classes used inside cards, lanes and labels. */
export const CSS = {
  lane: `.lane{font-size:17px;font-weight:700}.note{font-size:11px;fill:${MUTED}}`,
  route: '.route{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10.5px}',
  card: `.name{font-size:13px;font-weight:700;fill:${INK}}.act{font-size:11px;fill:#3D362F}`,
  label: `.lbl{font-size:10.5px;font-weight:600;fill:${INK}}.num{font-size:9.5px;font-weight:700;fill:#fff}`,
};

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function wrap(text, max) {
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

/**
 * One node's markup at `box`. With `id`, the group gets id="n-<id>"; the HTML
 * viewer passes a box at the origin and no id, and positions a wrapper instead.
 */
export function cardSvg(node, box, laneColor, id) {
  const b = box;
  const open = id ? `<g id="n-${id}">` : '<g>';
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const actions = node.actions ?? [];
  if (node.kind === 'gate') {
    return (
      `${open}<polygon points="${cx},${b.y} ${b.x + b.w},${cy} ${cx},${b.y + b.h} ${b.x},${cy}" fill="#fff" stroke="${INK}" stroke-width="1.5"/>` +
      `<text x="${cx}" y="${cy - (actions.length ? 9 : -4)}" class="name" text-anchor="middle">${esc(node.name)}</text>` +
      actions.map((a, i) => `<text x="${cx}" y="${cy + 7 + i * 13}" class="act" text-anchor="middle">${esc(a)}</text>`).join('') +
      `</g>`
    );
  }
  if (node.kind === 'end') {
    return (
      `${open}<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.h / 2}" fill="${INK}"/>` +
      `<text x="${cx}" y="${cy + (actions.length ? -3 : 5)}" class="name" style="fill:#fff" text-anchor="middle">${esc(node.name)}</text>` +
      (actions.length ? `<text x="${cx}" y="${cy + 14}" class="act" style="fill:#D9D1C4" text-anchor="middle">${esc(actions[0])}</text>` : '') +
      `</g>`
    );
  }
  const stroke = node.kind === 'service' ? laneColor : BORDER;
  const dash = node.kind === 'modal' ? ' stroke-dasharray="5 4"' : '';
  return (
    `${open}<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10" fill="#fff" stroke="${stroke}" stroke-width="1.2"${dash}/>` +
    `<text x="${b.x + 12}" y="${b.y + 17}" class="route" style="fill:${laneColor}">${esc(node.route)}</text>` +
    `<text x="${b.x + 12}" y="${b.y + 35}" class="name">${esc(node.name)}</text>` +
    actions
      .map(
        (a, i) =>
          `<circle cx="${b.x + 15}" cy="${b.y + 50.5 + i * 15}" r="1.8" fill="${laneColor}"/>` +
          `<text x="${b.x + 22}" y="${b.y + 54 + i * 15}" class="act">${esc(a)}</text>`,
      )
      .join('') +
    `</g>`
  );
}

/** Highlight ring around a node, for the box at `b`. */
export function ringSvg(kind, b, color) {
  return kind === 'gate'
    ? `<polygon points="${b.x + 100},${b.y - 5} ${b.x + b.w + 8},${b.y + 55} ${b.x + 100},${b.y + b.h + 5} ${b.x - 8},${b.y + 55}" fill="none" stroke="${color}" stroke-width="2.6"/>`
    : `<rect x="${b.x - 3.5}" y="${b.y - 3.5}" width="${b.w + 7}" height="${b.h + 7}" rx="${kind === 'end' ? b.h / 2 + 3.5 : 13}" fill="none" stroke="${color}" stroke-width="2.6"/>`;
}

/** Label pill size. Side-to-side edges wrap to fit the gap between the cards. */
export function labelLayout(text, gap, maxChars = 18) {
  const lines = wrap(text, Number.isFinite(gap) ? Math.floor((gap - 36) / CHAR_W) : maxChars);
  // +38: number circle and padding, plus 4 so short words with wide letters ("Team") still fit in Safari.
  return { lines, w: Math.max(...lines.map((l) => l.length)) * CHAR_W + 38, h: 8 + lines.length * 12.5 };
}

/** Numbered label pill centred at [x, y]. num "!" marks a failure branch. */
export function labelSvg([x, y], num, text, color, gap, maxChars) {
  const { lines, w, h } = labelLayout(text, gap, maxChars);
  const left = x - w / 2;
  return (
    `<rect x="${n2(left)}" y="${n2(y - h / 2)}" width="${n2(w)}" height="${h}" rx="9" fill="#fff" stroke="${color}" stroke-width="1.3"/>` +
    (num === '!'
      ? `<circle cx="${n2(left + 11)}" cy="${n2(y)}" r="7.3" fill="#fff" stroke="${color}" stroke-width="1.5"/>` +
        `<text x="${n2(left + 11)}" y="${n2(y + 3.6)}" class="num" style="fill:${color}" text-anchor="middle">!</text>`
      : `<circle cx="${n2(left + 11)}" cy="${n2(y)}" r="8" fill="${color}"/>` +
        `<text x="${n2(left + 11)}" y="${n2(y + 3.4)}" class="num" text-anchor="middle">${num}</text>`) +
    lines.map((l, j) => `<text x="${n2(left + 24)}" y="${n2(y - h / 2 + 14 + j * 12.5)}" class="lbl">${esc(l)}</text>`).join('')
  );
}

/** Opening tag of an arrowhead polygon; the caller adds attributes and closes it. */
export function arrowHead([x, y], [dx, dy], fill, size = 10) {
  const [bx, by] = [x - dx * size, y - dy * size];
  const [px, py] = [-dy * size * 0.5, dx * size * 0.5];
  return `<polygon points="${n2(x)},${n2(y)} ${n2(bx + px)},${n2(by + py)} ${n2(bx - px)},${n2(by - py)}" fill="${fill}"`;
}

/** Step marks for a flow: failure branches get "!" and do not take a number. */
export function stepMarks(flow, edges) {
  let num = 0;
  return flow.steps.map(([edgeId]) => (edges[edgeId].alt ? '!' : String(++num)));
}
