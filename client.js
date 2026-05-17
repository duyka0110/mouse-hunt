const CF = globalThis.MouseHuntLogic;
const Rogue = globalThis.MouseHuntRogue;

let state = null;
let placeTool = "cheese";
let uiLocked = false;
const $ = (id) => document.getElementById(id);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function selectedMode() {
  return $("gameModeSelect")?.value === "rogue" ? "rogue" : "cheeseflag";
}

function isRogue() {
  return state?.gameMode === "rogue";
}

function boardLive() {
  return state && state.phase === "playing";
}

function updateModeChrome() {
  const rogue = selectedMode();
  document.querySelectorAll(".cf-only").forEach((el) => {
    el.classList.toggle("hidden", rogue);
  });
  document.querySelectorAll(".rogue-only").forEach((el) => {
    el.classList.toggle("hidden", !rogue);
  });
}

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
    b.dataset.index = String(i);
    b.addEventListener("click", () => onCellClick(i));
    if (gt === "hex") {
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
    const H = W * 0.8660254037844386;
    const GAP = -2;
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

  requestAnimationFrame(layoutEdges);
}

function layoutEdges() {
  const layer = $("edgeLayer");
  layer.innerHTML = "";
  if (!state || !isRogue()) return;

  const wrap = $("boardWrap");
  const edges = Rogue.gridEdges(state.gridType);
  const cellEls = document.querySelectorAll(".cell");
  const wr = wrap.getBoundingClientRect();

  for (const e of edges) {
    const elA = cellEls[e.a];
    const elB = cellEls[e.b];
    if (!elA || !elB) continue;
    const ar = elA.getBoundingClientRect();
    const br = elB.getBoundingClientRect();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "edge-btn";
    btn.dataset.edgeId = e.id;
    if (state.walls && state.walls[e.id]) btn.classList.add("wall-placed");
    if (state.phase === "placing" && state.pendingAction === "wall" && Rogue.canPlaceWall(state, e.id)) {
      btn.classList.add("edge-pickable");
    } else {
      btn.disabled = true;
    }
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      onEdgeClick(e.id);
    });

    const cx = (ar.left + ar.right + br.left + br.right) / 4 - wr.left;
    const cy = (ar.top + ar.bottom + br.top + br.bottom) / 4 - wr.top;
    const thick = 10;
    const long = Math.max(ar.width, ar.height) * 0.55;

    if (e.dir === "h") {
      btn.style.left = `${cx - thick / 2}px`;
      btn.style.top = `${cy - long / 2}px`;
      btn.style.width = `${thick}px`;
      btn.style.height = `${long}px`;
    } else if (e.dir === "v") {
      btn.style.left = `${cx - long / 2}px`;
      btn.style.top = `${cy - thick / 2}px`;
      btn.style.width = `${long}px`;
      btn.style.height = `${thick}px`;
    } else {
      const dx = br.left - ar.left;
      const dy = br.top - ar.top;
      const len = Math.hypot(dx, dy) || 1;
      btn.style.left = `${cx - len / 2}px`;
      btn.style.top = `${cy - thick / 2}px`;
      btn.style.width = `${len}px`;
      btn.style.height = `${thick}px`;
      btn.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      btn.style.transformOrigin = "center center";
    }

    layer.appendChild(btn);
  }
}

function setOverlay(text, show) {
  const o = $("boardOverlay");
  $("boardOverlayText").textContent = text || "";
  o.classList.toggle("hidden", !show);
}

function setPlaceTool(tool) {
  if (tool !== "cheese" && tool !== "flag") return;
  placeTool = tool;
  $("toolCheese").classList.toggle("active", tool === "cheese");
  $("toolFlag").classList.toggle("active", tool === "flag");
  $("toolCheese").setAttribute("aria-pressed", tool === "cheese" ? "true" : "false");
  $("toolFlag").setAttribute("aria-pressed", tool === "flag" ? "true" : "false");
  render();
}

function updateCfTools() {
  if (!state || isRogue()) return;
  const playing = boardLive();
  if (!state) {
    $("toolCheese").disabled = true;
    $("toolFlag").disabled = true;
    return;
  }
  const cl = CF.cheeseLeft(state);
  const fl = CF.flagsLeft(state);
  $("toolCheese").disabled = !playing || cl <= 0;
  $("toolFlag").disabled = !playing || fl <= 0;
  if (playing) {
    if (placeTool === "cheese" && cl <= 0 && fl > 0) setPlaceTool("flag");
    else if (placeTool === "flag" && fl <= 0 && cl > 0) setPlaceTool("cheese");
  }
}

