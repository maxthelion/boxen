/**
 * Unit tests for the FACE_AXIS_MAPPINGS table in dividerSlotMappings.ts.
 *
 * Each test verifies a specific mapping entry (one per face) by calling its
 * pure-function members directly — no engine setup required.
 *
 * Test strategy: for each (faceId, axis) pair, exercise the canonical "divider
 * reaches the face in question" scenario and verify the coordinate output matches
 * what the original switch/case produced.
 */
import { describe, it, expect } from 'vitest';
import {
  FACE_AXIS_MAPPINGS,
  MeetsBoundary,
  BoxDims,
} from '../../../src/utils/dividerSlotMappings';
import { Bounds, EdgeExtensions } from '../../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All-false meets boundary (override specific fields per test). */
const noMeets: MeetsBoundary = {
  meetsBottom: false,
  meetsTop: false,
  meetsLeft: false,
  meetsRight: false,
  meetsBack: false,
  meetsFront: false,
};

/** A solid check where every face has material. */
const allSolid = () => true;

/** A solid check where no face has material (all open). */
const noneSolid = () => false;

/** Default box dimensions for tests. */
const dims: BoxDims = { width: 200, height: 150, depth: 100 };

/** Default bounds representing a divider spanning most of the interior. */
const bounds: Bounds = { x: 6, y: 6, z: 6, w: 188, h: 138, d: 88 };

/** Edge extensions with non-zero values for testing extension behavior. */
const ext: EdgeExtensions = { top: 5, bottom: 3, left: 7, right: 4 };

const MT = 6;

