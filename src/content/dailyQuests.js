// Daily and weekly contract templates. Each day every character draws a fresh set from this
// pool (engine/dailies.js), so the board changes every day. A template counts one game event
// (see services/progress.js); `place` templates pick a location the player can actually reach.
//
// event:  the tracked event ('defeat', 'gather', 'explore', 'work', ...)
// place:  'hunt' | 'gather' | 'explore' -> bound to a reachable location with that content
// count:  [min, max] for dailies; weekly contracts multiply it
// tier:   easy | normal | hard (sets the reward)

const T = (key, event, title, count, tier, extra = {}) => ({ key, event, title, count, tier, weight: 1, scope: 'both', ...extra });

export const DAILY_TEMPLATES = [
  // Hunting
  T('hunt_any', 'defeat', 'اهزم {n} من الوحوش في أي مكان', [3, 6], 'easy', { weight: 1.4 }),
  T('hunt_place', 'defeat', 'طهّر {place}: اهزم {n} من مخلوقاتها', [3, 5], 'normal', { place: 'hunt', weight: 1.4 }),
  T('hunt_elite', 'defeat', 'صيد شاق: اهزم {n} وحشاً دون أن تتوقف', [8, 12], 'hard', { weight: 0.8 }),
  T('boss_any', 'boss', 'اهزم زعيماً من زعماء المناطق', [1, 1], 'hard', { weight: 0.7, minChapter: 2 }),
  T('story_boss', 'story_boss', 'تقدّم في القصة: اهزم زعيم فصلك', [1, 1], 'hard', { weight: 0.5, scope: 'weekly' }),

  // Gathering and exploring
  T('gather_any', 'gather', 'اجمع موارد {n} مرات', [4, 8], 'easy', { weight: 1.3 }),
  T('gather_place', 'gather', 'اجمع {n} مرات في {place}', [3, 6], 'normal', { place: 'gather', weight: 1.2 }),
  T('explore_any', 'explore', 'استكشف {n} مرات في أي منطقة', [3, 5], 'easy', { weight: 1.2 }),
  T('explore_place', 'explore', 'استكشف {place} {n} مرات', [2, 4], 'normal', { place: 'explore', weight: 1.1 }),
  T('landmark', 'landmark', 'اكتشف معلماً جديداً لم تزره من قبل', [1, 1], 'hard', { weight: 0.5 }),

  // Work, travel, crafting
  T('work', 'work', 'اعمل {n} ورديات في وظيفتك', [2, 3], 'easy', { weight: 1.1 }),
  T('travel', 'visit', 'سافر {n} مرات بين الأماكن', [3, 5], 'easy', { weight: 1 }),
  T('craft', 'craft', 'اصنع {n} أغراض في ورشة الصناعة', [1, 3], 'normal', { weight: 0.9 }),
  T('use_item', 'use_item', 'استخدم {n} من المستهلكات', [2, 4], 'easy', { weight: 0.7 }),

  // Social
  T('pvp_win', 'pvp_win', 'انتصر في {n} تحدٍّ ضد لاعب', [1, 2], 'hard', { weight: 0.5 }),
  T('pvp_fight', 'pvp_fight', 'خض {n} تحدياً ضد لاعب (فوزاً أو خسارة)', [1, 2], 'normal', { weight: 0.5 }),
  T('rp', 'rp', 'اكتب {n} رسائل رول بلاي في قنوات الأماكن', [4, 8], 'normal', { weight: 1 }),
  T('trade', 'trade', 'أنجز صفقة تبادل مع لاعب', [1, 1], 'normal', { weight: 0.4 }),
  T('shop', 'shop_spend', 'أنفق {n} NX في المتاجر', [150, 400], 'easy', { weight: 0.6, scale: true }),
  T('story_read', 'story_read', 'اقرأ {n} صفحات من القصة', [3, 6], 'easy', { weight: 0.6 }),
];

export const TEMPLATE_BY_KEY = Object.fromEntries(DAILY_TEMPLATES.map((t) => [t.key, t]));

export const TIER_LABELS = { easy: 'سهل', normal: 'عادي', hard: 'صعب' };
export const TIER_MULT = { easy: 1, normal: 1.6, hard: 2.6 };
