/*
 * Browser-side checks for the HTML viewer made by render-flow-map.mjs (<out>.html).
 *
 * verify-flow-map.mjs runs this at several screen sizes. To use another browser
 * tool, open the HTML, evaluate this file, then call flowViewerChecks().
 *
 * It drives window.flowViewer through every flow in Map and Focus, then every
 * step in step-by-step mode, and reports:
 *   - card text that overflows its card, label text that overflows its pill
 *   - labels that overlap each other or cover a highlighted card; cards that overlap in Focus
 *   - step frames where card text is under 12px on screen or the target box is off screen
 *   - a page that scrolls (the viewer must fit the window)
 */
globalThis.flowViewerChecks = function flowViewerChecks() {
  const V = window.flowViewer;
  const issues = [];
  let cardMinSlack = Infinity;
  let labelMinSlack = Infinity;
  const ov = (a, b) => [Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)];

  // Card text: the same markup is used in every layout, so measure it once.
  document.querySelectorAll('#cards > g.card').forEach((g) => {
    const shape = g.querySelector('rect, polygon');
    const bb = shape.getBBox();
    const gate = shape.tagName === 'polygon';
    g.querySelectorAll('text').forEach((t) => {
      const tb = t.getBBox();
      const slack = Math.min(bb.x + bb.width - (gate ? 30 : 6) - (tb.x + tb.width), tb.x - bb.x - (gate ? 30 : 4));
      cardMinSlack = Math.min(cardMinSlack, slack);
      if (slack < 2) issues.push(`card ${g.dataset.id}: "${t.textContent}" has ${slack.toFixed(1)}px slack`);
    });
  });

  const labelText = () => {
    document.querySelectorAll('#labels g.pill').forEach((g) => {
      const rb = g.querySelector('rect').getBBox();
      g.querySelectorAll('text.lbl').forEach((t) => {
        const tb = t.getBBox();
        const slack = rb.x + rb.width - 4 - (tb.x + tb.width);
        labelMinSlack = Math.min(labelMinSlack, slack);
        if (slack < 2) issues.push(`label "${t.textContent}" has ${slack.toFixed(1)}px slack`);
      });
    });
  };

  // Every flow in Map and Focus, all steps shown.
  V.flows.forEach((f, fi) => {
    for (const view of ['map', 'focus']) {
      const info = V.set({ flow: fi, view, steps: 'all', step: 0 });
      const name = `flow ${fi + 1} (${info.layout})`;
      labelText();
      const cards = info.cards.filter((c) => c.active);
      const L = info.labels;
      for (let i = 0; i < L.length; i++)
        for (let j = i + 1; j < L.length; j++) {
          const [ox, oy] = ov(L[i], L[j]);
          if (ox > 0 && oy > 0) issues.push(`${name}: labels "${L[i].text}" and "${L[j].text}" overlap`);
        }
      for (const l of L)
        for (const c of cards) {
          const [ox, oy] = ov(l, c);
          if (ox > 6 && oy > 6) issues.push(`${name}: label "${l.text}" covers card ${c.id} by ${ox.toFixed(0)}x${oy.toFixed(0)}`);
        }
      if (info.layout !== 'map')
        for (let i = 0; i < cards.length; i++)
          for (let j = i + 1; j < cards.length; j++) {
            const [ox, oy] = ov(cards[i], cards[j]);
            if (ox > 0 && oy > 0) issues.push(`${name}: cards ${cards[i].id} and ${cards[j].id} overlap`);
          }
    }
  });

  // Every step, step by step: readable text and the target box fully on screen.
  V.flows.forEach((f, fi) => {
    for (const view of ['map', 'focus']) {
      for (let k = 0; k < f.steps; k++) {
        const info = V.set({ flow: fi, view, steps: 'step', step: k });
        const name = `flow ${fi + 1} (${info.layout}) step ${k + 1}`;
        const px = 11 * info.scale;
        if (px < 11.9) issues.push(`${name}: card text is ${px.toFixed(1)}px on screen`);
        const to = info.stepBoxes?.to;
        const c = info.canvas;
        if (!to) issues.push(`${name}: no step frame`);
        else if (to.x < c.x - 1 || to.y < c.y - 1 || to.x + to.w > c.x + c.w + 1 || to.y + to.h > c.y + c.h + 1)
          issues.push(`${name}: the target box is not fully on screen`);
      }
    }
  });

  const se = document.scrollingElement;
  if (se.scrollHeight > innerHeight + 1 || se.scrollWidth > innerWidth + 1)
    issues.push(`the page scrolls (${se.scrollWidth}x${se.scrollHeight} in a ${innerWidth}x${innerHeight} window)`);
  V.set({ flow: -1 });
  return { cardMinSlack, labelMinSlack, issues: [...new Set(issues)] };
};
