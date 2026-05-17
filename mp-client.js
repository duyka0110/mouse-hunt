const { occupied, piecesLeft } = globalThis.MouseHuntLogic;

let ws,
  myPlayer,
  roomCode,
  state,
  playersJoined = 0,
  connectGen = 0;
const $ = (id) => document.getElementById(id);

const WS_CONNECT_MS = 15000;

function teardownSocket(s) {
  if (!s) return;
  s.onopen = s.onclose = s.onmessage = s.onerror = null;
  try {
    s.close();
  } catch {
    /* ignore */
  }
}

const boardLive = () => state && playersJoined >= 2;

const left = (s, p) => piecesLeft(s, p);

function cells() {
  const g = $("grid");
  const gt = (state && state.gridType) || "square";
  const gridCells = state && Array.isArray(state.gridCells) ? state.gridCells : null;
  const n = gridCells ? gridCells.length : gt === "square" ? 25 : 0;

  g.innerHTML = "";
  g.className = `grid ${gt === "hex" ? "grid-hex" : "grid-square"}`;

  for (let i = 0; i < n; i++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cell";
    b.addEventListener("click", () => click(i));
    if (gt === "hex") {
      // Render the hex as an actual polygon, not a clipped rectangle.
      b.innerHTML = `
        <svg class="hex" viewBox="-3 -3 190.751 190.751" aria-hidden="true" focusable="false">
          <use class="hex-use" href="hexagon.svg#hex"></use>
        </svg>
        <span class="cell-content" aria-hidden="true"></span>
      `;
    } else {
      b.innerHTML = `<span class="cell-content" aria-hidden="true"></span>`;
    }
    g.appendChild(b);
  }

  if (gt === "hex" && gridCells && gridCells.length) {
    const btns = Array.from(g.querySelectorAll(".cell"));
    const W = btns[0].getBoundingClientRect().width || 1;
    const H = W * 0.8660254037844386; // sqrt(3) / 2

    const GAP = -2; // px: slightly overlap to reduce perceived gaps
    const xStep = W * 0.75 + GAP;
    const yStep = H + GAP;

    const centers = gridCells.map(({ q, r }) => ({
      x: xStep * q,
      y: yStep * (r + q / 2),
    }));

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const c of centers) {
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y);
      maxY = Math.max(maxY, c.y);
    }

    g.style.width = `${maxX - minX + W}px`;
    g.style.height = `${maxY - minY + H}px`;

    btns.forEach((btn, i) => {
      btn.style.left = `${centers[i].x - minX}px`;
      btn.style.top = `${centers[i].y - minY}px`;
      btn.style.width = `${W}px`;
      btn.style.height = `${H}px`;
    });
  } else {
    g.style.width = "";
    g.style.height = "";
  }
}

