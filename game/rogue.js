(function (global) {
  "use strict";

  const data = global.MouseHuntData;
  const shared = global.MouseHuntShared;
  if (!data || !shared) throw new Error("Mouse Hunt: load data.js and shared.js before rogue.js");

  const {
    VALID_GRID_TYPES,
    ROGUE_MAX_MOUSE_MOVES,
    ROGUE_MAX_CHEESE,
    hexCells,
    squareCells,
    squareEdges,
    hexEdges,
    edgeKey,
  } = data;
  const { eatCheese, moveMouseTowardCheese } = shared;

  const OFFER_TYPES = ["cheese", "wall", "flag", "trap", "pass"];

  function gridEdges(gt) {
    return gt === "hex" ? hexEdges : squareEdges;
  }

  function hasCheese(s, i) {
    return Object.prototype.hasOwnProperty.call(s.cheeses || {}, String(i));
  }

  function hasFlag(s, i) {
    return !!(s.flags && s.flags[i]);
  }

  function hasTrap(s, i) {
    return !!(s.traps && s.traps[i]);
  }

  function tileOccupied(s, i) {
    return hasCheese(s, i) || hasFlag(s, i) || hasTrap(s, i);
  }

  function emptyTileExists(s) {
    for (let i = 0; i < s.nCells; i++) if (!tileOccupied(s, i)) return true;
    return false;
  }

  function freeEdgeExists(s) {
    const walls = s.walls || {};
    for (const e of gridEdges(s.gridType)) {
      if (!walls[e.id]) return true;
    }
    return false;
  }

  function allPlacedCheeseEaten(s) {
    if ((s.cheesePlacedCount || 0) < ROGUE_MAX_CHEESE) return false;
    return Object.keys(s.cheeses || {}).length === 0;
  }

  function isEligible(s, type) {
    if (s.phase !== "playing" && s.phase !== "choosing" && s.phase !== "placing") return false;
    switch (type) {
      case "cheese":
        return (s.cheesePlacedCount || 0) < ROGUE_MAX_CHEESE && emptyTileExists(s);
      case "flag":
      case "trap":
        return emptyTileExists(s);
      case "wall":
        return freeEdgeExists(s);
      case "pass":
        return true;
      default:
        return false;
    }
  }

  function pickOffers(s) {
    const pool = OFFER_TYPES.filter((t) => isEligible(s, t));
    if (!pool.length) return ["pass"];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    if (pool.length <= 2) return pool;
    return [pool[0], pool[1]];
  }

  function makeRogueState(gridType = "square") {
    const gt = VALID_GRID_TYPES.has(gridType) ? gridType : "square";
    const gridCells = gt === "hex" ? hexCells : squareCells;
    return {
      gameMode: "rogue",
      phase: "choosing",
      gridType: gt,
      nCells: gridCells.length,
      gridCells,
      mouseIndex: Math.floor(Math.random() * gridCells.length),
      cheesePlacedCount: 0,
      cheeses: {},
      cheeseEating: {},
      flags: {},
      traps: {},
      walls: {},
      mouseMoves: 0,
      cycleSlot: 0,
      pendingLose: false,
      loseReason: null,
      offers: [],
      pendingAction: null,
      history: [],
    };
  }

  function canPlaceTile(s, action, index) {
    if (!s || s.phase !== "placing") return false;
    if (s.pendingAction !== action) return false;
    if (!Number.isInteger(index) || index < 0 || index >= s.nCells) return false;
    if (tileOccupied(s, index)) return false;
    if (action === "cheese") return (s.cheesePlacedCount || 0) < ROGUE_MAX_CHEESE;
    if (action === "flag" || action === "trap") return true;
    return false;
  }

  function canPlaceWall(s, edgeId) {
    if (!s || s.phase !== "placing" || s.pendingAction !== "wall") return false;
    const walls = s.walls || {};
    if (walls[edgeId]) return false;
    return gridEdges(s.gridType).some((e) => e.id === edgeId);
  }

  function applyTilePlacement(s, action, index) {
    if (!canPlaceTile(s, action, index)) return null;

    if (action === "cheese") {
      s.cheesePlacedCount = (s.cheesePlacedCount || 0) + 1;
      s.cheeses = { ...s.cheeses };
      s.cheeses[index] = true;
    } else if (action === "flag") {
      s.flags = { ...s.flags };
      s.flags[index] = true;
      if (index === s.mouseIndex) {
        s.phase = "won";
        s.winReason = "flag";
        return { event: "win", action, index };
      }
    } else if (action === "trap") {
      s.traps = { ...s.traps };
      s.traps[index] = true;
    }

    return { event: "place", action, index };
  }

  function applyWallPlacement(s, edgeId) {
    if (!canPlaceWall(s, edgeId)) return null;
    s.walls = { ...s.walls };
    s.walls[edgeId] = true;
    return { event: "place", action: "wall", edgeId };
  }

  function runMouseMove(s) {
    if (s.phase === "won" || s.phase === "lost") return { event: s.phase };

    const prev = s.mouseIndex;
    moveMouseTowardCheese(s);
    eatCheese(s);
    s.mouseMoves = (s.mouseMoves || 0) + 1;

    if (hasTrap(s, s.mouseIndex)) {
      s.phase = "won";
      s.winReason = "trap";
      return { event: "win", reason: "trap" };
    }

    if (s.mouseMoves >= ROGUE_MAX_MOUSE_MOVES) s.pendingLose = true;

    if (allPlacedCheeseEaten(s)) {
      s.phase = "lost";
      s.loseReason = "cheese";
      return { event: "lost", reason: "cheese" };
    }

    return { event: "move", from: prev, to: s.mouseIndex };
  }

  function finishCycleSlot(s) {
    if (s.phase === "won" || s.phase === "lost") return s;

    if (s.cycleSlot === 0) {
      s.cycleSlot = 1;
      s.phase = "choosing";
      s.offers = pickOffers(s);
      s.pendingAction = null;
      return s;
    }

    s.cycleSlot = 0;
    if (s.pendingLose) {
      s.phase = "lost";
      s.loseReason = "turns";
      return s;
    }

    if (allPlacedCheeseEaten(s)) {
      s.phase = "lost";
      s.loseReason = "cheese";
      return s;
    }

    s.phase = "choosing";
    s.offers = pickOffers(s);
    s.pendingAction = null;
    return s;
  }

  function selectOffer(s, type) {
    if (s.phase !== "choosing") return null;
    if (!s.offers.includes(type)) return null;

    s.history = [...(s.history || []), type];
    s.pendingAction = type;

    if (type === "pass") {
      s.phase = "moving";
      return { event: "pass" };
    }

    s.phase = "placing";
    return { event: "selected", action: type };
  }

  function labelFor(type) {
    const labels = {
      cheese: "🧀 Cheese",
      wall: "🧱 Wall",
      flag: "⚑ Flag",
      trap: "🪤 Trap",
      pass: "Pass",
    };
    return labels[type] || type;
  }

  global.MouseHuntRogue = {
    ROGUE_MAX_MOUSE_MOVES,
    ROGUE_MAX_CHEESE,
    OFFER_TYPES,
    makeRogueState,
    pickOffers,
    isEligible,
    canPlaceTile,
    canPlaceWall,
    applyTilePlacement,
    applyWallPlacement,
    runMouseMove,
    finishCycleSlot,
    selectOffer,
    tileOccupied,
    hasCheese,
    hasFlag,
    hasTrap,
    gridEdges,
    edgeKey,
    labelFor,
    allPlacedCheeseEaten,
  };
})(typeof globalThis !== "undefined" ? globalThis : global);
