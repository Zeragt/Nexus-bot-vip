import { getPool, tx } from '../db/pool.js';
import { UserError } from '../core/errors.js';
import { economy, guildProgression } from '../config/game.js';
import { requireByUser } from './characters.js';
import { audit } from './audit.js';
import { cleanText } from '../utils/validation.js';

const ROLE_LABELS = { leader: 'القائد', officer: 'ضابط', member: 'عضو' };
export const guildRoleLabel = (r) => ROLE_LABELS[r] ?? r;

export async function getGuild(input, db = getPool()) {
  const q = String(input ?? '').trim();
  const { rows } = await db.query(
    `SELECT g.*, c.name AS leader_name, (SELECT count(*)::int FROM guild_members m WHERE m.guild_id = g.id) AS member_count
     FROM guilds g JOIN characters c ON c.id = g.leader_character_id
     WHERE ${/^\d+$/.test(q) ? 'g.id = $1::int' : 'lower(g.name) = lower($1) OR lower(g.tag) = lower($1)'} LIMIT 1`,
    [q],
  );
  return rows[0] ?? null;
}

export async function guildAutocomplete(query) {
  const { rows } = await getPool().query('SELECT id, name, tag FROM guilds WHERE name ILIKE $1 OR tag ILIKE $1 ORDER BY level DESC, name LIMIT 25', [
    `%${query ?? ''}%`,
  ]);
  return rows.map((r) => ({ name: `${r.name} [${r.tag}]`.slice(0, 100), value: String(r.id) }));
}

export async function members(guildId) {
  const { rows } = await getPool().query(
    `SELECT m.*, c.name, c.code, c.level, c.user_id FROM guild_members m JOIN characters c ON c.id = m.character_id
     WHERE m.guild_id = $1 ORDER BY CASE m.role WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END, m.contributed DESC, m.joined_at`,
    [guildId],
  );
  return rows;
}

/** Guild XP from members' activity; levels up the guild and raises its member cap. */
export async function addGuildXp(db, characterId, amount) {
  if (!(amount > 0)) return null;
  const g = (
    await db.query('SELECT g.id, g.level, g.xp FROM guild_members m JOIN guilds g ON g.id = m.guild_id WHERE m.character_id = $1 FOR UPDATE OF g', [
      characterId,
    ])
  ).rows[0];
  if (!g) return null;
  let level = g.level;
  let xp = Number(g.xp) + amount;
  while (xp >= guildProgression.xpToNext(level)) {
    xp -= guildProgression.xpToNext(level);
    level += 1;
  }
  await db.query('UPDATE guilds SET level = $2, xp = $3, max_members = $4 WHERE id = $1', [g.id, level, xp, guildProgression.maxMembers(level)]);
  return { guildId: g.id, level, leveledUp: level > g.level };
}