function render() {
  const els = document.querySelectorAll(".cell");
  if (!state) {
    els.forEach((el) => {
      el.className = "cell disabled";
      el.disabled = true;
      const content = el.querySelector(".cell-content");
      if (content) content.textContent = "";
    });
    $("statusRoom").textContent = "";
    return;
  }
  const F = state.flags || {},
    Ch = state.cheeses || {},
    eat = state.cheeseEating || {};

  const canPick = (i) => {
    if (!boardLive()) return false;
    if (state.phase === "flagging") {
      if (myPlayer !== state.currentPlayer || occupied(state, i)) return false;
      return left(state, myPlayer) > 0;
    }
    if (state.phase !== "guessing") return false;
    if (myPlayer !== state.guessPlayerTurn) return false;
    if (myPlayer === 1 && state.guessP1 !== null) return false;
    if (myPlayer === 2 && state.guessP2 !== null) return false;
    return true;
  };

  els.forEach((el, i) => {
    el.className = "cell";
    el.disabled = false;
    const content = el.querySelector(".cell-content");
    if (content) content.textContent = "";
    el.removeAttribute("title");

    if (F[i] === 2) {
      el.classList.add("flagged-p2");
      if (content) content.textContent = "⚑";
    }
    if (Ch[i]) {
      el.classList.add("cheese");
      if (content) content.textContent = "🧀";
      if (eat[i] && state.mouseIndex === i) el.classList.add("cheese-partial");
    }

    const ph = state.phase;
    if (ph === "guessing") {
      // Hide the other player's guess until both picks are locked in.
      if (myPlayer === 1 && state.guessP1 === i) el.classList.add("guess-p1");
      else if (myPlayer === 2 && state.guessP2 === i) el.classList.add("guess-p2");
    } else if ((ph === "won" || ph === "lost") && (state.guessP1 != null || state.guessP2 != null)) {
      if (state.guessP1 === i && state.guessP2 === i) el.classList.add("guess-both");
      else if (state.guessP1 === i) el.classList.add("guess-p1");
      else if (state.guessP2 === i) el.classList.add("guess-p2");
    }

    if (!boardLive() || !canPick(i) || ph === "won" || ph === "lost") {
      el.classList.add("disabled");
      el.disabled = true;
    }
  });

  $("p1Meta").textContent = `Cheese left: ${Math.max(0, piecesLeft(state, 1))}`;
  $("p2Meta").textContent = `Flags left: ${Math.max(0, piecesLeft(state, 2))}`;
  const live = boardLive();
  $("p1Card").classList.toggle(
    "active",
    live &&
      ((state.phase === "flagging" && state.currentPlayer === 1) ||
        (state.phase === "guessing" && state.guessPlayerTurn === 1 && state.guessP1 === null))
  );
  $("p2Card").classList.toggle(
    "active",
    live &&
      ((state.phase === "flagging" && state.currentPlayer === 2) ||
        (state.phase === "guessing" && state.guessPlayerTurn === 2 && state.guessP2 === null))
  );

  const main = $("statusMain"),
    hint = $("statusHint"),
    roomLine = $("statusRoom");
  hint.classList.remove("overlay-win", "overlay-lose");

  if (playersJoined < 2) {
    roomLine.textContent = `Players: ${playersJoined}/2 — waiting for Player 2.`;
    main.textContent = "Waiting for Player 2 to join.";
    hint.textContent =
      myPlayer === 1
        ? "Share the room code. The board stays locked until both players are connected."
        : "";
  } else {
    roomLine.textContent = "Players: 2/2 — Player 2 joined. Ready to play.";
  }

  if (!live) {
    return;
  }

  if (state.phase === "flagging") {
    const L = left(state, state.currentPlayer);
    const cheese = state.currentPlayer === 1;
    main.textContent = `Player ${state.currentPlayer} — place ${cheese ? "cheese" : "flag"} (${L} left).`;
    hint.textContent =
      "Mouse moves toward cheese; flags block. Cheese takes two turns to vanish after a bite (stays until the Mouse leaves).";
  } else if (state.phase === "guessing") {
    if (state.guessP1 === null) {
      main.textContent = "Player 1: pick Mouse square.";
      hint.textContent = "Win only if both pick the Mouse.";
    } else if (state.guessP2 === null) {
      main.textContent = "Player 2: pick square.";
      hint.textContent = "Win only if both pick the Mouse.";
    } else {
      main.textContent = "…";
      hint.textContent = "";
    }
  } else if (state.phase === "won") {
    main.textContent = "You win.";
    hint.textContent = "New game to play again.";
    hint.classList.add("overlay-win");
    const c = els[state.mouseIndex];
    if (c) {
      const content = c.querySelector(".cell-content");
      if (content) content.textContent = F[state.mouseIndex] === 2 ? "⚑ 🐭" : "🐭";
    }
  } else {
    main.textContent = "Mouse escaped.";
    hint.textContent = "";
    hint.classList.add("overlay-lose");
    const c = els[state.mouseIndex];
    if (c) {
      const content = c.querySelector(".cell-content");
      if (content) content.textContent = "🐭";
      c.title = "Mouse";
    }
  }
}

function setBusy(on) {
  $("createRoomBtn").disabled = !on;
  $("joinRoomBtn").disabled = !on;
  $("passcodeInput").disabled = !on;
  $("newGameBtn").disabled = !on;
}

