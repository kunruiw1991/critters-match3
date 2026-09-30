import { CRITTER_TYPES, MAGIC_BIRD_CRITTER, COMBO_CALLOUTS, LEVELS } from './levels.js?v=1';
import { sound } from './audio.js?v=1';

// ============================================================================
// CRITTER POP · 萌宠开心消消乐 — 8x8 MATCH-3 & SPECIAL BOMB ENGINE
// ============================================================================

const GRID = 8;
const TILE = 72; // 8 * 72 = 576x576 canvas
const SAVE_KEY = 'critter_pop_match3_save_v1';

const canvas = document.getElementById('matchCanvas');
const ctx = canvas.getContext('2d');

// Preload all Critter & Magic Bird portraits
const imageCache = new Map();
const CRITTER_MAP = new Map();
CRITTER_TYPES.forEach(c => CRITTER_MAP.set(c.id, c));

function preloadImages() {
  const urls = new Set();
  CRITTER_TYPES.forEach(c => urls.add(c.icon));
  LEVELS.forEach(l => urls.add(l.hostIcon));
  urls.add(MAGIC_BIRD_CRITTER.icon);
  urls.forEach(url => {
    const img = new Image();
    img.src = url;
    imageCache.set(url, img);
  });
}
preloadImages();

export const S = {
  phase: 'ready', // 'ready' | 'animating' | 'victory' | 'paused'
  levelIndex: 0,
  levelCfg: LEVELS[0],
  clearedLevels: new Set(),
  score: 0,
  highScore: 0,
  moves: 30,
  combo: 1,
  maxCombo: 1,
  activeTool: null, // null | 'hammer' | 'wand'
  selected: null,   // { r, c }
  hintPair: null,   // [{ r, c }, { r, c }]
  idleTimer: 0,
  lastClickCell: null,
  lastClickTime: 0,
  board: [],        // 8x8 array of cell objects
  goalsProgress: [], // [{ ...goal, current, target }]
  lasers: [],       // Visual laser beams [{ x1, y1, x2, y2, color, life, maxLife }]
  shockwaves: [],   // Visual shockwave rings [{ x, y, maxR, color, life, maxLife }]
  particles: [],    // Candy crumbs & sparkles
  popups: []        // Floating score & callout texts
};

// ============================================================================
// LEVEL INITIALIZATION & BOARD BUILDER
// ============================================================================
function randomCritterId() {
  return CRITTER_TYPES[Math.floor(Math.random() * CRITTER_TYPES.length)].id;
}

function makeCell(r, c, type = randomCritterId(), special = null, ice = 0, honey = 0) {
  return {
    r,
    c,
    type,
    special, // null | 'line_h' | 'line_v' | 'bomb' | 'bird'
    ice,     // 0 | 1 | 2
    honey,   // 0 | 1
    drawX: c * TILE,
    drawY: r * TILE,
    scale: 1,
    alpha: 1
  };
}

export function loadLevel(lvlIdx) {
  const idx = Math.max(0, Math.min(LEVELS.length - 1, Number(lvlIdx) || 0));
  S.levelIndex = idx;
  const cfg = LEVELS[idx];
  S.levelCfg = cfg;

  S.phase = 'ready';
  S.score = 0;
  S.moves = cfg.moves || 30;
  S.combo = 1;
  S.maxCombo = 1;
  S.activeTool = null;
  S.selected = null;
  S.hintPair = null;
  S.idleTimer = 0;
  S.lasers = [];
  S.shockwaves = [];
  S.particles = [];
  S.popups = [];

  S.goalsProgress = cfg.goals.map(g => ({
    ...g,
    current: 0,
    target: g.count
  }));

  // Build 8x8 board with zero initial 3-in-a-row matches
  S.board = [];
  for (let r = 0; r < GRID; r++) {
    const row = [];
    for (let c = 0; c < GRID; c++) {
      let t = randomCritterId();
      let guard = 0;
      while (
        guard++ < 30 &&
        ((c >= 2 && row[c - 1].type === t && row[c - 2].type === t) ||
          (r >= 2 && S.board[r - 1][c].type === t && S.board[r - 2][c].type === t))
      ) {
        t = randomCritterId();
      }
      row.push(makeCell(r, c, t, null, 0, 0));
    }
    S.board.push(row);
  }

  // Place Level Ice & Honey overlays
  for (const [r, c, layers] of cfg.iceMap || []) {
    if (S.board[r]?.[c]) S.board[r][c].ice = layers || 1;
  }
  for (const [r, c] of cfg.honeyMap || []) {
    if (S.board[r]?.[c]) S.board[r][c].honey = 1;
  }

  // Place Starting Special Bombs / Magic Birds
  for (const sp of cfg.startingSpecials || []) {
    const cell = S.board[sp.r]?.[sp.c];
    if (cell) {
      cell.special = sp.special;
      if (sp.special === 'bird') {
        cell.type = 'dogday';
      }
    }
  }

  ensureValidMoveExists();

  document.getElementById('resultModal')?.classList.add('hidden');
  document.getElementById('vineMapModal')?.classList.add('hidden');

  updateBoosterUI();
  renderLevelStrip();
  updateHUD();
  showComboBanner(`🌿 ${cfg.title} · 开始消除！`, 2.0);
}

// ============================================================================
// VALID MOVE DETECTOR, SMART HINT & AUTO-SHUFFLE
// ============================================================================
export function findBestValidMove() {
  // 1. Any Magic Bird can swap with any neighbor!
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const cell = S.board[r][c];
      if (cell.special === 'bird' && r + 1 < GRID) {
        return [{ r, c }, { r: r + 1, c }];
      }
      if (cell.special === 'bird' && c + 1 < GRID) {
        return [{ r, c }, { r, c: c + 1 }];
      }
    }
  }

  // 2. Check all adjacent horizontal and vertical pairs for a match >= 3 or special+special
  let bestPair = null;
  let bestScore = 0;

  const trySwapPair = (r1, c1, r2, c2) => {
    const a = S.board[r1][c1];
    const b = S.board[r2][c2];
    if (a.special && b.special) {
      return 100;
    }
    // Temporarily swap types
    const tmpT = a.type;
    a.type = b.type;
    b.type = tmpT;
    const groups = findMatchGroups();
    a.type = b.type;
    b.type = tmpT;

    if (groups.length === 0) return 0;
    let total = 0;
    groups.forEach(g => {
      total += g.cells.length;
    });
    return total;
  };

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (c + 1 < GRID) {
        const sc = trySwapPair(r, c, r, c + 1);
        if (sc > bestScore) {
          bestScore = sc;
          bestPair = [{ r, c }, { r, c: c + 1 }];
        }
      }
      if (r + 1 < GRID) {
        const sc = trySwapPair(r, c, r + 1, c);
        if (sc > bestScore) {
          bestScore = sc;
          bestPair = [{ r, c }, { r: r + 1, c }];
        }
      }
    }
  }
  return bestPair;
}

function ensureValidMoveExists() {
  let move = findBestValidMove();
  let tries = 0;
  while (!move && tries++ < 15) {
    shuffleBoardTypesOnly();
    move = findBestValidMove();
  }
  if (!move) {
    // Guarantee a Magic Bird at center if somehow still no move
    S.board[3][3].special = 'bird';
  }
}

