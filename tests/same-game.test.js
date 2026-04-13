/**
 * Tests for same-game.js pure functions
 * Run with: node --test tests/same-game.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialBoard,
  createGame,
  match,
  fill,
  getHasNext,
  getScore,
  isClear,
  play,
  undo,
  CLEAR_BONUS,
} from '../src/same-game.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a board from a 2-D array literal.
 * null  → empty cell
 * number → color index
 */
function board(rows) { return rows; }

// Small 3×3 fixture:
//   0 1 0
//   0 1 1
//   2 2 0
const FIXTURE_3x3 = board([
  [0, 1, 0],
  [0, 1, 1],
  [2, 2, 0],
]);

// Board with no moves (every adjacent pair is a different color — hand-crafted)
//   0 1 0
//   1 0 1
//   0 1 0
const NO_MOVES_3x3 = board([
  [0, 1, 0],
  [1, 0, 1],
  [0, 1, 0],
]);

// Fully cleared board
const EMPTY_2x2 = board([
  [null, null],
  [null, null],
]);

// ---------------------------------------------------------------------------
// createInitialBoard
// ---------------------------------------------------------------------------
describe('createInitialBoard', () => {
  it('returns correct dimensions', () => {
    const b = createInitialBoard(5, 7, 3);
    assert.equal(b.length, 5);
    b.forEach(row => assert.equal(row.length, 7));
  });

  it('all values are in [0, colors)', () => {
    const colors = 4;
    const b = createInitialBoard(10, 10, colors);
    b.flat().forEach(v => {
      assert.ok(v >= 0 && v < colors, `value ${v} out of range`);
    });
  });

  it('values are integers', () => {
    const b = createInitialBoard(4, 4, 3);
    b.flat().forEach(v => assert.equal(v, Math.floor(v)));
  });

  it('produces different boards on successive calls (probabilistic)', () => {
    const b1 = createInitialBoard(10, 10, 4);
    const b2 = createInitialBoard(10, 10, 4);
    assert.notDeepEqual(b1, b2);
  });
});

// ---------------------------------------------------------------------------
// createGame
// ---------------------------------------------------------------------------
describe('createGame', () => {
  it('returns correct dimensions in state', () => {
    const s = createGame(10, 10, 3);
    assert.equal(s.rows, 10);
    assert.equal(s.cols, 10);
    assert.equal(s.colors, 3);
  });

  it('board has correct dimensions', () => {
    const s = createGame(8, 12, 4);
    assert.equal(s.board.length, 8);
    s.board.forEach(row => assert.equal(row.length, 12));
  });

  it('score starts at 0', () => {
    const s = createGame(5, 5, 3);
    assert.equal(s.score, 0);
  });

  it('history starts empty', () => {
    const s = createGame(5, 5, 3);
    assert.deepEqual(s.history, []);
  });

  it('accepts a boardOverride', () => {
    const b = [[0, 1], [1, 0]];
    const s = createGame(2, 2, 2, b);
    assert.deepEqual(s.board, b);
  });

  it('hasNext is boolean', () => {
    const s = createGame(5, 5, 3);
    assert.equal(typeof s.hasNext, 'boolean');
  });

  it('cleared is false for non-empty board', () => {
    const s = createGame(5, 5, 3, [[0, 1], [1, 0]]);
    assert.equal(s.cleared, false);
  });
});

