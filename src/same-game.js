/**
 * same-game.js — Pure game logic for Same Game (Chain Shot / 同色消し)
 *
 * Board layout convention:
 *   board[row][col]  (row 0 = top, col 0 = left)
 *   Each cell is a color index 0..(colors-1), or null for empty.
 *
 * All functions are pure — they return new state objects without mutating inputs.
 */

// ---------------------------------------------------------------------------
// Board helpers
// ---------------------------------------------------------------------------

/**
 * Create a rows×cols board filled with random color indices in [0, colors).
 * @param {number} rows
 * @param {number} cols
 * @param {number} colors
 * @returns {Array<Array<number|null>>}
 */
export function createInitialBoard(rows, cols, colors) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => Math.floor(Math.random() * colors))
  );
}

/**
 * Deep-clone a board (2D array of numbers/nulls).
 * @param {Array<Array<number|null>>} board
 * @returns {Array<Array<number|null>>}
 */
function cloneBoard(board) {
  return board.map(row => row.slice());
}

/**
 * Four orthogonal neighbor offsets: up, right, down, left.
 */
const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];

// ---------------------------------------------------------------------------
// Core logic (ported faithfully from the reference SameGame class)
// ---------------------------------------------------------------------------

/**
 * Flood-fill: find all connected same-color cells reachable from (row, col).
 * Returns an array of [row, col] pairs if the group has ≥ 2 cells, else null.
 *
 * @param {Array<Array<number|null>>} board
 * @param {number} row
 * @param {number} col
 * @returns {Array<[number,number]>|null}
 */
export function match(board, row, col) {
  const rows = board.length;
  const cols = board[0].length;
  const target = board[row]?.[col];
  if (target === null || target === undefined) return null;

  const points = [[row, col]];

  function flood(r, c) {
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      if (board[nr][nc] !== target) continue;
      if (points.some(([pr, pc]) => pr === nr && pc === nc)) continue;
      points.push([nr, nc]);
      flood(nr, nc);
    }
  }

  flood(row, col);
  return points.length >= 2 ? points : null;
}

/**
 * Remove the given points from the board, then:
 *   1. Apply gravity: in each column, non-null cells sink to the bottom.
 *   2. Compress: empty columns are shifted to the left (non-empty columns first).
 *
 * Faithful port of SameGame#fill, adapted to board[row][col] layout.
 *
 * @param {Array<Array<number|null>>} board
 * @param {Array<[number,number]>} points
 * @returns {Array<Array<number|null>>}
 */
export function fill(board, points) {
  const rows = board.length;
  const cols = board[0].length;

  // Step 1: mark removed cells as null
  const b = cloneBoard(board);
  for (const [r, c] of points) {
    b[r][c] = null;
  }

  // Step 2: build column arrays (col-major) and apply gravity per column.
  // Reference gravity: reverse col, filter nulls, reverse back, then pad top with nulls.
  // That is: cells fall downward (row 0 = top, last row = bottom).
  // After the operation the non-null cells are at the bottom.
  const colArrays = [];
  for (let c = 0; c < cols; c++) {
    const col = [];
    for (let r = 0; r < rows; r++) {
      col.push(b[r][c]);
    }
    // reverse → filter nulls → reverse back → pad top with nulls
    const reversed = col.slice().reverse();
    const nonNull = reversed.filter(v => v !== null);
    const withNulls = nonNull.reverse(); // non-null cells at bottom
    while (withNulls.length < rows) withNulls.unshift(null);
    colArrays.push(withNulls);
  }

  // Step 3: compress columns — keep only non-empty columns (at least one non-null),
  // then pad on the right with empty columns.
  const nonEmptyCols = colArrays.filter(col => col.some(v => v !== null));
  while (nonEmptyCols.length < cols) {
    nonEmptyCols.push(Array(rows).fill(null));
  }

  // Step 4: convert back to row-major layout
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => nonEmptyCols[c][r])
  );
}

/**
 * Check whether any valid move remains (any cell has an orthogonal same-color neighbor).
 *
 * @param {Array<Array<number|null>>} board
 * @returns {boolean}
 */
export function getHasNext(board) {
  const rows = board.length;
  const cols = board[0].length;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = board[r][c];
      if (v === null) continue;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
        if (board[nr][nc] === v) return true;
      }
    }
  }
  return false;
}

/**
 * Compute score for a removal of `points.length` cells.
 * Score = (count − 2)²  — groups of 1 cannot be removed (match returns null).
 *
 * @param {Array<[number,number]>} points
 * @returns {number}
 */
export function getScore(points) {
  return (points.length - 2) ** 2;
}

/**
 * Check whether the board is fully cleared (all cells are null).
 *
 * @param {Array<Array<number|null>>} board
 * @returns {boolean}
 */
export function isClear(board) {
  return board.every(row => row.every(v => v === null));
}

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

/** Clear board bonus awarded when every cell is removed. */
export const CLEAR_BONUS = 1000;

/**
 * Create initial game state.
 *
 * @param {number} rows
 * @param {number} cols
 * @param {number} colors  Number of distinct colors (0..colors-1)
 * @param {Array<Array<number|null>>} [boardOverride]  For testing
 * @returns {{board: Array, rows: number, cols: number, colors: number, score: number, hasNext: boolean, cleared: boolean, history: Array}}
 */
export function createGame(rows, cols, colors, boardOverride = null) {
  const board = boardOverride ?? createInitialBoard(rows, cols, colors);
  return {
    board,
    rows,
    cols,
    colors,
    score: 0,
    hasNext: getHasNext(board),
    cleared: isClear(board),
    history: [],
  };
}

/**
 * Play a move at (row, col).
 * If the cell has no matching group (< 2 connected), return state unchanged.
 * Otherwise remove the group, update score, check hasNext/cleared.
 * Saves previous state to history for undo.
 *
 * @param {{board, rows, cols, colors, score, hasNext, cleared, history}} state
 * @param {number} row
 * @param {number} col
 * @returns {typeof state}
 */
export function play(state, row, col) {
  const points = match(state.board, row, col);
  if (points === null) return state;

  const newBoard = fill(state.board, points);
  const gained = getScore(points);
  const cleared = isClear(newBoard);
  const bonus = cleared ? CLEAR_BONUS : 0;
  const newScore = state.score + gained + bonus;

  // Save snapshot for undo (history entry contains everything needed to restore)
  const snapshot = {
    board: state.board,
    score: state.score,
    hasNext: state.hasNext,
    cleared: state.cleared,
  };

  return {
    ...state,
    board: newBoard,
    score: newScore,
    hasNext: cleared ? false : getHasNext(newBoard),
    cleared,
    history: [...state.history, snapshot],
  };
}

/**
 * Undo the last move.  Returns state unchanged if history is empty.
 *
 * @param {{board, rows, cols, colors, score, hasNext, cleared, history}} state
 * @returns {typeof state}
 */
export function undo(state) {
  if (state.history.length === 0) return state;
  const history = state.history.slice();
  const snapshot = history.pop();
  return {
    ...state,
    board: snapshot.board,
    score: snapshot.score,
    hasNext: snapshot.hasNext,
    cleared: snapshot.cleared,
    history,
  };
}
