import { describe, expect, it } from 'vitest';
import { BoundedPreviewCache, PreviewWorkBudget } from './previewWorkBudget';

describe('diagnostic preview work budget', () => {
  const radius = { x: 1, y: 1, z: 1 };
  it('limits moving coverage to ten updates per second, preserves pending geometry, and skips an unchanged ball', () => {
    const budget = new PreviewWorkBudget();
    expect(budget.coverageDue(0, { x: 0, y: 1, z: 0 }, radius)).toBe(true);
    expect(budget.coverageDue(50, { x: 1, y: 1, z: 0 }, radius)).toBe(false);
    expect(budget.coverageDue(100, { x: 1, y: 1, z: 0 }, radius)).toBe(true);
    expect(budget.coverageDue(300, { x: 1, y: 1, z: 0 }, radius)).toBe(false);
    expect(budget.coverageDue(300, { x: 1, y: 1, z: 0 }, { ...radius, y: 1.2 })).toBe(true);
  });

  it('recomputes explicit rig edits immediately without granting an extra mapping readback', () => {
    const budget = new PreviewWorkBudget();
    const center = { x: 0, y: 1, z: 0 };
    expect(budget.coverageDue(0, center, radius)).toBe(true);
    expect(budget.readbackDue(0)).toBe(true);
    expect(budget.coverageDue(10, center, radius, true)).toBe(true);
    expect(budget.readbackDue(10)).toBe(false);
    expect(budget.readbackDue(100)).toBe(true);
  });
});

describe('bounded thumbnail cache', () => {
  it('evicts the least recently used pixels and replaces changed preset pixels', () => {
    const cache = new BoundedPreviewCache<number>(2);
    cache.set('paint-a', 1); cache.set('paint-b', 2);
    expect(cache.get('paint-a')).toBe(1);
    cache.set('crystal', 3);
    expect(cache.get('paint-b')).toBeUndefined();
    cache.set('paint-a', 4);
    expect(cache.get('paint-a')).toBe(4);
    cache.clear();
    expect(cache.get('crystal')).toBeUndefined();
  });
});