// ---------------------------------------------------------------------------
// match
// ---------------------------------------------------------------------------
describe('match', () => {
  it('returns null for an isolated cell', () => {
    // top-left 0 has neighbors: (0,1)=1 and (1,0)=0 in FIXTURE_3x3
    // Wait — (1,0) is 0, same color! Let's use NO_MOVES_3x3
    // (0,0)=0, right=(0,1)=1, down=(1,0)=1 — both different → isolated
    const result = match(NO_MOVES_3x3, 0, 0);
    assert.equal(result, null);
  });

  it('returns null for a 1-cell group', () => {
    // 2×2 board with all different colors
    const b = [[0, 1], [2, 3]];
    assert.equal(match(b, 0, 0), null);
    assert.equal(match(b, 1, 1), null);
  });

  it('finds a 2-cell horizontal pair', () => {
    // row 1 of FIXTURE_3x3: [0, 1, 1] — cells (1,1) and (1,2) are both 1
    const result = match(FIXTURE_3x3, 1, 1);
    assert.ok(Array.isArray(result));
    assert.equal(result.length >= 2, true);
  });

  it('finds a 2-cell vertical pair', () => {
    // col 0 of FIXTURE_3x3: 0,0,2 — (0,0) and (1,0) are both 0
    const result = match(FIXTURE_3x3, 0, 0);
    assert.ok(Array.isArray(result));
    // group includes at least (0,0) and (1,0)
    const found = result.some(([r, c]) => r === 1 && c === 0);
    assert.ok(found);
  });

  it('flood-fills a large connected region', () => {
    // All-zeros 4×4 board — clicking any cell returns all 16
    const b = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    const result = match(b, 0, 0);
    assert.equal(result.length, 16);
  });

  it('does not cross different-color cells', () => {
    // Only the top-left 2 zeros should be returned, not the bottom-left 2
    const b = [
      [0, 0],
      [1, 1],
    ];
    const result = match(b, 0, 0);
    assert.ok(result !== null);
    result.forEach(([r]) => assert.equal(r, 0));
  });

  it('returns null for null (empty) cell', () => {
    const b = [[null, 1], [1, 1]];
    assert.equal(match(b, 0, 0), null);
  });

  it('handles handcrafted L-shape group', () => {
    // 0 1
    // 0 1
    // 0 0   ← connects to form an L
    const b = [
      [0, 1],
      [0, 1],
      [0, 0],
    ];
    const result = match(b, 0, 0);
    assert.equal(result.length, 4); // (0,0),(1,0),(2,0),(2,1)
  });

  it('each point in result is unique', () => {
    const b = Array.from({ length: 3 }, () => [0, 0, 0]);
    const result = match(b, 1, 1);
    const serialized = result.map(([r, c]) => `${r},${c}`);
    const unique = new Set(serialized);
    assert.equal(unique.size, result.length);
  });
});

// ---------------------------------------------------------------------------
// fill
// ---------------------------------------------------------------------------
describe('fill', () => {
  it('removes specified points (cells become null after gravity/compress)', () => {
    // 2×2 board: col 0 = [0,0], col 1 = [1,1]
    // Remove entire col 0 → col 0 compresses away, col 1 shifts left.
    // Result: col 0 = [1,1], col 1 = [null, null]
    const b = [[0, 1], [0, 1]];
    const pts = [[0, 0], [1, 0]]; // remove all of col 0
    const nb = fill(b, pts);
    // The original col-0 cells (color 0) should be gone
    const allVals = nb.flat();
    assert.ok(!allVals.includes(0), 'color 0 cells should be removed');
    // The original col-1 cells (color 1) should still exist
    assert.ok(allVals.includes(1), 'color 1 cells should remain');
  });

  it('preserves unremoved cells', () => {
    const b = [[0, 1], [0, 1]];
    const pts = [[0, 0], [1, 0]]; // remove col 0 cells
    const nb = fill(b, pts);
    // col 1 cells (color 1) should still be there
    const vals = nb.flat().filter(v => v !== null);
    assert.ok(vals.every(v => v === 1));
  });

  it('applies gravity — cells fall to bottom of column', () => {
    // 3 rows, 1 col: [0, 1, null] (0 at top, 1 in middle, null at bottom)
    // After removing (0,0) the column becomes [null, null, 1]
    const b = [[0], [1], [null]];
    const nb = fill(b, [[0, 0]]);
    assert.equal(nb[2][0], 1); // 1 sinks to bottom row
    assert.equal(nb[0][0], null);
    assert.equal(nb[1][0], null);
  });

  it('compresses empty columns to the left', () => {
    // 2 rows × 2 cols
    // col 0: all null after removal → compressed out
    // col 1: [0, 0] → stays
    const b = [[1, 0], [1, 0]];
    const nb = fill(b, [[0, 0], [1, 0]]); // remove entire col 0
    // now the non-null column (col 1) should shift to col 0
    assert.equal(nb[0][0], 0);
    assert.equal(nb[1][0], 0);
    // col 1 should be all null
    assert.equal(nb[0][1], null);
    assert.equal(nb[1][1], null);
  });

  it('returns a board with the same dimensions', () => {
    const nb = fill(FIXTURE_3x3, [[0, 1], [1, 1], [1, 2]]);
    assert.equal(nb.length, 3);
    nb.forEach(row => assert.equal(row.length, 3));
  });

  it('does not mutate the input board', () => {
    const b = [[0, 1], [0, 1]];
    const copy = JSON.stringify(b);
    fill(b, [[0, 0]]);
    assert.equal(JSON.stringify(b), copy);
  });
});