async function myMembership(db, characterId, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT m.*, g.name, g.tag, g.leader_character_id, g.treasury, g.max_members FROM guild_members m JOIN guilds g ON g.id = m.guild_id
     WHERE m.character_id = $1 ${lock ? 'FOR UPDATE OF g' : ''}`,
    [characterId],
  );
  return rows[0] ?? null;
}

function requireRank(m, roles, msg = 'هذا الإجراء للقائد أو الضباط فقط') {
  if (!m) throw new UserError('أنت لست عضواً في أي نقابة');
  if (!roles.includes(m.role)) throw new UserError(msg);
}

export async function createGuild(userId, { name, tag, description }) {
  const n = cleanText(name).replace(/\s+/g, ' ');
  const t = cleanText(tag).toUpperCase();
  if (n.length < 3 || n.length > 32) throw new UserError('اسم النقابة يجب أن يكون بين 3 و 32 حرفاً');
  if (!/^[A-Z0-9]{2,5}$/.test(t)) throw new UserError('الرمز يجب أن يكون من 2 إلى 5 أحرف إنجليزية أو أرقام');
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    if (ch.level < economy.guildCreateMinLevel) throw new UserError(`تحتاج إلى المستوى ${economy.guildCreateMinLevel} لتأسيس نقابة`);
    if (await myMembership(db, ch.id)) throw new UserError('أنت عضو في نقابة بالفعل. غادرها أولاً');
    const dup = await db.query('SELECT 1 FROM guilds WHERE lower(name) = lower($1) OR lower(tag) = lower($2)', [n, t]);
    if (dup.rowCount) throw new UserError('يوجد نقابة بهذا الاسم أو الرمز');
    const res = await db.query('UPDATE characters SET nx = nx - $2 WHERE id = $1 AND nx >= $2', [ch.id, economy.guildCreateCost]);
    if (!res.rowCount) throw new UserError(`تأسيس النقابة يكلف ${economy.guildCreateCost} NX`);
    await db.query("INSERT INTO transactions (from_character_id, amount, kind, note) VALUES ($1, $2, 'guild_create', $3)", [
      ch.id,
      economy.guildCreateCost,
      `تأسيس نقابة ${n}`,
    ]);
    const g = (
      await db.query('INSERT INTO guilds (name, tag, description, leader_character_id, max_members) VALUES ($1,$2,$3,$4,$5) RETURNING *', [
        n,
        t,
        cleanText(description).slice(0, 300),
        ch.id,
        guildProgression.maxMembers(1),
      ])
    ).rows[0];
    await db.query("INSERT INTO guild_members (guild_id, character_id, role) VALUES ($1, $2, 'leader')", [g.id, ch.id]);
    await audit({ actorId: userId, action: 'guild_created', targetType: 'guild', targetId: g.id, after: { name: n, tag: t } }, db);
    return g;
  });
}

export async function invite(userId, targetUserId) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db);
    const m = await myMembership(db, ch.id);
    requireRank(m, ['leader', 'officer']);
    const target = await requireByUser(targetUserId, db).catch(() => {
      throw new UserError('هذا المستخدم لا يملك شخصية');
    });
    if (await myMembership(db, target.id)) throw new UserError(`${target.name} عضو في نقابة بالفعل`);
    const count = (await db.query('SELECT count(*)::int AS n FROM guild_members WHERE guild_id = $1', [m.guild_id])).rows[0].n;
    if (count >= m.max_members) throw new UserError('النقابة ممتلئة. ارفع مستواها لزيادة السعة');
    await db.query(
      `INSERT INTO guild_invites (guild_id, character_id, invited_by, expires_at) VALUES ($1,$2,$3, now() + interval '24 hours')
       ON CONFLICT (guild_id, character_id) DO UPDATE SET expires_at = EXCLUDED.expires_at, invited_by = EXCLUDED.invited_by`,
      [m.guild_id, target.id, ch.id],
    );
    return { guild: { id: m.guild_id, name: m.name, tag: m.tag }, target, inviter: ch };
  });
}

export async function acceptInvite(userId, guildId) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    if (await myMembership(db, ch.id)) throw new UserError('أنت عضو في نقابة بالفعل');
    const inv = (await db.query('DELETE FROM guild_invites WHERE guild_id = $1 AND character_id = $2 AND expires_at > now() RETURNING *', [guildId, ch.id]))
      .rows[0];
    if (!inv) throw new UserError('لا توجد دعوة صالحة من هذه النقابة');
    const g = (await db.query('SELECT * FROM guilds WHERE id = $1 FOR UPDATE', [guildId])).rows[0];
    if (!g) throw new UserError('النقابة لم تعد موجودة');
    const count = (await db.query('SELECT count(*)::int AS n FROM guild_members WHERE guild_id = $1', [guildId])).rows[0].n;
    if (count >= g.max_members) throw new UserError('النقابة ممتلئة');
    await db.query("INSERT INTO guild_members (guild_id, character_id, role) VALUES ($1, $2, 'member')", [guildId, ch.id]);
    return g;
  });
}

export async function leave(userId) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db);
    const m = await myMembership(db, ch.id, { lock: true });
    if (!m) throw new UserError('أنت لست عضواً في أي نقابة');
    if (m.role === 'leader') {
      const others = (await db.query('SELECT count(*)::int AS n FROM guild_members WHERE guild_id = $1', [m.guild_id])).rows[0].n - 1;
      if (others > 0) throw new UserError('أنت القائد. سلّم القيادة عبر /guild promote أو احلّ النقابة عبر /guild disband');
      await db.query('DELETE FROM guilds WHERE id = $1', [m.guild_id]);
      await audit(
        { actorId: userId, action: 'guild_deleted', targetType: 'guild', targetId: m.guild_id, before: { name: m.name }, reason: 'last member left' },
        db,
      );
      return { disbanded: true, name: m.name };
    }
    await db.query('DELETE FROM guild_members WHERE character_id = $1', [ch.id]);
    return { disbanded: false, name: m.name };
  });
}

/** Promote: member → officer; officer → leader (only the leader can pass leadership). */
export async function promote(userId, targetUserId) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db);
    const m = await myMembership(db, ch.id, { lock: true });
    requireRank(m, ['leader'], 'الترقية من صلاحيات القائد فقط');
    const target = await requireByUser(targetUserId, db);
    const tm = (await db.query('SELECT * FROM guild_members WHERE guild_id = $1 AND character_id = $2', [m.guild_id, target.id])).rows[0];
    if (!tm) throw new UserError(`${target.name} ليس عضواً في نقابتك`);
    if (tm.role === 'member') {
      await db.query("UPDATE guild_members SET role = 'officer' WHERE guild_id = $1 AND character_id = $2", [m.guild_id, target.id]);
      return { target, role: 'officer' };
    }
    if (tm.role === 'officer') {
      await db.query("UPDATE guild_members SET role = 'officer' WHERE guild_id = $1 AND character_id = $2", [m.guild_id, ch.id]);
      await db.query("UPDATE guild_members SET role = 'leader' WHERE guild_id = $1 AND character_id = $2", [m.guild_id, target.id]);
      await db.query('UPDATE guilds SET leader_character_id = $2 WHERE id = $1', [m.guild_id, target.id]);
      return { target, role: 'leader' };
    }
    throw new UserError('لا يمكن ترقية القائد');
  });
}

export async function demote(userId, targetUserId) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db);
    const m = await myMembership(db, ch.id);
    requireRank(m, ['leader'], 'التخفيض من صلاحيات القائد فقط');
    const target = await requireByUser(targetUserId, db);
    const res = await db.query("UPDATE guild_members SET role = 'member' WHERE guild_id = $1 AND character_id = $2 AND role = 'officer'", [
      m.guild_id,
      target.id,
    ]);
    if (!res.rowCount) throw new UserError(`${target.name} ليس ضابطاً في نقابتك`);
    return { target };
  });
}

export async function kick(userId, targetUserId) {
  return tx(async (db) => {
    const ch = await requireByUser(userId, db);
    const m = await myMembership(db, ch.id);
    requireRank(m, ['leader', 'officer']);
    const target = await requireByUser(targetUserId, db);
    if (target.id === ch.id) throw new UserError('لا يمكنك طرد نفسك. استخدم /guild leave');
    const tm = (await db.query('SELECT role FROM guild_members WHERE guild_id = $1 AND character_id = $2', [m.guild_id, target.id])).rows[0];
    if (!tm) throw new UserError(`${target.name} ليس عضواً في نقابتك`);
    if (tm.role === 'leader' || (tm.role === 'officer' && m.role !== 'leader')) throw new UserError('لا يمكنك طرد من هو أعلى منك أو بنفس رتبتك');
    await db.query('DELETE FROM guild_members WHERE guild_id = $1 AND character_id = $2', [m.guild_id, target.id]);
    return { target, guild: m.name };
  });
}

export async function deposit(userId, amount) {
  if (!Number.isInteger(amount) || amount <= 0) throw new UserError('مبلغ غير صالح');
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const m = await myMembership(db, ch.id, { lock: true });
    if (!m) throw new UserError('أنت لست عضواً في أي نقابة');
    const res = await db.query('UPDATE characters SET nx = nx - $2 WHERE id = $1 AND nx >= $2', [ch.id, amount]);
    if (!res.rowCount) throw new UserError('رصيدك من NX لا يكفي');
    await db.query('UPDATE guilds SET treasury = treasury + $2 WHERE id = $1', [m.guild_id, amount]);
    await db.query('UPDATE guild_members SET contributed = contributed + $3 WHERE guild_id = $1 AND character_id = $2', [m.guild_id, ch.id, amount]);
    await db.query("INSERT INTO transactions (from_character_id, amount, kind, note) VALUES ($1, $2, 'guild_deposit', $3)", [
      ch.id,
      amount,
      `إيداع في خزينة ${m.name}`,
    ]);
    await addGuildXp(db, ch.id, Math.floor(amount / 20));
    return { guild: m.name, treasury: Number(m.treasury) + amount };
  });
}

export async function withdraw(userId, amount) {
  if (!Number.isInteger(amount) || amount <= 0) throw new UserError('مبلغ غير صالح');
  return tx(async (db) => {
    const ch = await requireByUser(userId, db, { lock: true });
    const m = await myMembership(db, ch.id, { lock: true });
    requireRank(m, ['leader'], 'السحب من الخزينة للقائد فقط');
    const res = await db.query('UPDATE guilds SET treasury = treasury - $2 WHERE id = $1 AND treasury >= $2 RETURNING treasury', [m.guild_id, amount]);
    if (!res.rowCount) throw new UserError('الخزينة لا تحتوي هذا المبلغ');
    await db.query('UPDATE characters SET nx = nx + $2 WHERE id = $1', [ch.id, amount]);
    await db.query("INSERT INTO transactions (to_character_id, amount, kind, note) VALUES ($1, $2, 'guild_withdraw', $3)", [
      ch.id,
      amount,
      `سحب من خزينة ${m.name}`,
    ]);
    await audit(
      { actorId: userId, action: 'admin_action', targetType: 'guild', targetId: m.guild_id, after: { withdraw: amount }, reason: 'treasury withdraw' },
      db,
    );
    return { guild: m.name, treasury: Number(res.rows[0].treasury) };
  });
}

export async function disband(userId, { actorId = userId, guildId = null, reason = null } = {}) {
  return tx(async (db) => {
    let gid = guildId;
    if (!gid) {
      const ch = await requireByUser(userId, db);
      const m = await myMembership(db, ch.id, { lock: true });
      requireRank(m, ['leader'], 'حلّ النقابة من صلاحيات القائد فقط');
      gid = m.guild_id;
    }
    const g = (await db.query('DELETE FROM guilds WHERE id = $1 RETURNING *', [gid])).rows[0];
    if (!g) throw new UserError('النقابة غير موجودة');
    await audit({ actorId, action: 'guild_deleted', targetType: 'guild', targetId: gid, before: { name: g.name, treasury: g.treasury }, reason }, db);
    return g;
  });
}

export async function myGuildId(userId) {
  const { rows } = await getPool().query('SELECT m.guild_id FROM guild_members m JOIN characters c ON c.id = m.character_id WHERE c.user_id = $1', [userId]);
  return rows[0]?.guild_id ?? null;
}
