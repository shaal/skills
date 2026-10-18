// The animated SVG: full map plus a SMIL tour that plays each flow in turn.
// No script, no external assets, one shared clock (dur = T), so it animates as
// a file, in an <img>, and on GitHub, and a viewer can scrub it with setCurrentTime().
import { n2 } from './geometry.mjs';
import { BG, BORDER, CSS, FONT_STACK, INK, LINE, MUTED, arrowHead, cardSvg, esc, labelSvg, ringSvg, stepMarks, wrap } from './parts.mjs';

export function renderSvg(model, dataArg) {
  const { META, LAYOUT, TIMING, LANES, ACTORS, NODES, FLOWS, EDGES, laneById, ROWS, BOX, WIDTH, HEIGHT, GEO } = model;
  const { HEADER } = LAYOUT;

  // ---------- timeline ----------
  let clock = TIMING.overview;
  const WINDOWS = FLOWS.map((flow) => {
    const s = clock;
    clock += TIMING.lead + flow.steps.length * TIMING.step + TIMING.hold;
    return { s, e: clock, done: s + TIMING.lead + flow.steps.length * TIMING.step + 0.3 };
  });
  const T = Math.round(clock * 100) / 100;
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
  const cardOf = (id) => cardSvg(NODES[id], BOX[id], NODES[id].lane ? laneById.get(NODES[id].lane).color : INK, id);

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
      [`<line x1="0" y1="-4" x2="28" y2="-4" stroke="${LINE}" stroke-width="1.4"/>`, 'Moves between pages'],
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
    const marks = stepMarks(flow, EDGES);
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
      labels += `<g opacity="0">${animate('opacity', [[a, 0], [a + 0.2, 1]])}${labelSvg(at, marks[k], text, color, opts?.labelAt ? Infinity : g.gap)}</g>`;
    });
    let nodes = '';
    for (const [id, [t, color]] of reach) {
      nodes += `<g opacity="0">${animate('opacity', [[t, 0], [t + 0.25, 1]])}<use href="#n-${id}" xlink:href="#n-${id}"/>${ringSvg(NODES[id].kind, BOX[id], color)}</g>`;
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
svg{font-family:${FONT_STACK}}
.title{font-size:26px;font-weight:700;fill:${INK}}.sub{font-size:12.5px;fill:${MUTED}}
${CSS.lane}
${CSS.route}
${CSS.card}
.pill{font-size:11.5px;font-weight:600}.legend{font-size:11.5px;fill:#3D362F}.legend-h{font-size:11.5px;font-weight:700;fill:${INK}}
.cap1{font-size:20px;font-weight:700;fill:${INK}}.cap2{font-size:13px;font-weight:600;fill:${MUTED}}.cap3{font-size:13px;fill:#3D362F}
${CSS.label}.foot{font-size:11px;fill:${MUTED}}
@media (prefers-reduced-motion: reduce){.tour{display:none}}
</style>
<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="${LINE}"/></marker></defs>
<rect width="${WIDTH}" height="${HEIGHT}" fill="${BG}"/>
<text x="24" y="46" class="title">${esc(title)}</text>
<text x="24" y="70" class="sub">${esc(subtitle)}</text>
<text x="24" y="108" class="cap1">Overview · ${FLOWS.length} flows · ${screens} screens and services</text>
<text x="24" y="130" class="cap2">Each flow plays in turn. Numbered steps follow the moving dot.</text>
<text x="24" y="151" class="cap3">Gray lines: moves between pages. Bullets: every action on that page. Full cycle: ${Math.round(T)} s.</text>
${FLOWS.map((_, i) => pill(i, false)).join('')}
${legendSvg()}
${LANES.map(laneSvg).join('')}
${baseEdges}
${Object.keys(NODES).map(cardOf).join('')}
${veil}
${FLOWS.map(flowSvg).join('\n')}
<text x="24" y="${HEIGHT - 12}" class="foot">${esc(footer)}</text>
</svg>
`;
  return { svg, times, T };
}
