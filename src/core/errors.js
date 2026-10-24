/** An error whose message is safe and meant to be shown to the player (in Arabic). */
export class UserError extends Error {
  constructor(message, { ephemeral = true } = {}) {
    super(message);
    this.name = 'UserError';
    this.userMessage = message;
    this.ephemeral = ephemeral;
  }
}

export const fail = (message) => {
  throw new UserError(message);
};

export function assert(condition, message) {
  if (!condition) throw new UserError(message);
}

/** Maps known Postgres constraint violations to friendly messages instead of crashes. */
export function translateDbError(err) {
  if (err?.userMessage) return err.userMessage;
  switch (err?.code) {
    case '23514':
      return 'العملية مرفوضة لأنها تخالف قواعد العالم (رصيد أو كمية غير كافية).';
    case '23505':
      return 'هذا موجود بالفعل.';
    case '23503':
      return 'العنصر المطلوب لم يعد موجوداً.';
    default:
      return null;
  }
}
