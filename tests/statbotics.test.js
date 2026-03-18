/**
 * Tests for statbotics.js pure utility functions.
 * Loads the source file via Node's vm module to test the actual code without a browser.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createContext, runInContext } from 'vm';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let epaColor, formatPercentile, formatRpProb, epaBarWidth;

beforeAll(() => {
  const code = readFileSync(resolve(__dirname, '../statbotics.js'), 'utf8');
  const ctx = {};
  createContext(ctx);
  runInContext(code, ctx);
  ({ epaColor, formatPercentile, formatRpProb, epaBarWidth } = ctx);
});

// ===========================
// epaColor
// ===========================
describe('epaColor', () => {
  it('returns text-dim for null', () => {
    expect(epaColor(null)).toBe('var(--text-dim)');
  });

  it('returns text-dim for undefined', () => {
    expect(epaColor(undefined)).toBe('var(--text-dim)');
  });

  // Elite tier: >= 70
  it('returns accent3 (elite) at exactly 70', () => {
    expect(epaColor(70)).toBe('var(--accent3)');
  });
  it('returns accent3 (elite) above 70', () => {
    expect(epaColor(100)).toBe('var(--accent3)');
  });

  // Strong tier: >= 50, < 70
  it('returns accent (strong) at exactly 50', () => {
    expect(epaColor(50)).toBe('var(--accent)');
  });
  it('returns accent (strong) at 60', () => {
    expect(epaColor(60)).toBe('var(--accent)');
  });
  it('returns accent (strong) at 69', () => {
    expect(epaColor(69)).toBe('var(--accent)');
  });

  // Average tier: >= 35, < 50
  it('returns text (average) at exactly 35', () => {
    expect(epaColor(35)).toBe('var(--text)');
  });
  it('returns text (average) at 45', () => {
    expect(epaColor(45)).toBe('var(--text)');
  });
  it('returns text (average) at 49', () => {
    expect(epaColor(49)).toBe('var(--text)');
  });

  // Below average: < 35
  it('returns text-dim (below average) at 34', () => {
    expect(epaColor(34)).toBe('var(--text-dim)');
  });
  it('returns text-dim (below average) at 0', () => {
    expect(epaColor(0)).toBe('var(--text-dim)');
  });
  it('returns text-dim (below average) at negative values', () => {
    expect(epaColor(-5)).toBe('var(--text-dim)');
  });
});

// ===========================
// formatPercentile
// ===========================
describe('formatPercentile', () => {
  it('returns empty string for null', () => {
    expect(formatPercentile(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatPercentile(undefined)).toBe('');
  });

  // Standard ordinal suffixes
  it('formats 1st correctly', () => {
    expect(formatPercentile(0.01)).toBe('1st %ile');
  });
  it('formats 2nd correctly', () => {
    expect(formatPercentile(0.02)).toBe('2nd %ile');
  });
  it('formats 3rd correctly', () => {
    expect(formatPercentile(0.03)).toBe('3rd %ile');
  });
  it('formats 4th correctly', () => {
    expect(formatPercentile(0.04)).toBe('4th %ile');
  });
  it('formats 21st correctly', () => {
    expect(formatPercentile(0.21)).toBe('21st %ile');
  });
  it('formats 22nd correctly', () => {
    expect(formatPercentile(0.22)).toBe('22nd %ile');
  });
  it('formats 23rd correctly', () => {
    expect(formatPercentile(0.23)).toBe('23rd %ile');
  });
  it('formats 83rd correctly', () => {
    expect(formatPercentile(0.83)).toBe('83rd %ile');
  });

  // Teens use "th" (special case: 11th, 12th, 13th)
  it('formats 11th correctly (teen exception)', () => {
    expect(formatPercentile(0.11)).toBe('11th %ile');
  });
  it('formats 12th correctly (teen exception)', () => {
    expect(formatPercentile(0.12)).toBe('12th %ile');
  });
  it('formats 13th correctly (teen exception)', () => {
    expect(formatPercentile(0.13)).toBe('13th %ile');
  });

  // Edge cases
  it('formats 100th correctly', () => {
    expect(formatPercentile(1.0)).toBe('100th %ile');
  });
  it('formats 50th correctly', () => {
    expect(formatPercentile(0.5)).toBe('50th %ile');
  });
});

// ===========================
// formatRpProb
// ===========================
describe('formatRpProb', () => {
  it('returns em dash for null', () => {
    expect(formatRpProb(null)).toBe('—');
  });
  it('returns em dash for undefined', () => {
    expect(formatRpProb(undefined)).toBe('—');
  });
  it('formats 0 as 0%', () => {
    expect(formatRpProb(0)).toBe('0%');
  });
  it('formats 0.75 as 75%', () => {
    expect(formatRpProb(0.75)).toBe('75%');
  });
  it('formats 1 as 100%', () => {
    expect(formatRpProb(1)).toBe('100%');
  });
  it('clamps values above 1 to 100%', () => {
    expect(formatRpProb(1.5)).toBe('100%');
  });
  it('clamps negative values to 0%', () => {
    expect(formatRpProb(-0.5)).toBe('0%');
  });
  it('rounds fractional values', () => {
    expect(formatRpProb(0.676)).toBe('68%');
  });
});

// ===========================
// epaBarWidth
// ===========================
describe('epaBarWidth', () => {
  it('returns 0 for falsy val', () => {
    expect(epaBarWidth(0, 100)).toBe(0);
  });
  it('returns 0 for null val', () => {
    expect(epaBarWidth(null, 100)).toBe(0);
  });
  it('returns 0 for null max', () => {
    expect(epaBarWidth(50, null)).toBe(0);
  });
  it('returns 0 for zero max', () => {
    expect(epaBarWidth(50, 0)).toBe(0);
  });
  it('calculates 50% correctly', () => {
    expect(epaBarWidth(50, 100)).toBe(50);
  });
  it('calculates 100% when val equals max', () => {
    expect(epaBarWidth(75, 75)).toBe(100);
  });
  it('caps at 100 when val exceeds max', () => {
    expect(epaBarWidth(200, 100)).toBe(100);
  });
  it('rounds to nearest integer', () => {
    expect(epaBarWidth(1, 3)).toBe(33);
  });
  it('rounds up correctly', () => {
    expect(epaBarWidth(2, 3)).toBe(67);
  });
});
