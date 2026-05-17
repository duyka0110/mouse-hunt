const path = require("path");
const http = require("http");
const express = require("express");
const os = require("os");
const fs = require("fs");
const wsPkg = require("ws");
const { WebSocketServer } = wsPkg;
const { VALID_GRID_TYPES } = require("./game/data");
const {
  makeState,
  applyPlace,
  applyGuess,
  mouseStr,
  logBoard,
} = require("./game/logic");

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

function passcode() {
  let s = "";
  for (let i = 0; i < 4; i++) s += String(Math.floor(Math.random() * 10));
  return s;
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

function place(room, pl, i) {
  if (playersJoined(room) < 2) return;
  const s = room.state;
  if (!s) return;

  const result = applyPlace(s, pl, i);
  if (!result) return;

  if (result.event === "win") {
    log(`[${room.roundId}] p2@${i} WIN ${mouseStr(s)} ${logBoard(s)}`);
    return send(room);
  }

  log(`[${room.roundId}] p${pl}@${i} ${mouseStr(s)} ${logBoard(s)}`);
  send(room);
}

function guess(room, pl, i) {
  if (playersJoined(room) < 2) return;
  const s = room.state;
  if (!s) return;

  const result = applyGuess(s, pl, i);
  if (!result) return;

  if (result.event === "guess1") {
    log(`[${room.roundId}] guess1@${i} ${mouseStr(s)} ${logBoard(s)}`);
    return send(room);
  }

  log(`[${room.roundId}] guess2@${i} ${result.phase.toUpperCase()} ${mouseStr(s)} ${logBoard(s)}`);
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
