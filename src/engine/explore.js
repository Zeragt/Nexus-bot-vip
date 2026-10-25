/**
 * Pure exploration and gathering rules (v3). The service feeds in the zone, weather and
 * mastery, and gets back what happened; it then applies it to the database.
 */
import { DEPTH_BOOST, ELITE_CHANCE } from '../content/regions.js';

/** Outcome weights in the wild and inside the city. */
const WILD = { resource: 30, encounter: 22, cache: 9, lore: 11, traveler: 7, trap: 8, shrine: 7, nothing: 6 };
const CITY = { resource: 22, cache: 14, lore: 20, traveler: 22, pickpocket: 8, festival: 8, nothing: 6 };

/** Flavour lines. {zone} = zone name. */
export const LINES = {
  resource: [
    'تحت حجر مقلوب في {zone} وجدت ما يستحق الحمل.',
    'بين الجذور والصخور في {zone}، لمع شيء فالتقطته.',
    'كنت تبحث عن طريق، فوجدت مواد لم يلمسها أحد.',
    'رائحة غريبة قادتك إلى مخبأ صغير من الموارد.',
    'آثار حيوان قادتك إلى بقعة غنية في {zone}.',
    'الأرض هنا كريمة اليوم.',
  ],
  encounter: [
    'شيء ما كان يتبعك منذ دخلت {zone}... والآن قرر أن يهاجم!',
    'خطوة خاطئة، وصوت غصن ينكسر، وعينان تلمعان في الظلام.',
    'قطعت عليك مخلوقة الطريق، ولا يبدو أنها ستتنحى.',
    'سمعت زمجرة قبل أن ترى صاحبها.',
    'دخلت دون قصد إلى عرين شيء جائع.',
  ],
  elite: [
    'الأرض ترتجف. هذا ليس وحشاً عادياً... هذا وحش له اسم.',
    'الطيور سكتت فجأة. الصيادون يحكون عن هذا المخلوق حول النار.',
    'ظل ضخم يغطي {zone}. وحش نخبة يقف أمامك.',
  ],
  cache: [
    'صندوق صغير مخبأ بعناية في شق صخرة. أحدهم نسيه... أو تركه لك.',
    'حقيبة مغامر قديمة، ما زال فيها ما ينفع.',
    'تحت شجرة محترقة وجدت مخبأً لمستكشف سبقك.',
    'علامة محفورة على جدار قادتك إلى كنز صغير.',
  ],
  lore: [
    'قرأت نقشاً قديماً في {zone}. لم تفهمه كله، لكنك تعلمت شيئاً.',
    'جلست قليلاً وأنصتّ لـ {zone}. المكان يحكي لمن يصغي.',
    'وجدت يوميات مغامر سقط هنا. قرأتها، وصرت أحكم قليلاً.',
    'لاحظت تفاصيل لم ترها من قبل. خريطتك صارت أدق.',
    'همس عابر من الريح حمل اسماً... تذكره جيداً.',
  ],
  traveler: [
    'مسافر بعباءة رمادية شاركك ناره ونصيحته.',
    'تاجر متجول أعطاك شيئاً مقابل صحبة الطريق.',
    'حاج يمشي نحو البوابة دعا لك، فشعرت بخفة غريبة.',
    'طفل ضائع دلّك على طريق مختصر، ثم اختفى.',
    'صياد عجوز علّمك حيلة قديمة وأعطاك قطعاً نقدية.',
  ],
  trap: [
    'أرض رخوة انهارت تحت قدميك. نجوت، لكن بجروح.',
    'فخ قديم نسيه صياد ما زال يعمل جيداً.',
    'غاز خانق تسرب من شق في الأرض.',
    'أشواك سامة اختبأت تحت الأوراق.',
  ],
  shrine: [
    'مزار صغير منسي في {zone}. لمست حجره فدبّت فيك قوة.',
    'نبع صافٍ يقولون إن ماءه مبارك. شربت منه.',
    'تمثال لحامٍ قديم، حوله شموع ما زالت تشتعل. صليت عنده.',
  ],
  nothing: [
    'مشيت طويلاً في {zone}، ولم يحدث شيء. أحياناً هذا أفضل.',
    'الطريق هادئ اليوم. هادئ أكثر من اللازم.',
    'ضللت الطريق قليلاً ثم عدت. على الأقل صرت تعرفه.',
  ],
  pickpocket: ['يد خفيفة امتدت إلى جيبك في الزحام. خسرت بعض NX.', 'لص صغير ركض بعيداً قبل أن تنتبه أن محفظتك أخف.'],
  festival: ['المدينة تحتفل! أحد التجار رمى لك هدية من عربته.', 'موسيقى ورقص في الشارع. أحدهم وضع في يدك حلوى وعملة.'],
  discover: ['وأنت تتعمق، انفتح أمامك طريق جديد: {zone}!', 'خلف صخرة لم تلحظها من قبل... منطقة جديدة: {zone}!'],
};

