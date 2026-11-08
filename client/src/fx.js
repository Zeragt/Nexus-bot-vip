/**
 * خلفية حية مرسومة بالكود (بدون صور): سماء نجمية، سديم، تضاريس لكل منطقة، وجزيئات متحركة.
 */
const THEMES = {
  hub: { sky: ['#030712', '#0b1a3a', '#102a5c'], nebula: '#22d3ee', ground: null, particle: 'mote', pc: '#7dd3fc' },
  dawn: { sky: ['#0b1530', '#3b2a5a', '#f59e0b'], nebula: '#fbbf24', ground: 'hills', gc: ['#1a1433', '#120d26'], particle: 'mote', pc: '#fde68a' },
  forest: { sky: ['#020c08', '#062a1a', '#14532d'], nebula: '#4ade80', ground: 'trees', gc: ['#04140c', '#020a06'], particle: 'firefly', pc: '#bef264' },
  desert: { sky: ['#1a0a05', '#4a1d0a', '#c2410c'], nebula: '#fb923c', ground: 'dunes', gc: ['#2a1206', '#1a0b04'], particle: 'ember', pc: '#fdba74' },
  frost: { sky: ['#020617', '#0c2a4a', '#38bdf8'], nebula: '#bae6fd', ground: 'peaks', gc: ['#0b1d33', '#081426'], particle: 'snow', pc: '#f0f9ff' },
  gears: { sky: ['#01080c', '#06242e', '#0e7490'], nebula: '#22d3ee', ground: 'city', gc: ['#031218', '#020b10'], particle: 'spark', pc: '#67e8f9' },
  rift: { sky: ['#07020f', '#2a0b45', '#86198f'], nebula: '#e879f9', ground: 'shards', gc: ['#12051f', '#0a0312'], particle: 'void', pc: '#f0abfc' },
};

let canvas;
let ctx;
let theme = THEMES.hub;
let stars = [];
let parts = [];
let groundCache = null;
let W = 0;
let H = 0;
let raf = 0;

function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = seeded(7);
  stars = Array.from({ length: Math.round((W * H) / 5000) }, () => ({ x: r() * W, y: r() * H * 0.8, s: r() * 1.4 + 0.2, p: r() * 6 }));
  groundCache = null;
}

function drawGround() {
  if (!theme.ground) return;
  if (!groundCache) {
    groundCache = document.createElement('canvas');
    groundCache.width = W;
    groundCache.height = H;
    const g = groundCache.getContext('2d');
    const r = seeded(theme.ground.length * 991);
    const layer = (color, base, amp, step, shape) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W + step; x += step) shape(g, x, base, amp, r);
      g.lineTo(W, H);
      g.closePath();
      g.fill();
    };
    const [c1, c2] = theme.gc;
    const kind = theme.ground;
    if (kind === 'hills' || kind === 'dunes') {
      const smooth = (gg, x, base, amp) => gg.lineTo(x, base - Math.sin(x / (kind === 'dunes' ? 160 : 110)) * amp - Math.sin(x / 47) * amp * 0.3);
      layer(c1, H * 0.72, 26, 8, smooth);
      layer(c2, H * 0.84, 18, 8, (gg, x, b, a) => smooth(gg, x + 300, b, a));
    } else if (kind === 'peaks') {
      layer(c1, H * 0.7, 120, 70, (gg, x, b, a, rr) => gg.lineTo(x, b - rr() * a));
      layer(c2, H * 0.84, 60, 50, (gg, x, b, a, rr) => gg.lineTo(x, b - rr() * a));
    } else if (kind === 'trees') {
      for (const [c, base, hgt] of [[c1, H * 0.74, 120], [c2, H * 0.86, 90]]) {
        g.fillStyle = c;
        g.fillRect(0, base, W, H - base);
        for (let x = -20; x < W + 20; x += 18 + r() * 22) {
          const h = hgt * (0.5 + r() * 0.7);
          g.beginPath();
          g.moveTo(x - 16, base + 2);
          g.lineTo(x, base - h);
          g.lineTo(x + 16, base + 2);
          g.fill();
        }
      }
    } else if (kind === 'city') {
      for (const [c, base, hgt] of [[c1, H * 0.74, 150], [c2, H * 0.86, 80]]) {
        g.fillStyle = c;
        g.fillRect(0, base, W, H - base);
        for (let x = 0; x < W; x += 24 + r() * 30) {
          const w = 18 + r() * 34;
          const h = hgt * (0.3 + r());
          g.fillRect(x, base - h, w, h + 2);
          if (r() > 0.6) {
            g.beginPath();
            g.arc(x + w / 2, base - h, w / 2.2, Math.PI, 0);
            g.fill();
          }
        }
      }
    } else if (kind === 'shards') {
      g.fillStyle = c2;
      g.fillRect(0, H * 0.82, W, H * 0.18);
      for (let i = 0; i < 26; i++) {
        const x = r() * W;
        const b = H * (0.78 + r() * 0.1);
        const h = 30 + r() * 140;
        g.fillStyle = i % 2 ? c1 : c2;
        g.beginPath();
        g.moveTo(x - 10 - r() * 14, b);
        g.lineTo(x + (r() - 0.5) * 30, b - h);
        g.lineTo(x + 10 + r() * 14, b);
        g.fill();
      }
    }
  }
  ctx.drawImage(groundCache, 0, 0, W, H);
}