// ---------------------------------------------------------------------------
// FRONT face (x-axis divider) — vertical slot running in Y
// ---------------------------------------------------------------------------
describe('FACE_AXIS_MAPPINGS.front.x', () => {
  const m = FACE_AXIS_MAPPINGS.front!.x!;

  it('matches when divider meets front', () => {
    expect(m.matches({ ...noMeets, meetsFront: true })).toBe(true);
    expect(m.matches({ ...noMeets, meetsFront: false })).toBe(false);
  });

  it('computes slotX = position − width/2', () => {
    expect(m.getSlotX!(75, dims)).toBeCloseTo(75 - 200 / 2);   // -25
    expect(m.getSlotX!(100, dims)).toBeCloseTo(0);              // centre
  });

  it('getSlotY is null (vertical slot)', () => {
    expect(m.getSlotY).toBeNull();
  });

  it('isHorizontal is false', () => {
    expect(m.isHorizontal).toBe(false);
  });

  it('getLength returns bounds.h', () => {
    expect(m.getLength(bounds)).toBe(bounds.h);
  });

  it('getCenterOffset = (bounds.y + bounds.h/2) − height/2', () => {
    const expected = (bounds.y + bounds.h / 2) - dims.height / 2;
    expect(m.getCenterOffset(bounds, dims)).toBeCloseTo(expected);
  });

  it('startInset = MT when meetsBottom + bottom solid', () => {
    const meets = { ...noMeets, meetsBottom: true };
    expect(m.getStartInset(meets, allSolid, MT)).toBe(MT);
    expect(m.getStartInset(meets, noneSolid, MT)).toBe(0);
    expect(m.getStartInset(noMeets, allSolid, MT)).toBe(0);
  });

  it('endInset = MT when meetsTop + top solid', () => {
    const meets = { ...noMeets, meetsTop: true };
    expect(m.getEndInset(meets, allSolid, MT)).toBe(MT);
    expect(m.getEndInset(meets, noneSolid, MT)).toBe(0);
  });

  it('extStart uses e.bottom when face not locked', () => {
    expect(m.getExtStart(noMeets, allSolid, ext)).toBe(ext.bottom);
    // When locked (meetsBottom && solid), extension is 0
    expect(m.getExtStart({ ...noMeets, meetsBottom: true }, allSolid, ext)).toBe(0);
  });

  it('extEnd uses e.top when face not locked', () => {
    expect(m.getExtEnd(noMeets, allSolid, ext)).toBe(ext.top);
    expect(m.getExtEnd({ ...noMeets, meetsTop: true }, allSolid, ext)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// BACK face (x-axis divider) — vertical slot, slotX negated
// ---------------------------------------------------------------------------
describe('FACE_AXIS_MAPPINGS.back.x', () => {
  const m = FACE_AXIS_MAPPINGS.back!.x!;

  it('matches when divider meets back', () => {
    expect(m.matches({ ...noMeets, meetsBack: true })).toBe(true);
    expect(m.matches({ ...noMeets, meetsBack: false })).toBe(false);
  });

  it('computes slotX = −(position − width/2)  [mirrored from front]', () => {
    expect(m.getSlotX!(75, dims)).toBeCloseTo(-(75 - 200 / 2));   // +25
    expect(m.getSlotX!(100, dims)).toBeCloseTo(0);
  });

  it('getCenterOffset is NOT negated (same as front.x)', () => {
    // Back face: Y direction is same orientation as front — not mirrored
    const expected = (bounds.y + bounds.h / 2) - dims.height / 2;
    expect(m.getCenterOffset(bounds, dims)).toBeCloseTo(expected);
  });
});

// ---------------------------------------------------------------------------
// BACK face (y-axis divider) — horizontal slot, centerOffset negated
// ---------------------------------------------------------------------------
describe('FACE_AXIS_MAPPINGS.back.y', () => {
  const m = FACE_AXIS_MAPPINGS.back!.y!;

  it('matches when divider meets back', () => {
    expect(m.matches({ ...noMeets, meetsBack: true })).toBe(true);
  });

  it('getSlotX is null (horizontal slot)', () => {
    expect(m.getSlotX).toBeNull();
  });

  it('computes slotY = position − height/2 (same as front.y)', () => {
    expect(m.getSlotY!(50, dims)).toBeCloseTo(50 - 150 / 2); // -25
  });

  it('getCenterOffset is negated (X mirrored on back face)', () => {
    const front_y = FACE_AXIS_MAPPINGS.front!.y!;
    const frontOffset = front_y.getCenterOffset(bounds, dims);
    expect(m.getCenterOffset(bounds, dims)).toBeCloseTo(-frontOffset);
  });
});

// ---------------------------------------------------------------------------
// LEFT face (z-axis divider) — vertical slot
// ---------------------------------------------------------------------------
describe('FACE_AXIS_MAPPINGS.left.z', () => {
  const m = FACE_AXIS_MAPPINGS.left!.z!;

  it('matches when divider meets left', () => {
    expect(m.matches({ ...noMeets, meetsLeft: true })).toBe(true);
    expect(m.matches({ ...noMeets, meetsLeft: false })).toBe(false);
  });

  it('computes slotX = position − depth/2', () => {
    expect(m.getSlotX!(30, dims)).toBeCloseTo(30 - 100 / 2); // -20
  });

  it('getSlotY is null', () => {
    expect(m.getSlotY).toBeNull();
  });

  it('getLength returns bounds.h', () => {
    expect(m.getLength(bounds)).toBe(bounds.h);
  });

  it('getCenterOffset = (bounds.y + bounds.h/2) − height/2', () => {
    const expected = (bounds.y + bounds.h / 2) - dims.height / 2;
    expect(m.getCenterOffset(bounds, dims)).toBeCloseTo(expected);
  });
});

// ---------------------------------------------------------------------------
// LEFT face (y-axis divider) — horizontal slot (runs Z), start=back end=front
// ---------------------------------------------------------------------------
describe('FACE_AXIS_MAPPINGS.left.y', () => {
  const m = FACE_AXIS_MAPPINGS.left!.y!;

  it('matches when divider meets left', () => {
    expect(m.matches({ ...noMeets, meetsLeft: true })).toBe(true);
  });

  it('getSlotX is null (horizontal slot)', () => {
    expect(m.getSlotX).toBeNull();
  });

  it('computes slotY = position − height/2', () => {
    expect(m.getSlotY!(60, dims)).toBeCloseTo(60 - 150 / 2); // -15
  });

  it('getLength returns bounds.d', () => {
    expect(m.getLength(bounds)).toBe(bounds.d);
  });

  it('getCenterOffset = (bounds.z + bounds.d/2) − depth/2', () => {
    const expected = (bounds.z + bounds.d / 2) - dims.depth / 2;
    expect(m.getCenterOffset(bounds, dims)).toBeCloseTo(expected);
  });

  it('startInset uses back face (start=back)', () => {
    const meets = { ...noMeets, meetsBack: true };
    expect(m.getStartInset(meets, allSolid, MT)).toBe(MT);
    expect(m.getStartInset(meets, noneSolid, MT)).toBe(0);
  });

  it('endInset uses front face (end=front)', () => {
    const meets = { ...noMeets, meetsFront: true };
    expect(m.getEndInset(meets, allSolid, MT)).toBe(MT);
  });

  it('extStart uses e.left when back not locked', () => {
    expect(m.getExtStart(noMeets, allSolid, ext)).toBe(ext.left);
    expect(m.getExtStart({ ...noMeets, meetsBack: true }, allSolid, ext)).toBe(0);
  });

  it('extEnd uses e.right when front not locked', () => {
    expect(m.getExtEnd(noMeets, allSolid, ext)).toBe(ext.right);
    expect(m.getExtEnd({ ...noMeets, meetsFront: true }, allSolid, ext)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// RIGHT face (z-axis divider) — vertical slot, slotX negated vs left.z
// ---------------------------------------------------------------------------
describe('FACE_AXIS_MAPPINGS.right.z', () => {
  const m = FACE_AXIS_MAPPINGS.right!.z!;

  it('matches when divider meets right', () => {
    expect(m.matches({ ...noMeets, meetsRight: true })).toBe(true);
    expect(m.matches({ ...noMeets, meetsRight: false })).toBe(false);
  });

  it('computes slotX = −(position − depth/2)  [mirrored from left.z]', () => {
    expect(m.getSlotX!(30, dims)).toBeCloseTo(-(30 - 100 / 2)); // +20
    expect(m.getSlotX!(50, dims)).toBeCloseTo(0);              // centre
  });
});

// ---------------------------------------------------------------------------
// RIGHT face (y-axis divider) — horizontal slot, start=front end=back (swapped vs left.y)
// ---------------------------------------------------------------------------
describe('FACE_AXIS_MAPPINGS.right.y', () => {
  const m = FACE_AXIS_MAPPINGS.right!.y!;

  it('matches when divider meets right', () => {
    expect(m.matches({ ...noMeets, meetsRight: true })).toBe(true);
  });

  it('getCenterOffset is negated (Z mirrored on right face)', () => {
    const left_y = FACE_AXIS_MAPPINGS.left!.y!;
    const leftOffset = left_y.getCenterOffset(bounds, dims);
    expect(m.getCenterOffset(bounds, dims)).toBeCloseTo(-leftOffset);
  });

  it('startInset uses front face (swapped from left.y)', () => {
    const meets = { ...noMeets, meetsFront: true };
    expect(m.getStartInset(meets, allSolid, MT)).toBe(MT);
  });

  it('endInset uses back face (swapped from left.y)', () => {
    const meets = { ...noMeets, meetsBack: true };
    expect(m.getEndInset(meets, allSolid, MT)).toBe(MT);
  });

  it('extStart uses e.right (front locked = 0)', () => {
    expect(m.getExtStart(noMeets, allSolid, ext)).toBe(ext.right);
    expect(m.getExtStart({ ...noMeets, meetsFront: true }, allSolid, ext)).toBe(0);
  });

  it('extEnd uses e.left (back locked = 0)', () => {
    expect(m.getExtEnd(noMeets, allSolid, ext)).toBe(ext.left);
    expect(m.getExtEnd({ ...noMeets, meetsBack: true }, allSolid, ext)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TOP face (x-axis divider) — vertical slot (Z mapped to local Y), centerOffset negated
// ---------------------------------------------------------------------------
describe('FACE_AXIS_MAPPINGS.top.x', () => {
  const m = FACE_AXIS_MAPPINGS.top!.x!;

  it('matches when divider meets top', () => {
    expect(m.matches({ ...noMeets, meetsTop: true })).toBe(true);
    expect(m.matches({ ...noMeets, meetsTop: false })).toBe(false);
  });

  it('computes slotX = position − width/2 (same formula as front.x)', () => {
    expect(m.getSlotX!(75, dims)).toBeCloseTo(75 - 200 / 2);
  });

  it('getSlotY is null', () => {
    expect(m.getSlotY).toBeNull();
  });

  it('getLength returns bounds.d', () => {
    expect(m.getLength(bounds)).toBe(bounds.d);
  });

  it('getCenterOffset is −((bounds.z + bounds.d/2) − depth/2)  [negated for top rotation]', () => {
    const expected = -((bounds.z + bounds.d / 2) - dims.depth / 2);
    expect(m.getCenterOffset(bounds, dims)).toBeCloseTo(expected);
  });

  it('startInset uses front face (top start = front)', () => {
    const meets = { ...noMeets, meetsFront: true };
    expect(m.getStartInset(meets, allSolid, MT)).toBe(MT);
  });

  it('endInset uses back face', () => {
    const meets = { ...noMeets, meetsBack: true };
    expect(m.getEndInset(meets, allSolid, MT)).toBe(MT);
  });
});

// ---------------------------------------------------------------------------
// TOP face (z-axis divider) — horizontal slot, slotY negated
// ---------------------------------------------------------------------------
describe('FACE_AXIS_MAPPINGS.top.z', () => {
  const m = FACE_AXIS_MAPPINGS.top!.z!;

  it('matches when divider meets top', () => {
    expect(m.matches({ ...noMeets, meetsTop: true })).toBe(true);
  });

  it('computes slotY = −(position − depth/2)  [negated for top rotation]', () => {
    expect(m.getSlotY!(30, dims)).toBeCloseTo(-(30 - 100 / 2)); // +20
    expect(m.getSlotY!(50, dims)).toBeCloseTo(0);               // centre
  });

  it('getSlotX is null', () => {
    expect(m.getSlotX).toBeNull();
  });

  it('getLength returns bounds.w', () => {
    expect(m.getLength(bounds)).toBe(bounds.w);
  });
});

// ---------------------------------------------------------------------------
// BOTTOM face (x-axis divider) — vertical slot, centerOffset NOT negated (vs top.x)
// ---------------------------------------------------------------------------
describe('FACE_AXIS_MAPPINGS.bottom.x', () => {
  const m = FACE_AXIS_MAPPINGS.bottom!.x!;

  it('matches when divider meets bottom', () => {
    expect(m.matches({ ...noMeets, meetsBottom: true })).toBe(true);
    expect(m.matches({ ...noMeets, meetsBottom: false })).toBe(false);
  });

  it('getCenterOffset is positive (not negated — bottom rotation opposite to top)', () => {
    const top_x = FACE_AXIS_MAPPINGS.top!.x!;
    // Top negates, bottom does not — they should have opposite signs for non-zero cases
    const boundsOffCentre: Bounds = { ...bounds, z: 20, d: 60 };
    const topVal = top_x.getCenterOffset(boundsOffCentre, dims);
    const botVal = m.getCenterOffset(boundsOffCentre, dims);
    expect(botVal).toBeCloseTo(-topVal);
  });

  it('startInset uses back face (bottom start = back)', () => {
    const meets = { ...noMeets, meetsBack: true };
    expect(m.getStartInset(meets, allSolid, MT)).toBe(MT);
  });

  it('endInset uses front face', () => {
    const meets = { ...noMeets, meetsFront: true };
    expect(m.getEndInset(meets, allSolid, MT)).toBe(MT);
  });
});

// ---------------------------------------------------------------------------
// BOTTOM face (z-axis divider) — horizontal slot, slotY NOT negated (vs top.z)
// ---------------------------------------------------------------------------
describe('FACE_AXIS_MAPPINGS.bottom.z', () => {
  const m = FACE_AXIS_MAPPINGS.bottom!.z!;

  it('matches when divider meets bottom', () => {
    expect(m.matches({ ...noMeets, meetsBottom: true })).toBe(true);
  });

  it('computes slotY = position − depth/2  (not negated, opposite to top.z)', () => {
    const top_z = FACE_AXIS_MAPPINGS.top!.z!;
    const pos = 30;
    expect(m.getSlotY!(pos, dims)).toBeCloseTo(-(top_z.getSlotY!(pos, dims)!));
  });

  it('getSlotX is null', () => {
    expect(m.getSlotX).toBeNull();
  });

  it('isHorizontal is true', () => {
    expect(m.isHorizontal).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Coverage: every entry exists in the table
// ---------------------------------------------------------------------------
describe('FACE_AXIS_MAPPINGS table completeness', () => {
  it('front has x and y entries', () => {
    expect(FACE_AXIS_MAPPINGS.front?.x).toBeDefined();
    expect(FACE_AXIS_MAPPINGS.front?.y).toBeDefined();
  });

  it('back has x and y entries', () => {
    expect(FACE_AXIS_MAPPINGS.back?.x).toBeDefined();
    expect(FACE_AXIS_MAPPINGS.back?.y).toBeDefined();
  });

  it('left has z and y entries', () => {
    expect(FACE_AXIS_MAPPINGS.left?.z).toBeDefined();
    expect(FACE_AXIS_MAPPINGS.left?.y).toBeDefined();
  });

  it('right has z and y entries', () => {
    expect(FACE_AXIS_MAPPINGS.right?.z).toBeDefined();
    expect(FACE_AXIS_MAPPINGS.right?.y).toBeDefined();
  });

  it('top has x and z entries', () => {
    expect(FACE_AXIS_MAPPINGS.top?.x).toBeDefined();
    expect(FACE_AXIS_MAPPINGS.top?.z).toBeDefined();
  });

  it('bottom has x and z entries', () => {
    expect(FACE_AXIS_MAPPINGS.bottom?.x).toBeDefined();
    expect(FACE_AXIS_MAPPINGS.bottom?.z).toBeDefined();
  });
});
