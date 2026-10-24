/**
 * Discord caps a command's combined name + description + option names, descriptions,
 * and choice names/values at 8000 characters. This mirrors that count.
 */
export function commandSize(json) {
  let n = (json.name?.length ?? 0) + (json.description?.length ?? 0);
  for (const o of json.options ?? []) n += commandSize(o);
  for (const c of json.choices ?? []) n += String(c.name).length + String(c.value).length;
  return n;
}