// ---------------------------------------------------------------------------
// getHasNext
// ---------------------------------------------------------------------------
describe('getHasNext', () => {
  it('returns true when adjacent same-color cells exist', () => {
    // row 1 of FIXTURE_3x3 has two 1s side by side
    assert.equal(getHasNext(FIXTURE_3x3), true);
  });

  it('returns false for checkerboard (no two adjacent same-color)', () => {
    assert.equal(getHasNext(NO_MOVES_3x3), false);
  });

  it('returns false for an empty board', () => {
    assert.equal(getHasNext(EMPTY_2x2), false);
  });

  it('returns false for single-cell board with unique color', () => {
    assert.equal(getHasNext([[0]]), false);
  });

  it('returns true for two identical adjacent cells', () => {
    assert.equal(getHasNext([[0, 0]]), true);
  });
});

// ---------------------------------------------------------------------------
// getScore
// ---------------------------------------------------------------------------
describe('getScore', () => {
  it('returns 0 for 2 cells (minimum playable group)', () => {
    const pts = [[0, 0], [0, 1]];
    assert.equal(getScore(pts), 0); // (2-2)^2 = 0
  });

  it('returns 1 for 3 cells', () => {
    const pts = [[0, 0], [0, 1], [1, 0]];
    assert.equal(getScore(pts), 1); // (3-2)^2 = 1
  });

  it('returns 4 for 4 cells', () => {
    const pts = [[0,0],[0,1],[1,0],[1,1]];
    assert.equal(getScore(pts), 4); // (4-2)^2 = 4
  });

  it('returns 9 for 5 cells', () => {
    const pts = Array.from({ length: 5 }, (_, i) => [0, i]);
    assert.equal(getScore(pts), 9); // (5-2)^2 = 9
  });

  it('is exponential (larger groups give much more)', () => {
    const pts10 = Array.from({ length: 10 }, (_, i) => [0, i]);
    const pts5  = Array.from({ length: 5  }, (_, i) => [0, i]);
    assert.ok(getScore(pts10) > getScore(pts5) * 2);
  });
});

// ---------------------------------------------------------------------------
// isClear
// ---------------------------------------------------------------------------
describe('isClear', () => {
  it('returns true for all-null board', () => {
    assert.equal(isClear(EMPTY_2x2), true);
  });

  it('returns false when at least one cell is non-null', () => {
    assert.equal(isClear([[0, null], [null, null]]), false);
  });

  it('returns false for a normal board', () => {
    assert.equal(isClear(FIXTURE_3x3), false);
  });
});

