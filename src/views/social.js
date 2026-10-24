import { ButtonStyle } from 'discord.js';
import { renderCombat, renderTrade, renderGuild, renderEvent, renderList, renderNotice } from '../render/index.js';
import { card, row, button, select } from '../core/ui.js';
import { cid } from '../core/customId.js';
import { availableActions, activeFighter } from '../engine/combat.js';
import { tradeView } from '../services/trades.js';
import { members, guildRoleLabel } from '../services/guilds.js';
import { guildProgression } from '../config/game.js';
import { characterImage } from './avatars.js';
import { theme } from '../render/theme.js';
import { duration, compact } from '../utils/format.js';

const fmtDate = (d) => new Date(d).toISOString().slice(0, 10);
const fmtShort = (d) => {
  const x = new Date(d);
  return `${String(x.getUTCDate()).padStart(2, '0')}/${String(x.getUTCMonth() + 1).padStart(2, '0')} ${String(x.getUTCHours()).padStart(2, '0')}:${String(x.getUTCMinutes()).padStart(2, '0')}`;
};

// Combat --------------------------------------------------------------------
async function fighterImages(state) {
  return Promise.all(state.fighters.map((f) => (typeof f.id === 'number' ? characterImage(f.id, f.userId) : null)));
}

export async function challengeMessage({ id, challenger, opponent }) {
  const buf = await renderNotice({
    title: 'تحدٍّ للقتال!',
    subtitle: `${challenger.name} (LV ${challenger.level}) يتحدى ${opponent.name} (LV ${opponent.level})`,
    iconName: 'swords',
    color: '#ff4f7b',
    body: 'لديك دقيقتان للرد. القتال بالأدوار: هجوم، مهارات، دفاع، أغراض، أو انسحاب.',
  });
  return {
    content: `<@${opponent.userId}>`,
    allowedMentions: { users: [opponent.userId] },
    files: [card(buf, 'challenge')],
    components: [
      row(
        button(cid('cb', 'acc', id), 'قبول التحدي', ButtonStyle.Success, { emoji: '⚔️' }),
        button(cid('cb', 'dec', id), 'رفض', ButtonStyle.Secondary, { emoji: '🏳️' }),
      ),
    ],
  };
}

export function combatComponents(session) {
  const s = session.state;
  if (session.status !== 'active' || s.finished) return [];
  const acts = availableActions(s);
  const f = activeFighter(s);
  const rows = [
    row(
      button(cid('cb', 'atk', session.id), 'هجوم', ButtonStyle.Danger, { emoji: '⚔️' }),
      button(cid('cb', 'def', session.id), 'دفاع', ButtonStyle.Primary, { emoji: '🛡️' }),
      button(cid('cb', 'flee', session.id), 'انسحاب', ButtonStyle.Secondary, { emoji: '🏃' }),
    ),
  ];
  if (acts.skills.length) {
    rows.push(
      row(
        select(
          cid('cb', 'skill', session.id),
          acts.silenced ? 'مُسكت! لا يمكن استخدام المهارات' : `مهارات ${f.name}`,
          acts.skills.map((sk) => ({
            label: sk.name,
            value: sk.key,
            description: sk.usable ? `${sk.energyCost} طاقة` : sk.cooldown > 0 ? `انتظار ${sk.cooldown} أدوار` : 'طاقة غير كافية',
            emoji: sk.usable ? '✨' : '⏳',
          })),
        ),
      ),
    );
  }
  if (acts.items.length) {
    rows.push(
      row(
        select(
          cid('cb', 'item', session.id),
          'استخدم غرضاً',
          acts.items.map((it) => ({ label: `${it.name} x${it.qty}`, value: it.key, emoji: '🧪' })),
        ),
      ),
    );
  }
  return rows;
}

export async function combatMessage(session) {
  const s = session.state;
  const buf = await renderCombat({
    state: s,
    avatars: await fighterImages(s),
    deadline: session.turnDeadline,
    kind: session.kind,
    rewards: s.rewardText ?? null,
  });
  const turnUser = !s.finished ? activeFighter(s).userId : null;
  return {
    content: turnUser ? `دور <@${turnUser}>` : null,
    allowedMentions: { users: turnUser ? [turnUser] : [] },
    files: [card(buf, 'combat')],
    components: combatComponents(session),
  };
}

