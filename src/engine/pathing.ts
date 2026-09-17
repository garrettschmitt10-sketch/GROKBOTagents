import {
  ARENA_H,
  ARENA_W,
  BRIDGES,
  RIVER_BOT,
  RIVER_TOP,
  clamp,
  dist,
  type Entity,
  type Team,
} from "./types";
import { cardById } from "./cards";

export function inRiver(x: number, y: number): boolean {
  if (y < RIVER_TOP || y > RIVER_BOT) return false;
  for (const b of BRIDGES) {
    if (x >= b.x1 && x <= b.x2) return false;
  }
  return true;
}

export function onBridge(x: number, y: number): boolean {
  if (y < RIVER_TOP - 0.05 || y > RIVER_BOT + 0.05) return false;
  return BRIDGES.some((b) => x >= b.x1 && x <= b.x2);
}

export type Bank = "north" | "south" | "river";

export function bankOf(y: number): Bank {
  if (y < RIVER_TOP) return "north";
  if (y > RIVER_BOT) return "south";
  return "river";
}

export function ownBank(team: Team): Bank {
  return team === 0 ? "south" : "north";
}

export function enemyBank(team: Team): Bank {
  return team === 0 ? "north" : "south";
}

export function clampToArena(x: number, y: number, r: number): { x: number; y: number } {
  return {
    x: clamp(x, r + 0.15, ARENA_W - r - 0.15),
    y: clamp(y, r + 0.2, ARENA_H - r - 0.2),
  };
}

function nearestBridgeCx(x: number, targetX: number): number {
  let best: number = BRIDGES[0].cx;
  let bestCost = Infinity;
  for (const b of BRIDGES) {
    const cost = Math.abs(x - b.cx) + Math.abs(targetX - b.cx) * 0.65;
    if (cost < bestCost) {
      bestCost = cost;
      best = b.cx;
    }
  }
  return best;
}

export function steerToward(
  unit: Entity,
  tx: number,
  ty: number,
): { x: number; y: number } {
  if (unit.flying) return { x: tx, y: ty };

  const us = bankOf(unit.y);
  const ts = bankOf(ty);
  if (us === ts && us !== "river") return { x: tx, y: ty };
  if (us === "river") {
    const b = BRIDGES.find((br) => unit.x >= br.x1 - 0.2 && unit.x <= br.x2 + 0.2);
    const cx = b?.cx ?? nearestBridgeCx(unit.x, tx);
    if (ts === "river") return { x: cx, y: ty };
    return { x: cx, y: ty };
  }

  const cx = nearestBridgeCx(unit.x, tx);
  const approachY = us === "south" ? RIVER_BOT + 0.12 : RIVER_TOP - 0.12;
  const closeToBridge = Math.abs(unit.x - cx) < 0.8 && Math.abs(unit.y - approachY) < 1.05;
  if (!closeToBridge && Math.abs(unit.x - cx) > 0.28) {
    return { x: cx, y: approachY };
  }
  const farY = us === "south" ? RIVER_TOP - 0.35 : RIVER_BOT + 0.35;
  return { x: cx, y: farY };
}

export function stepPosition(
  unit: Entity,
  nx: number,
  ny: number,
): { x: number; y: number } {
  const clamped = clampToArena(nx, ny, unit.radius * 0.7);
  if (unit.flying || !inRiver(clamped.x, clamped.y)) return clamped;

  const cx = nearestBridgeCx(unit.x, clamped.x);
  const towardBridge = clampToArena(
    unit.x + Math.sign(cx - unit.x) * Math.min(0.4, Math.abs(cx - unit.x)),
    unit.y,
    unit.radius * 0.7,
  );
  if (!inRiver(towardBridge.x, towardBridge.y)) return towardBridge;
  return { x: unit.x, y: unit.y };
}

export interface Unlock {
  left: boolean;
  right: boolean;
}

export function deployAllowed(
  team: Team,
  cardId: string,
  x: number,
  y: number,
  unlock: Unlock,
): boolean {
  if (x < 0.4 || x > ARENA_W - 0.4 || y < 0.4 || y > ARENA_H - 0.4) return false;
  const card = cardById(cardId);
  if (card.kind === "spell") return true;

  if (inRiver(x, y) && !card.flying) return false;

  const myBank = ownBank(team);
  const b = bankOf(y);
  if (b === myBank) {
    if (team === 0 && y > ARENA_H - 0.95) return false;
    if (team === 1 && y < 0.95) return false;
    return true;
  }

  if (b === "river") return Boolean(card.flying);

  const laneLeft = x < ARENA_W * 0.5;
  const open = laneLeft ? unlock.left : unlock.right;
  if (!open) return false;
  if (team === 0) return y >= 6.4;
  return y <= ARENA_H - 6.4;
}

/** Pull an almost-legal drop onto the nearest valid tile so deploy feels forgiving. */
export function snapDeploy(
  team: Team,
  cardId: string,
  x: number,
  y: number,
  unlock: Unlock,
): { x: number; y: number } | null {
  if (deployAllowed(team, cardId, x, y, unlock)) return { x, y };

  const card = cardById(cardId);
  const guesses: { x: number; y: number }[] = [];

  let gx = clamp(x, 0.55, ARENA_W - 0.55);
  let gy = clamp(y, 0.55, ARENA_H - 0.55);

  if (card.kind === "spell") return { x: gx, y: gy };

  if (inRiver(gx, gy) || bankOf(gy) === "river") {
    const toSouth = Math.abs(gy - RIVER_BOT);
    const toNorth = Math.abs(gy - RIVER_TOP);
    gy = toSouth <= toNorth ? RIVER_BOT + 0.35 : RIVER_TOP - 0.35;
  }

  if (team === 0 && gy > ARENA_H - 0.95) gy = ARENA_H - 1.15;
  if (team === 1 && gy < 0.95) gy = 1.15;

  const my = ownBank(team);
  if (bankOf(gy) !== my && bankOf(gy) !== "river") {
    const laneOpen = (gx < ARENA_W * 0.5 ? unlock.left : unlock.right);
    if (!laneOpen) gy = team === 0 ? RIVER_BOT + 0.55 : RIVER_TOP - 0.55;
  }

  guesses.push({ x: gx, y: gy });
  guesses.push({ x: clamp(x, 1.1, ARENA_W - 1.1), y: team === 0 ? clamp(y, RIVER_BOT + 0.4, ARENA_H - 1.2) : clamp(y, 1.2, RIVER_TOP - 0.4) });

  for (const b of BRIDGES) {
    guesses.push({ x: b.cx, y: team === 0 ? RIVER_BOT + 0.45 : RIVER_TOP - 0.45 });
  }

  const radii = [0.35, 0.7, 1.1, 1.6, 2.1];
  const steps = 10;
  for (const r of radii) {
    for (let i = 0; i < steps; i++) {
      const a = (Math.PI * 2 * i) / steps;
      guesses.push({ x: gx + Math.cos(a) * r, y: gy + Math.sin(a) * r });
    }
  }

  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const g of guesses) {
    const px = clamp(g.x, 0.5, ARENA_W - 0.5);
    const py = clamp(g.y, 0.5, ARENA_H - 0.5);
    if (!deployAllowed(team, cardId, px, py, unlock)) continue;
    const d = dist(x, y, px, py);
    if (d < bestD) {
      bestD = d;
      best = { x: px, y: py };
    }
  }
  if (!best || bestD > 2.4) return null;
  return best;
}

export function distEntity(a: Entity, b: Entity): number {
  return Math.max(0, dist(a.x, a.y, b.x, b.y) - a.radius * 0.15 - b.radius * 0.15);
}