function shuffleBoardTypesOnly() {
  const types = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      types.push(S.board[r][c].type);
    }
  }
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  let k = 0;
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      S.board[r][c].type = types[k++];
      S.board[r][c].scale = 0.7;
    }
  }
}

// ============================================================================
// MATCH DETECTION & ANIPOP SPECIAL SYNTHESIS (4 -> LINE, T/L -> BOMB, 5 -> BIRD)
// ============================================================================
export function findMatchGroups() {
  const horizRuns = [];
  const vertRuns = [];

  // Horizontal runs of >= 3 matching non-bird Critters
  for (let r = 0; r < GRID; r++) {
    let c = 0;
    while (c < GRID) {
      const cell = S.board[r][c];
      if (!cell || !cell.type || cell.special === 'bird') {
        c++;
        continue;
      }
      let end = c + 1;
      while (
        end < GRID &&
        S.board[r][end] &&
        S.board[r][end].type === cell.type &&
        S.board[r][end].special !== 'bird'
      ) {
        end++;
      }
      const len = end - c;
      if (len >= 3) {
        const cells = [];
        for (let k = c; k < end; k++) cells.push({ r, c: k });
        horizRuns.push({ type: cell.type, dir: 'h', len, cells });
      }
      c = end;
    }
  }

  // Vertical runs of >= 3 matching non-bird Critters
  for (let c = 0; c < GRID; c++) {
    let r = 0;
    while (r < GRID) {
      const cell = S.board[r][c];
      if (!cell || !cell.type || cell.special === 'bird') {
        r++;
        continue;
      }
      let end = r + 1;
      while (
        end < GRID &&
        S.board[end][c] &&
        S.board[end][c].type === cell.type &&
        S.board[end][c].special !== 'bird'
      ) {
        end++;
      }
      const len = end - r;
      if (len >= 3) {
        const cells = [];
        for (let k = r; k < end; k++) cells.push({ r: k, c });
        vertRuns.push({ type: cell.type, dir: 'v', len, cells });
      }
      r = end;
    }
  }

  // Merge overlapping runs of the same Critter type into connected match groups
  const allRuns = [...horizRuns, ...vertRuns];
  const visited = new Array(allRuns.length).fill(false);
  const groups = [];

  const shareCell = (runA, runB) => {
    for (const a of runA.cells) {
      for (const b of runB.cells) {
        if (a.r === b.r && a.c === b.c) return true;
      }
    }
    return false;
  };

  for (let i = 0; i < allRuns.length; i++) {
    if (visited[i]) continue;
    visited[i] = true;
    const queue = [allRuns[i]];
    const clusterRuns = [];
    while (queue.length > 0) {
      const cur = queue.shift();
      clusterRuns.push(cur);
      for (let j = 0; j < allRuns.length; j++) {
        if (!visited[j] && allRuns[j].type === cur.type && shareCell(cur, allRuns[j])) {
          visited[j] = true;
          queue.push(allRuns[j]);
        }
      }
    }

    const cellMap = new Map();
    let maxLineLen = 0;
    let hasH = false;
    let hasV = false;
    for (const run of clusterRuns) {
      if (run.dir === 'h') hasH = true;
      if (run.dir === 'v') hasV = true;
      if (run.len > maxLineLen) maxLineLen = run.len;
      for (const pos of run.cells) {
        cellMap.set(`${pos.r},${pos.c}`, pos);
      }
    }

    const uniqueCells = Array.from(cellMap.values());
    let spawnSpecial = null;
    if (maxLineLen >= 5) {
      spawnSpecial = 'bird'; // 5-in-a-row -> CraftyCorn Magic Bird 🌈!
    } else if (hasH && hasV && uniqueCells.length >= 5) {
      spawnSpecial = 'bomb'; // T/L-shape -> 3x3 Area Bomb 💣!
    } else if (maxLineLen === 4) {
      spawnSpecial = hasH ? 'line_v' : 'line_h'; // 4-in-a-row -> Line Blast ⚡!
    }

    groups.push({
      type: clusterRuns[0].type,
      cells: uniqueCells,
      spawnSpecial
    });
  }

  return groups;
}

// ============================================================================
// PLAYER SWAP, DOUBLE-CLICK DETONATION & MAGIC BOOSTERS
// ============================================================================
export async function attemptSwap(r1, c1, r2, c2) {
  if (S.phase !== 'ready') return false;
  if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return false;

  S.phase = 'animating';
  S.selected = null;
  S.hintPair = null;
  S.idleTimer = 0;
  sound.startMusic();
  sound.swap();

  const cellA = S.board[r1][c1];
  const cellB = S.board[r2][c2];

  // Animate visual swap
  await animateSwapCells(cellA, cellB, 150);

  // Swap board data (type + special; ice and honey stay on the board cell coordinates)
  swapCellContents(cellA, cellB);

  const nowA = S.board[r1][c1];
  const nowB = S.board[r2][c2];

  // Case 1: Magic Bird + Anything OR Special + Special Combo!
  if (nowA.special === 'bird' || nowB.special === 'bird' || (nowA.special && nowB.special)) {
    consumeOneMove();
    S.combo = 1;
    await triggerSpecialPairCombo(nowA, nowB);
    await runCascadeLoop();
    finishTurn();
    return true;
  }

  // Case 2: Standard Match-3 / Match-4 / Match-5 check
  const groups = findMatchGroups();
  if (groups.length === 0) {
    // Invalid swap -> swap back smoothly without costing a move!
    sound.invalidSwap();
    await animateSwapCells(nowA, nowB, 140);
    swapCellContents(nowA, nowB);
    S.phase = 'ready';
    return false;
  }

  consumeOneMove();
  S.combo = 1;
  await resolveMatchGroups(groups, [
    { r: r1, c: c1 },
    { r: r2, c: c2 }
  ]);
  await runCascadeLoop();
  finishTurn();
  return true;
}

function swapCellContents(a, b) {
  const tmpType = a.type;
  const tmpSpec = a.special;
  a.type = b.type;
  a.special = b.special;
  b.type = tmpType;
  b.special = tmpSpec;
  a.drawX = a.c * TILE;
  a.drawY = a.r * TILE;
  b.drawX = b.c * TILE;
  b.drawY = b.r * TILE;
}

