import { api } from './api.js';

/** حالة اللعبة المشتركة بين الشاشات، ومُرسل أحداث صغير. */
export const S = {
  user: null,
  player: null,
  content: null,
  room: null,
  net: null,
  presence: [],
  online: false,
  tab: 'world',
};

const handlers = new Map();
export const on = {
  listen(evt, fn) {
    if (!handlers.has(evt)) handlers.set(evt, new Set());
    handlers.get(evt).add(fn);
    return () => handlers.get(evt).delete(fn);
  },
  emit(evt, data) {
    for (const fn of handlers.get(evt) || []) fn(data);
  },
};

export const classOf = (key) => S.content.CLASSES.find((c) => c.key === key);
export const regionOf = (id) => S.content.REGIONS.find((r) => r.id === id);

export async function refreshMe() {
  const r = await api('/me');
  S.player = r.player;
  on.emit('player');
  return r.player;
}

/** يحدّث اللاعب من رد الخادم إن احتوى عليه. */
export function applyPlayer(p) {
  if (p) {
    S.player = p;
    on.emit('player');
  }
}
