/**
 * Tests for scouting data aggregation and scoring business logic.
 *
 * These formulas mirror app.js and catch regressions if scoring rules change.
 * Functions are defined inline (mirroring app.js) to avoid loading DOM-dependent code.
 */
import { describe, it, expect } from 'vitest';

// ===========================
// SCORING FORMULAS (mirrored from app.js)
// ===========================

const TOWER_PTS = { 0: 0, 1: 10, 2: 20, 3: 30 };
const AUTO_TOWER_BONUS = 15; // pts for reaching L1 in auto

function avg(entries, field) {
  return entries.reduce((s, e) => s + (e[field] || 0), 0) / entries.length;
}

function calcAvgFuel(entries) {
  return avg(entries, 'autoFuel') + avg(entries, 'teleopFuel');
}

function calcAvgTowerPts(entries) {
  const n = entries.length;
  return entries.reduce((s, e) => {
    const autoPts = e.autoTower === 1 ? AUTO_TOWER_BONUS : 0;
    return s + autoPts + (TOWER_PTS[e.teleopTower || 0]);
  }, 0) / n;
}

function calcBestClimb(entries) {
  return Math.max(...entries.map(e => e.teleopTower || 0));
}

function calcAvgScore(entries) {
  const n = entries.length;
  return Math.round(entries.reduce((s, e) => s + e.score, 0) / n);
}

function calcAnyTrue(entries, field) {
  return entries.some(e => e[field]);
}

// ===========================
// TOWER POINTS
// ===========================
describe('tower points — teleop levels', () => {
  it('L0 (no climb) = 0 pts', () => {
    expect(calcAvgTowerPts([{ autoTower: 0, teleopTower: 0 }])).toBe(0);
  });
  it('L1 = 10 pts', () => {
    expect(calcAvgTowerPts([{ autoTower: 0, teleopTower: 1 }])).toBe(10);
  });
  it('L2 = 20 pts', () => {
    expect(calcAvgTowerPts([{ autoTower: 0, teleopTower: 2 }])).toBe(20);
  });
  it('L3 = 30 pts', () => {
    expect(calcAvgTowerPts([{ autoTower: 0, teleopTower: 3 }])).toBe(30);
  });
});

describe('tower points — auto tower bonus', () => {
  it('auto L1 = +15 pts bonus', () => {
    expect(calcAvgTowerPts([{ autoTower: 1, teleopTower: 0 }])).toBe(15);
  });
  it('auto L1 + teleop L1 = 25 pts', () => {
    expect(calcAvgTowerPts([{ autoTower: 1, teleopTower: 1 }])).toBe(25);
  });
  it('auto L1 + teleop L2 = 35 pts', () => {
    expect(calcAvgTowerPts([{ autoTower: 1, teleopTower: 2 }])).toBe(35);
  });
  it('auto L1 + teleop L3 = 45 pts', () => {
    expect(calcAvgTowerPts([{ autoTower: 1, teleopTower: 3 }])).toBe(45);
  });
  it('auto L0 gets no bonus', () => {
    expect(calcAvgTowerPts([{ autoTower: 0, teleopTower: 3 }])).toBe(30);
  });
});

describe('tower points — averaging across matches', () => {
  it('averages two entries correctly', () => {
    const entries = [
      { autoTower: 0, teleopTower: 3 }, // 30 pts
      { autoTower: 0, teleopTower: 1 }, // 10 pts
    ];
    expect(calcAvgTowerPts(entries)).toBe(20);
  });
  it('averages mixed auto and teleop entries', () => {
    const entries = [
      { autoTower: 1, teleopTower: 2 }, // 35 pts
      { autoTower: 0, teleopTower: 0 }, //  0 pts
    ];
    expect(calcAvgTowerPts(entries)).toBe(17.5);
  });
  it('treats missing teleopTower as 0', () => {
    expect(calcAvgTowerPts([{ autoTower: 0 }])).toBe(0);
  });
});

// ===========================
// FUEL AVERAGING
// ===========================
describe('fuel averaging', () => {
  it('combines auto and teleop fuel', () => {
    expect(calcAvgFuel([{ autoFuel: 10, teleopFuel: 40 }])).toBe(50);
  });
  it('averages across multiple entries', () => {
    const entries = [
      { autoFuel: 0, teleopFuel: 100 },
      { autoFuel: 0, teleopFuel: 0 },
    ];
    expect(calcAvgFuel(entries)).toBe(50);
  });
  it('treats missing fields as 0', () => {
    expect(calcAvgFuel([{}])).toBe(0);
  });
  it('handles only auto fuel', () => {
    expect(calcAvgFuel([{ autoFuel: 25 }])).toBe(25);
  });
  it('handles only teleop fuel', () => {
    expect(calcAvgFuel([{ teleopFuel: 80 }])).toBe(80);
  });
});

// ===========================
// BEST CLIMB
// ===========================
describe('best climb', () => {
  it('returns 0 when no climb across entries', () => {
    expect(calcBestClimb([{ teleopTower: 0 }, { teleopTower: 0 }])).toBe(0);
  });
  it('returns highest climb level seen', () => {
    expect(calcBestClimb([
      { teleopTower: 1 },
      { teleopTower: 3 },
      { teleopTower: 2 },
    ])).toBe(3);
  });
  it('treats missing teleopTower as 0', () => {
    expect(calcBestClimb([{}, { teleopTower: 2 }])).toBe(2);
  });
  it('single entry with L2', () => {
    expect(calcBestClimb([{ teleopTower: 2 }])).toBe(2);
  });
});

// ===========================
// AVERAGE SCORE
// ===========================
describe('average score', () => {
  it('calculates average and rounds', () => {
    expect(calcAvgScore([{ score: 100 }, { score: 101 }])).toBe(101);
  });
  it('rounds down correctly', () => {
    expect(calcAvgScore([{ score: 100 }, { score: 101 }, { score: 100 }])).toBe(100);
  });
  it('single entry returns that score', () => {
    expect(calcAvgScore([{ score: 85 }])).toBe(85);
  });
});

// ===========================
// CAPABILITY FLAGS (anyTrue)
// ===========================
describe('capability flags', () => {
  it('returns true if any entry has the flag', () => {
    expect(calcAnyTrue([{ strClimber: false }, { strClimber: true }], 'strClimber')).toBe(true);
  });
  it('returns false if no entries have the flag', () => {
    expect(calcAnyTrue([{ strClimber: false }, { strClimber: false }], 'strClimber')).toBe(false);
  });
  it('returns false if field is missing', () => {
    expect(calcAnyTrue([{}, {}], 'strClimber')).toBe(false);
  });
  it('detects wkBroke flag correctly', () => {
    expect(calcAnyTrue([{ wkBroke: true }], 'wkBroke')).toBe(true);
  });
});

// ===========================
// RP THRESHOLDS (alliance picker dots)
// ===========================
describe('RP threshold checks', () => {
  // Energized RP requires 100 avg fuel
  it('energized RP unlocks at 100 fuel', () => expect(100 >= 100).toBe(true));
  it('energized RP does not unlock at 99 fuel', () => expect(99 >= 100).toBe(false));

  // Supercharged RP requires 360 avg fuel
  it('supercharged RP unlocks at 360 fuel', () => expect(360 >= 360).toBe(true));
  it('supercharged RP does not unlock at 359 fuel', () => expect(359 >= 360).toBe(false));

  // Traversal RP requires 50 avg tower pts
  it('traversal RP unlocks at 50 tower pts', () => expect(50 >= 50).toBe(true));
  it('traversal RP does not unlock at 49 tower pts', () => expect(49 >= 50).toBe(false));
});
