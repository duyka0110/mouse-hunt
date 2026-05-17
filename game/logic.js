(function (global) {
"use strict";

const data =
  globalThis.MouseHuntData ??
  (typeof require !== "undefined" ? require("./data") : undefined);
if (!data) throw new Error("Mouse Hunt: load game/data.js before game/logic.js");

const {
  SQUARE_SIZE,
  FLAGS_PER_PLAYER,
  VALID_GRID_TYPES,
  hexCells,
  hexCube,
  hexNeighbors,
  squareCells,
} = data;

const MAX_CHEESE = FLAGS_PER_PLAYER;
const MAX_FLAGS = FLAGS_PER_PLAYER;

const idxToRC = (i) => [Math.floor(i / SQUARE_SIZE), i % SQUARE_SIZE];
const rcToIdx = (r, c) => r * SQUARE_SIZE + c;

const rc = (i) => {
  const [r, c] = idxToRC(i);
  return `${i}(${r},${c})`;
};

function cellLabel(gridType, i) {
  if (gridType === "hex") {
    const { q, r } = hexCells[i];
    return `${i}(${q},${r})`;
  }
  return rc(i);
}

function mouseStr(s) {
  return `idx=${s.mouseIndex} ${cellLabel(s.gridType || "square", s.mouseIndex)}`;
}

function logBoard(s) {
  const gt = s.gridType || "square";
  const fl = Object.entries(s.flags || {})
    .filter(([, p]) => p)
    .map(([i]) => cellLabel(gt, Number(i)))
    .sort();
  const ch = Object.keys(s.cheeses || {}).map(Number);
  ch.sort((a, b) => a - b);
  const chL = ch.map((i) => cellLabel(gt, i));
  return `flags=[${fl}] cheese=[${chL}]`;
}

const manhattan = (a, b) => {
  const [ar, ac] = idxToRC(a);
  const [br, bc] = idxToRC(b);
  return Math.abs(ar - br) + Math.abs(ac - bc);
};

function hasFlag(s, i) {
  return Object.prototype.hasOwnProperty.call(s.flags || {}, String(i));
}

function hasCheese(s, i) {
  return Object.prototype.hasOwnProperty.call(s.cheeses || {}, String(i));
}

function blocked(s, i) {
  return hasFlag(s, i) || hasCheese(s, i);
}

function occupied(s, i) {
  return blocked(s, i);
}

function squareNeighbors(i) {
  const [r, c] = idxToRC(i);
  const o = [];
  if (r > 0) o.push(rcToIdx(r - 1, c));
  if (r < SQUARE_SIZE - 1) o.push(rcToIdx(r + 1, c));
  if (c > 0) o.push(rcToIdx(r, c - 1));
  if (c < SQUARE_SIZE - 1) o.push(rcToIdx(r, c + 1));
  return o;
}

function countFlags(s) {
  let n = 0;
  for (const v of Object.values(s.flags || {})) if (v) n++;
  return n;
}

function cheesePlaced(s) {
  return typeof s.cheesePlaced === "number" ? s.cheesePlaced : Object.keys(s.cheeses || {}).length;
}

function cheeseLeft(s) {
  return MAX_CHEESE - cheesePlaced(s);
}

function flagsLeft(s) {
  return MAX_FLAGS - countFlags(s);
}

function allPiecesPlaced(s) {
  return cheesePlaced(s) >= MAX_CHEESE && countFlags(s) >= MAX_FLAGS;
}

function gridNeighbors(gt, i) {
  return gt === "hex" ? hexNeighbors[i] || [] : squareNeighbors(i);
}

function hexDist(a, b) {
  const dx = hexCube.x[a] - hexCube.x[b];
  const dy = hexCube.y[a] - hexCube.y[b];
  const dz = hexCube.z[a] - hexCube.z[b];
  return (Math.abs(dx) + Math.abs(dy) + Math.abs(dz)) / 2;
}

function gridDist(gt, a, b) {
  return gt === "hex" ? hexDist(a, b) : manhattan(a, b);
}

function makeState(gridType = "square") {
  const gt = VALID_GRID_TYPES.has(gridType) ? gridType : "square";
  const gridCells = gt === "hex" ? hexCells : squareCells;
  const nCells = gridCells.length;
  const mouseIndex = Math.floor(Math.random() * nCells);
  return {
    phase: "playing",
    gridType: gt,
    nCells,
    gridCells,
    mouseIndex,
    mousePath: [mouseIndex],
    cheesePlaced: 0,
    flags: {},
    cheeses: {},
    cheeseEating: {},
  };
}

function moveMouse(s) {
  const gt = s.gridType || "square";
  const opts = gridNeighbors(gt, s.mouseIndex).filter((i) => !hasFlag(s, i));
  if (!opts.length) return;
  const eat = s.cheeseEating || {};
  const cheeses = Object.keys(s.cheeses || {})
    .filter((k) => !eat[k])
    .map(Number);
  if (!cheeses.length) {
    s.mouseIndex = opts[Math.floor(Math.random() * opts.length)];
    return;
  }
  let best = Infinity,
    t = [];
  for (const c of cheeses) {
    const d = gridDist(gt, s.mouseIndex, c);
    if (d < best) {
      best = d;
      t = [c];
    } else if (d === best) t.push(c);
  }
  const target = t[Math.floor(Math.random() * t.length)];
  best = Infinity;
  let picks = [];
  for (const o of opts) {
    const d = gridDist(gt, o, target);
    if (d < best) {
      best = d;
      picks = [o];
    } else if (d === best) picks.push(o);
  }
  s.mouseIndex = picks[Math.floor(Math.random() * picks.length)];
}

function eatCheese(s) {
  const ch = { ...(s.cheeses || {}) };
  const eat = { ...(s.cheeseEating || {}) };
  const mi = s.mouseIndex;
  for (const k of Object.keys(ch)) {
    if (eat[k] && mi !== Number(k)) {
      delete ch[k];
      delete eat[k];
    }
  }
  if (Object.prototype.hasOwnProperty.call(ch, String(mi))) eat[String(mi)] = true;
  s.cheeses = ch;
  s.cheeseEating = eat;
}

function canPlace(state, action, index) {
  if (!state || state.phase !== "playing") return false;
  if (action !== "cheese" && action !== "flag") return false;
  if (!Number.isInteger(index) || index < 0 || index >= state.nCells) return false;
  if (blocked(state, index)) return false;
  if (action === "cheese") return cheeseLeft(state) > 0;
  return flagsLeft(state) > 0;
}

function applyPlace(state, action, index) {
  if (!canPlace(state, action, index)) return null;

  if (action === "cheese") {
    state.cheesePlaced = (state.cheesePlaced || 0) + 1;
    state.cheeses = { ...state.cheeses };
    state.cheeses[index] = true;
  } else {
    state.flags = { ...state.flags };
    state.flags[index] = true;
    if (index === state.mouseIndex) {
      state.phase = "won";
      return { event: "win", action, index };
    }
  }

  const prevMouse = state.mouseIndex;
  moveMouse(state);
  eatCheese(state);
  if (state.mouseIndex !== prevMouse) {
    state.mousePath = [...(state.mousePath || [prevMouse]), state.mouseIndex];
  }

  if (allPiecesPlaced(state)) {
    state.phase = "lost";
    return { event: "lost", action, index };
  }

  return { event: "place", action, index };
}

const exports_ = {
  FLAGS_PER_PLAYER,
  MAX_CHEESE,
  MAX_FLAGS,
  makeState,
  moveMouse,
  eatCheese,
  applyPlace,
  canPlace,
  blocked,
  occupied,
  cheeseLeft,
  flagsLeft,
  cheesePlaced,
  countFlags,
  mouseStr,
  logBoard,
  cellLabel,
};

global.MouseHuntLogic = exports_;
if (typeof module !== "undefined" && module.exports) {
  module.exports = exports_;
}
})(typeof globalThis !== "undefined" ? globalThis : global);