function renderBoardCells() {
  const els = document.querySelectorAll(".cell");
  if (!state) {
    els.forEach((el) => {
      el.className = "cell disabled";
      el.disabled = true;
    });
    return;
  }

  const F = state.flags || {},
    Ch = state.cheeses || {},
    Tr = state.traps || {},
    eat = state.cheeseEating || {};

  els.forEach((el, i) => {
    el.className = "cell";
    el.disabled = uiLocked;
    const content = el.querySelector(".cell-content");
    if (content) content.textContent = "";
    el.removeAttribute("title");

    if (F[i]) {
      el.classList.add("flagged-p2");
      if (content) content.textContent = "⚑";
    }
    if (Tr[i]) {
      el.classList.add("trap");
      if (content) content.textContent = "🪤";
    }
    if (Ch[i]) {
      el.classList.add("cheese");
      if (content) content.textContent = "🧀";
      if (eat[i] && state.mouseIndex === i) el.classList.add("cheese-partial");
    }

    let pickable = false;
    if (isRogue()) {
      pickable =
        !uiLocked &&
        state.phase === "placing" &&
        state.pendingAction !== "wall" &&
        state.pendingAction !== "pass" &&
        Rogue.canPlaceTile(state, state.pendingAction, i);
    } else {
      pickable = boardLive() && CF.canPlace(state, placeTool, i);
    }

    if (!pickable || state.phase === "won" || state.phase === "lost") {
      el.classList.add("disabled");
      el.disabled = true;
    }
  });

  if (state.phase === "won" || state.phase === "lost") {
    const c = els[state.mouseIndex];
    if (c) {
      const content = c.querySelector(".cell-content");
      if (state.phase === "won") {
        if (content)
          content.textContent =
            F[state.mouseIndex] || Tr[state.mouseIndex]
              ? `${F[state.mouseIndex] ? "⚑" : ""}${Tr[state.mouseIndex] ? "🪤" : ""} 🐭`.trim()
              : "🐭";
      } else if (content) {
        content.textContent = "🐭";
        c.title = "Mouse";
      }
    }
  }
}

function renderRoguePanel() {
  const sel = $("rogueSelection");
  const hist = $("rogueHistory");
  if (!isRogue() || !state) {
    sel.textContent = "";
    hist.textContent = "";
    return;
  }

  if (state.phase === "choosing") {
    sel.textContent = "Pick one of the offered actions.";
  } else if (state.pendingAction) {
    sel.textContent = `Selected: ${Rogue.labelFor(state.pendingAction)}`;
  } else if (state.phase === "moving") {
    sel.textContent = "Mouse is moving…";
  } else {
    sel.textContent = "—";
  }

  const h = state.history || [];
  hist.textContent = h.length ? `Choices: ${h.map((t) => Rogue.labelFor(t)).join(" → ")}` : "Choices: —";
}

function renderChoicePopup() {
  const overlay = $("boardOverlay");
  const text = $("boardOverlayText");
  if (!isRogue() || state.phase !== "choosing" || uiLocked) {
    if (state?.phase !== "moving") setOverlay("", false);
    return;
  }

  overlay.classList.remove("hidden");
  overlay.classList.add("choice-popup");
  text.innerHTML = "";

  const title = document.createElement("p");
  title.className = "choice-popup-title";
  title.textContent =
    state.cycleSlot === 0 ? "Choose your first action" : "Choose your second action";
  text.appendChild(title);

  const row = document.createElement("div");
  row.className = "choice-popup-actions";
  for (const type of state.offers || []) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-primary choice-btn";
    btn.textContent = Rogue.labelFor(type);
    btn.addEventListener("click", () => onRogueOffer(type));
    row.appendChild(btn);
  }
  text.appendChild(row);
}

