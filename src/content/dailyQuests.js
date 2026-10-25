/**
 * Daily, weekly and world quest templates.
 *
 * A template is turned into a concrete quest by engine/dailies.js: it picks a target with the
 * template's selector (a location the player can reach, a resource from an open zone...), a count,
 * and one of the title/description variants. Placeholders: {loc} {item} {n} {province}.
 *
 * Fields
 *   kind      what is tracked (see services/progress.js for the events)
 *   group     which board slot can use it: easy | core | hard | region | social
 *   select    target selector: hunt | explore | gather | visit | province_hunt | province_explore | any
 *   count     [min, max] (the engine scales it a little with the tier)
 *   minLevel  lowest character level that gets it
 *   weight    how often it is picked
 */
const T = (key, kind, group, select, count, minLevel, weight, variants) => ({ key, kind, group, select, count, minLevel, weight, variants });
const V = (title, description) => ({ title, description });

export const DAILY_TEMPLATES = [
  // Hunting ---------------------------------------------------------------------------------
  T('hunt_loc', 'hunt', 'core', 'hunt', [3, 5], 1, 10, [
    V('تطهير {loc}', 'المخلوقات في {loc} صارت جريئة. اهزم {n} منها قبل أن تصل إلى الطرق.'),
    V('دورية في {loc}', 'الحرس يطلب متطوعين. اهزم {n} وحوش في {loc} وعد سالماً.'),
    V('جائزة الصياد: {loc}', 'لوحة الإعلانات تعرض مكافأة لمن يهزم {n} مخلوقات في {loc}.'),
    V('صيد قبل الغروب', 'قبل أن يحل الليل في {loc}، اهزم {n} من الوحوش التي تحوم حول المخيمات.'),
  ]),
  T('hunt_any_easy', 'hunt', 'easy', 'any', [2, 3], 1, 6, [
    V('تمرين الصباح', 'السيف الذي لا يُستعمل يصدأ. اهزم {n} وحوش في أي مكان.'),
    V('إحماء', 'ابدأ يومك بقتال. اهزم {n} مخلوقات بريّة أينما كانت.'),
  ]),
  T('hunt_hard', 'hunt', 'hard', 'hunt', [7, 10], 6, 7, [
    V('مذبحة في {loc}', 'شيء ما يدفع الوحوش للهياج في {loc}. اهزم {n} منها وأعد التوازن.'),
    V('حصار {loc}', 'المخلوقات تحاصر الطريق إلى {loc}. اكسر الحصار بهزيمة {n} منها.'),
  ]),
  T('elite', 'hunt_elite', 'hard', 'any', [1, 1], 12, 4, [
    V('رأس النخبة', 'وحوش النخبة تجوب أعماق المناطق. اعثر على واحد منها واهزمه.'),
    V('الوحش ذو الاسم', 'الصيادون يتحدثون عن وحش له اسم. استكشف أو اصطد في المناطق العميقة حتى تجده وتهزمه.'),
  ]),
  T('province_hunt', 'hunt', 'region', 'province_hunt', [4, 6], 1, 8, [
    V('حامي {province}', 'سكان {province} يحتاجون من يحميهم. اهزم {n} مخلوقات في {loc}.'),
    V('نداء {province}', 'إشارات الدخان ترتفع من {loc}. اهزم {n} وحوش هناك.'),
  ]),
  // Exploration -------------------------------------------------------------------------------
  T('explore_loc', 'explore', 'core', 'explore', [3, 5], 1, 9, [
    V('خرائط {loc}', 'المكتبة تريد خرائط محدّثة. استكشف {loc} {n} مرات.'),
    V('آثار في {loc}', 'شخص ما ترك آثاراً غريبة في {loc}. استكشف المكان {n} مرات وتتبعها.'),
    V('مسح ميداني', 'نقابة المغامرين تحتاج تقريراً عن {loc}. استكشفها {n} مرات.'),
  ]),
  T('explore_any', 'explore', 'easy', 'any', [2, 3], 1, 6, [
    V('فضول', 'العالم كبير ولم تره كله. استكشف {n} مرات في أي مكان.'),
    V('خطوات جديدة', 'اخرج من روتينك. استكشف {n} مرات.'),
  ]),
  T('discover', 'discover', 'hard', 'any', [1, 1], 3, 4, [
    V('ما وراء الطريق', 'اكتشف منطقة فرعية جديدة لم تدخلها من قبل.'),
    V('الأرض المجهولة', 'استكشف حتى تنفتح أمامك منطقة جديدة.'),
  ]),
  T('province_explore', 'explore', 'region', 'province_explore', [3, 5], 1, 8, [
    V('أسرار {province}', 'يقال إن {province} تخفي أكثر مما تُظهر. استكشف {loc} {n} مرات.'),
    V('طرق {province} المنسية', 'اسلك الطرق التي لا يسلكها أحد في {loc}. استكشف {n} مرات.'),
  ]),
  // Gathering ---------------------------------------------------------------------------------
  T('gather_item', 'gather', 'core', 'gather', [4, 8], 1, 9, [
    V('طلبية: {item}', 'أحد التجار يحتاج {item}. اجمع {n} قطع منها.'),
    V('مؤونة الشتاء', 'الحي السكني يستعد للبرد. اجمع {n} من {item}.'),
    V('مواد للحداد', 'بورين يقول إنه يحتاج {item}، ولا يقول لماذا. اجمع {n}.'),
  ]),
  T('gather_any', 'gather', 'easy', 'any', [5, 8], 1, 6, [
    V('يدان مشغولتان', 'اجمع {n} مواد من أي منطقة.'),
    V('حقيبة ممتلئة', 'لا تعد إلى المدينة بحقيبة فارغة. اجمع {n} مواد.'),
  ]),
  T('deliver_item', 'deliver', 'core', 'gather', [3, 5], 2, 5, [
    V('توصيل: {item}', 'سلّم {n} من {item} عند استلام المكافأة. (تُسحب من حقيبتك)'),
    V('دَين قديم', 'عليك دين لأحد التجار، ويقبل السداد بـ {n} من {item}. (تُسحب من حقيبتك)'),
  ]),
  // Travel ------------------------------------------------------------------------------------
  T('visit', 'visit', 'easy', 'visit', [1, 1], 1, 6, [
    V('رسالة إلى {loc}', 'رسالة مختومة تنتظر من يوصلها. سافر إلى {loc}.'),
    V('موعد في {loc}', 'أحدهم ينتظرك في {loc}. لا تتأخر.'),
  ]),
  T('travel', 'travel', 'easy', 'any', [3, 4], 1, 5, [
    V('رحّال', 'لا تبقَ في مكان واحد. سافر {n} مرات.'),
    V('طرق كثيرة', 'العالم لا يأتي إليك. انتقل بين الأماكن {n} مرات.'),
  ]),
  // City life ---------------------------------------------------------------------------------
  T('work', 'work', 'social', 'any', [2, 3], 1, 7, [
    V('عرق الجبين', 'أنجز {n} ورديات في وظيفتك.'),
    V('ساعات إضافية', 'المدينة تحتاج أيدي عاملة. اعمل {n} ورديات.'),
  ]),
  T('rp', 'rp', 'social', 'any', [5, 10], 1, 8, [
    V('حكّاء', 'اكتب {n} رسائل رول بلاي في قنوات المدينة (تُحتسب الرسائل التي تمنحك خبرة).'),
    V('صوت في الساحة', 'شارك في الحكاية. اكتب {n} رسائل رول بلاي.'),
  ]),
  T('craft', 'craft', 'social', 'any', [1, 3], 4, 5, [
    V('يد الصانع', 'اصنع {n} أغراض في ورشة أو محطة صناعة.'),
    V('حرفة اليوم', 'حوّل المواد الخام إلى شيء مفيد. اصنع {n}.'),
  ]),
  T('buy', 'buy', 'easy', 'any', [1, 2], 1, 4, [V('دعم التجار', 'السوق يمر بأيام صعبة. اشترِ {n} أغراض من أي متجر.')]),
  T('use_item', 'use_item', 'easy', 'any', [2, 3], 1, 4, [V('مستعد دائماً', 'استخدم {n} أغراض مستهلكة (جرعات، منشطات، صناديق...).')]),
  T('daily_reward', 'daily_reward', 'easy', 'any', [1, 1], 1, 3, [V('لا تنسَ نفسك', 'اجمع مكافأتك اليومية عبر /economy daily.')]),
  // Combat with players -----------------------------------------------------------------------
  T('pvp_fight', 'pvp_fight', 'social', 'any', [1, 2], 5, 4, [V('شرف المبارزة', 'خض {n} مبارزات ضد لاعبين (الفوز أو الخسارة، والخسارة لها ثمن).')]),
  T('pvp_win', 'pvp_win', 'hard', 'any', [1, 2], 8, 3, [V('بطل الحلبة', 'انتصر في {n} مبارزات ضد لاعبين. تذكّر: الخاسر يفقد من خبرته.')]),
  // Story -------------------------------------------------------------------------------------
  T('story_page', 'story_page', 'social', 'any', [3, 6], 1, 4, [V('فصل جديد', 'اقرأ {n} صفحات من القصة الكبرى عبر /story.')]),
  T('story_boss', 'story_boss', 'hard', 'any', [1, 1], 1, 2, [V('زعيم الفصل', 'تحدَّ زعيم فصلك الحالي في القصة (/story fight).')]),
];