// ---------------------------------------------------------------------------
// play
// ---------------------------------------------------------------------------
describe('play', () => {
  it('returns a new state object (immutable)', () => {
    const s = createGame(3, 3, 2, FIXTURE_3x3);
    const ns = play(s, 1, 1); // hits the (1,1)–(1,2) group of 1s
    assert.notEqual(s, ns);
  });

  it('returns same state when cell has no match', () => {
    const s = createGame(3, 3, 3, NO_MOVES_3x3);
    const ns = play(s, 0, 0); // isolated cell
    assert.equal(ns, s);
  });

  it('updates score after a valid play', () => {
    const s = createGame(3, 3, 3, FIXTURE_3x3);
    const ns = play(s, 1, 1);
    assert.ok(ns.score > 0);
  });

  it('pushes to history on valid play', () => {
    const s = createGame(3, 3, 3, FIXTURE_3x3);
    const ns = play(s, 1, 1);
    assert.equal(ns.history.length, 1);
  });

  it('does not push to history on no-match', () => {
    const s = createGame(3, 3, 3, NO_MOVES_3x3);
    const ns = play(s, 0, 0);
    assert.equal(ns.history.length, 0);
  });

  it('board dimensions are unchanged after play', () => {
    const s = createGame(3, 3, 3, FIXTURE_3x3);
    const ns = play(s, 1, 1);
    assert.equal(ns.board.length, 3);
    ns.board.forEach(row => assert.equal(row.length, 3));
  });

  it('sets hasNext = false when no more moves remain after play', () => {
    // After removing everything on NO_MOVES_3x3 there are no moves
    // But we can't play on NO_MOVES — use a 2-cell board that leaves nothing
    const b = [[0, 0]];
    const s = createGame(1, 2, 1, b);
    const ns = play(s, 0, 0);
    assert.equal(ns.hasNext, false);
  });

  it('detects board clear and adds bonus', () => {
    const b = [[0, 0]];
    const s = createGame(1, 2, 1, b);
    const ns = play(s, 0, 0);
    assert.equal(ns.cleared, true);
    assert.equal(ns.score, 0 + CLEAR_BONUS); // (2-2)^2 + bonus = 0 + 1000
  });
});

// ---------------------------------------------------------------------------
// undo
// ---------------------------------------------------------------------------
describe('undo', () => {
  it('returns same state when history is empty', () => {
    const s = createGame(3, 3, 3, FIXTURE_3x3);
    assert.equal(undo(s), s);
  });

  it('reverts board to previous state', () => {
    const s  = createGame(3, 3, 3, FIXTURE_3x3);
    const s1 = play(s, 1, 1);
    const s2 = undo(s1);
    assert.deepEqual(s2.board, s.board);
  });

  it('reverts score to previous value', () => {
    const s  = createGame(3, 3, 3, FIXTURE_3x3);
    const s1 = play(s, 1, 1);
    const s2 = undo(s1);
    assert.equal(s2.score, 0);
  });

  it('pops the history stack', () => {
    const s  = createGame(3, 3, 3, FIXTURE_3x3);
    const s1 = play(s, 1, 1);
    const s2 = undo(s1);
    assert.equal(s2.history.length, 0);
  });

  it('two plays + two undos returns to original board', () => {
    // Use a larger board to guarantee two separate groups exist
    const b = [
      [0, 0, 1, 1],
      [2, 2, 3, 3],
    ];
    const s  = createGame(2, 4, 4, b);
    const s1 = play(s, 0, 0); // remove top-left pair
    const s2 = play(s1, 0, 2); // remove top-right pair (positions may shift — use match to find)
    const s3 = undo(s2);
    const s4 = undo(s3);
    assert.deepEqual(s4.board, s.board);
    assert.equal(s4.score, 0);
  });
});

// ---------------------------------------------------------------------------
// CLEAR_BONUS
// ---------------------------------------------------------------------------
describe('CLEAR_BONUS', () => {
  it('is a positive number', () => {
    assert.equal(typeof CLEAR_BONUS, 'number');
    assert.ok(CLEAR_BONUS > 0);
  });
});
