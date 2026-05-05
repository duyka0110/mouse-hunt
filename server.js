const path = require("path");
const http = require("http");
const express = require("express");
const os = require("os");
const fs = require("fs");
const wsPkg = require("ws");
const { WebSocketServer } = wsPkg;

const SQUARE_SIZE = 5;
const FLAGS_PER_PLAYER = 3;
const SQUARE_N = SQUARE_SIZE * SQUARE_SIZE;
const HEX_R = 2;
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const LOG_PATH = path.join(__dirname, "mouse_log.txt");

try {
  fs.openSync(LOG_PATH, "a");
} catch (e) {
  console.error("mouse_log.txt:", e.message);
}

const app = express();
app.use(express.static(path.join(__dirname)));
const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
const rooms = new Map();
const wsMeta = new Map();

const idxToRC = (i) => [Math.floor(i / SQUARE_SIZE), i % SQUARE_SIZE];
const rc = (i) => {
  const [r, c] = idxToRC(i);
  return `${i}(${r},${c})`;
};
const hexCells = [];
const hexIdMap = new Map();
const hexCube = { x: [], y: [], z: [] };
const HEX_DIRS = [
  [1, -1, 0],
  [1, 0, -1],
  [0, 1, -1],
  [-1, 1, 0],
  [-1, 0, 1],
  [0, -1, 1],
];

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

const cellLabel = (gridType, i) => {
  if (gridType === "hex") {
    const { q, r } = hexCells[i];
    return `${i}(${q},${r})`;
  }
  return rc(i);
};

const mouseStr = (s) => `idx=${s.mouseIndex} ${cellLabel(s.gridType || "square", s.mouseIndex)}`;

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
const nCheese = (s) => Object.keys(s.cheeses || {}).length;
const hasFlag = (s, i) => Object.prototype.hasOwnProperty.call(s.flags || {}, String(i));
const hasCheese = (s, i) => Object.prototype.hasOwnProperty.call(s.cheeses || {}, String(i));
const blocked = (s, i) => hasFlag(s, i) || hasCheese(s, i);
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

function passcode() {
  let s = "";
  for (let i = 0; i < 4; i++) s += String(Math.floor(Math.random() * 10));
  return s;
}

function countP2(s) {
  let n = 0;
  for (const v of Object.values(s.flags || {})) if (v === 2) n++;
  return n;
}

const VALID_GRID_TYPES = new Set(["square", "hex"]);

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

function playersJoined(room) {
  return room.sockets.size;
}

function send(room) {
  const payload = {
    type: "state",
    state: room.state,
    roomCode: room.code,
    playersJoined: playersJoined(room),
  };
  const p = JSON.stringify(payload);
  for (const ws of room.sockets.values()) if (ws.readyState === wsPkg.OPEN) ws.send(p);
}

function clearLog() {
  try {
    fs.writeFileSync(LOG_PATH, "", "utf8");
  } catch (e) {
    console.error("clear log:", e.message);
  }
}
const log = (line) => fs.appendFileSync(LOG_PATH, line + "\n", "utf8");

