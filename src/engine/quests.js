/**
 * Pure quest rules: requirement checks and objective evaluation.
 * The service feeds plain data in, so every rule is unit-testable.
 */

export function checkQuestRequirements(quest, ctx) {
  const problems = [];
  if (!quest.active) problems.push('هذه المهمة غير متاحة حالياً');
  if (quest.expiresAt && new Date(quest.expiresAt) < (ctx.now ?? new Date())) problems.push('انتهت صلاحية هذه المهمة');
  if (ctx.level < quest.minLevel) problems.push(`تحتاج إلى المستوى ${quest.minLevel}`);
  if (quest.requiredQuestId && !ctx.completedQuestIds.includes(quest.requiredQuestId)) {
    problems.push(`يجب إنجاز مهمة «${quest.requiredQuestTitle ?? 'سابقة'}» أولاً`);
  }
  if (ctx.openQuestIds.includes(quest.id)) problems.push('هذه المهمة مقبولة لديك بالفعل');
  if (!quest.repeatable && ctx.completedQuestIds.includes(quest.id)) problems.push('أنجزت هذه المهمة من قبل');
  if (ctx.activeCount >= ctx.maxActive) problems.push(`لا يمكنك حمل أكثر من ${ctx.maxActive} مهام في نفس الوقت`);
  return { ok: problems.length === 0, problems };
}

/**
 * Evaluates objectives against the character's state.
 * progress: counters recorded by the game (defeat/work/visit), keyed by objective id.
 */
export function evaluateObjectives(objectives, { inventory, progress, currentLocationKey }) {
  return objectives.map((o) => {
    let current;
    switch (o.kind) {
      case 'collect':
        current = inventory[o.targetKey] ?? 0;
        break;
      case 'visit':
        // Only visits made after accepting count (travel records them in progress), or standing there now.
        current = (progress[o.id] ?? 0) > 0 || currentLocationKey === o.targetKey ? 1 : 0;
        break;
      case 'defeat':
      case 'work':
      case 'manual':
        current = progress[o.id] ?? 0;
        break;
      default:
        current = 0;
    }
    const done = current >= o.requiredCount;
    return { ...o, current: Math.min(current, o.requiredCount), done };
  });
}

/** Objectives a player can't prove automatically and need a staff review. */
export function needsReview(quest, evaluated) {
  return quest.requiresReview || evaluated.some((o) => o.kind === 'manual' && !o.done);
}

export function autoObjectivesDone(evaluated) {
  return evaluated.filter((o) => o.kind !== 'manual').every((o) => o.done);
}