function animateSwapCells(a, b, durMs = 150) {
  return new Promise(resolve => {
    const startX_A = a.c * TILE;
    const startY_A = a.r * TILE;
    const startX_B = b.c * TILE;
    const startY_B = b.r * TILE;
    const t0 = performance.now();

    function step(now) {
      const p = Math.min(1, (now - t0) / durMs);
      const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      a.drawX = startX_A + (startX_B - startX_A) * ease;
      a.drawY = startY_A + (startY_B - startY_A) * ease;
      b.drawX = startX_B + (startX_A - startX_B) * ease;
      b.drawY = startY_B + (startY_A - startY_B) * ease;
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

function consumeOneMove() {
  S.moves = Math.max(0, S.moves - 1);
  updateHUD();
}

// Direct Double-Click on a Special Tile detonates it immediately!
export async function detonateSpecialCellDirectly(r, c) {
  if (S.phase !== 'ready') return false;
  const cell = S.board[r]?.[c];
  if (!cell || !cell.special) return false;

  S.phase = 'animating';
  S.selected = null;
  S.hintPair = null;
  consumeOneMove();
  S.combo = 1;

  const clearSet = new Set([`${r},${c}`]);
  expandSpecialTriggers(clearSet);
  await clearCellsAndRefill(clearSet, []);
  await runCascadeLoop();
  finishTurn();
  return true;
}

// ============================================================================
// SPECIAL + SPECIAL & MAGIC BIRD SUPER COMBOS (开心消消乐大招系统)
// ============================================================================
async function triggerSpecialPairCombo(cellA, cellB) {
  const clearSet = new Set([`${cellA.r},${cellA.c}`, `${cellB.r},${cellB.c}`]);

  // 1. Double Magic Bird (🌈 + 🌈) -> Full 8x8 Board Clear!
  if (cellA.special === 'bird' && cellB.special === 'bird') {
    sound.magicBird();
    showComboBanner('🌈🦄 DOUBLE MAGIC BIRD! 全屏大清场！', 2.2);
    addShockwave((GRID / 2) * TILE, (GRID / 2) * TILE, 360, '#ffd166');
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        clearSet.add(`${r},${c}`);
      }
    }
    cellA.special = null;
    cellB.special = null;
    await clearCellsAndRefill(clearSet, []);
    return;
  }

  // 2. Magic Bird + Another Tile (Normal or Special)
  if (cellA.special === 'bird' || cellB.special === 'bird') {
    const birdCell = cellA.special === 'bird' ? cellA : cellB;
    const otherCell = birdCell === cellA ? cellB : cellA;
    const targetType = otherCell.type || randomCritterId();
    const inheritedSpecial = otherCell.special;

    sound.magicBird();
    const critterInfo = CRITTER_MAP.get(targetType) || CRITTER_TYPES[0];
    showComboBanner(`🌈 Magic Bird Clears All ${critterInfo.name}! · 魔力鸟全屏同色消除！`, 2.0);

    birdCell.special = null;
    otherCell.special = null;

    const bx = (birdCell.c + 0.5) * TILE;
    const by = (birdCell.r + 0.5) * TILE;

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const target = S.board[r][c];
        if (target.type === targetType) {
          clearSet.add(`${r},${c}`);
          addLaser(bx, by, (c + 0.5) * TILE, (r + 0.5) * TILE, critterInfo.glow);
          if (inheritedSpecial && inheritedSpecial !== 'bird') {
            target.special = inheritedSpecial === 'line_h' || inheritedSpecial === 'line_v'
              ? (Math.random() < 0.5 ? 'line_h' : 'line_v')
              : 'bomb';
          }
        }
      }
    }

    expandSpecialTriggers(clearSet);
    await sleep(180);
    await clearCellsAndRefill(clearSet, []);
    return;
  }

  // 3. Two Non-Bird Specials Swapped (⚡ + ⚡, ⚡ + 💣, 💣 + 💣)
  const specA = cellA.special;
  const specB = cellB.special;
  cellA.special = null;
  cellB.special = null;

  if ((specA === 'bomb' && (specB === 'line_h' || specB === 'line_v')) ||
      (specB === 'bomb' && (specA === 'line_h' || specA === 'line_v'))) {
    // Mega 3-Row + 3-Col Cross Blast!
    sound.bomb();
    sound.laser();
    showComboBanner('🔥 MEGA CROSS BLAST! · 爆炸+直线超宽十字清屏！', 2.0);
    for (let dr = -1; dr <= 1; dr++) {
      const rr = cellB.r + dr;
      if (rr >= 0 && rr < GRID) {
        addLaser(0, (rr + 0.5) * TILE, GRID * TILE, (rr + 0.5) * TILE, '#ffbe0b');
        for (let c = 0; c < GRID; c++) clearSet.add(`${rr},${c}`);
      }
    }
    for (let dc = -1; dc <= 1; dc++) {
      const cc = cellB.c + dc;
      if (cc >= 0 && cc < GRID) {
        addLaser((cc + 0.5) * TILE, 0, (cc + 0.5) * TILE, GRID * TILE, '#4cc9f0');
        for (let r = 0; r < GRID; r++) clearSet.add(`${r},${cc}`);
      }
    }
  } else if (specA === 'bomb' && specB === 'bomb') {
    // Giant 5x5 Explosion!
    sound.bomb();
    showComboBanner('💥 DOUBLE BOMB 5×5 BLAST! · 双爆炸特效全屏震荡！', 2.0);
    addShockwave((cellB.c + 0.5) * TILE, (cellB.r + 0.5) * TILE, 220, '#ff4d6d');
    for (let r = Math.max(0, cellB.r - 2); r <= Math.min(GRID - 1, cellB.r + 2); r++) {
      for (let c = Math.max(0, cellB.c - 2); c <= Math.min(GRID - 1, cellB.c + 2); c++) {
        clearSet.add(`${r},${c}`);
      }
    }
  } else {
    // Double Line Blast -> Full Row + Full Column Cross Laser!
    sound.laser();
    showComboBanner('⚡ CROSS LASER BLAST! · 双直线十字激光！', 1.8);
    addLaser(0, (cellB.r + 0.5) * TILE, GRID * TILE, (cellB.r + 0.5) * TILE, '#ffd166');
    addLaser((cellB.c + 0.5) * TILE, 0, (cellB.c + 0.5) * TILE, GRID * TILE, '#4cc9f0');
    for (let k = 0; k < GRID; k++) {
      clearSet.add(`${cellB.r},${k}`);
      clearSet.add(`${k},${cellB.c}`);
    }
  }

  expandSpecialTriggers(clearSet);
  await sleep(160);
  await clearCellsAndRefill(clearSet, []);
}

// ============================================================================
// RESOLVE MATCH GROUPS, CHAIN SPECIAL EXPLOSIONS & GRAVITY CASCADE
// ============================================================================
async function resolveMatchGroups(groups, swapCoords = []) {
  const clearSet = new Set();
  const spawnList = []; // [{ r, c, type, special }]

  for (const g of groups) {
    for (const pos of g.cells) {
      clearSet.add(`${pos.r},${pos.c}`);
    }
    if (g.spawnSpecial) {
      // Pick the swapped cell inside this group if possible, else the middle cell
      let anchor = g.cells[Math.floor(g.cells.length / 2)];
      for (const sw of swapCoords) {
        if (g.cells.some(p => p.r === sw.r && p.c === sw.c)) {
          anchor = sw;
          break;
        }
      }
      spawnList.push({
        r: anchor.r,
        c: anchor.c,
        type: g.type,
        special: g.spawnSpecial
      });
    }
  }

  expandSpecialTriggers(clearSet);
  await clearCellsAndRefill(clearSet, spawnList);
}