function weighted(table, rng) {
  const entries = Object.entries(table);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[0][0];
}

export function line(kind, zoneName, rng) {
  return (rng.pick(LINES[kind] ?? LINES.nothing) ?? '').replaceAll('{zone}', zoneName);
}

/**
 * Gathering yield from a zone: picks resources by weight, scaled by weather and mastery.
 * Returns [{ key, quantity }].
 */
export function rollGather(zone, { weather = { gather: 1 }, masteryRank = 0, gatherBonus = 0.12 } = {}, rng) {
  const res = zone.resources ?? [];
  if (!res.length) return [];
  const mult = (weather.gather ?? 1) * (1 + masteryRank * gatherBonus);
  const picks = Math.max(1, Math.round(rng.range(1, 2.6) * mult));
  const out = new Map();
  const total = res.reduce((s, [, w]) => s + w, 0);
  for (let i = 0; i < picks; i++) {
    let r = rng.next() * total;
    for (const [key, w] of res) {
      r -= w;
      if (r <= 0) {
        out.set(key, (out.get(key) ?? 0) + 1);
        break;
      }
    }
  }
  return [...out].map(([key, quantity]) => ({ key, quantity }));
}

/**
 * One exploration step. Returns
 *   { kind, points, elite, resources, nx, xp, hpLossPct, buff }
 * `kind` is one of the LINES keys. The service starts the fight for encounter/elite.
 */
export function rollExplore(zone, { level, weather = {}, masteryRank = 0, provinceTier = 1, hasEnemies = true } = {}, rng) {
  const table = { ...(zone.city ? CITY : WILD) };
  if (!hasEnemies) delete table.encounter;
  if (weather.key === 'fog') table.lore = (table.lore ?? 0) + 6;
  if ((weather.danger ?? 0) > 0 && table.encounter) table.encounter += 6 * weather.danger;
  const kind = weighted(table, rng);
  const points = 1 + (weather.key === 'fog' ? 1 : 0) + (rng.chance(0.35) ? 1 : 0);
  const out = { kind, points, elite: false, resources: [], nx: 0, xp: 0, hpLossPct: 0, buff: null };
  const scale = (5 + level * 2.2) * provinceTier * (weather.xp ?? 1);
  switch (kind) {
    case 'encounter':
      out.elite = rng.chance((ELITE_CHANCE[zone.depth] ?? 0) * (weather.loot ?? 1));
      if (out.elite) out.kind = 'elite';
      break;
    case 'resource':
      out.resources = rollGather(zone, { weather, masteryRank }, rng);
      out.xp = Math.round(scale * 0.4);
      break;
    case 'cache':
      out.nx = Math.round((20 + level * 4) * provinceTier * rng.range(0.7, 1.3));
      out.box = rng.chance(0.4 + masteryRank * 0.05);
      break;
    case 'lore':
      out.xp = Math.round(scale * 1.1);
      out.points += 1;
      break;
    case 'traveler':
      out.nx = Math.round((10 + level * 2.5) * rng.range(0.6, 1.4));
      out.buff = rng.chance(0.4) ? rng.pick(['regeneration', 'haste', 'attack_up', 'defense_up']) : null;
      out.xp = Math.round(scale * 0.3);
      break;
    case 'trap':
      out.hpLossPct = rng.range(0.06, 0.16) * (1 + (zone.depth - 1) * 0.25);
      out.xp = Math.round(scale * 0.2);
      break;
    case 'shrine':
      out.buff = rng.pick(['regeneration', 'barrier', 'attack_up', 'defense_up', 'haste']);
      out.xp = Math.round(scale * 0.3);
      break;
    case 'pickpocket':
      out.nx = -Math.round(5 + level * 1.5);
      break;
    case 'festival':
      out.nx = Math.round(15 + level * 3);
      out.xp = Math.round(scale * 0.5);
      break;
    default:
      out.xp = Math.round(scale * 0.15);
  }
  return out;
}

/** Monster level/loot boost for a zone. */
export function depthBoost(zone) {
  return DEPTH_BOOST[zone?.depth ?? 1] ?? DEPTH_BOOST[1];
}
