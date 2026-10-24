import { describe, it, expect } from 'vitest';
import { commandList, componentList, buildRegistry } from '../../src/commands/index.js';
import { commandSize } from '../../src/discord/limits.js';

const walk = (opts = [], fn, depth = 0) => {
  for (const o of opts) {
    fn(o, depth);
    walk(o.options, fn, depth + 1);
  }
};

describe('slash command definitions', () => {
  const payloads = commandList.map((c) => c.data.toJSON());

  it('registry has unique command names and component prefixes', () => {
    const { commands, components } = buildRegistry();
    expect(commands.size).toBe(commandList.length);
    expect(components.size).toBe(componentList.length);
  });

  it('every command stays under Discord limits', () => {
    for (const p of payloads) {
      expect(commandSize(p), p.name).toBeLessThanOrEqual(8000);
      expect((p.options ?? []).length, p.name).toBeLessThanOrEqual(25);
    }
  });

  it('names are lowercase English and descriptions are set', () => {
    for (const p of payloads) {
      expect(p.name).toMatch(/^[a-z_-]{1,32}$/);
      walk(p.options, (o) => {
        expect(o.name, `${p.name}.${o.name}`).toMatch(/^[a-z0-9_-]{1,32}$/);
        expect(o.description.length, `${p.name}.${o.name}`).toBeGreaterThan(0);
        expect(o.description.length, `${p.name}.${o.name}`).toBeLessThanOrEqual(100);
        expect((o.choices ?? []).length).toBeLessThanOrEqual(25);
      });
    }
  });

  it('every command module has an execute function and autocomplete where needed', () => {
    for (const c of commandList) {
      expect(typeof c.execute, c.data.name).toBe('function');
      let needs = false;
      walk(c.data.toJSON().options, (o) => (needs ||= Boolean(o.autocomplete)));
      if (needs) expect(typeof c.autocomplete, c.data.name).toBe('function');
    }
  });

  it('admin tools are hidden from regular members by default', () => {
    for (const name of ['admin', 'gm']) {
      const p = payloads.find((x) => x.name === name);
      expect(p.default_member_permissions).toBeTruthy();
    }
  });
});