function spawn() {
  const p = theme.particle;
  const base = { x: Math.random() * W, y: Math.random() * H, life: 1, r: 1 + Math.random() * 2 };
  if (p === 'snow') return { ...base, y: -10, vx: (Math.random() - 0.5) * 0.4, vy: 0.5 + Math.random() * 0.8 };
  if (p === 'ember' || p === 'spark') return { ...base, y: H + 10, vx: (Math.random() - 0.5) * 0.5, vy: -(0.4 + Math.random() * 1.2) };
  return { ...base, vx: (Math.random() - 0.5) * 0.25, vy: -(0.05 + Math.random() * 0.3) };
}

function frame(t) {
  raf = requestAnimationFrame(frame);
  const [a, b, c] = theme.sky;
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, a);
  grd.addColorStop(0.6, b);
  grd.addColorStop(1, c);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // سديم
  const nx = W * 0.3 + Math.sin(t / 9000) * 60;
  const ny = H * 0.3 + Math.cos(t / 11000) * 40;
  const neb = ctx.createRadialGradient(nx, ny, 10, nx, ny, Math.max(W, H) * 0.6);
  neb.addColorStop(0, `${theme.nebula}33`);
  neb.addColorStop(1, 'transparent');
  ctx.fillStyle = neb;
  ctx.fillRect(0, 0, W, H);

  for (const s of stars) {
    const tw = 0.5 + 0.5 * Math.sin(t / 700 + s.p);
    ctx.globalAlpha = 0.3 + tw * 0.7;
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }
  ctx.globalAlpha = 1;
  drawGround();

  if (parts.length < 60 && Math.random() < 0.5) parts.push(spawn());
  ctx.fillStyle = theme.pc;
  for (const p of parts) {
    p.x += p.vx + (theme.particle === 'snow' ? Math.sin(t / 600 + p.r) * 0.3 : 0);
    p.y += p.vy;
    p.life -= 0.003;
    const glow = theme.particle === 'firefly' ? 0.5 + 0.5 * Math.sin(t / 300 + p.r * 9) : 1;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life)) * glow * 0.85;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  parts = parts.filter((p) => p.life > 0 && p.y > -20 && p.y < H + 20);
}

export function startSky() {
  canvas = document.getElementById('sky');
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
}

export function setTheme(id) {
  const next = THEMES[id] || THEMES.hub;
  if (next === theme) return;
  theme = next;
  parts = [];
  groundCache = null;
}
