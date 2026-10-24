import { describe, it, expect } from 'vitest';
import * as render from '../../src/render/index.js';
import { safe } from '../../src/render/draw.js';
import { samples } from '../../scripts/samples.js';

describe('renderer', () => {
  it.each(Object.entries(samples))('renders %s', async (_name, [fn, data]) => {
    const buf = await render[fn](data);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(5_000);
    expect(buf.length).toBeLessThan(2_000_000);
  });

  it('renders with missing optional data', async () => {
    const buf = await render.renderList({ title: 'فارغ', rows: [] });
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('safe() strips emoji and keeps Arabic', () => {
    expect(safe('مرحبا ⚔️ 🔥 بك')).toBe('مرحبا بك');
  });
});
