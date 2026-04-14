/**
 * main.js — DOM, events, and rendering for Same Game
 *
 * Architecture:
 *   - Pure game logic lives in same-game.js
 *   - This file owns all DOM mutation and user interaction
 *   - State is held in a single `state` variable; every change goes through
 *     the pure functions and then re-renders
 */

import {
  createGame,
  play,
  undo,
  match,
  isClear,
  CLEAR_BONUS,
} from './same-game.js';
import { t } from './i18n.js';

// ---------------------------------------------------------------------------
// Difficulty definitions
// ---------------------------------------------------------------------------
const DIFFICULTIES = {
  easy:   { rows: 10, cols: 10, colors: 3, label: 'easy' },
  medium: { rows: 12, cols: 15, colors: 4, label: 'medium' },
  hard:   { rows: 15, cols: 20, colors: 5, label: 'hard' },
};

// CSS class names for colors (styled in style.css)
const COLOR_CLASSES = ['c0', 'c1', 'c2', 'c3', 'c4'];

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------
let state        = null;
let lang         = localStorage.getItem('sg-lang')  || 'en';
let theme        = localStorage.getItem('sg-theme') || 'light';
let difficulty   = localStorage.getItem('sg-diff')  || 'easy';
let highlighted  = null; // array of [row,col] currently highlighted, or null
let isAnimating  = false; // true while a removal animation is playing

// ---------------------------------------------------------------------------
// DOM references (set after DOMContentLoaded)
// ---------------------------------------------------------------------------
let grid, scoreEl, bestEl, undoBtn, newBtn, overlay, overlayTitle,
    overlayMsg, overlayScore, overlayPlayBtn, previewEl, hintEl;

// ---------------------------------------------------------------------------
// Best score helpers
// ---------------------------------------------------------------------------
function bestKey() { return `sg-best-${difficulty}`; }
function getBest()  { return parseInt(localStorage.getItem(bestKey()) || '0', 10); }
function saveBest(score) {
  if (score > getBest()) localStorage.setItem(bestKey(), String(score));
}

// ---------------------------------------------------------------------------
// i18n helpers
// ---------------------------------------------------------------------------
function _(key) { return t(lang, key); }

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    el.textContent = _(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = _(el.dataset.i18nPlaceholder);
  });
  // Update difficulty selector options
  document.querySelectorAll('#difficulty-select option').forEach(opt => {
    opt.textContent = _(opt.value);
  });
  hintEl.textContent = _('hint');
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  document.getElementById('theme-toggle').textContent =
    theme === 'dark' ? _('light') : _('dark');
}

// ---------------------------------------------------------------------------
// New game
// ---------------------------------------------------------------------------
function startGame() {
  const def = DIFFICULTIES[difficulty];
  state = createGame(def.rows, def.cols, def.colors);
  highlighted = null;
  updateScoreDisplay();
  renderGrid();
  hideOverlay();
}

// ---------------------------------------------------------------------------
// Score display
// ---------------------------------------------------------------------------
function updateScoreDisplay() {
  scoreEl.textContent = state.score;
  bestEl.textContent  = getBest();
}

// ---------------------------------------------------------------------------
// Grid rendering
// ---------------------------------------------------------------------------
/**
 * Full re-render: destroys and recreates all cells. Used when the grid
 * structure changes (new game, difficulty change, undo). NOT used during
 * normal play because innerHTML=''/appendChild causes a whole-grid flicker.
 */
function renderGrid() {
  grid.innerHTML = '';
  const def = DIFFICULTIES[difficulty];
  grid.style.setProperty('--cols', def.cols);
  grid.style.setProperty('--rows', def.rows);

  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;

      const v = state.board[r][c];
      if (v !== null) {
        cell.classList.add(COLOR_CLASSES[v]);
      } else {
        cell.classList.add('empty');
      }

      cell.addEventListener('click',    onCellClick);
      cell.addEventListener('mouseenter', onCellHover);
      cell.addEventListener('mouseleave', onCellLeave);
      cell.addEventListener('touchstart', onCellTouch, { passive: true });

      grid.appendChild(cell);
    }
  }
}

