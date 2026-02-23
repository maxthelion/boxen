/**
 * Unit tests for the EdgeCheckConfig table produced by buildEdgeCheckConfigs().
 *
 * Each test verifies a specific config entry (one per edge direction) by calling
 * its pure-function members directly — no engine setup or full analyzePath call
 * required.
 *
 * Test strategy:
 *  - Verify getCoord extracts the correct axis (x vs y).
 *  - Verify isPositive matches the geometric direction (top/right = positive).
 *  - Verify safeThreshold and bodyThreshold are computed from the correct
 *    boundary values passed to the builder.
 *  - Verify the beyond / inClosedRegion logic works correctly for each direction
 *    by evaluating the expressions that analyzePath uses.
 */
import { describe, it, expect } from 'vitest';
import {
  buildEdgeCheckConfigs,
  EdgeCheckConfig,
  EdgePosition,
} from '../../../src/engine/safeSpace';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build configs with easily-distinguishable boundary values. */
function makeConfigs(margins: Record<EdgePosition, number>): EdgeCheckConfig[] {
  const safeMinX = -80;
  const safeMaxX =  80;
  const safeMinY = -60;
  const safeMaxY =  60;
  const bodyMinX = -100;
  const bodyMaxX =  100;
  const bodyMinY =  -75;
  const bodyMaxY =   75;
  return buildEdgeCheckConfigs(
    safeMinX, safeMaxX, safeMinY, safeMaxY,
    bodyMinX, bodyMaxX, bodyMinY, bodyMaxY,
    margins
  );
}

/** Default margins: joints on all sides (margin = 6). */
const ALL_CLOSED: Record<EdgePosition, number> = { top: 6, bottom: 6, left: 6, right: 6 };

/** Open margins: no joints on any edge. */
const ALL_OPEN: Record<EdgePosition, number> = { top: 0, bottom: 0, left: 0, right: 0 };

// ---------------------------------------------------------------------------
// Config table structure
// ---------------------------------------------------------------------------

describe('buildEdgeCheckConfigs', () => {
  it('returns exactly 4 entries', () => {
    const configs = makeConfigs(ALL_CLOSED);
    expect(configs).toHaveLength(4);
  });

  it('includes all four edge directions', () => {
    const edges = makeConfigs(ALL_CLOSED).map(c => c.edge);
    expect(edges).toContain('top');
    expect(edges).toContain('bottom');
    expect(edges).toContain('left');
    expect(edges).toContain('right');
  });
});

// ---------------------------------------------------------------------------
// getCoord — axis extraction
// ---------------------------------------------------------------------------

