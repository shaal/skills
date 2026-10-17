// The interactive HTML viewer: one self-contained page with every layout precomputed.
// Card and label markup comes from parts.mjs, the same code the SVG uses.
import { readFileSync } from 'node:fs';
import { columnLayout, compactLayout, unionBox } from './focus.mjs';
import { BG, CSS, FONT_STACK, INK, LINE, arrowHead, cardSvg, esc, labelLayout, labelSvg, ringSvg, stepMarks } from './parts.mjs';

const pill = ([x, y], size) => ({ x: x - size.w / 2, y: y - size.h / 2, w: size.w, h: size.h });
const pad = (b, p) => ({ x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p });

export function renderHtml(model) {
  const { META, LAYOUT, LANES, ACTORS, NODES, FLOWS, EDGES, laneById, ROWS, BOX, WIDTH, HEIGHT, GEO } = model;
  const colorOf = (id) => laneById.get(NODES[id].lane).color;

  const nodes = {};
  for (const [id, n] of Object.entries(NODES)) {
    const b = BOX[id];
    const origin = { x: 0, y: 0, w: b.w, h: b.h };
    nodes[id] = {
      kind: n.kind ?? 'page', lane: n.lane, laneName: laneById.get(n.lane).name, color: colorOf(id), w: b.w, h: b.h,
      card: cardSvg(n, origin, colorOf(id)), ring: ringSvg(n.kind, origin, 'currentColor'),
    };
  }
  const mapLanes = LANES.map((lane) => {
    const R = ROWS[lane.id];
    const h = R.bottom - R.top;
    return (
      `<rect x="8" y="${R.top}" width="${WIDTH - 16}" height="${h}" rx="14" fill="${lane.tint}"/>` +
      `<rect x="8" y="${R.top}" width="176" height="${h}" rx="14" fill="${lane.color}" opacity="0.07"/>` +
      `<text x="24" y="${R.top + 32}" class="lane" style="fill:${lane.color}">${esc(lane.name)}</text>` +
      (lane.notes ?? []).map((t, i) => `<text x="24" y="${R.top + 54 + i * 15}" class="note">${esc(t)}</text>`).join('')
    );
  }).join('');
  const lastLane = ROWS[LANES[LANES.length - 1].id];
  const map = {
    lanes: mapLanes,
    edges: Object.values(GEO).map((g) => `<path class="base-edge" d="${g.d}" marker-end="url(#arr)"/>`).join(''),
    pos: Object.fromEntries(Object.entries(BOX).map(([id, b]) => [id, [b.x, b.y]])),
    bounds: { x: 0, y: LAYOUT.HEADER, w: WIDTH, h: lastLane.bottom - LAYOUT.HEADER + 8 },
  };

  const stats = [];
  const flows = FLOWS.map((flow) => {
    const marks = stepMarks(flow, EDGES);
    const steps = flow.steps.map(([edgeId, actor, text]) => ({
      from: EDGES[edgeId].from, to: EDGES[edgeId].to, actor, color: ACTORS[actor].color, text, alt: !!EDGES[edgeId].alt,
    }));
    const active = [...new Set(steps.flatMap((s) => [s.from, s.to]))];
    const draw = (k, d, end, dir, at, gap, maxChars) => ({
      d,
      arrow: `${arrowHead(end, dir, steps[k].color, 11)}/>`,
      label: labelSvg(at, marks[k], steps[k].text, steps[k].color, gap, maxChars),
      lbox: pill(at, labelLayout(steps[k].text, gap, maxChars)),
    });

    const mapSteps = flow.steps.map(([edgeId, , , opts], k) => {
      const g = GEO[edgeId];
      const gap = opts?.labelAt ? Infinity : g.gap;
      return draw(k, g.d, g.end, g.dir, opts?.labelAt ?? g.label, gap);
    });
    const col = columnLayout(model, flow);
    const cmp = compactLayout(model, flow);
    stats.push(`${flow.title}: compact ${cmp.issues.length ? `has problems: ${cmp.issues.join('; ')}` : 'clean'}`);
    return {
      title: flow.title, who: flow.who ?? '', desc: flow.desc ?? '', steps, active,
      map: { steps: mapSteps, bounds: pad(unionBox([...active.map((id) => BOX[id]), ...mapSteps.map((s) => s.lbox)]), 8) },
      compact: {
        lanes: cmp.lanes.map((l) => {
          const lane = laneById.get(l.id);
          return `<rect x="4" y="${l.top}" width="${cmp.w - 8}" height="${l.bottom - l.top}" rx="12" fill="${lane.tint}"/>` +
            `<text x="16" y="${l.top + 21}" class="lane-tag" style="fill:${lane.color}">${esc(lane.name)}</text>`;
        }).join(''),
        pos: cmp.pos,
        steps: cmp.steps.map((s, k) => draw(k, s.d, s.end, s.dir, s.label, s.gap, s.labelChars)),
        bounds: { x: 0, y: 0, w: cmp.w, h: cmp.h },
        issues: cmp.issues,
      },
      column: {
        items: col.items.map(({ node, x, y, repeat }) => ({ node, x, y, repeat })),
        jumps: col.jumps,
        steps: col.steps.map((s, k) => ({ ...draw(k, s.d, s.end, s.dir, s.label, Infinity, s.labelChars), from: s.from, to: s.to })),
        bounds: { x: 0, y: 0, w: col.w, h: col.h },
      },
    };
  });

  const data = { meta: { title: META.title ?? 'User flow map' }, actors: ACTORS, nodes, map, flows };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const read = (f) => readFileSync(new URL(`../viewer/${f}`, import.meta.url), 'utf8');
  const title = esc(META.title ?? 'User flow map');
  const legend =
    `<h2>Who acts (line colour)</h2><ul>${Object.values(ACTORS)
      .map((a) => `<li><span class="swatch" style="background:${a.color}"></span>${esc(a.label)}</li>`)
      .join('')}</ul>` +
    `<h2>Reading it</h2><p class="hint">Boxes are pages; bullets are the actions on that page. Dashed boxes are dialogs, ` +
    `coloured borders are services, the diamond is a gate, the dark pill is an end state. Numbered labels follow ` +
    `the order of a flow; "!" marks a failure branch.</p>` +
    `<h2>Moving around</h2><p class="hint">Map shows every box in place. Focus keeps only the flow's boxes. ` +
    `Swipe or use ← → for steps, ↑ ↓ for flows. Drag to pan; pinch, scroll or + / − to zoom; 0 fits.</p>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<style>
${read('viewer.css')}
#canvas{font-family:${FONT_STACK};background:${BG}}
${CSS.lane}
${CSS.route}
${CSS.card}
${CSS.label}
</style>
</head>
<body>
<noscript><p class="noscript">This user flow map needs JavaScript. Open the file in a web browser (Safari, Chrome, Firefox, Edge), not in a file preview.</p></noscript>
<header class="bar">
  <h1 class="title">${title}</h1>
  <div class="controls">
    <label class="sr" for="flow-select">Flow</label>
    <select id="flow-select"></select>
    <div class="seg" role="group" aria-label="Layout"><button type="button" data-view="map">Map</button><button type="button" data-view="focus">Focus</button></div>
    <div class="seg" role="group" aria-label="Steps"><button type="button" data-steps="all">All steps</button><button type="button" data-steps="step">Step by step</button></div>
    <button type="button" class="tool" id="key-btn" aria-expanded="false" aria-controls="key">Key</button>
  </div>
</header>
<main class="stage">
  <svg id="canvas" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}">
    <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="${LINE}"/></marker></defs>
    <g id="lanes"></g><g id="base"></g><g id="jumps"></g><g id="flowlines"></g><g id="cards"></g><g id="clones"></g><g id="rings"></g><g id="labels"></g>
    <circle id="dot" r="7" stroke="#fff" stroke-width="2" opacity="0" fill="${INK}"/>
  </svg>
  <div class="zoom" role="group" aria-label="Zoom"><button type="button" id="zoom-in" aria-label="Zoom in">+</button><button type="button" id="fit-btn" aria-label="Fit to screen">Fit</button><button type="button" id="zoom-out" aria-label="Zoom out">−</button></div>
  <div id="key" class="key" hidden>${legend}</div>
</main>
<footer class="sheet" aria-live="polite">
  <div class="sheet-text"><div id="sheet-title"></div><div id="sheet-body"></div></div>
  <div class="sheet-nav"><button type="button" id="prev" aria-label="Previous step">‹</button><button type="button" id="play" aria-label="Play">▶</button><button type="button" id="next" aria-label="Next step">›</button></div>
</footer>
<script type="application/json" id="flow-data">${json}</script>
<script>
${read('viewer.js')}
</script>
</body>
</html>
`;
  return { html, stats };
}