/**
 * In-place update: reuses existing cell DOM elements, only mutating their
 * class lists. Used during a play() move so we don't flash the whole grid.
 * Returns an array of cells whose contents changed (for fall animation).
 */
function updateGridInPlace() {
  const cells = grid.children;
  const changed = [];
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const cell = cells[r * state.cols + c];
      if (!cell) continue;
      const v = state.board[r][c];
      const oldColorClass = [...cell.classList].find(x => /^c\d$/.test(x)) || null;
      const wasEmpty = cell.classList.contains('empty');
      const newColorClass = v !== null ? COLOR_CLASSES[v] : null;
      const nowEmpty = v === null;

      // Remove all transient/content classes
      cell.classList.remove('empty', 'c0', 'c1', 'c2', 'c3', 'c4', 'highlight', 'popping', 'fall');

      if (nowEmpty) {
        cell.classList.add('empty');
      } else {
        cell.classList.add(newColorClass);
      }

      // A cell "changed" when its visible content is different
      const contentChanged =
        wasEmpty !== nowEmpty ||
        (!nowEmpty && oldColorClass !== newColorClass);
      if (contentChanged && !nowEmpty) {
        changed.push(cell);
      }
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Highlight helpers
// ---------------------------------------------------------------------------
function clearHighlight() {
  highlighted = null;
  previewEl.textContent = '';
  grid.querySelectorAll('.cell.highlight').forEach(el => el.classList.remove('highlight'));
}

function applyHighlight(points) {
  highlighted = points;
  grid.querySelectorAll('.cell').forEach(cell => {
    const r = +cell.dataset.row;
    const c = +cell.dataset.col;
    const inGroup = points.some(([hr, hc]) => hr === r && hc === c);
    if (inGroup) {
      cell.classList.add('highlight');
    } else {
      cell.classList.remove('highlight');
    }
  });
  const score = (points.length - 2) ** 2;
  previewEl.textContent = `${_('previewScore')}: +${score}`;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------
function onCellHover(e) {
  if (isAnimating) return;
  if (state.cleared || !state.hasNext) return;
  const r = +e.currentTarget.dataset.row;
  const c = +e.currentTarget.dataset.col;
  if (state.board[r]?.[c] === null || state.board[r]?.[c] === undefined) {
    clearHighlight();
    return;
  }
  const points = match(state.board, r, c);
  if (points) {
    applyHighlight(points);
  } else {
    clearHighlight();
  }
}

function onCellLeave() {
  if (isAnimating) return;
  clearHighlight();
}

function onCellClick(e) {
  if (isAnimating) return;
  if (state.cleared || !state.hasNext) return;
  const r = +e.currentTarget.dataset.row;
  const c = +e.currentTarget.dataset.col;
  doPlay(r, c);
}

let touchHighlightedCell = null;
function onCellTouch(e) {
  const r = +e.currentTarget.dataset.row;
  const c = +e.currentTarget.dataset.col;

  if (touchHighlightedCell &&
      touchHighlightedCell[0] === r && touchHighlightedCell[1] === c) {
    // Second tap on same cell → confirm
    doPlay(r, c);
    touchHighlightedCell = null;
    return;
  }

  const points = match(state.board, r, c);
  if (points) {
    applyHighlight(points);
    touchHighlightedCell = [r, c];
  } else {
    clearHighlight();
    touchHighlightedCell = null;
  }
}

function doPlay(r, c) {
  // Find the matched group on the CURRENT board so we can animate removal
  const points = match(state.board, r, c);
  if (!points) return;

  isAnimating = true;

  // Phase 1: pop-out animation on the matched cells (in place)
  const popDurationMs = 180;
  grid.querySelectorAll('.cell').forEach(cell => {
    const cr = +cell.dataset.row;
    const cc = +cell.dataset.col;
    if (points.some(([pr, pc]) => pr === cr && pc === cc)) {
      cell.classList.remove('highlight');
      cell.classList.add('popping');
    }
  });

  // Phase 2: after pop completes, update state and in-place refresh.
  // In-place update avoids the whole-grid flash caused by innerHTML=''.
  setTimeout(() => {
    state = play(state, r, c);
    highlighted = null;
    touchHighlightedCell = null;
    previewEl.textContent = '';

    updateScoreDisplay();
    const changedCells = updateGridInPlace();
    animateFallCells(changedCells);

    isAnimating = false;

    if (state.cleared) {
      saveBest(state.score);
      showOverlay(true);
      return;
    }
    if (!state.hasNext) {
      saveBest(state.score);
      showOverlay(false);
    }
  }, popDurationMs);
}

// ---------------------------------------------------------------------------
// Fall animation
// ---------------------------------------------------------------------------
function animateFallCells(cells) {
  cells.forEach((cell) => {
    const c = +cell.dataset.col;
    cell.style.animationDelay = `${c * 15}ms`;
    cell.classList.add('fall');
    cell.addEventListener('animationend', () => {
      cell.classList.remove('fall');
      cell.style.animationDelay = '';
    }, { once: true });
  });
}

// ---------------------------------------------------------------------------
// Overlay (game over / cleared)
// ---------------------------------------------------------------------------
function showOverlay(cleared) {
  overlayTitle.textContent = cleared ? _('cleared') : _('gameOver');
  overlayMsg.textContent   = cleared ? _('clearedMsg') : _('gameOverMsg');
  overlayScore.textContent = `${_('finalScore')}: ${state.score}`;
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
function onUndoClick() {
  if (!state || state.history.length === 0) return;
  state = undo(state);
  highlighted = null;
  touchHighlightedCell = null;
  previewEl.textContent = '';
  updateScoreDisplay();
  renderGrid();
}

function onNewGame() {
  startGame();
}

function onDifficultyChange(e) {
  difficulty = e.target.value;
  localStorage.setItem('sg-diff', difficulty);
  startGame();
}

function onThemeToggle() {
  theme = theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('sg-theme', theme);
  applyTheme();
}

function onLangToggle() {
  lang = lang === 'ja' ? 'en' : 'ja';
  localStorage.setItem('sg-lang', lang);
  applyTranslations();
  applyTheme(); // refresh theme button label
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------
function onKeyDown(e) {
  if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    onUndoClick();
  }
  if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    onNewGame();
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  grid          = document.getElementById('game-grid');
  scoreEl       = document.getElementById('score-value');
  bestEl        = document.getElementById('best-value');
  undoBtn       = document.getElementById('undo-btn');
  newBtn        = document.getElementById('new-btn');
  overlay       = document.getElementById('overlay');
  overlayTitle  = document.getElementById('overlay-title');
  overlayMsg    = document.getElementById('overlay-msg');
  overlayScore  = document.getElementById('overlay-score');
  overlayPlayBtn= document.getElementById('overlay-play-btn');
  previewEl     = document.getElementById('preview');
  hintEl        = document.getElementById('hint');

  // Wire controls
  undoBtn.addEventListener('click', onUndoClick);
  newBtn.addEventListener('click',  onNewGame);
  overlayPlayBtn.addEventListener('click', () => startGame());
  document.getElementById('difficulty-select').addEventListener('change', onDifficultyChange);
  document.getElementById('theme-toggle').addEventListener('click', onThemeToggle);
  document.getElementById('lang-toggle').addEventListener('click',  onLangToggle);

  // Set initial difficulty select value
  document.getElementById('difficulty-select').value = difficulty;

  document.addEventListener('keydown', onKeyDown);

  applyTheme();
  applyTranslations();
  startGame();
});
