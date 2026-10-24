/**
 * Tiny stand-ins for discord.js interactions, enough to drive the real command and
 * component handlers end to end against a database without connecting to Discord.
 */
let seq = 0;

class Base {
  constructor({ user, roles = [], admin = false }) {
    this.id = String(++seq);
    this.user = { id: user.id, username: user.username ?? `user${user.id}`, globalName: null, bot: false };
    this.member = { roles: { cache: new Map(roles.map((r) => [r, {}])) }, displayName: this.user.username };
    this.memberPermissions = { has: () => admin };
    this.guild = { ownerId: '0' };
    this.guildId = '100000000000000001';
    this.channelId = '200000000000000001';
    this.channel = { id: this.channelId, send: async (p) => this.record('channel.send', p, { id: `m${++seq}`, channelId: this.channelId }) };
    this.client = { users: { fetch: async (id) => ({ id, username: `user${id}`, send: async () => ({}) }) } };
    this.deferred = false;
    this.replied = false;
    this.ephemeral = false;
    this.calls = [];
  }
  record(kind, payload, ret = { id: `m${++seq}`, channelId: this.channelId }) {
    this.calls.push({ kind, payload });
    return ret;
  }
  async deferReply(opts = {}) {
    this.deferred = true;
    this.ephemeral = Boolean(opts.flags);
    return this.record('deferReply', opts);
  }
  async reply(p) {
    this.replied = true;
    return this.record('reply', p);
  }
  async editReply(p) {
    return this.record('editReply', p);
  }
  async followUp(p) {
    return this.record('followUp', p);
  }
  async deleteReply() {
    return this.record('deleteReply', null);
  }
  async showModal(m) {
    this.replied = true;
    return this.record('showModal', m.toJSON ? m.toJSON() : m);
  }
  isAutocomplete() {
    return false;
  }
  isChatInputCommand() {
    return false;
  }
  isMessageComponent() {
    return false;
  }
  isModalSubmit() {
    return false;
  }
  /** Everything the user would have seen, flattened to text (embeds) and file names (cards). */
  get output() {
    const texts = [];
    const files = [];
    for (const c of this.calls) {
      const p = c.payload ?? {};
      for (const e of p.embeds ?? []) texts.push(e.data?.description ?? e.description ?? '');
      if (p.content) texts.push(p.content);
      for (const f of p.files ?? []) files.push(f.name);
    }
    return { texts, files, text: texts.join('\n') };
  }
  get errors() {
    return this.output.texts.filter((t) => t.startsWith('⚠️'));
  }
}

class Options {
  constructor({ sub = null, group = null, values = {}, focused = null }) {
    Object.assign(this, { sub, group, values, focused });
  }
  getSubcommand() {
    return this.sub;
  }
  getSubcommandGroup() {
    return this.group;
  }
  #get(name, required) {
    const v = this.values[name];
    if (v === undefined || v === null) {
      if (required) throw new Error(`Missing required option ${name}`);
      return null;
    }
    return v;
  }
  getString(n, r) {
    return this.#get(n, r);
  }
  getInteger(n, r) {
    return this.#get(n, r);
  }
  getNumber(n, r) {
    return this.#get(n, r);
  }
  getBoolean(n, r) {
    return this.#get(n, r);
  }
  getUser(n, r) {
    const v = this.#get(n, r);
    return v ? { id: v.id, username: v.username ?? `user${v.id}`, bot: Boolean(v.bot) } : null;
  }
  getChannel(n, r) {
    return this.#get(n, r);
  }
  getAttachment(n, r) {
    return this.#get(n, r);
  }
  getFocused(full) {
    return full ? this.focused : (this.focused?.value ?? '');
  }
}

export class FakeCommand extends Base {
  constructor(name, { sub, group, options = {}, ...rest }) {
    super(rest);
    this.commandName = name;
    this.options = new Options({ sub, group, values: options });
  }
  isChatInputCommand() {
    return true;
  }
}

export class FakeAutocomplete extends Base {
  constructor(name, { sub, group, options = {}, focused, ...rest }) {
    super(rest);
    this.commandName = name;
    this.options = new Options({ sub, group, values: options, focused });
    this.responded = null;
  }
  isAutocomplete() {
    return true;
  }
  async respond(choices) {
    this.responded = choices;
  }
}

export class FakeComponent extends Base {
  constructor(customId, { values = [], fields = {}, modal = false, message = {}, ...rest }) {
    super(rest);
    this.customId = customId;
    this.values = values;
    this.modal = modal;
    this.fields = { getTextInputValue: (n) => fields[n] ?? '' };
    const attachments = message.attachments ?? [];
    this.message = {
      id: 'msg1',
      createdTimestamp: message.createdTimestamp ?? Date.now(),
      editedTimestamp: null,
      attachments: { first: () => attachments[0] },
      edit: async (p) => this.record('message.edit', p),
    };
  }
  isMessageComponent() {
    return !this.modal;
  }
  isModalSubmit() {
    return this.modal;
  }
  async update(p) {
    this.replied = true;
    return this.record('update', p);
  }
  async deferUpdate() {
    this.deferred = true;
    return this.record('deferUpdate', null);
  }
}

/** Pulls every customId out of the components of the last payload that had any. */
export function customIds(i) {
  const ids = [];
  for (const c of i.calls) {
    for (const row of c.payload?.components ?? []) {
      const json = row.toJSON ? row.toJSON() : row;
      for (const comp of json.components ?? []) if (comp.custom_id) ids.push(comp.custom_id);
    }
  }
  return ids;
}