export const WEEKLY_TEMPLATES = [
  T('w_hunt', 'hunt', 'core', 'any', [40, 60], 1, 6, [
    V('حملة الأسبوع', 'اهزم {n} وحوش خلال هذا الأسبوع.'),
    V('ليالي الصيد', 'هذا أسبوع الصيادين. اهزم {n} مخلوقات.'),
  ]),
  T('w_explore', 'explore', 'core', 'any', [30, 45], 1, 6, [
    V('رحلة كبرى', 'استكشف {n} مرات خلال الأسبوع.'),
    V('رسام الخرائط', 'املأ الخرائط الفارغة. استكشف {n} مرات.'),
  ]),
  T('w_gather', 'gather', 'core', 'any', [60, 90], 1, 5, [V('مخازن ممتلئة', 'اجمع {n} مواد خلال الأسبوع.')]),
  T('w_dailies', 'daily_board', 'core', 'any', [4, 5], 1, 6, [V('أسبوع الالتزام', 'أكمل لوحة المهام اليومية بالكامل {n} أيام هذا الأسبوع.')]),
  T('w_elite', 'hunt_elite', 'hard', 'any', [3, 5], 12, 4, [V('صائد الأسماء', 'اهزم {n} من وحوش النخبة.')]),
  T('w_discover', 'discover', 'hard', 'any', [2, 3], 3, 3, [V('حدود جديدة', 'اكتشف {n} مناطق فرعية جديدة.')]),
  T('w_craft', 'craft', 'core', 'any', [8, 12], 4, 4, [V('ورشة لا تهدأ', 'اصنع {n} أغراض خلال الأسبوع.')]),
  T('w_rp', 'rp', 'core', 'any', [40, 70], 1, 5, [V('صوت المدينة', 'اكتب {n} رسائل رول بلاي خلال الأسبوع.')]),
  T('w_pvp', 'pvp_win', 'hard', 'any', [5, 8], 8, 3, [V('سيد الحلبة', 'انتصر في {n} مبارزات ضد لاعبين.')]),
  T('w_work', 'work', 'core', 'any', [12, 18], 1, 4, [V('عامل الأسبوع', 'أنجز {n} ورديات عمل.')]),
];

