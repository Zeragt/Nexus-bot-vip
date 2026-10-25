// Nexus visual identity: midnight → royal blue with cyan energy accents.
export const theme = {
  bg0: '#040714',
  bg1: '#081032',
  bg2: '#0d1b4f',
  royal: '#2f4fd8',
  royalSoft: '#4d6bff',
  cyan: '#22d3ee',
  cyanSoft: '#67e8f9',
  ice: '#cffafe',
  violet: '#7c6cff',
  text: '#eaf6ff',
  textDim: '#9fb4d9',
  textMute: '#6a7fa8',
  panel: 'rgba(14, 28, 78, 0.55)',
  panelStrong: 'rgba(10, 20, 60, 0.82)',
  stroke: 'rgba(103, 232, 249, 0.28)',
  strokeStrong: 'rgba(103, 232, 249, 0.6)',
  hp: ['#f43f5e', '#fb7185'],
  energy: ['#0ea5e9', '#67e8f9'],
  xp: ['#4d6bff', '#22d3ee'],
  gold: '#f5c451',
  success: '#34d399',
  danger: '#f43f5e',
  warn: '#fbbf24',
};

export const rarityColors = {
  common: '#9aa7bd',
  uncommon: '#34d399',
  rare: '#4f9dff',
  epic: '#a78bfa',
  legendary: '#f5b942',
  mythic: '#ff4fa3',
  secret: '#f0f9ff',
};

export const difficultyColors = {
  easy: '#34d399',
  normal: '#22d3ee',
  hard: '#fbbf24',
  elite: '#fb7185',
  legendary: '#c084fc',
};

export const tierColors = { bronze: '#d9915b', silver: '#cbd5e1', gold: '#f5c451', mythic: '#ff4fa3' };

export function hexToRgba(hex, a = 1) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