// Recursively expand any Special Tiles (line_h, line_v, bomb, bird) included in clearSet
function expandSpecialTriggers(clearSet) {
  const triggered = new Set();
  let added = true;

  while (added) {
    added = false;
    for (const key of Array.from(clearSet)) {
      if (triggered.has(key)) continue;
      const [r, c] = key.split(',').map(Number);
      const cell = S.board[r]?.[c];
      if (!cell || !cell.special) continue;

      triggered.add(key);
      const spec = cell.special;
      cell.special = null;

      if (spec === 'line_h') {
        sound.laser();
        addLaser(0, (r + 0.5) * TILE, GRID * TILE, (r + 0.5) * TILE, '#ffd166');
        for (let cc = 0; cc < GRID; cc++) {
          const k = `${r},${cc}`;
          if (!clearSet.has(k)) {
            clearSet.add(k);
            added = true;
          }
        }
      } else if (spec === 'line_v') {
        sound.laser();
        addLaser((c + 0.5) * TILE, 0, (c + 0.5) * TILE, GRID * TILE, '#4cc9f0');
        for (let rr = 0; rr < GRID; rr++) {
          const k = `${rr},${c}`;
          if (!clearSet.has(k)) {
            clearSet.add(k);
            added = true;
          }
        }
      } else if (spec === 'bomb') {
        sound.bomb();
        addShockwave((c + 0.5) * TILE, (r + 0.5) * TILE, 145, '#ff758f');
        for (let rr = Math.max(0, r - 1); rr <= Math.min(GRID - 1, r + 1); rr++) {
          for (let cc = Math.max(0, c - 1); cc <= Math.min(GRID - 1, c + 1); cc++) {
            const k = `${rr},${cc}`;
            if (!clearSet.has(k)) {
              clearSet.add(k);
              added = true;
            }
          }
        }
      } else if (spec === 'bird') {
        sound.magicBird();
        const targetType = cell.type || randomCritterId();
        const info = CRITTER_MAP.get(targetType) || CRITTER_TYPES[0];
        for (let rr = 0; rr < GRID; rr++) {
          for (let cc = 0; cc < GRID; cc++) {
            if (S.board[rr][cc].type === targetType) {
              const k = `${rr},${cc}`;
              if (!clearSet.has(k)) {
                clearSet.add(k);
                addLaser((c + 0.5) * TILE, (r + 0.5) * TILE, (cc + 0.5) * TILE, (rr + 0.5) * TILE, info.glow);
                added = true;
              }
            }
          }
        }
      }
    }
  }
}

async function clearCellsAndRefill(clearSet, spawnList = []) {
  if (clearSet.size === 0) return;

  sound.pop(S.combo);

  // Combo Callout Banner (Good! -> Great! -> Excellent! -> Amazing! -> Unbelievable!)
  if (S.combo >= 2) {
    let callout = COMBO_CALLOUTS[0];
    for (const co of COMBO_CALLOUTS) {
      if (S.combo >= co.min) callout = co;
    }
    addScore(callout.pts);
    showComboBanner(`🔥 Combo x${S.combo} · ${callout.en} ${callout.cn} (+${callout.pts})`, 1.5);
  }

  const spawnMap = new Map();
  for (const sp of spawnList) {
    spawnMap.set(`${sp.r},${sp.c}`, sp);
  }

  // Score, Goal Tracking & Particle Bursts for each cleared cell
  for (const key of clearSet) {
    const [r, c] = key.split(',').map(Number);
    const cell = S.board[r]?.[c];
    if (!cell) continue;

    const info = CRITTER_MAP.get(cell.type) || CRITTER_TYPES[0];
    const pts = 30 * S.combo;
    addScore(pts);
    recordGoalProgress('critter', cell.type, 1);

    // Damage Ice or Collect Honey on this cell
    if (cell.ice > 0) {
      cell.ice--;
      recordGoalProgress('ice', null, 1);
      addPopup(c, r, '🧊 破冰!', '#caf0f8');
    }
    if (cell.honey > 0) {
      cell.honey = 0;
      recordGoalProgress('honey', null, 1);
      addPopup(c, r, '🍯 +蜂蜜!', '#ffd166');
    }

    spawnParticles(c, r, info.glow, 7);
    cell.scale = 0.15;
  }

  addPopup(3.5, 3.5, `+${clearSet.size * 30 * S.combo}`, '#ffd166');
  updateHUD();
  await sleep(150);

  // Apply cleared cells or transform into newly synthesized Special Bomb / Magic Bird
  for (const key of clearSet) {
    const [r, c] = key.split(',').map(Number);
    const sp = spawnMap.get(key);
    if (sp) {
      S.board[r][c].type = sp.type;
      S.board[r][c].special = sp.special;
      S.board[r][c].scale = 1.15;
      const badge = sp.special === 'bird' ? '🌈 魔力鸟!' : sp.special === 'bomb' ? '💣 爆炸特效!' : '⚡ 直线特效!';
      addPopup(c, r, badge, '#ffe066');
    } else {
      S.board[r][c].type = null;
      S.board[r][c].special = null;
      S.board[r][c].scale = 1;
    }
  }

  // Gravity Fall: collapse remaining Critter tiles downward within each column
  for (let c = 0; c < GRID; c++) {
    let writeR = GRID - 1;
    for (let r = GRID - 1; r >= 0; r--) {
      const cell = S.board[r][c];
      if (cell.type !== null) {
        if (writeR !== r) {
          S.board[writeR][c].type = cell.type;
          S.board[writeR][c].special = cell.special;
          S.board[writeR][c].drawY = cell.drawY;
          cell.type = null;
          cell.special = null;
        }
        writeR--;
      }
    }
    // Fill empty top cells with fresh falling Critter Heads
    let dropOffset = 1;
    for (let r = writeR; r >= 0; r--) {
      const cell = S.board[r][c];
      cell.type = randomCritterId();
      cell.special = null;
      cell.drawX = c * TILE;
      cell.drawY = -(dropOffset++) * TILE;
      cell.scale = 1;
    }
  }

  await animateGravityFall(180);
}

