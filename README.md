# نكسس — Nexus Roleplay Bot

بوت رول بلاي لديسكورد مبني من الصفر بـ **Node.js 22 (JavaScript ESM)** و **discord.js v14** و **PostgreSQL (Neon)**.
كل شيء تقريباً يُعرض كـ **صور مرسومة** بتصميم نكسس الكوني (أزرق ليلي + سماوي)، مع خط عربي مدمج وتشكيل صحيح من اليمين لليسار.

> English summary at the bottom.

---

## 🆕 الجديد في الإصدار 2.5

| النظام         | ماذا يقدّم                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| العقود اليومية | لوحة جديدة كل يوم (منتصف الليل بتوقيت بغداد): 5 عقود يومية منها عقد صعب دائماً، و3 عقود أسبوعية، تُدفع لحظة إنجازها. تبديل مجاني مرة يومياً، سلسلة مواظبة، صناديق للإنجاز الكامل. `/daily`                                                 |
| عقوبة الخسارة  | في التحدي ضد لاعب: يخسر المهزوم **30% من خبرة مستواه** وقد يسقط **غرض واحد** من حقيبته **للفائز**، والاحتمال حسب الندرة (عادي 50% ... سري 0.01%). لا هروب من التحدي، فقط الاستسلام. تميمة الروح تتحطم بدل الغرض. أمام الوحوش: 10% خبرة فقط |
| الزعماء المئة  | **100 زعيم** لكل منهم شكله الخاص (تيجان، قرون، أجنحة، هالات، عيون، رونات...): 55 زعيم قصة و45 زعيم منطقة يُقاتَلون مجدداً كل 6 ساعات، بغنائم وكؤوس وعناصر سرية نادرة جداً. `/boss`                                                         |
| القصة          | **30 فصلاً جديداً** (9 أجزاء و55 فصلاً)، حتى المستوى 150، مع 8 قرارات جديدة. كل منطقة وحدث ومعلم وزعيم ووصفة مختوم حتى تبلغ فصله                                                                                                           |
| المناطق        | **10 عوالم عائدة** جديدة (30 مكاناً)، ولكل مكان موارد وأحداث استكشاف ومعالم مخفية وجائزة إتقان. `/region`                                                                                                                                  |
| الصناعة        | 35 وصفة تحول موارد المناطق إلى معدات وجرعات. `/craft`                                                                                                                                                                                      |
| الأغراض        | ندرة جديدة: **سري**، و168 غرضاً جديداً، و9 تجار جدد، وصناديق تُفتح من الحقيبة                                                                                                                                                              |

## الجديد في الإصدار 2

| النظام    | ماذا يقدّم                                                                                                                                                                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| الكلاسات  | **55 كلاساً** في 8 فئات، لكل كلاس **30 مساراً فرعياً** (1,650 مساراً) و**100 مهارة** تُفتح مع المستويات، ومهارات توقيع لكل مسار (أكثر من 10,000 مهارة). تجهيز قتالي من 6 مهارات + مهارات دائمة. نمو تلقائي للإحصائيات حسب الكلاس والمسار. `/class`                                      |
| القتال 2D | ساحة 1280×720 بخلفية المكان، **شخصيات 2D ترتدي صورة بروفايل اللاعب** وتأخذ ألوانها منها، بزي وسلاح الكلاس (30 سلاحاً)، ووضعيات حسب الحدث (هجوم، تعويذة، دفاع، إصابة، نصر). 11 نوعاً من الوحوش المرسومة. تأثيرات جديدة: حاجز، عمى، ضعف، انكشاف، تسارع، ضربات متعددة، اختراق، امتصاص حياة |
| القصة     | **4 أجزاء، 25 فصلاً، 162 صفحة** مكتوبة بالكامل، زعيم لكل فصل، و4 قرارات مصيرية تغيّر سمعتك عند الفصائل. كل صفحة تُعرض كصفحة كتاب فوق مكان الفصل وشخصيتك فيها. `/story`                                                                                                                  |
| الأرشيف   | **66 مدخلاً** عن العالم والتاريخ والأماكن والفصائل والشعوب والأساطير والشخصيات، بعضها مختوم حتى تتقدم في القصة (لا حرق للأسرار)، وكتاب وحوش مرسوم لكل منطقة. `/codex`                                                                                                                   |
| العالم    | 6 مناطق جديدة: كهوف البلور، القفار الرمادية، أرخبيل السماء، المملكة الغارقة، قلعة الظلال، الهاوية                                                                                                                                                                                       |
| التوازن   | الزعماء والكلاسات والصيد مضبوطة بمحاكاة آلاف المعارك (`npm run tune:bosses`)                                                                                                                                                                                                            |
| الفن      | حزمة فنية تُبنى بأمر واحد: 1,650 شعاراً للمسارات (مناسبة كأيقونات رتب)، 55 ملصق كلاس، 25 ملصق فصل، 26 خلفية 4K، وصور الوحوش والزعماء                                                                                                                                                    |

