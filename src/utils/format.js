const nf = new Intl.NumberFormat('en-US');

export const fmt = (n) => nf.format(Math.round(Number(n) || 0));

/** 12.5K / 3.2M for tight spots in images. */
export function compact(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e4) return `${(v / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}K`;
  return fmt(v);
}

/** Arabic human duration, e.g. "ساعة و 5 دقائق". */
export function duration(ms) {
  const s = Math.max(1, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(unit(d, 'يوم', 'يومين', 'أيام'));
  if (h) parts.push(unit(h, 'ساعة', 'ساعتين', 'ساعات'));
  if (m && !d) parts.push(unit(m, 'دقيقة', 'دقيقتين', 'دقائق'));
  if (sec && !d && !h && m < 5) parts.push(unit(sec, 'ثانية', 'ثانيتين', 'ثوانٍ'));
  return parts.slice(0, 2).join(' و ');
}

function unit(n, one, two, few) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n <= 10) return `${n} ${few}`;
  return `${n} ${one}`;
}

/** Discord dynamic timestamp. */
export const ts = (date, style = 'R') => `<t:${Math.floor(new Date(date).getTime() / 1000)}:${style}>`;

export function truncate(text, max) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function pct(v) {
  return `${Math.round(v * 100)}%`;
}