function connect(mode, code, gridType) {
  connectGen++;
  const gen = connectGen;
  let joinedOk = false;

  teardownSocket(ws);
  ws = null;

  myPlayer = roomCode = state = null;
  playersJoined = 0;
  setBusy(false);
  $("roomStatus").textContent = "…";
  $("roomCodeRow").style.display = "none";
  $("statusRoom").textContent = "";

  const sock = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws = sock;

  const clearConnectTimer = (tid) => {
    if (tid != null) clearTimeout(tid);
  };

  let connectTimer = setTimeout(() => {
    if (gen !== connectGen) return;
    if (sock.readyState === WebSocket.CONNECTING) {
      teardownSocket(sock);
      if (ws === sock) ws = null;
      $("roomStatus").textContent = "Couldn’t connect in time. Try again.";
      setBusy(true);
    }
  }, WS_CONNECT_MS);

  sock.onopen = () => {
    if (gen !== connectGen) return;
    clearConnectTimer(connectTimer);
    connectTimer = null;
    $("roomStatus").textContent = mode === "create" ? "Creating…" : "Joining…";
    try {
      sock.send(
        JSON.stringify(
          mode === "create" ? { type: "create", gridType: gridType || "square" } : { type: "join", passcode: code }
        )
      );
    } catch {
      $("roomStatus").textContent = "Send failed. Try again.";
      setBusy(true);
      teardownSocket(sock);
      if (ws === sock) ws = null;
    }
  };

  sock.onmessage = (ev) => {
    if (gen !== connectGen) return;
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (m.type === "error") {
      $("roomStatus").textContent = m.message || "Error";
      setBusy(true);
      teardownSocket(sock);
      if (ws === sock) ws = null;
      return;
    }
    if (m.type === "joined") {
      joinedOk = true;
      myPlayer = m.player;
      roomCode = m.roomCode;
      state = m.state;
      playersJoined = typeof m.playersJoined === "number" ? m.playersJoined : myPlayer === 2 ? 2 : 1;
      $("roomStatus").textContent = `Player ${myPlayer}`;
      $("roomCodeRow").style.display = "";
      $("roomCode").textContent = roomCode;
      setBusy(true);
      $("newGameBtn").disabled = false;
      cells();
      return render();
    }
    if (m.type === "state") {
      state = m.state;
      if (typeof m.playersJoined === "number") playersJoined = m.playersJoined;
      render();
    }
  };

  sock.onerror = () => {
    if (gen !== connectGen) return;
    clearConnectTimer(connectTimer);
    connectTimer = null;
    if (!joinedOk) {
      const rs = $("roomStatus").textContent;
      if (rs === "…" || rs === "Joining…" || rs === "Creating…")
        $("roomStatus").textContent = "Connection error. Try again.";
      setBusy(true);
    }
  };

  sock.onclose = () => {
    if (gen !== connectGen) return;
    clearConnectTimer(connectTimer);
    connectTimer = null;
    if (ws === sock) ws = null;

    if (!joinedOk) {
      setBusy(true);
      const rs = $("roomStatus").textContent;
      if (rs === "Joining…" || rs === "Creating…" || rs === "…")
        $("roomStatus").textContent = "Disconnected before joining. Try again.";
      return;
    }

    myPlayer = roomCode = state = null;
    playersJoined = 0;
    setBusy(true);
    $("newGameBtn").disabled = true;
    $("statusMain").textContent = "Disconnected.";
    $("statusHint").textContent = "";
    $("statusRoom").textContent = "";
    cells();
    render();
  };
}

function click(i) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !state || !myPlayer || playersJoined < 2) return;
  if (state.phase === "flagging") {
    if (state.currentPlayer !== myPlayer || occupied(state, i) || left(state, myPlayer) <= 0) return;
    ws.send(JSON.stringify({ type: "flag", index: i }));
  } else if (state.phase === "guessing") {
    if (state.guessPlayerTurn !== myPlayer) return;
    if (myPlayer === 1 && state.guessP1 !== null) return;
    if (myPlayer === 2 && state.guessP2 !== null) return;
    ws.send(JSON.stringify({ type: "guess", index: i }));
  }
}

$("newGameBtn").onclick = () => ws && ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "restart" }));
$("createRoomBtn").onclick = () => connect("create", null, $("gridTypeSelect")?.value || "square");
$("joinRoomBtn").onclick = () => {
  const p = String($("passcodeInput").value || "").trim();
  if (!/^[0-9]{4}$/.test(p)) return ($("roomStatus").textContent = "4-digit code.");
  connect("join", p);
};

cells();
setBusy(true);
$("newGameBtn").disabled = true;
$("statusMain").textContent = "Create or join.";
$("statusHint").textContent = "P1 cheese · P2 flags";