describe('EdgeCheckConfig.getCoord', () => {
  const configs = makeConfigs(ALL_CLOSED);
  const point = { x: 42, y: 17 };

  it('top uses y coordinate', () => {
    const cfg = configs.find(c => c.edge === 'top')!;
    expect(cfg.getCoord(point)).toBe(17);
  });

  it('bottom uses y coordinate', () => {
    const cfg = configs.find(c => c.edge === 'bottom')!;
    expect(cfg.getCoord(point)).toBe(17);
  });

  it('left uses x coordinate', () => {
    const cfg = configs.find(c => c.edge === 'left')!;
    expect(cfg.getCoord(point)).toBe(42);
  });

  it('right uses x coordinate', () => {
    const cfg = configs.find(c => c.edge === 'right')!;
    expect(cfg.getCoord(point)).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// isPositive — direction sign
// ---------------------------------------------------------------------------

describe('EdgeCheckConfig.isPositive', () => {
  const configs = makeConfigs(ALL_CLOSED);

  it('top is positive (high-y side)', () => {
    expect(configs.find(c => c.edge === 'top')!.isPositive).toBe(true);
  });

  it('bottom is negative (low-y side)', () => {
    expect(configs.find(c => c.edge === 'bottom')!.isPositive).toBe(false);
  });

  it('left is negative (low-x side)', () => {
    expect(configs.find(c => c.edge === 'left')!.isPositive).toBe(false);
  });

  it('right is positive (high-x side)', () => {
    expect(configs.find(c => c.edge === 'right')!.isPositive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// safeThreshold — inner joint margin boundary
// ---------------------------------------------------------------------------

describe('EdgeCheckConfig.safeThreshold', () => {
  const configs = makeConfigs(ALL_CLOSED);

  it('top safeThreshold = safeMaxY', () => {
    expect(configs.find(c => c.edge === 'top')!.safeThreshold).toBe(60);
  });

  it('bottom safeThreshold = safeMinY', () => {
    expect(configs.find(c => c.edge === 'bottom')!.safeThreshold).toBe(-60);
  });

  it('left safeThreshold = safeMinX', () => {
    expect(configs.find(c => c.edge === 'left')!.safeThreshold).toBe(-80);
  });

  it('right safeThreshold = safeMaxX', () => {
    expect(configs.find(c => c.edge === 'right')!.safeThreshold).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// bodyThreshold — outer body boundary
// ---------------------------------------------------------------------------

describe('EdgeCheckConfig.bodyThreshold', () => {
  const configs = makeConfigs(ALL_CLOSED);

  it('top bodyThreshold = bodyMaxY', () => {
    expect(configs.find(c => c.edge === 'top')!.bodyThreshold).toBe(75);
  });

  it('bottom bodyThreshold = bodyMinY', () => {
    expect(configs.find(c => c.edge === 'bottom')!.bodyThreshold).toBe(-75);
  });

  it('left bodyThreshold = bodyMinX', () => {
    expect(configs.find(c => c.edge === 'left')!.bodyThreshold).toBe(-100);
  });

  it('right bodyThreshold = bodyMaxX', () => {
    expect(configs.find(c => c.edge === 'right')!.bodyThreshold).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// margin — reflects edge margin argument
// ---------------------------------------------------------------------------

describe('EdgeCheckConfig.margin', () => {
  it('closed margins are forwarded correctly', () => {
    const margins: Record<EdgePosition, number> = { top: 6, bottom: 3, left: 12, right: 9 };
    const configs = makeConfigs(margins);
    expect(configs.find(c => c.edge === 'top')!.margin).toBe(6);
    expect(configs.find(c => c.edge === 'bottom')!.margin).toBe(3);
    expect(configs.find(c => c.edge === 'left')!.margin).toBe(12);
    expect(configs.find(c => c.edge === 'right')!.margin).toBe(9);
  });

  it('open margins are forwarded as 0', () => {
    const configs = makeConfigs(ALL_OPEN);
    for (const cfg of configs) {
      expect(cfg.margin).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// beyond logic (as used by analyzePath)
// ---------------------------------------------------------------------------

describe('beyond logic', () => {
  const TOL = 0.001;
  const configs = makeConfigs(ALL_OPEN);

  function beyond(cfg: EdgeCheckConfig, coord: number): boolean {
    return cfg.isPositive
      ? coord > cfg.bodyThreshold + TOL
      : coord < cfg.bodyThreshold - TOL;
  }

  it('top: point above bodyMaxY is beyond', () => {
    const cfg = configs.find(c => c.edge === 'top')!;
    expect(beyond(cfg, 76)).toBe(true);   // 76 > 75 + 0.001
    expect(beyond(cfg, 75)).toBe(false);  // exactly on boundary
    expect(beyond(cfg, 74)).toBe(false);  // inside body
  });

  it('bottom: point below bodyMinY is beyond', () => {
    const cfg = configs.find(c => c.edge === 'bottom')!;
    expect(beyond(cfg, -76)).toBe(true);  // -76 < -75 - 0.001
    expect(beyond(cfg, -75)).toBe(false); // exactly on boundary
    expect(beyond(cfg, -74)).toBe(false); // inside body
  });

  it('left: point left of bodyMinX is beyond', () => {
    const cfg = configs.find(c => c.edge === 'left')!;
    expect(beyond(cfg, -101)).toBe(true);  // -101 < -100 - 0.001
    expect(beyond(cfg, -100)).toBe(false); // exactly on boundary
    expect(beyond(cfg, -99)).toBe(false);  // inside body
  });

  it('right: point right of bodyMaxX is beyond', () => {
    const cfg = configs.find(c => c.edge === 'right')!;
    expect(beyond(cfg, 101)).toBe(true);   // 101 > 100 + 0.001
    expect(beyond(cfg, 100)).toBe(false);  // exactly on boundary
    expect(beyond(cfg, 99)).toBe(false);   // inside body
  });
});

// ---------------------------------------------------------------------------
// inClosedRegion logic (as used by analyzePath)
// ---------------------------------------------------------------------------

describe('inClosedRegion logic', () => {
  const TOL = 0.001;
  const configs = makeConfigs(ALL_CLOSED);

  function inClosedRegion(cfg: EdgeCheckConfig, coord: number): boolean {
    return cfg.isPositive
      ? coord > cfg.safeThreshold - TOL
      : coord < cfg.safeThreshold + TOL;
  }

  it('top: point at or above safeMaxY is in closed region', () => {
    const cfg = configs.find(c => c.edge === 'top')!;
    expect(inClosedRegion(cfg, 60)).toBe(true);   // on safe boundary
    expect(inClosedRegion(cfg, 61)).toBe(true);   // above safe boundary
    expect(inClosedRegion(cfg, 59.999)).toBe(false); // just below (not in margin)
  });

  it('bottom: point at or below safeMinY is in closed region', () => {
    const cfg = configs.find(c => c.edge === 'bottom')!;
    expect(inClosedRegion(cfg, -60)).toBe(true);  // on safe boundary
    expect(inClosedRegion(cfg, -61)).toBe(true);  // below safe boundary
    expect(inClosedRegion(cfg, -59.999)).toBe(false); // just above (not in margin)
  });

  it('left: point at or left of safeMinX is in closed region', () => {
    const cfg = configs.find(c => c.edge === 'left')!;
    expect(inClosedRegion(cfg, -80)).toBe(true);  // on safe boundary
    expect(inClosedRegion(cfg, -81)).toBe(true);  // left of safe boundary
    expect(inClosedRegion(cfg, -79.999)).toBe(false); // just inside (not in margin)
  });

  it('right: point at or right of safeMaxX is in closed region', () => {
    const cfg = configs.find(c => c.edge === 'right')!;
    expect(inClosedRegion(cfg, 80)).toBe(true);   // on safe boundary
    expect(inClosedRegion(cfg, 81)).toBe(true);   // right of safe boundary
    expect(inClosedRegion(cfg, 79.999)).toBe(false); // just inside (not in margin)
  });
});
