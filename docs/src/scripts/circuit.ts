/**
 * The faint circuit board behind the hero. Signals run along traces into an "osq" chip that sits
 * between the copy and the demo card. Most come back out on wires into the card as checked work;
 * some stop at the chip, like a change that failed its checks.
 *
 * Colors come from the --streak and --streak-alpha tokens, so the theme decides how loud it is.
 * Listens for `osq-demo-step` on window to send a signal into the card when the demo moves on.
 */

type Point = [number, number];

interface Trace {
  pts: Point[];
  seg: number[];
  len: number;
  /** ends in a via before the edge */
  via: boolean;
  /** ends on the card's edge */
  pad: boolean;
  inbound: boolean;
}

interface Pulse {
  t: Trace;
  d: number;
  v: number;
  dir: 1 | -1;
  len: number;
  arrived?: boolean;
}

type Side = 'left' | 'right' | 'top' | 'bottom';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function finish(pts: Point[], via: boolean, inbound: boolean, pad: boolean): Trace {
  let len = 0;
  const seg = [0];
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(len);
  }
  return { pts, seg, len, via, pad, inbound };
}

function pointAt(t: Trace, distance: number): Point {
  const d = Math.max(0, Math.min(t.len, distance));
  for (let i = 1; i < t.seg.length; i++) {
    if (d <= t.seg[i]) {
      const f = (d - t.seg[i - 1]) / (t.seg[i] - t.seg[i - 1] || 1);
      return [t.pts[i - 1][0] + (t.pts[i][0] - t.pts[i - 1][0]) * f, t.pts[i - 1][1] + (t.pts[i][1] - t.pts[i - 1][1]) * f];
    }
  }
  return t.pts[t.pts.length - 1];
}