function makeRoom(gridType = "square") {
  let code = passcode();
  for (let t = 0; rooms.has(code) && t < 20; t++) code = passcode();
  const room = { code, sockets: new Map(), state: null, roundId: 0 };
  room.roundId++;
  clearLog();
  room.state = makeState(gridType);
  log(`[${room.roundId}][start] ${new Date().toISOString()} ${mouseStr(room.state)} ${logBoard(room.state)}`);
  rooms.set(code, room);
  return room;
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

function place(room, pl, i) {
  if (playersJoined(room) < 2) return;
  const s = room.state;
  if (!s || s.phase !== "flagging" || pl !== s.currentPlayer || !Number.isInteger(i) || i < 0 || i >= s.nCells) return;
  if (blocked(s, i)) return;

  if (pl === 1) {
    if ((s.cheesePlaced || 0) >= FLAGS_PER_PLAYER) return;
    s.cheesePlaced = (s.cheesePlaced || 0) + 1;
    s.cheeses = { ...s.cheeses };
    s.cheeses[i] = true;
  } else {
    if (countP2(s) >= FLAGS_PER_PLAYER) return;
    s.flags[i] = 2;
    if (i === s.mouseIndex) {
      s.phase = "won";
      log(`[${room.roundId}] p2@${i} WIN ${mouseStr(s)} ${logBoard(s)}`);
      send(room);
      return;
    }
  }

  moveMouse(s);
  eatCheese(s);

  const done1 = (s.cheesePlaced || 0) >= FLAGS_PER_PLAYER;
  const done2 = countP2(s) >= FLAGS_PER_PLAYER;
  if ((s.cheesePlaced || 0) + countP2(s) >= FLAGS_PER_PLAYER * 2 && done1 && done2) {
    s.phase = "guessing";
    s.guessPlayerTurn = 1;
    s.guessP1 = null;
    s.guessP2 = null;
  } else s.currentPlayer = s.currentPlayer === 1 ? 2 : 1;

  log(`[${room.roundId}] p${pl}@${i} ${mouseStr(s)} ${logBoard(s)}`);
  send(room);
}

function guess(room, pl, i) {
  if (playersJoined(room) < 2) return;
  const s = room.state;
  if (!s || s.phase !== "guessing" || pl !== s.guessPlayerTurn || !Number.isInteger(i) || i < 0 || i >= s.nCells) return;

  if (pl === 1) {
    if (s.guessP1 !== null) return;
    s.guessP1 = i;
    s.guessPlayerTurn = 2;
    log(`[${room.roundId}] guess1@${i} ${mouseStr(s)} ${logBoard(s)}`);
    send(room);
    return;
  }
  if (s.guessP2 !== null) return;
  s.guessP2 = i;
  s.phase = s.guessP1 === s.guessP2 && s.guessP1 === s.mouseIndex ? "won" : "lost";
  log(`[${room.roundId}] guess2@${i} ${s.phase.toUpperCase()} ${mouseStr(s)} ${logBoard(s)}`);
  send(room);
}

function restart(room) {
  room.roundId++;
  clearLog();
  room.state = makeState(room.state?.gridType || "square");
  log(`[${room.roundId}][start] ${new Date().toISOString()} ${mouseStr(room.state)} ${logBoard(room.state)}`);
  send(room);
}

wss.on("connection", (ws) => {
  wsMeta.set(ws, { roomCode: null, player: null });
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return ws.send(JSON.stringify({ type: "error", message: "Bad JSON." }));
    }
    const a = msg && msg.type;
    if (!["create", "join", "flag", "guess", "restart"].includes(a))
      return ws.send(JSON.stringify({ type: "error", message: "Unknown type." }));

    if (a === "create") {
      const gridType = VALID_GRID_TYPES.has(msg.gridType) ? msg.gridType : "square";
      const room = makeRoom(gridType);
      room.sockets.set(1, ws);
      wsMeta.set(ws, { roomCode: room.code, player: 1 });
      return ws.send(
        JSON.stringify({
          type: "joined",
          player: 1,
          roomCode: room.code,
          state: room.state,
          playersJoined: playersJoined(room),
        })
      );
    }
    if (a === "join") {
      const code = String(msg.passcode || "").trim();
      const room = rooms.get(code) || null;
      if (!room) return ws.send(JSON.stringify({ type: "error", message: "Room not found." }));
      if (room.sockets.has(2)) return ws.send(JSON.stringify({ type: "error", message: "Room full." }));
      room.sockets.set(2, ws);
      wsMeta.set(ws, { roomCode: room.code, player: 2 });
      ws.send(
        JSON.stringify({
          type: "joined",
          player: 2,
          roomCode: room.code,
          state: room.state,
          playersJoined: playersJoined(room),
        })
      );
      return send(room);
    }

    const m = wsMeta.get(ws);
    if (!m || !m.roomCode || !m.player) return;
    const room = rooms.get(m.roomCode);
    if (!room) return;
    const p = m.player;
    if (a === "flag") return place(room, p, Number(msg.index));
    if (a === "guess") return guess(room, p, Number(msg.index));
    if (a === "restart") return restart(room);
  });
  ws.on("close", () => {
    const m = wsMeta.get(ws);
    wsMeta.delete(ws);
    if (!m || !m.roomCode || !m.player) return;
    const room = rooms.get(m.roomCode);
    if (room) {
      room.sockets.delete(m.player);
      if (playersJoined(room) > 0) send(room);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
  const addrs = new Set();
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) if (n.family === "IPv4" && !n.internal) addrs.add(n.address);
  }
  for (const addr of addrs) console.log(`  http://${addr}:${PORT}`);
});
