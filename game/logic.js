"use strict";

const data =
  typeof require !== "undefined"
    ? require("./data")
    : globalThis.MouseHuntData;

const {
  SQUARE_SIZE,
  FLAGS_PER_PLAYER,
  VALID_GRID_TYPES,
  hexCells,
  hexCube,
  hexNeighbors,
  squareCells,
} = data;

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
    .filter(([, p]) => p === 2)
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

function nCheese(s) {
  return Object.keys(s.cheeses || {}).length;
}

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

function countP2(s) {
  let n = 0;
  for (const v of Object.values(s.flags || {})) if (v === 2) n++;
  return n;
}

function countFlags2(s) {
  return countP2(s);
}

function cheesePlaced(s) {
  return typeof s.cheesePlaced === "number" ? s.cheesePlaced : nCheese(s);
}

function piecesLeft(s, player) {
  if (player === 1) return FLAGS_PER_PLAYER - cheesePlaced(s);
  return FLAGS_PER_PLAYER - countP2(s);
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
  return {
    phase: "flagging",
    currentPlayer: 1,
    gridType: gt,
    nCells,
    gridCells,
    mouseIndex: Math.floor(Math.random() * nCells),
    cheesePlaced: 0,
    flags: {},
    cheeses: {},
    cheeseEating: {},
    guessPlayerTurn: 1,
    guessP1: null,
    guessP2: null,
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

function canPlace(state, player, index) {
  if (!state || state.phase !== "flagging" || player !== state.currentPlayer) return false;
  if (!Number.isInteger(index) || index < 0 || index >= state.nCells) return false;
  if (blocked(state, index)) return false;
  if (player === 1) return (state.cheesePlaced || 0) < FLAGS_PER_PLAYER;
  return countP2(state) < FLAGS_PER_PLAYER;
}

function applyPlace(state, player, index) {
  if (!canPlace(state, player, index)) return null;

  if (player === 1) {
    state.cheesePlaced = (state.cheesePlaced || 0) + 1;
    state.cheeses = { ...state.cheeses };
    state.cheeses[index] = true;
  } else {
    state.flags[index] = 2;
    if (index === state.mouseIndex) {
      state.phase = "won";
      return { event: "win", index, player };
    }
  }

  moveMouse(state);
  eatCheese(state);

  const done1 = (state.cheesePlaced || 0) >= FLAGS_PER_PLAYER;
  const done2 = countP2(state) >= FLAGS_PER_PLAYER;
  if ((state.cheesePlaced || 0) + countP2(state) >= FLAGS_PER_PLAYER * 2 && done1 && done2) {
    state.phase = "guessing";
    state.guessPlayerTurn = 1;
    state.guessP1 = null;
    state.guessP2 = null;
  } else state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;

  return { event: "place", index, player };
}

function canGuess(state, player, index) {
  if (!state || state.phase !== "guessing" || player !== state.guessPlayerTurn) return false;
  if (!Number.isInteger(index) || index < 0 || index >= state.nCells) return false;
  if (player === 1) return state.guessP1 === null;
  return state.guessP2 === null;
}

function applyGuess(state, player, index) {
  if (!canGuess(state, player, index)) return null;

  if (player === 1) {
    state.guessP1 = index;
    state.guessPlayerTurn = 2;
    return { event: "guess1", index, player };
  }
  if (state.guessP2 !== null) return null;
  state.guessP2 = index;
  state.phase =
    state.guessP1 === state.guessP2 && state.guessP1 === state.mouseIndex ? "won" : "lost";
  return { event: "guess2", index, player, phase: state.phase };
}

const exports_ = {
  FLAGS_PER_PLAYER,
  makeState,
  moveMouse,
  eatCheese,
  applyPlace,
  applyGuess,
  canPlace,
  canGuess,
  blocked,
  occupied,
  countP2,
  countFlags2,
  nCheese,
  cheesePlaced,
  piecesLeft,
  mouseStr,
  logBoard,
  cellLabel,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = exports_;
} else if (typeof globalThis !== "undefined") {
  globalThis.MouseHuntLogic = exports_;
}