---

## ✨ المزايا

| النظام   | ماذا يقدّم                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| الشخصيات | شخصية واحدة لكل لاعب برقم هوية `NX-000001`، إنشاء عبر نوافذ (Modals)، بطاقة ملف بأزرار: الملف، الإحصائيات، المهارات، الحقيبة، المهام، الاقتصاد. صورة مخصصة للشخصية. حذف بتأكيد |
| التقدم   | XP ومستويات (حتى 100)، 6 إحصائيات، نقاط توزيع، نقطة مهارة كل مستويين، XP من الكتابة في قنوات الرول بلاي مع حماية من التلاعب                                                    |
| الاقتصاد | عملة NX، تحويل بمفتاح منع التكرار، مكافأة يومية متصاعدة، سجل معاملات، لوحة الأثرياء                                                                                            |
| الحقيبة  | أغراض بـ 6 ندرات، تجهيز (سلاح/درع/إكسسوار)، استهلاك (شفاء، طاقة، تعزيزات)، وزن وسعة حمل                                                                                        |
| العالم   | 20 مكاناً على خريطة مرسومة، سفر بالطاقة، أماكن مقفلة/بمستوى، شخصيات NPC بحوارات ومتاجر، أرشيف القصص                                                                            |
| المهام   | لوحة 📜 QUEST BOARD مرسومة، أهداف تلقائية (جمع/زيارة/هزيمة/عمل) ويدوية، مراجعة إدارية، مكافآت                                                                                  |
| القتال   | قتال بالأدوار PvE و PvP بالأزرار، مهارات، تأثيرات (سم، نزيف، حرق، صعق، تجمد، إسكات...)، مؤقت للدور، حماية من استغلال PvP                                                       |
| المجتمع  | نقابات بخزينة ورتب ومستويات، فصائل وسمعة، وظائف ورواتب، علاقات، تداول آمن بتأكيد الطرفين، إنجازات، لوحات شرف                                                                   |
| الأحداث  | أحداث بمراحل وتصويت ومساهمات ومكافآت، وأحداث عشوائية تظهر في القنوات                                                                                                           |
| الإدارة  | `/admin` و `/gm` بصلاحيات حسب **معرفات الرتب**، سجل تدقيق كامل في قاعدة البيانات وقناة السجل                                                                                   |

---

## 🚀 التشغيل على Wispbyte

1. ارفع ملفات المشروع (بدون `node_modules`) إلى الخادم.
2. انسخ `.env.example` إلى `.env` واملأ القيم (انظر الجدول أدناه).
3. تأكد أن إصدار Node في الخادم هو **22** وأن ملف التشغيل هو `index.js`.
4. شغّل الخادم. سيقوم Wispbyte بـ `npm install` ثم `npm start`، والبوت عند الإقلاع:
   - ينتظر قاعدة Neon حتى تستيقظ،
   - يطبّق الترحيلات الجديدة (`RUN_MIGRATIONS=true`) ويزرع العالم الافتراضي مرة واحدة،
   - يسجّل أوامر السلاش إن تغيّرت (`DEPLOY_COMMANDS=true`)،
   - يتصل بديسكورد ويبدأ المجدول.

لا حاجة لأي أمر يدوي. إن أردت: `npm run db:migrate` و `npm run deploy:commands`.

### إعداد ديسكورد (Developer Portal)

- **Bot → Privileged Gateway Intents**: فعّل **Message Content Intent** (اختياري لكنه موصى به: يحسب XP الرول بلاي حسب طول الرسالة. إن لم يُفعّل، يكتشف البوت ذلك ويعمل بدونه).
- **OAuth2 → URL Generator**: النطاقات `bot` و `applications.commands`، والصلاحيات: View Channels، Send Messages، Embed Links، Attach Files، Read Message History، Use External Emojis.

### إعداد Neon

- استخدم رابط الاتصال **المجمّع (pooled)** — الذي يحتوي اسم المضيف فيه على `-pooler` — في `DATABASE_URL`.
- الترحيلات تعمل عبر الـ pooler بأمان (قفل استشاري على مستوى المعاملة).

---

## ⚙️ متغيرات البيئة

