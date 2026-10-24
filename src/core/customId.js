/**
 * Component custom IDs: "<handler>:<action>:<args...>", max 100 chars.
 * Handlers own their action/args layout; this only builds and parses safely.
 */
const SEP = ':';

export function cid(handler, action, ...args) {
  const parts = [handler, action, ...args.map((a) => String(a ?? ''))];
  for (const p of parts) if (p.includes(SEP)) throw new Error(`customId part contains separator: ${p}`);
  const id = parts.join(SEP);
  if (id.length > 100) throw new Error(`customId too long (${id.length}): ${id}`);
  return id;
}

export function parseCid(id) {
  const [handler, action = '', ...args] = String(id).split(SEP);
  return { handler, action, args };
}
