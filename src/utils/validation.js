import { z } from 'zod';
import { UserError } from '../core/errors.js';

// Strip control characters, zero-width tricks and Discord mention syntax from free text.
export function cleanText(v) {
  return (
    String(v ?? '')
      // eslint-disable-next-line no-control-regex -- removes control characters from user input
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/@(everyone|here)/gi, '@\u200B$1')
      .replace(/<@[!&]?\d+>/g, '')
      .trim()
  );
}

const text = (max, min = 0) =>
  z
    .string()
    .optional()
    .transform((v) => cleanText(v))
    .refine((v) => v.length <= max, { message: `النص طويل جداً (الحد ${max} حرفاً)` })
    .refine((v) => v.length === 0 || v.length >= min, { message: `النص قصير جداً (الحد الأدنى ${min})` })
    .transform((v) => (v.length ? v : null));

export const characterSchema = z.object({
  name: z
    .string()
    .transform((v) => cleanText(v).replace(/\s+/g, ' '))
    .refine((v) => v.length >= 2 && v.length <= 32, { message: 'الاسم يجب أن يكون بين 2 و 32 حرفاً' })
    .refine((v) => /^[\p{L}\p{M}\p{N} '\-.]+$/u.test(v), { message: 'الاسم يحتوي على رموز غير مسموحة' }),
  age: text(20),
  gender: text(30),
  race: text(40),
  origin: text(60),
  occupation: text(60),
  personality: text(400),
  appearance: text(600),
  backstory: text(1500),
  alignment: text(40),
  abilities: text(600),
  weaknesses: text(600),
});

export const characterPatchSchema = characterSchema.partial();

/** Validates with zod and throws a UserError with the first readable issue. */
export function parseOrThrow(schema, data) {
  const res = schema.safeParse(data);
  if (!res.success) throw new UserError(res.error.issues[0]?.message ?? 'بيانات غير صالحة');
  return res.data;
}

/** Parses "1500", "1,500", "1.5k", "2m". Rejects decimals, negatives and absurd values. */
export function parseAmount(input, { min = 1, max = 1_000_000_000 } = {}) {
  const s = String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[,_\s]/g, '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const m = /^(\d+(?:\.\d+)?)(k|m)?$/.exec(s);
  if (!m) throw new UserError('أدخل مبلغاً صحيحاً، مثل 500 أو 1.5k');
  const mult = m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1;
  const value = Number(m[1]) * mult;
  if (!Number.isInteger(value)) throw new UserError('المبلغ يجب أن يكون رقماً صحيحاً');
  if (value < min) throw new UserError(`أقل مبلغ مسموح هو ${min}`);
  if (value > max) throw new UserError(`أكبر مبلغ مسموح هو ${max.toLocaleString('en-US')}`);
  return value;
}

export const hexColor = z.string().regex(/^#?[0-9a-f]{6}$/i, 'لون غير صالح، استخدم صيغة مثل #22d3ee');

export function slugify(v) {
  return cleanText(v)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export const keyOf = (v) =>
  cleanText(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