| المتغير                                                                                  | الوصف                                                       |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `DISCORD_TOKEN`                                                                          | توكن البوت                                                  |
| `CLIENT_ID`                                                                              | معرف التطبيق                                                |
| `GUILD_ID`                                                                               | معرف السيرفر (الأوامر تظهر فوراً). اتركه فارغاً لأوامر عامة |
| `DATABASE_URL`                                                                           | رابط Neon المجمّع                                           |
| `DIRECT_URL`                                                                             | اختياري: الرابط المباشر                                     |
| `LOG_CHANNEL_ID`                                                                         | قناة سجل الإدارة                                            |
| `OWNER_USER_ID`                                                                          | معرف المالك (أو عدة معرفات مفصولة بفواصل)                   |
| `ADMIN_ROLE_ID` / `MODERATOR_ROLE_ID` / `EVENT_MANAGER_ROLE_ID` / `LORE_MANAGER_ROLE_ID` | معرفات الرتب                                                |
| `TRUST_DISCORD_ADMINISTRATOR`                                                            | اعتبار من يملك صلاحية Administrator مشرفاً (افتراضي true)   |
| `RUN_MIGRATIONS` / `DEPLOY_COMMANDS`                                                     | تشغيل الترحيلات / نشر الأوامر عند الإقلاع                   |
| `ENABLE_MESSAGE_CONTENT`                                                                 | طلب صلاحية محتوى الرسائل                                    |
| `LOG_LEVEL` / `LOG_PRETTY` / `NODE_ENV`                                                  | السجلات                                                     |
| `IMAGE_FORMAT`                                                                           | `webp` (افتراضي، أسرع وأصغر) أو `png`                       |
| `DATABASE_SSL` / `DATABASE_POOL_MAX`                                                     | خيارات الاتصال                                              |

---

## 🎮 الأوامر

**اللاعبون**

- `/start` `/help` — بطاقة الترحيب ودليل الأوامر
- `/character create | profile | edit | delete | stats | skills | allocate | avatar`
- `/skill list | learn`
- `/inventory view | use | equip | unequip | drop | info`
- `/economy balance | pay | daily | leaderboard`
- `/travel` `/world map | location | lore` `/npc list | view | talk` `/shop view | buy | sell`
- `/quest board | list | view | accept | active | abandon | complete`
- `/hunt` `/combat challenge | status | forfeit`
- `/trade @user`
- `/guild create | profile | members | invite | accept | leave | promote | demote | kick | deposit | withdraw | disband`
- `/faction list | view` `/job list | select | work` `/achievements` `/relation set | remove | list` `/leaderboard`
- `/event list | view | join | leave`
- `/class browse | view | choose | path | skills | loadout | equip | unequip`
- `/story current | read | chapters | fight | bosses`
- `/codex browse | entry | bestiary`
- `/daily board | reroll | top` — العقود اليومية والأسبوعية
- `/boss here | hall | info | fight | top` — الزعماء المئة
- `/region view | explore | gather | landmarks` — محتوى المناطق
- `/craft list | make` — الصناعة

**الإدارة** (مخفية افتراضياً عن الأعضاء، والصلاحية تُفحص في الخادم عند كل استخدام)

- `/admin character view | setstat | xp | heal | unlock | classreset | story | delete`
- `/admin economy add | remove` · `/admin item give | take | create` · `/admin guild disband`
- `/admin faction create | rep` · `/admin settings view | set` · `/admin logs`
- `/gm quest create | toggle | reviews | review`
- `/gm npc create | dialogue | shop`
- `/gm event create | post | phase | advance | contribute | end`
- `/gm world location | flags | lore | lore_delete | random | spawn`

### الصلاحيات

| القدرة                                     | Owner | Admin | Moderator | Event Manager | Lore Manager |
| ------------------------------------------ | :---: | :---: | :-------: | :-----------: | :----------: |
| إدارة الشخصيات                             |   ✔   |   ✔   |     ✔     |               |              |
| حذف الشخصيات، الاقتصاد، الأغراض، الإعدادات |   ✔   |   ✔   |           |               |              |
| المهام                                     |   ✔   |   ✔   |           |       ✔       |      ✔       |
| مراجعة المهام                              |   ✔   |   ✔   |     ✔     |       ✔       |              |
| الأحداث والأحداث العشوائية                 |   ✔   |   ✔   |           |       ✔       |              |
| NPC، العالم، القصص، الفصائل                |   ✔   |   ✔   |           |               |      ✔       |
| النقابات، السجلات                          |   ✔   |   ✔   |     ✔     |               |              |

### إعدادات داخل اللعبة (`/admin settings set`)