function animateGravityFall(durMs = 180) {
  return new Promise(resolve => {
    const startY = [];
    for (let r = 0; r < GRID; r++) {
      startY[r] = [];
      for (let c = 0; c < GRID; c++) {
        startY[r][c] = S.board[r][c].drawY;
      }
    }
    const t0 = performance.now();
    function step(now) {
      const p = Math.min(1, (now - t0) / durMs);
      const ease = 1 - Math.pow(1 - p, 2);
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          const targetY = r * TILE;
          S.board[r][c].drawX = c * TILE;
          S.board[r][c].drawY = startY[r][c] + (targetY - startY[r][c]) * ease;
          S.board[r][c].scale += (1 - S.board[r][c].scale) * 0.35;
        }
      }
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

async function runCascadeLoop() {
  let safety = 0;
  while (safety++ < 18) {
    const groups = findMatchGroups();
    if (groups.length === 0) break;
    S.combo++;
    if (S.combo > S.maxCombo) S.maxCombo = S.combo;
    updateHUD();
    await resolveMatchGroups(groups, []);
  }
}

function finishTurn() {
  S.combo = 1;
  ensureValidMoveExists();
  updateHUD();

  // Check if all level targets are completed!
  if (areAllGoalsCompleted()) {
    triggerLevelVictory();
    return;
  }

  // Casual Immortal / Never-Stuck Mode: if moves hit 0, automatically gift +10 Free Moves!
  if (S.moves <= 0) {
    S.moves = 10;
    sound.magicBird();
    showComboBanner('🎁 轻松不败模式：免费赠送 +10 步继续闯关！', 2.4);
    updateHUD();
  }

  S.phase = 'ready';
}

function recordGoalProgress(type, id, amount = 1) {
  for (const g of S.goalsProgress) {
    if (g.type === type && (type !== 'critter' || g.id === id)) {
      g.current = Math.min(g.target, g.current + amount);
    }
  }
}

function areAllGoalsCompleted() {
  return S.goalsProgress.every(g => g.current >= g.target);
}

function addScore(pts) {
  S.score += pts;
  if (S.score > S.highScore) {
    S.highScore = S.score;
  }
}

function triggerLevelVictory() {
  if (S.phase === 'victory') return;
  S.phase = 'victory';
  S.clearedLevels.add(S.levelIndex);

  // Bonus points for remaining moves (开心消消乐 Bonus Time!)
  const bonusPts = S.moves * 150;
  addScore(500 + bonusPts);
  sound.victory();
  saveGameState(true);
  renderLevelStrip();
  updateHUD();

  const isAllClear = S.levelIndex >= LEVELS.length - 1;
  const curCfg = S.levelCfg;
  const nextCfg = LEVELS[(S.levelIndex + 1) % LEVELS.length];

  const hostImg = document.getElementById('resultHostImg');
  const nextImg = document.getElementById('resultNextHostImg');
  const starsBig = document.getElementById('resultStarsBig');
  const titleEl = document.getElementById('resultTitle');
  const subEl = document.getElementById('resultSub');
  const statsEl = document.getElementById('resultStatsBox');
  const nextBtn = document.getElementById('resultNextBtn');

  if (hostImg) hostImg.src = curCfg.hostIcon;
  if (nextImg) nextImg.src = nextCfg.hostIcon;
  if (starsBig) starsBig.textContent = '⭐⭐⭐';

  if (isAllClear) {
    if (titleEl) titleEl.textContent = '👑 ALL 8 VINE TREE LEVELS CLEARED! · 藤蔓大树全通关！';
    if (subEl) subEl.textContent = 'Every Smiling Critter celebrated atop the Giant Vine Tree! · 八大萌宠开心消消乐圆满大通关！';
    if (nextBtn) nextBtn.textContent = '🌟 Play Again (Lv.1) · 从第1关再来';
  } else {
    if (titleEl) titleEl.textContent = `🎉 ${curCfg.title} 通关！`;
    if (subEl) subEl.textContent = `Next Level: ${nextCfg.title} (${nextCfg.hostName})!`;
    if (nextBtn) nextBtn.textContent = `▶️ Next: Lv.${S.levelIndex + 2} · 攀登下一关`;
  }

  if (statsEl) {
    statsEl.textContent = `⭐ Score: ${S.score} (+${bonusPts} 剩余步数奖励) · 🏆 Best: ${S.highScore} · 🔥 Max Combo: x${S.maxCombo} · ✅ Cleared: ${S.clearedLevels.size}/8`;
  }

  document.getElementById('resultModal')?.classList.remove('hidden');
}

// ============================================================================
// FOUR FREE MAGIC BOOSTERS (🔨 HAMMER, 🌈 WAND, 💣 BOMB PACK, 🔀 SHUFFLE +5)
// ============================================================================
export async function applyBoosterOnCell(r, c) {
  if (S.phase !== 'ready' || !S.activeTool) return false;
  const tool = S.activeTool;
  S.activeTool = null;
  updateBoosterUI();

  const cell = S.board[r]?.[c];
  if (!cell) return false;

  S.phase = 'animating';
  S.selected = null;
  S.hintPair = null;

  if (tool === 'hammer') {
    sound.bomb();
    addShockwave((c + 0.5) * TILE, (r + 0.5) * TILE, 110, '#ffd166');
    showComboBanner('🔨 小木槌暴击！直接敲碎目标格！', 1.6);
    const clearSet = new Set([`${r},${c}`]);
    expandSpecialTriggers(clearSet);
    await clearCellsAndRefill(clearSet, []);
    await runCascadeLoop();
    finishTurn();
    return true;
  } else if (tool === 'wand') {
    sound.magicBird();
    const targetType = cell.type || randomCritterId();
    const info = CRITTER_MAP.get(targetType) || CRITTER_TYPES[0];
    showComboBanner(`🌈 魔力棒发动！全屏消除所有 ${info.name}！`, 1.8);
    const clearSet = new Set();
    for (let rr = 0; rr < GRID; rr++) {
      for (let cc = 0; cc < GRID; cc++) {
        if (S.board[rr][cc].type === targetType) {
          clearSet.add(`${rr},${cc}`);
          addLaser((c + 0.5) * TILE, (r + 0.5) * TILE, (cc + 0.5) * TILE, (rr + 0.5) * TILE, info.glow);
        }
      }
    }
    expandSpecialTriggers(clearSet);
    await sleep(160);
    await clearCellsAndRefill(clearSet, []);
    await runCascadeLoop();
    finishTurn();
    return true;
  }
  S.phase = 'ready';
  return false;
}

export function useBombPackBooster() {
  if (S.phase !== 'ready') return;
  sound.magicBird();
  const candidates = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (!S.board[r][c].special) candidates.push(S.board[r][c]);
    }
  }
  if (candidates.length >= 2) {
    const a = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
    const b = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
    a.special = Math.random() < 0.5 ? 'line_h' : 'line_v';
    a.scale = 1.25;
    b.special = 'bomb';
    b.scale = 1.25;
    spawnParticles(a.c, a.r, '#ffd166', 12);
    spawnParticles(b.c, b.r, '#ff758f', 12);
    showComboBanner('💣 特效包送达！棋盘新增 ⚡直线特效 + 💣爆炸特效！', 1.9);
  }
}

export function useShufflePlusBooster() {
  if (S.phase !== 'ready') return;
  sound.magicBird();
  shuffleBoardTypesOnly();
  S.moves += 5;
  ensureValidMoveExists();
  updateHUD();
  showComboBanner('🔀 棋盘已重新洗牌，并免费赠送 +5 步！', 1.9);
}

