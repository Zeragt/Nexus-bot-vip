import { theme, hexToRgba } from '../theme.js';
import { icon } from '../icons.js';
import { EFFECTS } from '../../engine/effects.js';
import { CLASS_BY_KEY, ELEMENTS } from '../../content/classes.js';
import { subclassByKey } from '../../content/classGen.js';
import { createCard, frame, panel, text, bar, hashSeed, toImage, brand, chip, roundRect } from '../draw.js';
import { drawCombatant } from '../sprites.js';
import { sceneImage } from '../sceneCache.js';
import { sceneFor } from '../scenes.js';

const TONES = { hit: theme.text, crit: theme.gold, heal: theme.success, miss: theme.textMute, effect: '#c4b5fd', info: theme.cyanSoft };
const REASONS = { ko: 'بالضربة القاضية', flee: 'انسحاب', forfeit: 'استسلام', timeout: 'غياب عن الدور', time: 'انتهاء الوقت' };
const CAST_TYPES = new Set(['healing', 'utility', 'defense']);

/** Decides each fighter's pose from what just happened. */
export function posesFor(state) {
  const poses = ['idle', 'idle'];
  if (state.finished) {
    if (state.winner != null) {
      poses[state.winner] = 'victory';
      if (state.reason === 'ko' || state.reason === 'time') poses[1 - state.winner] = 'defeated';
    }
    return poses;
  }
  state.fighters.forEach((f, i) => {
    if (f.defending) poses[i] = 'defend';
  });
  const la = state.lastAction;
  if (!la) return poses;
  const actor = la.actor;
  const target = 1 - actor;
  const f = state.fighters[actor];
  const skill = la.key ? f.skills?.find((s) => s.key === la.key) : null;
  if (la.type === 'attack' || (la.type === 'skill' && la.damage > 0)) poses[actor] = 'attack';
  else if (la.type === 'skill' && skill && CAST_TYPES.has(skill.type)) poses[actor] = 'cast';
  else if (la.type === 'skill') poses[actor] = 'cast';
  else if (la.type === 'defend') poses[actor] = 'defend';
  if (la.damage > 0) poses[target] = 'hurt';
  return poses;
}

function classLine(f) {
  if (f.look?.monster) return f.boss ? 'زعيم' : 'مخلوق بري';
  const cls = CLASS_BY_KEY[f.look?.classKey];
  if (!cls) return 'مغامر بلا كلاس';
  const sub = subclassByKey(f.look?.subclassKey);
  return sub ? `${cls.nameAr} • ${sub.name}` : cls.nameAr;
}

function hud(ctx, f, { x, w, side, active, won, lost }) {
  const col = won ? theme.gold : active ? theme.cyan : lost ? '#64748b' : theme.royalSoft;
  const y = 22;
  const h = 128;
  panel(ctx, x, y, w, h, { radius: 18, fill: 'rgba(6, 12, 40, 0.78)', stroke: hexToRgba(col, active || won ? 0.9 : 0.4), glow: active || won ? col : null });
  const right = x + w - 22;
  const left = x + 22;
  text(ctx, f.name, right, y + 30, { size: 26, weight: 800, maxWidth: w - 140 });
  text(ctx, `LV ${f.level}`, left, y + 30, { size: 18, weight: 700, family: 'num', align: 'left', color: col });
  text(ctx, classLine(f), right, y + 58, { size: 15, weight: 600, color: theme.textDim, maxWidth: w - 150 });
  if (active) chip(ctx, 'دوره', left + 88, y + 58, { color: theme.cyan, size: 13, h: 24, align: 'left' });
  if (won) chip(ctx, 'المنتصر', left + 88, y + 58, { color: theme.gold, size: 13, h: 24, iconName: 'crown', align: 'left' });

  const bw = w - 44;
  bar(ctx, left, y + 78, bw, 16, f.hp / f.maxHp, { colors: theme.hp, rtl: side === 'right' });
  if (f.shield > 0) {
    const sw = Math.min(bw, (f.shield / f.maxHp) * bw);
    ctx.save();
    roundRect(ctx, side === 'right' ? left + bw - sw : left, y + 78, sw, 16, 8);
    ctx.fillStyle = 'rgba(147,197,253,0.55)';
    ctx.fill();
    ctx.restore();
  }
  text(ctx, `${f.hp} / ${f.maxHp}${f.shield > 0 ? `  +${f.shield}` : ''}`, x + w / 2, y + 86, {
    size: 13,
    weight: 800,
    family: 'num',
    align: 'center',
    color: '#fff',
  });
  bar(ctx, left, y + 102, bw, 9, f.energy / f.maxEnergy, { colors: theme.energy, rtl: side === 'right' });
  text(ctx, `${f.energy}`, side === 'right' ? left - 2 : left + bw + 2, y + 106, {
    size: 11,
    weight: 700,
    family: 'num',
    align: side === 'right' ? 'right' : 'left',
    color: theme.cyanSoft,
  });

  // Effects under the panel.
  let ex = side === 'right' ? right : left;
  for (const e of f.effects.slice(0, 5)) {
    const def = EFFECTS[e.key];
    if (!def) continue;
    const wdt = chip(ctx, `${def.name} ${e.turns}`, ex, y + h + 20, { color: def.color, size: 12, h: 22, align: side === 'right' ? 'right' : 'left' });
    ex += side === 'right' ? -(wdt + 6) : wdt + 6;
  }
}