- `rp_channel_ids`: قنوات الرول بلاي التي تمنح XP. إن تُركت فارغة، تُحتسب القنوات التي يطابق اسمها `channel_name` لأحد الأماكن (مثل `#tavern`).
- `random_event_channel_ids`: قنوات الأحداث العشوائية.
- `xp_multiplier`, `nx_multiplier`: مضاعفات (مثلاً 2 لعطلة نهاية الأسبوع).
- `rp_xp_enabled`, `random_events_enabled`.

### Tupperbox

رسائل Tupperbox تصل عبر Webhook ويتجاهلها البوت، بينما تُحتسب رسالة اللاعب الأصلية مرة واحدة فقط، فلا يتضاعف الـ XP ولا يُعاقب اللاعب.

---

## 🛡️ الأمان ومنع الاستغلال

- كل تغيير للمال أو الأغراض داخل معاملة، مع أقفال صفوف بترتيب ثابت وشروط مثل `nx >= amount`. لا يمكن أن يصبح الرصيد سالباً أو أن يتكرر غرض.
- التحويلات تحمل مفتاح منع تكرار، والتداول يُعاد التحقق منه بعد قفل الطرفين.
- كل زر مقفل على صاحبه وله مدة صلاحية، والعمليات الخطيرة تحتاج تأكيداً.
- حدود سرعة للأوامر والأزرار، وقفل لكل مستخدم لمنع الضغط المزدوج.
- PvP: لا مكافأة بين نفس الطرفين أكثر من مرة في فترة التهدئة، وحد يومي.
- XP الرول بلاي: حد أدنى للطول، تهدئة، سقف يومي، وكشف الرسائل المكررة.
- التوكن وروابط قاعدة البيانات تُحجب من السجلات تلقائياً.

---

## 🧰 للمطوّرين

```bash
npm install
npm run dev            # تشغيل مع إعادة التحميل
npm run build          # فحص: كل الوحدات تُحمَّل، الأوامر ضمن حدود ديسكورد، الخطوط موجودة
npm run lint           # ESLint
npm run format         # Prettier
npm test               # اختبارات (الوحدة دائماً، والتكامل عند ضبط TEST_DATABASE_URL)
npm run db:migrate     # تطبيق الترحيلات   |  npm run db:status
npm run db:generate -- add_pets   # ترحيل جديد فارغ
npm run render:preview # يرسم كل البطاقات في ./preview بدون ديسكورد
npm run assets         # يبني الحزمة الفنية في assets/ (حوالي 3 دقائق، 170 ميغابايت)
npm run tune:bosses    # يحاكي معارك القصة ويعيد ضبط صحة الزعماء
```

**الحزمة الفنية اختيارية**: البوت يرسم كل شيء مباشرة إن لم تجدها. مجلد `assets/scenes` صغير ويسرّع البطاقات، ومجلد `assets/art` هو الملصقات والشعارات عالية الدقة التي يرسلها البوت عند ضغط «ملصق HD»، ويمكنك استخدامها كأيقونات رتب وخلفيات للسيرفر. إن كانت مساحة الاستضافة محدودة يمكنك عدم رفع `assets/art`، وتختفي أزرار الملصقات فقط.

اختبارات التكامل تشغّل الأوامر الحقيقية بتفاعلات مُحاكاة على قاعدة بيانات فعلية (يتم مسحها!):

```bash
TEST_DATABASE_URL=postgres://user:pass@localhost/nexus_test npm test
```

### البنية

```
index.js                  نقطة البداية
src/index.js              الإقلاع: البيئة، القاعدة، الترحيل، النشر، الاتصال، المجدول، الإغلاق الآمن
src/config/               env.js (تحقق zod) و game.js (كل أرقام التوازن)
src/core/                 التفاعلات، الصلاحيات، التهدئة، المجدول، السجلات
src/db/                   الاتصال، الترحيل، migrations/*.sql
src/content/              المحتوى: الكلاسات، القصة (story/act1-9.js)، الأرشيف، الزعماء، المناطق، الأغراض، الوصفات، قوالب العقود
src/engine/               منطق نقي قابل للاختبار: القتال، التأثيرات، التقدم، المهام، التداول
src/services/             قواعد اللعبة فوق قاعدة البيانات
src/render/               محرك الصور (canvas) والبطاقات، الشخصيات 2D (sprites.js)، المشاهد، الشعارات
assets/                   الخطوط، الخلفيات المرسومة مسبقاً، والحزمة الفنية (art/)
src/views/                تحويل البيانات إلى بطاقات وأزرار
src/commands/ src/components/   أوامر السلاش والأزرار والنوافذ
tests/                    اختبارات الوحدة والتكامل
```

