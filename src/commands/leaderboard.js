import { SlashCommandBuilder } from 'discord.js';
import { send, card, pager, assertOwner } from '../core/ui.js';
import { leaderboard, BOARDS } from '../services/social.js';
import { findByUser } from '../services/characters.js';
import { renderList } from '../render/index.js';
import { characterImage } from '../views/avatars.js';
import { theme } from '../render/theme.js';

const ICONS = { level: 'sparkle', wealth: 'coin', reputation: 'crown', quests: 'scroll', combat: 'swords' };

export async function leaderboardMessage(metric, page, viewerId) {
  const viewer = await findByUser(viewerId);
  const lb = await leaderboard(metric, { page, viewerCharacterId: viewer?.id });
  const rows = await Promise.all(
    lb.rows.map(async (r) => ({
      rank: r.rank,
      title: r.name,
      subtitle: r.code,
      avatar: await characterImage(r.id, r.user_id),
      value: lb.board.value(r),
      valueSub: lb.board.sub(r),
      highlight: r.isViewer,
      color: r.rank <= 3 ? theme.gold : theme.cyan,
    })),
  );
  const buf = await renderList({
    title: `لوحة الشرف: ${lb.board.label}`,
    subtitle: 'أبرز شخصيات نكسس',
    iconName: ICONS[metric] ?? 'trophy',
    color: theme.gold,
    rows,
    page: lb.page,
    pages: lb.pages,
    emptyText: 'لا توجد شخصيات بعد',
  });
  const pg = pager('lb', viewerId, lb.page, lb.pages, metric);
  return { files: [card(buf, 'leaderboard')], components: pg ? [pg] : [] };
}

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('لوحات الشرف')
    .addSubcommand((s) => s.setName('level').setDescription('الأعلى مستوى'))
    .addSubcommand((s) => s.setName('wealth').setDescription('الأغنى'))
    .addSubcommand((s) => s.setName('reputation').setDescription('الأعلى سمعة'))
    .addSubcommand((s) => s.setName('quests').setDescription('الأكثر إنجازاً للمهام'))
    .addSubcommand((s) => s.setName('combat').setDescription('الأكثر انتصاراً')),
  defer: 'public',
  async execute(i, { sub }) {
    if (!BOARDS[sub]) return;
    return send(i, await leaderboardMessage(sub, 1, i.user.id));
  },
};

export const leaderboardPager = {
  prefix: 'lb',
  async handle(i, { action, args }) {
    if (action !== 'page') return i.deferUpdate();
    const [owner, page, metric] = args;
    assertOwner(i, owner);
    await i.deferUpdate();
    return i.editReply({ ...(await leaderboardMessage(metric, Number(page), owner)), attachments: [] });
  },
};