function popup(ctx, label, x, y, color, size = 46) {
  text(ctx, label, x, y, {
    size,
    weight: 800,
    family: /\d/.test(label) && !/[؀-ۿ]/.test(label) ? 'num' : 'ar',
    align: 'center',
    color,
    glow: 18,
    glowColor: color,
  });
}

function impact(ctx, x, y, color, r = 70) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 2, x, y, r);
  g.addColorStop(0, hexToRgba('#ffffff', 0.8));
  g.addColorStop(0.3, hexToRgba(color, 0.6));
  g.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.strokeStyle = hexToRgba('#ffffff', 0.85);
  ctx.lineWidth = 3;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.35, y + Math.sin(a) * r * 0.35);
    ctx.lineTo(x + Math.cos(a) * r * (i % 2 ? 0.7 : 0.95), y + Math.sin(a) * r * (i % 2 ? 0.7 : 0.95));
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Battle scene: a painted arena of the current location with both fighters as full 2D
 * characters (players wear their profile picture as a face), poses that follow the last
 * action, floating damage numbers, HUDs and the battle log.
 * `view` = { state, avatars: [img|null, img|null], deadline, kind, rewards, locationKey }
 */
export async function renderCombat({ state, avatars = [null, null], deadline = null, kind = 'pvp', rewards = null, locationKey = null }) {
  const W = 1280;
  const H = 720;
  const { canvas, ctx } = createCard(W, H);
  const scene = sceneFor(locationKey ?? state.locationKey ?? (kind === 'pvp' ? 'central_plaza' : 'dimensional_gate'));
  ctx.drawImage(await sceneImage(scene, W, H, { arena: true }), 0, 0);
  const accent = state.finished ? theme.gold : theme.cyan;

  const poses = posesFor(state);
  const la = state.lastAction;
  const feetY = H - 70;
  const pos = [
    { x: W * 0.27, facing: 1 },
    { x: W * 0.73, facing: -1 },
  ];

  // Element trail from attacker to target for skills.
  if (la && !state.finished && la.type === 'skill' && la.damage > 0) {
    const from = pos[la.actor];
    const to = pos[1 - la.actor];
    const color = ELEMENTS[la.element]?.color ?? theme.cyan;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(from.x, 0, to.x, 0);
    g.addColorStop(0, hexToRgba(color, 0));
    g.addColorStop(1, hexToRgba(color, 0.55));
    ctx.strokeStyle = g;
    ctx.lineWidth = 26;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x + from.facing * 90, feetY - 170);
    ctx.quadraticCurveTo(W / 2, feetY - 320, to.x - from.facing * 40, feetY - 170);
    ctx.stroke();
    ctx.restore();
  }

  state.fighters.forEach((f, i) => {
    drawCombatant(ctx, f, { x: pos[i].x, y: feetY, scale: 1.02, facing: pos[i].facing, avatar: avatars[i], pose: poses[i], seed: hashSeed(String(f.id)) });
  });

  // Floating numbers over the target.
  if (la && !state.finished) {
    const target = 1 - la.actor;
    const tx = pos[target].x;
    if (la.dodged) popup(ctx, 'MISS', tx, feetY - 330, '#cbd5e1', 40);
    else if (la.damage > 0) {
      impact(ctx, tx - pos[target].facing * 10, feetY - 170, la.crit ? theme.gold : (ELEMENTS[la.element]?.color ?? '#ff4f7b'), la.crit ? 110 : 80);
      popup(ctx, `-${la.damage}`, tx, feetY - 340, la.crit ? theme.gold : '#ff5c7a', la.crit ? 60 : 48);
      if (la.crit) text(ctx, 'ضربة حرجة!', tx, feetY - 392, { size: 22, weight: 800, align: 'center', color: theme.gold, glow: 12 });
      if (la.hits > 1) text(ctx, `${la.hits} HITS`, tx, feetY - 300, { size: 20, weight: 800, family: 'num', align: 'center', color: '#fff', glow: 10 });
    }
    if (la.heal > 0) popup(ctx, `+${la.heal}`, pos[la.actor].x, feetY - 340, theme.success, 40);
    if (la.type === 'skill' && la.key) {
      const sk = state.fighters[la.actor].skills?.find((s) => s.key === la.key);
      if (sk) {
        const px = pos[la.actor].x;
        const wd = Math.min(380, 60 + sk.name.length * 16);
        panel(ctx, px - wd / 2, feetY - 440 + (la.damage > 0 && la.actor === 1 - la.actor ? 0 : 0), wd, 40, {
          radius: 20,
          fill: 'rgba(8,10,30,0.82)',
          stroke: hexToRgba(ELEMENTS[la.element]?.color ?? theme.cyan, 0.9),
          glow: ELEMENTS[la.element]?.color ?? theme.cyan,
        });
        text(ctx, sk.name, px, feetY - 420, { size: 20, weight: 800, align: 'center', color: '#fff', maxWidth: wd - 24 });
      }
    }
  }

  // HUDs: fighter 0 on the left (the challenger), fighter 1 on the right.
  const hw = 430;
  [0, 1].forEach((i) =>
    hud(ctx, state.fighters[i], {
      x: i === 0 ? 24 : W - 24 - hw,
      w: hw,
      side: i === 0 ? 'left' : 'right',
      active: !state.finished && state.active === i,
      won: state.finished && state.winner === i,
      lost: state.finished && state.winner === 1 - i,
    }),
  );

  // Centre medallion: round and timer.
  const cx = W / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, 76, 44, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8, 12, 40, 0.92)';
  ctx.fill();
  ctx.strokeStyle = hexToRgba(accent, 0.9);
  ctx.lineWidth = 3;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 22;
  ctx.stroke();
  ctx.restore();
  icon(ctx, 'swords', cx, 66, 30, accent, { glow: 12 });
  text(ctx, state.finished ? 'END' : `R${Math.ceil(state.turn / 2)}`, cx, 100, { size: 14, weight: 800, family: 'num', align: 'center', color: theme.textDim });
  if (deadline && !state.finished) {
    const secs = Math.max(0, Math.round((new Date(deadline) - Date.now()) / 1000));
    chip(ctx, `${secs}s`, cx, 146, { color: secs < 20 ? theme.danger : theme.cyan, size: 14, h: 26, align: 'center' });
  }
  text(ctx, kind === 'pve' ? (state.story ? 'معركة القصة' : 'مواجهة في البرية') : 'ساحة القتال', cx, 184, {
    size: 18,
    weight: 800,
    align: 'center',
    color: '#fff',
    glow: 10,
    glowColor: kind === 'pve' ? '#ff4f7b' : theme.cyan,
  });

  // Battle log.
  const lines = state.log.slice(-3);
  const logW = 640;
  const lx = cx - logW / 2;
  const ly = H - 132;
  if (!state.finished) {
    panel(ctx, lx, ly, logW, 112, { radius: 16, fill: 'rgba(4, 8, 28, 0.72)' });
    lines.forEach((l, i) => {
      const fresh = i === lines.length - 1;
      text(ctx, l.text, lx + logW - 24, ly + 24 + i * 32, {
        size: fresh ? 19 : 16,
        weight: fresh ? 800 : 600,
        color: TONES[l.tone] ?? theme.text,
        maxWidth: logW - 48,
        alpha: fresh ? 1 : 0.7,
      });
    });
  }

  if (state.finished) {
    ctx.save();
    roundRect(ctx, cx - 340, H / 2 - 70, 680, 120, 22);
    const g = ctx.createLinearGradient(cx - 340, 0, cx + 340, 0);
    g.addColorStop(0, 'rgba(10,14,40,0.94)');
    g.addColorStop(0.5, 'rgba(48,34,8,0.94)');
    g.addColorStop(1, 'rgba(10,14,40,0.94)');
    ctx.fillStyle = g;
    ctx.shadowColor = theme.gold;
    ctx.shadowBlur = 34;
    ctx.fill();
    ctx.strokeStyle = hexToRgba(theme.gold, 0.9);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    const winner = state.winner != null ? state.fighters[state.winner] : null;
    text(ctx, winner ? `النصر لـ ${winner.name}` : 'لا منتصر في هذه المعركة', cx, H / 2 - 30, {
      size: 38,
      weight: 800,
      align: 'center',
      color: theme.gold,
      glow: 18,
      maxWidth: 620,
    });
    const sub = [REASONS[state.reason], rewards].filter(Boolean).join('  •  ');
    text(ctx, sub, cx, H / 2 + 16, { size: 18, weight: 600, align: 'center', color: theme.text, maxWidth: 620 });
    const last = state.log.at(-1);
    if (last) text(ctx, last.text, cx, H - 40, { size: 16, weight: 600, align: 'center', color: theme.textDim, maxWidth: 900 });
  }
  frame(ctx, W, H, accent);
  brand(ctx, 30, H - 26);
  return toImage(canvas);
}