// ============================================================================
// EXPRESSIVE 2D CANVAS RENDERER (CANDY TILES, ICE, HONEY, LASERS & CRITTERS)
// ============================================================================
export function renderBoard(dt) {
  const now = performance.now() * 0.001;

  // Auto-hint after 3.2 seconds of idle time
  if (S.phase === 'ready') {
    S.idleTimer += dt;
    if (S.idleTimer >= 3.2 && !S.hintPair) {
      S.hintPair = findBestValidMove();
    }
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Translucent Frosted Vine Grid Cells + Ice / Honey Underlays
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const x = c * TILE;
      const y = r * TILE;
      const isEven = (r + c) % 2 === 0;

      ctx.fillStyle = isEven ? 'rgba(20, 62, 44, 0.86)' : 'rgba(14, 46, 33, 0.86)';
      ctx.strokeStyle = 'rgba(116, 198, 157, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, TILE - 4, TILE - 4, 12);
      ctx.fill();
      ctx.stroke();

      const cell = S.board[r]?.[c];
      if (!cell) continue;

      // Ice Overlay Under/Around Tile
      if (cell.ice > 0) {
        ctx.fillStyle = cell.ice >= 2 ? 'rgba(56, 189, 248, 0.48)' : 'rgba(186, 230, 253, 0.36)';
        ctx.strokeStyle = cell.ice >= 2 ? '#38bdf8' : '#bae6fd';
        ctx.lineWidth = cell.ice >= 2 ? 3.5 : 2.5;
        ctx.beginPath();
        ctx.roundRect(x + 3, y + 3, TILE - 6, TILE - 6, 12);
        ctx.fill();
        ctx.stroke();
      }

      // Golden Honey Overlay
      if (cell.honey > 0) {
        ctx.fillStyle = 'rgba(251, 191, 36, 0.38)';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(x + 4, y + 4, TILE - 8, TILE - 8, 12);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  // 2. Render All 64 Critter Candy Cushions & Special Power Tiles
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const cell = S.board[r]?.[c];
      if (!cell || !cell.type) continue;
      drawCritterCell(cell, now);
    }
  }

  // 3. Render Lasers, Shockwaves, Particles & Popups
  for (let i = S.lasers.length - 1; i >= 0; i--) {
    const ls = S.lasers[i];
    ls.life -= dt;
    if (ls.life <= 0) {
      S.lasers.splice(i, 1);
      continue;
    }
    const alpha = ls.life / ls.maxLife;
    ctx.save();
    ctx.strokeStyle = ls.color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 14 * alpha;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ls.x1, ls.y1);
    ctx.lineTo(ls.x2, ls.y2);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5 * alpha;
    ctx.beginPath();
    ctx.moveTo(ls.x1, ls.y1);
    ctx.lineTo(ls.x2, ls.y2);
    ctx.stroke();
    ctx.restore();
  }

  for (let i = S.shockwaves.length - 1; i >= 0; i--) {
    const sw = S.shockwaves[i];
    sw.life -= dt;
    if (sw.life <= 0) {
      S.shockwaves.splice(i, 1);
      continue;
    }
    const p = 1 - sw.life / sw.maxLife;
    ctx.save();
    ctx.strokeStyle = sw.color;
    ctx.globalAlpha = 1 - p;
    ctx.lineWidth = 6 * (1 - p);
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.maxR * p, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  for (let i = S.particles.length - 1; i >= 0; i--) {
    const pt = S.particles[i];
    pt.life -= dt;
    if (pt.life <= 0) {
      S.particles.splice(i, 1);
      continue;
    }
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = S.popups.length - 1; i >= 0; i--) {
    const pop = S.popups[i];
    pop.life -= dt;
    if (pop.life <= 0) {
      S.popups.splice(i, 1);
      continue;
    }
    pop.y -= dt * 26;
    ctx.save();
    ctx.font = '900 14px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1b120c';
    ctx.fillText(pop.text, pop.x + 1.5, pop.y + 1.5);
    ctx.fillStyle = pop.color || '#ffd166';
    ctx.fillText(pop.text, pop.x, pop.y);
    ctx.restore();
  }
}

function drawCritterCell(cell, now) {
  const cx = cell.drawX + TILE / 2;
  const cy = cell.drawY + TILE / 2;
  const isSelected = S.selected && S.selected.r === cell.r && S.selected.c === cell.c;
  const isHinted =
    S.hintPair && S.hintPair.some(h => h.r === cell.r && h.c === cell.c);

  let pulse = cell.scale || 1;
  if (isSelected) {
    pulse *= 1.08 + Math.sin(now * 10) * 0.04;
  } else if (isHinted) {
    pulse *= 1.05 + Math.sin(now * 8) * 0.05;
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pulse, pulse);

  const isBird = cell.special === 'bird';
  const info = isBird ? MAGIC_BIRD_CRITTER : (CRITTER_MAP.get(cell.type) || CRITTER_TYPES[0]);

  // 1. Candy Cushion Tile Background
  const rSize = 29;
  if (isBird) {
    // Spinning Rainbow Halo for CraftyCorn Magic Bird (五连魔力鸟)!
    const grad = ctx.createLinearGradient(-rSize, -rSize, rSize, rSize);
    grad.addColorStop(0, '#ff4d6d');
    grad.addColorStop(0.33, '#ffd166');
    grad.addColorStop(0.66, '#4cc9f0');
    grad.addColorStop(1, '#b197fc');
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#ffffff';
  } else {
    const grad = ctx.createLinearGradient(0, -rSize, 0, rSize);
    grad.addColorStop(0, info.bgGrad[0]);
    grad.addColorStop(1, info.bgGrad[1]);
    ctx.fillStyle = grad;
    ctx.strokeStyle = isSelected ? '#ffffff' : info.border;
  }

  ctx.lineWidth = isSelected ? 3.5 : 2.2;
  ctx.beginPath();
  ctx.roundRect(-rSize, -rSize, rSize * 2, rSize * 2, 16);
  ctx.fill();
  ctx.stroke();

  // Top glossy candy shine
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.beginPath();
  ctx.roundRect(-rSize + 5, -rSize + 4, (rSize - 5) * 2, 10, 6);
  ctx.fill();

  // 2. Circular Critter Head Portrait inside Cushion
  const headR = 21.5;
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 1, headR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  const img = imageCache.get(info.icon);
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, -headR, 1 - headR, headR * 2, headR * 2);
  }
  ctx.restore();

  // Portrait ring
  ctx.strokeStyle = '#fffdf7';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 1, headR, 0, Math.PI * 2);
  ctx.stroke();

  // 3. Special Bomb / Laser / Magic Bird Aura & Indicator
  if (cell.special === 'line_h') {
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-27, 0);
    ctx.lineTo(27, 0);
    ctx.stroke();
    drawCornerBadge('↔️', -19, -19, '#f59e0b');
  } else if (cell.special === 'line_v') {
    ctx.strokeStyle = '#4cc9f0';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, -27);
    ctx.lineTo(0, 27);
    ctx.stroke();
    drawCornerBadge('↕️', -19, -19, '#0284c7');
  } else if (cell.special === 'bomb') {
    ctx.save();
    ctx.strokeStyle = '#ff4d6d';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 3]);
    ctx.rotate(now * 3.5);
    ctx.beginPath();
    ctx.arc(0, 1, headR + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawCornerBadge('💣', -19, -19, '#e11d48');
  } else if (cell.special === 'bird') {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.rotate(-now * 4);
    ctx.beginPath();
    ctx.arc(0, 1, headR + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawCornerBadge('🌈', -19, -19, '#7c3aed');
  }

  // 4. Critter Identity Mini-Badge (Bottom-Right)
  drawCornerBadge(info.badge, 19, 19, 'rgba(0,0,0,0.45)');

  // 5. Ice Frost / Honey Corner Tag if Cell has Obstacle
  if (cell.ice > 0) {
    drawCornerBadge(cell.ice >= 2 ? '❄️2' : '🧊', 18, -19, '#0284c7');
  } else if (cell.honey > 0) {
    drawCornerBadge('🍯', 18, -19, '#d97706');
  }

  // 6. Hint or Selection Golden Outline
  if (isSelected || isHinted) {
    ctx.strokeStyle = isSelected ? '#ffffff' : '#fde047';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(-rSize - 2, -rSize - 2, (rSize + 2) * 2, (rSize + 2) * 2, 18);
    ctx.stroke();
  }

  ctx.restore();
}

