import { getPool } from '../db/pool.js';
import { app } from '../core/context.js';
import { logger } from '../core/logger.js';

export const ACTION_LABELS = {
  character_created: 'إنشاء شخصية',
  character_edited: 'تعديل شخصية',
  character_deleted: 'حذف شخصية',
  money_added: 'إضافة أموال',
  money_removed: 'خصم أموال',
  item_added: 'إضافة غرض',
  item_removed: 'إزالة غرض',
  item_created: 'إنشاء غرض',
  quest_created: 'إنشاء مهمة',
  quest_completed: 'إنجاز مهمة',
  quest_reviewed: 'مراجعة مهمة',
  combat_started: 'بدء قتال',
  combat_finished: 'نهاية قتال',
  guild_created: 'إنشاء نقابة',
  guild_deleted: 'حذف نقابة',
  trade_completed: 'صفقة تداول',
  event_created: 'إنشاء حدث',
  event_ended: 'إنهاء حدث',
  admin_action: 'إجراء إداري',
  class_chosen: 'اختيار كلاس أو مسار',
  story_chapter: 'إنهاء فصل من القصة',
};

/**
 * Records who did what to whom, with before/after snapshots and a reason.
 * Never store secrets or personal data here: only game state.
 */
export async function audit({ actorId = null, action, targetType = null, targetId = null, before = null, after = null, reason = null }, db = null) {
  try {
    await (db ?? getPool()).query(
      `INSERT INTO admin_logs (actor_id, action, target_type, target_id, before, after, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [actorId, action, targetType, targetId == null ? null : String(targetId), before && JSON.stringify(before), after && JSON.stringify(after), reason],
    );
  } catch (err) {
    logger.error({ err, action }, 'Failed to write audit log');
  }
  if (app.logSink) {
    Promise.resolve(app.logSink({ actorId, action, targetType, targetId, before, after, reason })).catch((err) =>
      logger.warn({ err: err.message }, 'Audit log channel post failed'),
    );
  }
}
