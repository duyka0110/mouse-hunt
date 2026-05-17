(function (global) {
  "use strict";

  const data = global.MouseHuntData;
  if (!data) throw new Error("Mouse Hunt: load game/data.js before game/shared.js");

  const { SQUARE_SIZE, hexCells, hexCube, hexNeighbors, squareCells, edgeKey } = data;

  const idxToRC = (i) => [Math.floor(i / SQUARE_SIZE), i % SQUARE_SIZE];
  const rcToIdx = (r, c) => r * SQUARE_SIZE + c;

  function squareNeighbors(i) {
    const [r, c] = idxToRC(i);
    const o = [];
    if (r > 0) o.push(rcToIdx(r - 1, c));
    if (r < SQUARE_SIZE - 1) o.push(rcToIdx(r + 1, c));
    if (c > 0) o.push(rcToIdx(r, c - 1));
    if (c < SQUARE_SIZE - 1) o.push(rcToIdx(r, c + 1));
    return o;
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

  function manhattan(a, b) {
    const [ar, ac] = idxToRC(a);
    const [br, bc] = idxToRC(b);
    return Math.abs(ar - br) + Math.abs(ac - bc);
  }

  function gridDist(gt, a, b) {
    return gt === "hex" ? hexDist(a, b) : manhattan(a, b);
  }

  function hasWall(s, a, b) {
    const walls = s.walls || {};
    return !!walls[edgeKey(a, b)];
  }

  function reachableNeighbors(s, from) {
    const gt = s.gridType || "square";
    return gridNeighbors(gt, from).filter((to) => {
      if (hasWall(s, from, to)) return false;
      if (s.flags && s.flags[to]) return false;
      return true;
    });
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

  function moveMouseTowardCheese(s) {
    const gt = s.gridType || "square";
    const opts = reachableNeighbors(s, s.mouseIndex);
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

  global.MouseHuntShared = {
    edgeKey,
    gridNeighbors,
    gridDist,
    eatCheese,
    moveMouseTowardCheese,
    hasWall,
    reachableNeighbors,
    squareNeighbors,
  };
})(typeof globalThis !== "undefined" ? globalThis : global);