// Trade ---------------------------------------------------------------------
export async function tradeMessage(trade) {
  const view = await tradeView(trade);
  view.right.avatar = await characterImage(view.right.characterId, view.right.userId);
  view.left.avatar = await characterImage(view.left.characterId, view.left.userId);
  const buf = await renderTrade({ ...view, expiresIn: trade.status === 'open' ? `بعد ${duration(new Date(trade.expiresAt) - Date.now())}` : null });
  const open = trade.status === 'open';
  return {
    content: open ? `<@${view.right.userId}> ⇄ <@${view.left.userId}>` : null,
    allowedMentions: { users: open ? [view.right.userId, view.left.userId] : [] },
    files: [card(buf, 'trade')],
    components: open
      ? [
          row(
            button(cid('tr', 'additem', trade.id), 'إضافة غرض', ButtonStyle.Secondary, { emoji: '🎒' }),
            button(cid('tr', 'addnx', trade.id), 'إضافة NX', ButtonStyle.Secondary, { emoji: '💰' }),
          ),
          row(
            button(cid('tr', 'confirm', trade.id), 'تأكيد', ButtonStyle.Success, { emoji: '✅' }),
            button(cid('tr', 'cancel', trade.id), 'إلغاء', ButtonStyle.Danger, { emoji: '✖️' }),
          ),
        ]
      : [],
  };
}

// Guild ---------------------------------------------------------------------
export async function guildCard(g) {
  const list = await members(g.id);
  const top = await Promise.all(list.slice(0, 5).map(async (m) => ({ name: m.name, role: m.role, avatar: await characterImage(m.character_id, m.user_id) })));
  return renderGuild({
    name: g.name,
    tag: g.tag,
    description: g.description,
    color: g.color,
    level: g.level,
    xp: Number(g.xp),
    xpNeed: guildProgression.xpToNext(g.level),
    treasury: Number(g.treasury),
    reputation: g.reputation,
    members: list.length,
    maxMembers: g.max_members,
    leader: g.leader_name,
    topMembers: top,
    createdAt: fmtDate(g.created_at),
  });
}

export async function guildMembersCard(g) {
  const list = await members(g.id);
  return renderList({
    title: `أعضاء ${g.name}`,
    subtitle: `[${g.tag}] • ${list.length} / ${g.max_members}`,
    iconName: 'users',
    rows: list.slice(0, 15).map((m) => ({
      title: m.name,
      subtitle: `${m.code} • ${guildRoleLabel(m.role)}`,
      avatar: null,
      color: m.role === 'leader' ? theme.gold : m.role === 'officer' ? theme.violet : theme.cyan,
      value: `LV ${m.level}`,
      valueSub: `ساهم ${compact(m.contributed)} NX`,
    })),
    rowHeight: 70,
  });
}

// Events --------------------------------------------------------------------
export async function eventCard(ev) {
  return renderEvent({
    title: ev.title,
    description: ev.description,
    status: ev.status,
    location: ev.location,
    startsAt: fmtShort(ev.startsAt),
    endsAt: fmtShort(ev.endsAt),
    participants: ev.participants,
    maxParticipants: ev.maxParticipants,
    phases: ev.phases,
    currentPhase: ev.currentPhase,
    rewards: { xp: ev.xpReward, nx: ev.nxReward },
  });
}

export async function eventMessage(ev) {
  const components = [];
  if (['scheduled', 'active'].includes(ev.status)) {
    components.push(
      row(
        button(cid('ev', 'join', ev.id), 'انضم للحدث', ButtonStyle.Success, { emoji: '🚩' }),
        button(cid('ev', 'leave', ev.id), 'انسحب', ButtonStyle.Secondary),
        button(cid('ev', 'refresh', ev.id), 'تحديث', ButtonStyle.Secondary, { emoji: '🔄' }),
      ),
    );
    const phase = ev.phases?.find((p) => p.position === ev.currentPhase && p.status === 'active');
    if (ev.status === 'active' && phase?.choices?.length) {
      components.push(
        row(
          select(
            cid('ev', 'vote', ev.id),
            `قرار المرحلة: ${phase.title}`,
            phase.choices.map((c, i) => ({ label: c, value: String(i), emoji: '🗳️' })),
          ),
        ),
      );
    }
  }
  return { files: [card(await eventCard(ev), 'event')], components };
}