export function startCircuit(canvas: HTMLCanvasElement, copyEl: HTMLElement, cardEl: HTMLElement) {
  const ctx = canvas.getContext('2d');
  const hero = canvas.parentElement;
  if (!ctx || !hero) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  let w = 0;
  let h = 0;
  const chip = { x: 0, y: 0, s: 30, glow: 0 };
  let traces: Trace[] = [];
  let pulses: Pulse[] = [];
  let pending: number[] = [];
  let color = '#b7410e';
  let fg = '#5c544e';
  let maxAlpha = 0.2;
  let raf = 0;
  let visible = true;
  let last = 0;
  let clock = 0;

  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    color = cs.getPropertyValue('--streak').trim() || color;
    fg = cs.getPropertyValue('--muted').trim() || fg;
    maxAlpha = Number.parseFloat(cs.getPropertyValue('--streak-alpha')) || maxAlpha;
    draw();
  }

  // Out of a pin, a short straight run, a 45 degree jog that fans away from the chip, then straight to the edge.
  function route(side: Side, off: number, fan: number): Trace {
    const hx = side === 'left' ? -1 : side === 'right' ? 1 : 0;
    const vy = side === 'top' ? -1 : side === 'bottom' ? 1 : 0;
    const px = hx ? chip.x + hx * chip.s : chip.x + off;
    const py = vy ? chip.y + vy * chip.s : chip.y + off;
    const pts: Point[] = [[px, py]];
    const run = rnd(14, 30);
    const jog = Math.abs(off) * fan;
    let x = px + hx * run;
    let y = py + vy * run;
    pts.push([x, y]);
    if (hx) {
      x += hx * jog;
      y += Math.sign(off) * jog;
    } else {
      y += vy * jog;
      x += Math.sign(off) * jog;
    }
    pts.push([x, y]);
    const reach = Math.random() < 0.3 ? rnd(0.45, 0.85) : 1.1;
    if (hx) x = hx < 0 ? x - x * reach : x + (w - x) * reach;
    else y = vy < 0 ? y - y * reach : y + (h - y) * reach;
    pts.push([x, y]);
    return finish(pts, reach < 1, side === 'left' || side === 'top', false);
  }

  // Wires from the chip's output pins to the card's edge, fanned out so they land along its side.
  function wireToCard(off: number, n: number, idx: number, card: DOMRect, sideways: boolean): Trace {
    const run = 12;
    let pts: Point[];
    if (sideways) {
      const px = chip.x + chip.s;
      const py = chip.y + off;
      const ty = card.top + card.height * (0.18 + (0.64 * idx) / (n - 1));
      const x1 = px + run;
      const dy = ty - py;
      const jog = Math.min(Math.abs(dy), card.left - x1 - 10);
      pts = [[px, py], [x1, py], [x1 + jog, py + Math.sign(dy) * jog], [card.left, py + Math.sign(dy) * jog]];
    } else {
      const qx = chip.x + off;
      const qy = chip.y + chip.s;
      const tx = card.left + card.width * (0.2 + (0.6 * idx) / (n - 1));
      const y1 = qy + run;
      const dx = tx - qx;
      const jog = Math.min(Math.abs(dx), card.top - y1 - 10);
      pts = [[qx, qy], [qx, y1], [qx + Math.sign(dx) * jog, y1 + jog], [qx + Math.sign(dx) * jog, card.top]];
    }
    return finish(pts, false, false, true);
  }

  function layout() {
    if (!ctx || !hero) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = hero.clientWidth;
    h = hero.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const hr = hero.getBoundingClientRect();
    const a = copyEl.getBoundingClientRect();
    const b = cardEl.getBoundingClientRect();
    const sideways = b.left >= a.right - 1;
    if (sideways) {
      chip.x = (a.right + b.left) / 2 - hr.left;
      chip.y = b.top + b.height / 2 - hr.top;
      chip.s = Math.min(34, (b.left - a.right) / 2 - 12);
    } else {
      chip.x = w / 2;
      chip.y = (a.bottom + b.top) / 2 - hr.top;
      chip.s = Math.min(30, (b.top - a.bottom) / 2 - 14);
    }
    chip.s = Math.max(20, chip.s);

    const n = chip.s > 28 ? 6 : 4;
    const offs = Array.from({ length: n }, (_, i) => -chip.s * 0.75 + (i * chip.s * 1.5) / (n - 1));
    const card = new DOMRect(b.left - hr.left, b.top - hr.top, b.width, b.height);
    const outSide: Side = sideways ? 'right' : 'bottom';
    traces = [];
    for (const side of ['left', 'right', 'top', 'bottom'] as Side[]) {
      if (side === outSide) {
        offs.forEach((o, k) => traces.push(wireToCard(o, n, k, card, sideways)));
        continue;
      }
      const fan = rnd(2.5, 5);
      for (const o of offs) {
        if (Math.random() >= 0.85) continue;
        const t = route(side, o, fan);
        if (side === 'right' || side === 'bottom') t.inbound = false;
        traces.push(t);
      }
    }
    pulses = [];
    pending = [];
    if (!reduce.matches) for (let k = 0; k < 2; k++) launchIn(rnd(0, 0.8));
    draw();
  }

  function pick(inbound: boolean) {
    const list = traces.filter((t) => t.inbound === inbound);
    return list[Math.floor(Math.random() * list.length)];
  }

  function launchIn(progress = 0) {
    const t = pick(true);
    if (t) pulses.push({ t, d: t.len * (1 - progress), v: rnd(90, 170), dir: -1, len: rnd(24, 46) });
  }

  function launchOut() {
    const wires = traces.filter((t) => t.pad);
    const t = wires.length && Math.random() < 0.85 ? wires[Math.floor(Math.random() * wires.length)] : pick(false);
    if (t) pulses.push({ t, d: 0, v: rnd(110, 200), dir: 1, len: rnd(24, 46) });
  }

  let zapTimer = 0;
  function zap() {
    cardEl.classList.add('zap');
    clearTimeout(zapTimer);
    zapTimer = window.setTimeout(() => cardEl.classList.remove('zap'), 260);
  }

  function update(dt: number) {
    clock += dt;
    chip.glow = Math.max(0, chip.glow - dt * 1.6);
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.d += p.dir * p.v * dt;
      if (p.dir < 0 && p.d - p.len <= 0 && !p.arrived) {
        p.arrived = true;
        chip.glow = 1;
        // checked work comes out the other side; the rest stopped at a gate
        if (Math.random() < 0.75) pending.push(clock + rnd(0.35, 0.8));
      }
      if (p.dir > 0 && p.t.pad && p.d >= p.t.len && !p.arrived) {
        p.arrived = true;
        zap();
      }
      if ((p.dir < 0 && p.d + p.len < 0) || (p.dir > 0 && p.d - p.len > p.t.len)) pulses.splice(i, 1);
    }
    pending = pending.filter((at) => {
      if (at > clock) return true;
      launchOut();
      return false;
    });
    const inbound = pulses.filter((p) => p.dir < 0).length;
    if (inbound < 3 && Math.random() < dt * 0.6) launchIn();
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    // traces, vias and the pads where wires meet the card
    ctx.lineWidth = 1;
    ctx.globalAlpha = maxAlpha * 0.55;
    for (const t of traces) {
      ctx.beginPath();
      ctx.moveTo(t.pts[0][0], t.pts[0][1]);
      for (let i = 1; i < t.pts.length; i++) ctx.lineTo(t.pts[i][0], t.pts[i][1]);
      ctx.stroke();
      const [ex, ey] = t.pts[t.pts.length - 1];
      if (t.via) {
        ctx.beginPath();
        ctx.arc(ex, ey, 2.6, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (t.pad) ctx.fillRect(ex - 3, ey - 3, 6, 6);
    }

    // signals, brightest at the head
    ctx.lineWidth = 1.6;
    const segs = 8;
    for (const p of pulses) {
      for (let k = 0; k < segs; k++) {
        const d0 = p.d - p.dir * p.len * (1 - k / segs);
        const d1 = p.d - p.dir * p.len * (1 - (k + 1) / segs);
        if ((d0 < 0 && d1 < 0) || (d0 > p.t.len && d1 > p.t.len)) continue;
        const a0 = pointAt(p.t, d0);
        const a1 = pointAt(p.t, d1);
        ctx.globalAlpha = maxAlpha * 1.9 * ((k + 1) / segs);
        ctx.beginPath();
        ctx.moveTo(a0[0], a0[1]);
        ctx.lineTo(a1[0], a1[1]);
        ctx.stroke();
      }
    }

    // the chip: pins, body, outline and label
    const s = chip.s;
    const x = chip.x - s;
    const y = chip.y - s;
    ctx.globalAlpha = maxAlpha * (0.5 + chip.glow * 0.9);
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const o = -s * 0.75 + (i * s * 1.5) / 5;
      ctx.beginPath();
      ctx.moveTo(x - 5, chip.y + o);
      ctx.lineTo(x, chip.y + o);
      ctx.moveTo(x + 2 * s, chip.y + o);
      ctx.lineTo(x + 2 * s + 5, chip.y + o);
      ctx.moveTo(chip.x + o, y - 5);
      ctx.lineTo(chip.x + o, y);
      ctx.moveTo(chip.x + o, y + 2 * s);
      ctx.lineTo(chip.x + o, y + 2 * s + 5);
      ctx.stroke();
    }
    ctx.globalAlpha = maxAlpha * (0.35 + chip.glow * 0.5);
    ctx.beginPath();
    ctx.roundRect(x, y, 2 * s, 2 * s, 5);
    ctx.fill();
    ctx.globalAlpha = maxAlpha * (2.2 + chip.glow * 1.5);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.globalAlpha = Math.min(1, maxAlpha * 3.5);
    ctx.fillStyle = fg;
    ctx.font = `500 ${Math.round(s * 0.55)}px 'IBM Plex Mono', ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('osq', chip.x, chip.y + 1);
    ctx.globalAlpha = 1;
  }

  function frame(now: number) {
    raf = 0;
    if (!visible || reduce.matches || document.hidden) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf || reduce.matches) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  readTheme();
  layout();
  start();
  document.fonts?.ready.then(layout);
  window.addEventListener('resize', layout);
  new ResizeObserver(() => layout()).observe(cardEl);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTheme);
  new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  reduce.addEventListener('change', () => {
    if (reduce.matches) {
      pulses = [];
      draw();
    } else start();
  });
  document.addEventListener('visibilitychange', start);
  new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
    if (visible) start();
  }).observe(hero);
  window.addEventListener('osq-demo-step', () => {
    if (!reduce.matches && Math.random() < 0.6) launchOut();
  });
}