function drawCornerBadge(txt, x, y, bg) {
  ctx.save();
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(txt, x, y + 0.5);
  ctx.restore();
}

// ============================================================================
// VISUAL EFFECTS HELPERS
// ============================================================================
function addLaser(x1, y1, x2, y2, color = '#ffd166') {
  S.lasers.push({ x1, y1, x2, y2, color, life: 0.28, maxLife: 0.28 });
}

function addShockwave(x, y, maxR = 140, color = '#ffd166') {
  S.shockwaves.push({ x, y, maxR, color, life: 0.32, maxLife: 0.32 });
}

function spawnParticles(c, r, color, count = 7) {
  const cx = (c + 0.5) * TILE;
  const cy = (r + 0.5) * TILE;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 50 + Math.random() * 110;
    S.particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      size: 3 + Math.random() * 3,
      color,
      life: 0.32 + Math.random() * 0.2
    });
  }
}

function addPopup(c, r, text, color = '#ffd166') {
  S.popups.push({
    x: (c + 0.5) * TILE,
    y: (r + 0.35) * TILE,
    text,
    color,
    life: 0.9
  });
}

let bannerTimer = null;
export function showComboBanner(msg, durSec = 1.6) {
  const el = document.getElementById('comboBanner');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    el.classList.add('hidden');
  }, durSec * 1000);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================================================
// HUD, VINE TREE LEVEL SELECTOR & SAVE/LOAD SYSTEM
// ============================================================================
export function updateHUD() {
  const cfg = S.levelCfg;
  const setTxt = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
  };
  const setSrc = (id, s) => {
    const el = document.getElementById(id);
    if (el) el.src = s;
  };

  setSrc('topHostAvatar', cfg.hostIcon);
  setTxt('topLevelTitle', cfg.title);
  setTxt('topLevelSub', cfg.subtitle);

  setTxt('movesCount', S.moves);
  setTxt('scoreCount', S.score);
  setTxt('highScoreCount', S.highScore);
  setTxt('comboCount', `x${S.combo}`);

  setSrc('dockHostImg', cfg.hostIcon);
  setTxt('dockHostName', cfg.hostName);
  setTxt('dockLevelTag', `藤蔓第 ${cfg.level} / 8 关 · ♾️ 轻松不败模式`);

  // 3-Star Progress Bar
  const [s1, s2, s3] = cfg.starScores || [1200, 2500, 4000];
  const stars = S.score >= s3 ? '⭐⭐⭐' : S.score >= s2 ? '⭐⭐☆' : S.score >= s1 ? '⭐☆☆' : '☆☆☆';
  setTxt('starDisplay', stars);
  const fill = document.getElementById('starBarFill');
  if (fill) {
    const pct = Math.min(100, (S.score / Math.max(1, s3)) * 100);
    fill.style.width = `${pct.toFixed(1)}%`;
  }

  // Render Level Mission Targets
  const goalList = document.getElementById('goalList');
  if (goalList) {
    goalList.innerHTML = '';
    for (const g of S.goalsProgress) {
      const done = g.current >= g.target;
      const item = document.createElement('div');
      item.className = `goal-item${done ? ' done' : ''}`;
      const iconHtml = g.icon
        ? `<img src="${g.icon}" alt="${g.label}" />`
        : `<span style="font-size:18px;">${g.emoji || '🎯'}</span>`;
      item.innerHTML = `
        <div class="goal-left">
          ${iconHtml}
          <span>${g.label}</span>
        </div>
        <span class="goal-count">${done ? '✅' : `${g.current}/${g.target}`}</span>
      `;
      goalList.appendChild(item);
    }
  }
}

function renderLevelStrip() {
  const strip = document.getElementById('levelStrip');
  if (strip) {
    strip.innerHTML = '';
    LEVELS.forEach((l, idx) => {
      const btn = document.createElement('button');
      const isCur = idx === S.levelIndex;
      const isDone = S.clearedLevels.has(idx);
      btn.className = `lvl-tab${isCur ? ' active' : ''}${isDone ? ' cleared' : ''}`;
      btn.innerHTML = `
        <img src="${l.hostIcon}" alt="${l.hostName}" />
        <span>Lv.${l.level} ${l.hostName.split('·')[1]?.trim() || l.hostName}</span>
        <span>${isDone ? '⭐' : '🌿'}</span>
      `;
      btn.addEventListener('click', () => {
        sound.click();
        loadLevel(idx);
      });
      strip.appendChild(btn);
    });
  }

  const grid = document.getElementById('vineLevelGrid');
  if (grid) {
    grid.innerHTML = '';
    LEVELS.forEach((l, idx) => {
      const card = document.createElement('button');
      card.className = `chapter-pick-card${idx === S.levelIndex ? ' active' : ''}`;
      const done = S.clearedLevels.has(idx) ? ' ✅' : '';
      card.innerHTML = `
        <img src="${l.hostIcon}" alt="${l.hostName}" />
        <div>
          <b>${l.title}${done}</b>
          <span>${l.hostName} · 步数 ${l.moves}</span>
        </div>
      `;
      card.addEventListener('click', () => {
        sound.click();
        loadLevel(idx);
        saveGameState(true);
      });
      grid.appendChild(card);
    });
  }
}

function updateBoosterUI() {
  document.getElementById('toolHammerBtn')?.classList.toggle('active', S.activeTool === 'hammer');
  document.getElementById('toolWandBtn')?.classList.toggle('active', S.activeTool === 'wand');
  const hint = document.getElementById('activeToolHint');
  if (hint) {
    if (S.activeTool === 'hammer') {
      hint.textContent = '🔨 请点击棋盘上任意一个萌宠或冰块，直接敲碎它！';
    } else if (S.activeTool === 'wand') {
      hint.textContent = '🌈 请点击棋盘上任意一只萌宠，全屏消除同色萌宠！';
    } else {
      hint.textContent = '👆 拖拽或点击相邻两只萌宠交换 · 双击特效头像可直接引爆！';
    }
  }
}

export function saveGameState(silent = false) {
  try {
    const payload = {
      version: 1,
      timestamp: Date.now(),
      levelIndex: S.levelIndex,
      score: S.score,
      highScore: S.highScore,
      clearedLevels: Array.from(S.clearedLevels)
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    refreshMenuSaveStatus();
    if (!silent) {
      sound.magicBird();
      showComboBanner('💾 藤蔓关卡进度已保存！ · Progress Saved!', 1.6);
    }
    return true;
  } catch {
    return false;
  }
}

export function loadSavedGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      showComboBanner('📂 暂无存档记录 · No Save Found', 1.5);
      return false;
    }
    const data = JSON.parse(raw);
    S.highScore = Math.max(S.highScore, Number(data.highScore) || 0);
    S.clearedLevels = new Set(Array.isArray(data.clearedLevels) ? data.clearedLevels : []);
    loadLevel(data.levelIndex ?? 0);
    showComboBanner(`📂 已读取藤蔓第 ${S.levelIndex + 1} 关存档！`, 1.8);
    return true;
  } catch {
    return false;
  }
}

