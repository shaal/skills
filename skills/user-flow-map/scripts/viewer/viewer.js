// User flow map viewer: Map/Focus layouts, all steps or step by step, pinch/drag/wheel zoom.
// All geometry comes precomputed from render-flow-map.mjs; this file only switches views.
(() => {
  'use strict';
  const D = JSON.parse(document.getElementById('flow-data').textContent);
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = $('canvas');
  const layer = Object.fromEntries(['lanes', 'base', 'jumps', 'flowlines', 'cards', 'clones', 'rings', 'labels'].map((k) => [k, $(k)]));
  const dot = $('dot');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const MIN_SCALE = 1.1; // card text is 11 units tall, so this keeps it at 12px or more
  const MAX_SCALE = 2.4;
  const STEP_MAX_SCALE = 1.6; // step mode: big enough to read, small enough to keep context
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  const state = { flow: -1, view: 'map', steps: 'all', step: 0 };
  let vb = { ...D.map.bounds };
  let target = D.map.bounds;
  let stepBoxes = null;
  let tween = 0;
  let playTimer = 0;
  let lastLayout = '';

  const isPhone = () => Math.min(innerWidth, innerHeight) < 600;
  const portrait = () => innerWidth < 700 && innerHeight > innerWidth;
  const layoutKey = () => (state.flow < 0 || state.view === 'map' ? 'map' : portrait() ? 'column' : 'compact');
  const current = () => D.flows[state.flow];
  const union = (bs) => {
    const x = Math.min(...bs.map((b) => b.x));
    const y = Math.min(...bs.map((b) => b.y));
    return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
  };

  // ---------- cards (built once, moved with the CSS transform property so moves animate) ----------
  const cardEls = {};
  for (const [id, n] of Object.entries(D.nodes)) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'card');
    g.dataset.id = id;
    g.innerHTML = n.card;
    layer.cards.appendChild(g);
    cardEls[id] = g;
  }
  const place = (el, x, y) => {
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.dataset.x = x;
    el.dataset.y = y;
  };
  layer.base.innerHTML = D.map.edges;

  function boxOf(id, lk, F) {
    const n = D.nodes[id];
    const [x, y] = lk === 'compact' ? F.compact.pos[id] : D.map.pos[id];
    return { x, y, w: n.w, h: n.h };
  }
  const itemBox = (F, i) => {
    const it = F.column.items[i];
    return { x: it.x, y: it.y, w: D.nodes[it.node].w, h: D.nodes[it.node].h };
  };

  // ---------- camera ----------
  function scaleFor(b, pad = 24) {
    const max = state.flow >= 0 && state.steps === 'step' ? STEP_MAX_SCALE : MAX_SCALE;
    return Math.min(max, svg.clientWidth / (b.w + 2 * pad), svg.clientHeight / (b.h + 2 * pad));
  }
  function fitBox(b, pad = 24) {
    const s = scaleFor(b, pad);
    const w = svg.clientWidth / s;
    const h = svg.clientHeight / s;
    return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
  }
  const setVB = (v) => {
    vb = v;
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  };
  function frame(instant) {
    cancelAnimationFrame(tween);
    const to = fitBox(target);
    if (instant || reduced.matches) return setVB(to);
    const from = { ...vb };
    const t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / 550);
      const e = ease(t);
      setVB({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e });
      if (t < 1) tween = requestAnimationFrame(tick);
    };
    tween = requestAnimationFrame(tick);
  }
  function cameraTarget(lk, F, L) {
    stepBoxes = null;
    if (!F) return D.map.bounds;
    if (state.steps === 'all') {
      // A long column fits the width and starts at the top; drag down to read on.
      if (lk === 'column') return { ...L.bounds, h: Math.min(L.bounds.h, (L.bounds.w * svg.clientHeight) / svg.clientWidth) };
      return L.bounds;
    }
    const s = L.steps[state.step];
    const st = F.steps[state.step];
    const from = lk === 'column' ? itemBox(F, s.from) : boxOf(st.from, lk, F);
    const to = lk === 'column' ? itemBox(F, s.to) : boxOf(st.to, lk, F);
    stepBoxes = { from, to, label: s.lbox };
    for (const c of [union([from, to, s.lbox]), union([to, s.lbox]), to]) if (scaleFor(c) >= MIN_SCALE) return c;
    return to;
  }

  // ---------- render ----------
  function render({ instant = false } = {}) {
    const lk = layoutKey();
    const F = state.flow >= 0 ? current() : null;
    const L = F ? F[lk] : null;
    document.body.dataset.layout = lk;
    if (instant) svg.classList.add('instant');

    const laneKey = lk === 'compact' ? `c${state.flow}` : lk;
    if (layer.lanes.dataset.key !== laneKey) {
      layer.lanes.innerHTML = lk === 'map' ? D.map.lanes : lk === 'compact' ? L.lanes : '';
      layer.lanes.dataset.key = laneKey;
    }
    layer.base.classList.toggle('gone', lk !== 'map');
    layer.base.classList.toggle('dim', lk === 'map' && !!F);

    const active = new Set(F ? F.active : Object.keys(D.nodes));
    const first = {};
    if (lk === 'column') L.items.forEach((it, i) => { if (!(it.node in first)) first[it.node] = i; });
    for (const [id, el] of Object.entries(cardEls)) {
      let [x, y] = D.map.pos[id];
      if (lk === 'compact' && active.has(id)) [x, y] = L.pos[id];
      if (lk === 'column' && id in first) [x, y] = [L.items[first[id]].x, L.items[first[id]].y];
      place(el, x, y);
      el.classList.toggle('inactive', lk === 'map' && !!F && !active.has(id));
      el.classList.toggle('gone', lk !== 'map' && !active.has(id));
    }

    let clones = '';
    let jumps = '';
    if (lk === 'column') {
      L.items.forEach((it) => {
        const n = D.nodes[it.node];
        jumps += `<text x="${it.x}" y="${it.y - 7}" class="lane-tag" style="fill:${n.color}">${esc(n.laneName)}</text>`;
        if (it.repeat) {
          clones += `<g class="card" style="transform:translate(${it.x}px,${it.y}px)">${n.card}</g>`;
          jumps += `<text x="${it.x + n.w}" y="${it.y - 7}" class="again" text-anchor="end">again</text>`;
        }
      });
      jumps += L.jumps.map((d) => `<path class="jump" d="${d}"/>`).join('');
    }
    layer.clones.innerHTML = clones;
    layer.jumps.innerHTML = jumps;

    let lines = '';
    let labels = '';
    let rings = '';
    if (F) {
      const step = state.steps === 'step';
      const upto = step ? state.step : F.steps.length - 1;
      F.steps.forEach((s, k) => {
        if (k > upto) return;
        const g = L.steps[k];
        const drawing = step && k === upto && !s.alt && !instant && !reduced.matches;
        lines +=
          `<path class="flowline${s.alt ? ' alt' : ''}${drawing ? ' draw' : ''}" d="${g.d}" stroke="${s.color}"` +
          `${drawing ? ' pathLength="1" stroke-dashoffset="1.05"' : ''} data-k="${k}"/>` +
          (drawing ? `<g class="late">${g.arrow}</g>` : g.arrow);
        labels += `<g class="pill${step && k < upto ? ' past' : ''}" data-k="${k}">${g.label}</g>`;
      });
      if (step) {
        const s = F.steps[state.step];
        const ring = (b, id) => `<g style="transform:translate(${b.x}px,${b.y}px);color:${s.color}">${D.nodes[id].ring}</g>`;
        const fb = lk === 'column' ? itemBox(F, L.steps[state.step].from) : boxOf(s.from, lk, F);
        const tb = lk === 'column' ? itemBox(F, L.steps[state.step].to) : boxOf(s.to, lk, F);
        rings = ring(fb, s.from) + ring(tb, s.to);
      }
    }
    layer.flowlines.innerHTML = lines;
    layer.labels.innerHTML = labels;
    layer.rings.innerHTML = rings;

    target = cameraTarget(lk, F, L);
    frame(instant);
    lastLayout = lk;
    if (instant) {
      svg.getBoundingClientRect();
      svg.classList.remove('instant');
    } else animateCurrent();
    updateUi();
    writeHash();
  }

  function animateCurrent() {
    dot.setAttribute('opacity', '0');
    const path = layer.flowlines.querySelector('path.draw');
    if (!path) return;
    requestAnimationFrame(() => requestAnimationFrame(() => (path.style.strokeDashoffset = '0')));
    const late = layer.flowlines.querySelector('.late');
    const len = path.getTotalLength();
    const t0 = performance.now();
    dot.setAttribute('fill', path.getAttribute('stroke'));
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / 600);
      const p = path.getPointAtLength(len * t);
      dot.setAttribute('cx', p.x);
      dot.setAttribute('cy', p.y);
      dot.setAttribute('opacity', t < 1 ? '1' : '0');
      if (t < 1) requestAnimationFrame(tick);
      else if (late) late.classList.remove('late');
    };
    requestAnimationFrame(tick);
  }

  // ---------- UI ----------
  const select = $('flow-select');
  const viewBtns = [...document.querySelectorAll('[data-view]')];
  const stepBtns = [...document.querySelectorAll('[data-steps]')];
  function updateUi() {
    const F = state.flow >= 0 ? current() : null;
    select.value = String(state.flow);
    viewBtns.forEach((b) => {
      b.setAttribute('aria-pressed', String(F ? b.dataset.view === state.view : b.dataset.view === 'map'));
      b.disabled = !F;
    });
    stepBtns.forEach((b) => {
      b.setAttribute('aria-pressed', String(F ? b.dataset.steps === state.steps : b.dataset.steps === 'all'));
      b.disabled = !F;
    });
    const title = $('sheet-title');
    const body = $('sheet-body');
    if (!F) {
      title.textContent = `All flows · ${D.flows.length} flows`;
      body.textContent = 'Pick a flow above to follow it. Pinch or drag to explore.';
    } else if (state.steps === 'all') {
      title.textContent = `${state.flow + 1}/${D.flows.length} · ${F.title}`;
      body.innerHTML = `${F.who ? `<b>${esc(F.who)}.</b> ` : ''}${esc(F.desc)}`;
    } else {
      const s = F.steps[state.step];
      title.textContent = `Step ${state.step + 1} of ${F.steps.length} · ${F.title}`;
      body.innerHTML = `<span class="chip" style="background:${s.color}">${esc(D.actors[s.actor].label)}</span>${s.alt ? 'If it fails: ' : ''}${esc(s.text)}`;
    }
    $('prev').disabled = !F || (state.steps === 'step' && state.step === 0);
    $('next').disabled = !!F && state.steps === 'step' && state.step === F.steps.length - 1;
    $('play').textContent = playTimer ? '❚❚' : '▶';
    $('play').setAttribute('aria-label', playTimer ? 'Pause' : 'Play');
  }

  function setFlow(i) {
    stop();
    state.flow = i;
    state.step = 0;
    if (i >= 0 && isPhone()) Object.assign(state, { view: 'focus', steps: 'step' });
    render();
  }
  function go(delta) {
    if (state.flow < 0) return setFlow(0);
    const F = current();
    if (state.steps === 'all') Object.assign(state, { steps: 'step', step: delta > 0 ? 0 : F.steps.length - 1 });
    else state.step = Math.max(0, Math.min(F.steps.length - 1, state.step + delta));
    render();
  }
  function stop() {
    clearInterval(playTimer);
    playTimer = 0;
  }
  function play() {
    if (playTimer) return stop(), updateUi();
    if (state.flow < 0) setFlow(0);
    if (state.steps === 'all' || state.step === current().steps.length - 1) Object.assign(state, { steps: 'step', step: 0 });
    render();
    playTimer = setInterval(() => {
      if (state.step >= current().steps.length - 1) return stop(), updateUi();
      go(1);
    }, 1700);
    updateUi();
  }

  select.innerHTML =
    `<option value="-1">All flows (overview)</option>` +
    D.flows.map((f, i) => `<option value="${i}">${i + 1}. ${esc(f.title)}</option>`).join('');
  select.addEventListener('change', () => setFlow(Number(select.value)));
  viewBtns.forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; render(); }));
  stepBtns.forEach((b) => b.addEventListener('click', () => { stop(); state.steps = b.dataset.steps; render(); }));
  $('prev').addEventListener('click', () => { stop(); go(-1); });
  $('next').addEventListener('click', () => { stop(); go(1); });
  $('play').addEventListener('click', play);
  $('fit-btn').addEventListener('click', () => frame(false));
  $('zoom-in').addEventListener('click', () => zoomAt(1.4));
  $('zoom-out').addEventListener('click', () => zoomAt(1 / 1.4));
  $('key-btn').addEventListener('click', () => {
    const key = $('key');
    key.hidden = !key.hidden;
    $('key-btn').setAttribute('aria-expanded', String(!key.hidden));
  });
  addEventListener('keydown', (e) => {
    if (e.target.closest('select') || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === 'ArrowRight') go(1);
    else if (k === 'ArrowLeft') go(-1);
    else if (k === 'ArrowDown') setFlow(Math.min(D.flows.length - 1, state.flow + 1));
    else if (k === 'ArrowUp') setFlow(Math.max(-1, state.flow - 1));
    else if (k === 'Escape') setFlow(-1);
    else if (k === 'f' && state.flow >= 0) { state.view = state.view === 'map' ? 'focus' : 'map'; render(); }
    else if (k === ' ') play();
    else if (k === '+' || k === '=') zoomAt(1.4);
    else if (k === '-') zoomAt(1 / 1.4);
    else if (k === '0') frame(false);
    else return;
    e.preventDefault();
  });

  // ---------- gestures: drag to pan, pinch or wheel to zoom, swipe for steps ----------
  const pointers = new Map();
  let gesture = null;
  const rect = () => svg.getBoundingClientRect();
  function zoomAt(factor, cx, cy) {
    cancelAnimationFrame(tween);
    const r = rect();
    const px = cx === undefined ? 0.5 : (cx - r.left) / r.width;
    const py = cy === undefined ? 0.5 : (cy - r.top) / r.height;
    const w = Math.min(Math.max(vb.w / factor, svg.clientWidth / 6), svg.clientWidth / 0.04);
    const h = (w * vb.h) / vb.w;
    setVB({ x: vb.x + (vb.w - w) * px, y: vb.y + (vb.h - h) * py, w, h });
  }
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cancelAnimationFrame(tween);
    const [a, b] = [...pointers.values()];
    gesture = b
      ? { kind: 'pinch', d0: Math.hypot(b.x - a.x, b.y - a.y), m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, vb0: { ...vb } }
      : { kind: 'pan', x0: e.clientX, y0: e.clientY, t0: performance.now(), vb0: { ...vb } };
    svg.classList.add('dragging');
  });
  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = rect();
    if (gesture.kind === 'pan') {
      const k = gesture.vb0.w / r.width;
      setVB({ ...gesture.vb0, x: gesture.vb0.x - (e.clientX - gesture.x0) * k, y: gesture.vb0.y - (e.clientY - gesture.y0) * k });
    } else if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const s = Math.hypot(b.x - a.x, b.y - a.y) / gesture.d0;
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const v = gesture.vb0;
      const w = Math.min(Math.max(v.w / s, svg.clientWidth / 6), svg.clientWidth / 0.04);
      const h = (w * v.h) / v.w;
      const ax = v.x + ((gesture.m0.x - r.left) / r.width) * v.w;
      const ay = v.y + ((gesture.m0.y - r.top) / r.height) * v.h;
      setVB({ x: ax - ((m.x - r.left) / r.width) * w, y: ay - ((m.y - r.top) / r.height) * h, w, h });
    }
  });
  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (gesture?.kind === 'pan' && pointers.size === 0) {
      const dx = e.clientX - gesture.x0;
      const dy = e.clientY - gesture.y0;
      const quick = performance.now() - gesture.t0 < 450;
      if (state.flow >= 0 && quick && Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
        stop();
        go(dx < 0 ? 1 : -1);
      }
    }
    if (pointers.size === 1) {
      const [p] = [...pointers.values()];
      gesture = { kind: 'pan', x0: p.x, y0: p.y, t0: 0, vb0: { ...vb } };
    } else if (!pointers.size) {
      gesture = null;
      svg.classList.remove('dragging');
    }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
  }, { passive: false });

  // ---------- URL hash: #flow=3&view=focus&steps=step&step=2 ----------
  function writeHash() {
    const p = new URLSearchParams();
    if (state.flow >= 0) {
      p.set('flow', state.flow + 1);
      p.set('view', state.view);
      p.set('steps', state.steps);
      if (state.steps === 'step') p.set('step', state.step + 1);
    }
    const h = p.toString();
    if (location.hash.slice(1) !== h) history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search);
  }
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const f = Number(p.get('flow')) - 1;
    state.flow = f >= 0 && f < D.flows.length ? f : -1;
    state.view = p.get('view') === 'focus' ? 'focus' : 'map';
    state.steps = p.get('steps') === 'step' ? 'step' : 'all';
    state.step = state.flow >= 0 ? Math.max(0, Math.min(current().steps.length - 1, Number(p.get('step') || 1) - 1)) : 0;
  }
  addEventListener('hashchange', () => { readHash(); render(); });
  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (layoutKey() !== lastLayout) render();
      else frame(true);
    }, 120);
  });

  // ---------- API for verification scripts ----------
  function info() {
    const r = rect();
    const scale = r.width / vb.w;
    const toScreen = (b) => b && { x: r.left + (b.x - vb.x) * scale, y: r.top + (b.y - vb.y) * scale, w: b.w * scale, h: b.h * scale };
    const cards = [];
    for (const [id, el] of Object.entries(cardEls)) {
      if (el.classList.contains('gone')) continue;
      cards.push({ id, active: !el.classList.contains('inactive'), x: +el.dataset.x, y: +el.dataset.y, w: D.nodes[id].w, h: D.nodes[id].h });
    }
    for (const el of layer.clones.children) {
      const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.getAttribute('style'));
      cards.push({ id: 'repeat', active: true, x: +m[1], y: +m[2], w: el.getBBox().width, h: el.getBBox().height });
    }
    const labels = [...layer.labels.querySelectorAll('g.pill')].map((g) => {
      const b = g.querySelector('rect').getBBox();
      return { k: +g.dataset.k, x: b.x, y: b.y, w: b.width, h: b.height, text: [...g.querySelectorAll('text.lbl')].map((t) => t.textContent).join(' ') };
    });
    return { state: { ...state }, layout: layoutKey(), scale, viewBox: { ...vb }, canvas: { x: r.left, y: r.top, w: r.width, h: r.height },
      target, stepBoxes: stepBoxes && { from: toScreen(stepBoxes.from), to: toScreen(stepBoxes.to), label: toScreen(stepBoxes.label) }, cards, labels };
  }
  window.flowViewer = {
    flows: D.flows.map((f) => ({ title: f.title, steps: f.steps.length })),
    set(partial, { instant = true } = {}) {
      stop();
      Object.assign(state, partial);
      if (state.flow >= 0) state.step = Math.max(0, Math.min(current().steps.length - 1, state.step));
      render({ instant });
      return info();
    },
    info,
  };

  readHash();
  render({ instant: true });
})();
