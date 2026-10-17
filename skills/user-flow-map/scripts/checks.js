/*
 * Browser-side layout checks for an SVG made by render-flow-map.mjs.
 *
 * verify-flow-map.mjs runs this for you. To use another browser tool, load the
 * SVG (as the document or inline), evaluate this file, then call:
 *
 *   flowMapChecks(svgElement)  ->  { cardMinSlack, labelMinSlack, issues: [...] }
 *
 * Checks: text that overflows its card, label pill or chapter pill; cards that
 * overlap; label pills that overlap each other or a lit card in the same flow;
 * anything outside the canvas; captions too wide or too tall for the header;
 * legend items that run into each other.
 */
globalThis.flowMapChecks = function flowMapChecks(svg) {
  const issues = [];
  const width = Number(svg.getAttribute('width'));
  const captionMax = Number(svg.getAttribute('data-caption-max')) || Infinity;
  const header = Number(svg.getAttribute('data-header')) || Infinity;
  const overlap = (a, b) => [
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  ];
  const shrink = (b, d) => ({ x: b.x + d, y: b.y + d, width: b.width - 2 * d, height: b.height - 2 * d });

  // Card text must fit inside its card. Gates (diamonds) need a wider margin.
  let cardMinSlack = Infinity;
  const cards = [];
  svg.querySelectorAll('g[id^="n-"]').forEach((g) => {
    const shape = g.querySelector('rect, polygon');
    const bb = shape.getBBox();
    const gate = shape.tagName === 'polygon';
    cards.push({ id: g.id.slice(2), b: bb });
    g.querySelectorAll('text').forEach((t) => {
      const tb = t.getBBox();
      const slack = Math.min(bb.x + bb.width - (gate ? 30 : 6) - (tb.x + tb.width), tb.x - bb.x - (gate ? 30 : 4));
      cardMinSlack = Math.min(cardMinSlack, slack);
      if (slack < 2) issues.push(`card ${g.id.slice(2)}: "${t.textContent}" has ${slack.toFixed(1)}px slack`);
    });
  });
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++) {
      const [ox, oy] = overlap(cards[i].b, cards[j].b);
      if (ox > 0 && oy > 0) issues.push(`cards ${cards[i].id} and ${cards[j].id} overlap`);
    }

  // Per flow: label pills, lit cards, captions.
  let labelMinSlack = Infinity;
  svg.querySelectorAll('g.tour').forEach((tour, fi) => {
    const flow = `flow ${fi + 1}`;
    const pills = [];
    const lit = [];
    tour.querySelectorAll(':scope > g').forEach((g) => {
      const use = g.querySelector(':scope > use');
      if (use) {
        const ring = g.querySelector(':scope > rect, :scope > polygon');
        lit.push({ id: (use.getAttribute('href') || '').slice(3), b: shrink(ring.getBBox(), 4) });
        return;
      }
      const rect = g.querySelector(':scope > rect');
      if (!rect) return;
      const rb = rect.getBBox();
      const texts = [...g.querySelectorAll(':scope > text.lbl')];
      const label = texts.map((t) => t.textContent).join(' ');
      texts.forEach((t) => {
        const tb = t.getBBox();
        const slack = rb.x + rb.width - 4 - (tb.x + tb.width);
        labelMinSlack = Math.min(labelMinSlack, slack);
        if (slack < 2) issues.push(`${flow}: label "${label}" has ${slack.toFixed(1)}px slack`);
      });
      if (rb.x < 0 || rb.x + rb.width > width) issues.push(`${flow}: label "${label}" is outside the canvas`);
      pills.push({ label, b: rb });
    });
    for (let i = 0; i < pills.length; i++)
      for (let j = i + 1; j < pills.length; j++) {
        const [ox, oy] = overlap(pills[i].b, pills[j].b);
        if (ox > 0 && oy > 0) issues.push(`${flow}: labels "${pills[i].label}" and "${pills[j].label}" overlap`);
      }
    pills.forEach((p) =>
      lit.forEach((n) => {
        const [ox, oy] = overlap(p.b, n.b);
        if (ox > 6 && oy > 6) issues.push(`${flow}: label "${p.label}" covers card ${n.id} by ${ox.toFixed(0)}x${oy.toFixed(0)}px`);
      }),
    );
    tour.querySelectorAll('text.cap1, text.cap2, text.cap3').forEach((t) => {
      const tb = t.getBBox();
      if (tb.x + tb.width > captionMax) issues.push(`${flow}: caption "${t.textContent.slice(0, 40)}…" is too wide`);
      if (tb.y + tb.height > header) issues.push(`${flow}: caption runs into the lanes (shorten the description)`);
    });
  });

  // Chapter pills and the rest of the header.
  svg.querySelectorAll('text.pill').forEach((t) => {
    const rect = t.previousElementSibling;
    const tb = t.getBBox();
    const rb = rect.getBBox();
    if (tb.x < rb.x + 4 || tb.x + tb.width > rb.x + rb.width - 4) issues.push(`chapter pill "${t.textContent}" overflows`);
  });
  const rows = new Map();
  svg.querySelectorAll('text.legend').forEach((t) => {
    const y = t.getAttribute('y');
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(t);
  });
  rows.forEach((items) => {
    items.sort((a, b) => a.getBBox().x - b.getBBox().x);
    for (let i = 0; i + 1 < items.length; i++) {
      const a = items[i].getBBox();
      const nextShapeX = items[i + 1].getBBox().x - 40;
      if (a.x + a.width > nextShapeX - 6) issues.push(`legend "${items[i].textContent}" runs into the next item`);
    }
  });
  svg.querySelectorAll('text').forEach((t) => {
    const tb = t.getBBox();
    if (tb.x + tb.width > width - 4) issues.push(`text "${t.textContent.slice(0, 40)}" runs off the right edge`);
  });

  return { cardMinSlack, labelMinSlack, issues: [...new Set(issues)] };
};
