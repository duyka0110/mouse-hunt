const {
  makeState,
  applyPlace,
  canPlace,
  cheeseLeft,
  flagsLeft,
} = globalThis.MouseHuntLogic;

let state = null;
let placeTool = "cheese";
const $ = (id) => document.getElementById(id);

const boardLive = () => state && state.phase === "playing";

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

function updateToolButtons() {
  const playing = boardLive();
  if (!state) {
    $("toolCheese").disabled = true;
    $("toolFlag").disabled = true;
    return;
  }
  const cl = cheeseLeft(state);
  const fl = flagsLeft(state);
  $("toolCheese").disabled = !playing || cl <= 0;
  $("toolFlag").disabled = !playing || fl <= 0;
  if (playing) {
    if (placeTool === "cheese" && cl <= 0 && fl > 0) setPlaceTool("flag");
    else if (placeTool === "flag" && fl <= 0 && cl > 0) setPlaceTool("cheese");
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
    $("playerMeta").textContent = "—";
    $("playerCard").classList.remove("active");
    updateToolButtons();
    return;
  }

  const F = state.flags || {},
    Ch = state.cheeses || {},
    eat = state.cheeseEating || {};

  els.forEach((el, i) => {
    el.className = "cell";
    el.disabled = false;
    const content = el.querySelector(".cell-content");
    if (content) content.textContent = "";
    el.removeAttribute("title");

    if (F[i]) {
      el.classList.add("flagged-p2");
      if (content) content.textContent = "⚑";
    }
    if (Ch[i]) {
      el.classList.add("cheese");
      if (content) content.textContent = "🧀";
      if (eat[i] && state.mouseIndex === i) el.classList.add("cheese-partial");
    }

    const pickable = boardLive() && canPlace(state, placeTool, i);
    if (!pickable || state.phase === "won" || state.phase === "lost") {
      el.classList.add("disabled");
      el.disabled = true;
    }
  });

  const cl = Math.max(0, cheeseLeft(state));
  const fl = Math.max(0, flagsLeft(state));
  $("playerMeta").textContent = `Cheese left: ${cl} · Flags left: ${fl}`;

  const live = boardLive();
  $("playerCard").classList.toggle("active", live);
  updateToolButtons();

  const main = $("statusMain"),
    hint = $("statusHint");
  hint.classList.remove("overlay-win", "overlay-lose");

  if (!live) {
    if (!state) return;
    if (state.phase === "won") {
      main.textContent = "You win — flag caught the Mouse.";
      hint.textContent = "New game to play again.";
      hint.classList.add("overlay-win");
      const c = els[state.mouseIndex];
      if (c) {
        const content = c.querySelector(".cell-content");
        if (content) content.textContent = F[state.mouseIndex] ? "⚑ 🐭" : "🐭";
      }
    } else if (state.phase === "lost") {
      main.textContent = "Mouse escaped.";
      hint.textContent = "All pieces placed — the Mouse got away.";
      hint.classList.add("overlay-lose");
      const c = els[state.mouseIndex];
      if (c) {
        const content = c.querySelector(".cell-content");
        if (content) content.textContent = "🐭";
        c.title = "Mouse";
      }
    }
    return;
  }

  const toolLabel = placeTool === "cheese" ? "cheese" : "flag";
  main.textContent = `Your turn — place ${toolLabel}.`;
  hint.textContent =
    "Mouse moves toward cheese; flags block. Flag on the Mouse wins. Cheese lingers one turn after a bite.";
}

function showPlayingActions() {
  $("startGameBtn").classList.add("hidden");
  $("newGameBtn").classList.remove("hidden");
}

function startGame() {
  const gridType = $("gridTypeSelect")?.value || "square";
  state = makeState(gridType);
  if (cheeseLeft(state) > 0) setPlaceTool("cheese");
  else setPlaceTool("flag");
  showPlayingActions();
  cells();
  render();
}

function newGame() {
  const gridType = $("gridTypeSelect")?.value || "square";
  state = makeState(gridType);
  setPlaceTool("cheese");
  cells();
  render();
}

function click(i) {
  if (!boardLive() || !canPlace(state, placeTool, i)) return;
  applyPlace(state, placeTool, i);
  render();
}

$("startGameBtn").onclick = startGame;
$("newGameBtn").onclick = newGame;
$("toolCheese").onclick = () => setPlaceTool("cheese");
$("toolFlag").onclick = () => setPlaceTool("flag");

cells();
$("newGameBtn").classList.add("hidden");
$("statusMain").textContent = "Choose a grid and start.";
$("statusHint").textContent = "Place up to 3 cheese and 3 flags anywhere on the board.";