**إضافة محتوى**: أغراض، مهام، NPC، أماكن وأحداث تُضاف من داخل ديسكورد عبر `/admin` و `/gm`. ولتعديل العالم الافتراضي أو إضافة جداول، أنشئ ترحيلاً جديداً (`npm run db:generate`) ولا تعدّل ترحيلاً طُبّق سابقاً.
**تأثير قتالي جديد**: أضف مدخلاً واحداً في `src/engine/effects.js`.
**فصل قصة جديد**: أضف فصلاً في `src/content/story/act9.js` (أو جزءاً جديداً في `story/index.js`)، ثم شغّل `npm run tune:bosses -- --new`.
**زعيم منطقة، حدث، معلم، وصفة أو غرض**: `src/content/bosses.js` و `regions.js` و `recipes.js` و `items.js` (تُزامَن مع القاعدة عند الإقلاع)، ثم `npm run tune:bosses -- --new --world` للزعماء.
**مدخل أرشيف**: أضفه في `src/content/lore.js`، أو من ديسكورد عبر `/gm world lore` (يظهر في باب «مدونات الإدارة»).
**الكلاسات**: كل كلاس سطر واحد في `src/content/classes.js`، والمسارات والمهارات تُولَّد منه وتُزامَن مع القاعدة تلقائياً عند الإقلاع.

### حل المشاكل

- **`Invalid environment configuration`**: الرسالة تذكر كل متغير خاطئ. معرفات الرتب يجب أن تكون أرقاماً وليست أسماء.
- **`Used disallowed intents`**: فعّل Message Content Intent أو ضع `ENABLE_MESSAGE_CONTENT=false` (البوت يحاول تلقائياً بدونه).
- **الأوامر لا تظهر**: ضع `GUILD_ID` لسيرفرك، أو انتظر حتى ساعة للأوامر العامة، أو شغّل `npm run deploy:commands`.
- **أخطاء الاتصال بـ Neon عند الإقلاع**: البوت يعيد المحاولة أثناء استيقاظ القاعدة. تأكد من أن الرابط هو رابط الـ pooler ويحتوي `sslmode=require`.
- **أي خطأ غير متوقع** يظهر للاعب برمز قصير (مثل `رمز: a1b2c3`) تجده في سجل الخادم.

الخطوط المدمجة: Tajawal و Orbitron بترخيص SIL Open Font License (الملفات في `assets/fonts`).

---

## English summary

Nexus is a Discord RPG/roleplay bot in plain JavaScript (Node 22, ESM) with discord.js v14 and PostgreSQL (Neon). Almost all output is rendered images (@napi-rs/canvas, bundled Arabic fonts, proper RTL).

- **Run**: copy `.env.example` → `.env`, `npm install`, `npm start`. Startup waits for Neon, applies SQL migrations (advisory-locked, pooler-safe), deploys slash commands only when they changed, logs in, and starts a DB-coordinated scheduler. Falls back automatically if the Message Content intent is not enabled.
- **Systems**: characters (`NX-000001` IDs), stats/XP/levels, NX economy, inventory/equipment, skills, turn-based PvE/PvP combat with status effects and turn timers, quests with a rendered quest board and staff review, NPCs/shops, locations/travel/map, guilds, factions, jobs, relationships, trading with two-sided confirmation, achievements, leaderboards, phased events with voting, random events, lore archive, Tupperbox-safe RP XP.
- **v2**: 55 classes × 30 paths × 100 skills (generated, synced to the DB on boot), 2D combat sprites that wear the player's avatar, a 25-chapter story with bosses and choices (`/story`), a 66-entry codex with spoiler gating and a bestiary (`/codex`), six new regions, simulation-tuned balance (`npm run tune:bosses`), and an optional ~170 MB art pack (`npm run assets`: 1,650 path crests, class and chapter posters, 4K wallpapers, monster portraits).
- **v2.5**: daily/weekly contracts that change every day (`/daily`), a duel penalty (30% of level XP and one bag item to the winner, rarity-weighted down to 1 in 10,000 for secret items; 10% XP vs monsters), 100 bosses each with its own look (`/boss`), 30 more story chapters (55 total, level 150), ten new worlds and per-region exploration, gathering, landmarks and story-gated content (`/region`), crafting (`/craft`), a secret rarity and 168 new items.
- **Admin**: `/admin` and `/gm`, gated by role **IDs** (Owner, Admin, Moderator, Event Manager, Lore Manager) checked server-side on every use, with a full audit log (DB + log channel).
- **Quality**: `npm run check` runs ESLint, a build check (imports, Discord command size limits) and the Vitest suite. Integration tests drive the real handlers with simulated interactions against a real Postgres when `TEST_DATABASE_URL` is set.