function render() {
  updateModeChrome();
  renderBoardCells();
  layoutEdges();

  if (!state) {
    $("playerMeta").textContent = "—";
    $("playerCard").classList.remove("active");
    setOverlay("", false);
    return;
  }

  const main = $("statusMain"),
    hint = $("statusHint");
  hint.classList.remove("overlay-win", "overlay-lose");

  if (isRogue()) {
    renderRoguePanel();
    const moves = state.mouseMoves || 0;
    const cheeseLeftN = Math.max(0, Rogue.ROGUE_MAX_CHEESE - (state.cheesePlacedCount || 0));
    $("playerMeta").textContent = `Mouse moves: ${moves}/${Rogue.ROGUE_MAX_MOUSE_MOVES} · Cheese to place: ${cheeseLeftN}`;
    $("playerCard").classList.toggle(
      "active",
      ["choosing", "placing", "playing"].includes(state.phase) && state.phase !== "won" && state.phase !== "lost"
    );

    if (state.phase === "moving") {
      setOverlay("Mouse is moving…", true);
      $("boardOverlay").classList.remove("choice-popup");
    } else if (state.phase === "choosing") {
      renderChoicePopup();
    } else {
      setOverlay("", false);
      $("boardOverlay").classList.remove("choice-popup");
    }

    if (state.phase === "won") {
      main.textContent =
        state.winReason === "trap" ? "You win — the Mouse hit your trap." : "You win — flag caught the Mouse.";
      hint.textContent = "New game to play again.";
      hint.classList.add("overlay-win");
    } else if (state.phase === "lost") {
      main.textContent =
        state.loseReason === "cheese"
          ? "You lose — the Mouse ate all the cheese."
          : "You lose — 10 mouse moves are up.";
      hint.textContent = "New game to try again.";
      hint.classList.add("overlay-lose");
    } else if (state.phase === "choosing") {
      main.textContent = "Pick an action from the board.";
      hint.textContent = "You get two random offers per cycle; the Mouse moves after each choice.";
    } else if (state.phase === "placing") {
      const a = state.pendingAction;
      main.textContent =
        a === "wall" ? "Place a wall on an edge between tiles." : `Place ${Rogue.labelFor(a)} on a tile.`;
      hint.textContent = "Tiles can hold only one object.";
    } else {
      main.textContent = "Rogue hunt in progress.";
      hint.textContent = "";
    }
    return;
  }

  $("playerMeta").textContent = `Cheese left: ${Math.max(0, CF.cheeseLeft(state))} · Flags left: ${Math.max(0, CF.flagsLeft(state))}`;
  const live = boardLive();
  $("playerCard").classList.toggle("active", live);
  updateCfTools();
  setOverlay("", false);

  if (!live) {
    if (state.phase === "won") {
      main.textContent = "You win — flag caught the Mouse.";
      hint.textContent = "New game to play again.";
      hint.classList.add("overlay-win");
    } else if (state.phase === "lost") {
      main.textContent = "Mouse escaped.";
      hint.textContent = "All pieces placed — the Mouse got away.";
      hint.classList.add("overlay-lose");
    }
    return;
  }

  const toolLabel = placeTool === "cheese" ? "cheese" : "flag";
  main.textContent = `Your turn — place ${toolLabel}.`;
  hint.textContent =
    "Mouse moves toward cheese; flags block. Flag on the Mouse wins. Cheese lingers one turn after a bite.";
}

async function rogueAfterAction() {
  if (state.phase === "won" || state.phase === "lost") {
    uiLocked = false;
    render();
    return;
  }

  uiLocked = true;
  state.phase = "moving";
  render();
  await sleep(700);

  Rogue.runMouseMove(state);
  uiLocked = false;

  if (state.phase === "won" || state.phase === "lost") {
    render();
    return;
  }

  Rogue.finishCycleSlot(state);
  if (state.phase === "choosing" && (!state.offers || !state.offers.length)) {
    state.offers = Rogue.pickOffers(state);
  }
  render();
}

function onRogueOffer(type) {
  if (uiLocked || state.phase !== "choosing") return;
  const r = Rogue.selectOffer(state, type);
  if (!r) return;
  if (type === "pass") {
    rogueAfterAction();
    return;
  }
  render();
}

function onCellClick(i) {
  if (uiLocked || !state) return;

  if (isRogue()) {
    if (state.phase !== "placing" || state.pendingAction === "wall") return;
    const result = Rogue.applyTilePlacement(state, state.pendingAction, i);
    if (!result) return;
    if (result.event === "win") {
      render();
      return;
    }
    rogueAfterAction();
    return;
  }

  if (!boardLive() || !CF.canPlace(state, placeTool, i)) return;
  CF.applyPlace(state, placeTool, i);
  render();
}

function onEdgeClick(edgeId) {
  if (uiLocked || !isRogue() || state.phase !== "placing" || state.pendingAction !== "wall") return;
  const result = Rogue.applyWallPlacement(state, edgeId);
  if (!result) return;
  rogueAfterAction();
}

function showPlayingActions() {
  $("startGameBtn").classList.add("hidden");
  $("newGameBtn").classList.remove("hidden");
}

function startGame() {
  const gridType = $("gridTypeSelect")?.value || "square";
  const mode = selectedMode();
  uiLocked = false;

  if (mode === "rogue") {
    state = Rogue.makeRogueState(gridType);
    state.offers = Rogue.pickOffers(state);
  } else {
    state = CF.makeState(gridType);
    state.gameMode = "cheeseflag";
    if (CF.cheeseLeft(state) > 0) setPlaceTool("cheese");
    else setPlaceTool("flag");
  }

  showPlayingActions();
  cells();
  render();
}

function newGame() {
  startGame();
}

$("startGameBtn").onclick = startGame;
$("newGameBtn").onclick = newGame;
$("toolCheese").onclick = () => setPlaceTool("cheese");
$("toolFlag").onclick = () => setPlaceTool("flag");
$("gameModeSelect").onchange = updateModeChrome;

cells();
updateModeChrome();
$("newGameBtn").classList.add("hidden");
$("statusMain").textContent = "Choose a mode and grid, then start.";
$("statusHint").textContent = "CheeseFlag: classic hunt. Rogue: random offers each turn.";
