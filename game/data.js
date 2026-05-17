"use strict";

const SQUARE_SIZE = 5;
const FLAGS_PER_PLAYER = 3;
const SQUARE_N = SQUARE_SIZE * SQUARE_SIZE;
const HEX_R = 2;
const VALID_GRID_TYPES = new Set(["square", "hex"]);

const HEX_DIRS = [
  [1, -1, 0],
  [1, 0, -1],
  [0, 1, -1],
  [-1, 1, 0],
  [-1, 0, 1],
  [0, -1, 1],
];

const hexCells = [];
const hexIdMap = new Map();
const hexCube = { x: [], y: [], z: [] };

for (let x = -HEX_R; x <= HEX_R; x++) {
  for (let z = -HEX_R; z <= HEX_R; z++) {
    const y = -x - z;
    if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) <= HEX_R) {
      const id = hexCells.length;
      hexCells.push({ q: x, r: z });
      hexIdMap.set(`${x},${y},${z}`, id);
      hexCube.x[id] = x;
      hexCube.y[id] = y;
      hexCube.z[id] = z;
    }
  }
}

const hexNeighbors = [];
for (let i = 0; i < hexCells.length; i++) {
  const x = hexCube.x[i];
  const y = hexCube.y[i];
  const z = hexCube.z[i];
  const ns = [];
  for (const [dx, dy, dz] of HEX_DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    const nz = z + dz;
    const nid = hexIdMap.get(`${nx},${ny},${nz}`);
    if (nid != null) ns.push(nid);
  }
  hexNeighbors[i] = ns;
}

const squareCells = Array.from({ length: SQUARE_N }, (_, i) => ({
  r: Math.floor(i / SQUARE_SIZE),
  c: i % SQUARE_SIZE,
}));

const exports_ = {
  SQUARE_SIZE,
  FLAGS_PER_PLAYER,
  SQUARE_N,
  HEX_R,
  VALID_GRID_TYPES,
  hexCells,
  hexCube,
  hexNeighbors,
  squareCells,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = exports_;
} else if (typeof globalThis !== "undefined") {
  globalThis.MouseHuntData = exports_;
}