function refreshMenuSaveStatus() {
  const box = document.getElementById('menuSaveStatus');
  if (!box) return;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      box.textContent = '📂 暂无存档（点击任一藤蔓关卡即可开始萌宠消消乐！）';
      return;
    }
    const data = JSON.parse(raw);
    const idx = Math.max(0, Math.min(LEVELS.length - 1, Number(data.levelIndex) || 0));
    box.textContent = `📂 存档记录: ${LEVELS[idx].title} · 🏆 最高分 ${data.highScore || 0} · ✅ 已通关 ${(data.clearedLevels || []).length}/8`;
  } catch {
    box.textContent = '📂 存档槽位就绪';
  }
}

// ============================================================================
// POINTER / TOUCH DRAG-SWAP, CLICK-SWAP & DOUBLE-CLICK SPECIAL DETONATION
// ============================================================================
let dragStartCell = null;
let dragStartPx = null;

function eventToCell(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  const c = Math.floor(x / TILE);
  const r = Math.floor(y / TILE);
  if (r < 0 || r >= GRID || c < 0 || c >= GRID) return null;
  return { r, c, x, y };
}

canvas.addEventListener('pointerdown', e => {
  if (S.phase !== 'ready') return;
  sound.startMusic();
  const hit = eventToCell(e);
  if (!hit) return;

  // 1. If a Booster Tool (Hammer or Wand) is armed, apply it immediately!
  if (S.activeTool) {
    applyBoosterOnCell(hit.r, hit.c);
    return;
  }

  // 2. Check for Double-Click on a Special Tile to detonate it directly!
  const now = performance.now();
  if (
    S.lastClickCell &&
    S.lastClickCell.r === hit.r &&
    S.lastClickCell.c === hit.c &&
    now - S.lastClickTime < 360 &&
    S.board[hit.r][hit.c]?.special
  ) {
    S.lastClickCell = null;
    detonateSpecialCellDirectly(hit.r, hit.c);
    return;
  }
  S.lastClickCell = { r: hit.r, c: hit.c };
  S.lastClickTime = now;

  // 3. If an adjacent cell is already selected, swap with it!
  if (S.selected) {
    const dist = Math.abs(S.selected.r - hit.r) + Math.abs(S.selected.c - hit.c);
    if (dist === 1) {
      const sr = S.selected.r;
      const sc = S.selected.c;
      S.selected = null;
      dragStartCell = null;
      attemptSwap(sr, sc, hit.r, hit.c);
      return;
    }
  }

  sound.click();
  S.selected = { r: hit.r, c: hit.c };
  dragStartCell = { r: hit.r, c: hit.c };
  dragStartPx = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('pointermove', e => {
  if (!dragStartCell || !dragStartPx || S.phase !== 'ready') return;
  const dx = e.clientX - dragStartPx.x;
  const dy = e.clientY - dragStartPx.y;
  if (Math.hypot(dx, dy) >= 22) {
    const { r, c } = dragStartCell;
    dragStartCell = null;
    dragStartPx = null;
    if (Math.abs(dx) > Math.abs(dy)) {
      const nc = c + (dx > 0 ? 1 : -1);
      if (nc >= 0 && nc < GRID) attemptSwap(r, c, r, nc);
    } else {
      const nr = r + (dy > 0 ? 1 : -1);
      if (nr >= 0 && nr < GRID) attemptSwap(r, c, nr, c);
    }
  }
});

window.addEventListener('pointerup', () => {
  dragStartCell = null;
  dragStartPx = null;
});

// UI Button Listeners
document.getElementById('hintBtn')?.addEventListener('click', () => {
  sound.click();
  S.hintPair = findBestValidMove();
  if (S.hintPair) {
    showComboBanner('💡 已高亮推荐消除组合！ · Best Move Highlighted!', 1.5);
  }
});

document.getElementById('toolHammerBtn')?.addEventListener('click', () => {
  sound.click();
  S.activeTool = S.activeTool === 'hammer' ? null : 'hammer';
  updateBoosterUI();
});

document.getElementById('toolWandBtn')?.addEventListener('click', () => {
  sound.click();
  S.activeTool = S.activeTool === 'wand' ? null : 'wand';
  updateBoosterUI();
});

document.getElementById('toolBombPackBtn')?.addEventListener('click', () => {
  useBombPackBooster();
});

document.getElementById('toolShuffleBtn')?.addEventListener('click', () => {
  useShufflePlusBooster();
});

document.getElementById('saveGameBtn')?.addEventListener('click', () => saveGameState(false));

document.getElementById('openMapBtn')?.addEventListener('click', () => {
  sound.click();
  refreshMenuSaveStatus();
  renderLevelStrip();
  document.getElementById('vineMapModal')?.classList.remove('hidden');
});

document.getElementById('menuNewGameBtn')?.addEventListener('click', () => {
  sound.click();
  loadLevel(0);
  saveGameState(true);
});

document.getElementById('menuLoadGameBtn')?.addEventListener('click', () => {
  sound.click();
  loadSavedGame();
});

document.getElementById('menuResumeBtn')?.addEventListener('click', () => {
  sound.click();
  document.getElementById('vineMapModal')?.classList.add('hidden');
});

document.getElementById('musicBtn')?.addEventListener('click', e => {
  const on = sound.toggleMusic();
  e.currentTarget.style.opacity = on ? '1' : '0.5';
});

document.getElementById('sfxBtn')?.addEventListener('click', e => {
  const on = sound.toggleSfx();
  e.currentTarget.style.opacity = on ? '1' : '0.5';
});

document.getElementById('resultNextBtn')?.addEventListener('click', () => {
  sound.click();
  const nextIdx = (S.levelIndex + 1) % LEVELS.length;
  loadLevel(nextIdx);
});

document.getElementById('resultReplayBtn')?.addEventListener('click', () => {
  sound.click();
  loadLevel(S.levelIndex);
});

document.getElementById('resultMapBtn')?.addEventListener('click', () => {
  sound.click();
  document.getElementById('resultModal')?.classList.add('hidden');
  refreshMenuSaveStatus();
  document.getElementById('vineMapModal')?.classList.remove('hidden');
});

// ============================================================================
// INITIALIZE LEVEL 1 & START 60FPS RENDER LOOP
// ============================================================================
try {
  const savedRaw = localStorage.getItem(SAVE_KEY);
  if (savedRaw) {
    const parsed = JSON.parse(savedRaw);
    S.highScore = Math.max(0, Number(parsed.highScore) || 0);
    S.clearedLevels = new Set(Array.isArray(parsed.clearedLevels) ? parsed.clearedLevels : []);
  }
} catch {
  // Ignore storage errors
}

loadLevel(0);

let lastTime = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  renderBoard(dt);
}
requestAnimationFrame(loop);

// Expose automated verification hooks for headless Chrome testing
window.__MATCH3__ = {
  S,
  LEVELS,
  CRITTER_TYPES,
  loadLevel,
  findBestValidMove,
  attemptSwap,
  detonateSpecialCellDirectly,
  applyBoosterOnCell,
  useBombPackBooster,
  useShufflePlusBooster,
  triggerLevelVictory
};