/** One server-wide goal per day. Everyone who contributes can claim the reward once it is done. */
export const WORLD_GOALS = [
  { key: 'g_hunt', kind: 'hunt', required: 250, title: 'الزحف الكبير', description: 'الوحوش تتجمع حول المدينة. اهزموا {n} وحشاً معاً قبل منتصف الليل.' },
  { key: 'g_explore', kind: 'explore', required: 200, title: 'خريطة نكسس', description: 'المكتبة تريد خريطة جديدة للعالم كله. استكشفوا {n} مرة.' },
  { key: 'g_gather', kind: 'gather', required: 500, title: 'مخازن الشتاء', description: 'املؤوا مخازن المدينة: اجمعوا {n} مادة.' },
  { key: 'g_rp', kind: 'rp', required: 300, title: 'ليلة الحكايات', description: 'المدينة تحتفل بالقصص. اكتبوا {n} رسالة رول بلاي.' },
  { key: 'g_elite', kind: 'hunt_elite', required: 12, title: 'صيد النخبة', description: 'وحوش النخبة استيقظت. اهزموا {n} منها.' },
  { key: 'g_work', kind: 'work', required: 120, title: 'يوم العمال', description: 'المدينة تبني سوراً جديداً. أنجزوا {n} وردية عمل.' },
  { key: 'g_craft', kind: 'craft', required: 60, title: 'معرض الحرفيين', description: 'بورين يقيم معرضاً. اصنعوا {n} غرضاً.' },
  { key: 'g_dailies', kind: 'daily_board', required: 15, title: 'مدينة لا تنام', description: 'أكملوا {n} لوحات مهام يومية كاملة.' },
  { key: 'g_pvp', kind: 'pvp_fight', required: 30, title: 'بطولة الحلبة', description: 'الحلبة مفتوحة. خوضوا {n} مبارزة.' },
];
