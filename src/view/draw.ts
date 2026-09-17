import { cardById } from "../engine/cards";
import { bankOf, inRiver, onBridge } from "../engine/pathing";
import {
  ARENA_H,
  ARENA_W,
  BRIDGES,
  RIVER_BOT,
  RIVER_TOP,
  clamp,
  type Entity,
  type Projectile,
  type Team,
} from "../engine/types";
import type { Match } from "../engine/match";

export interface ViewCam {
  x: number;
  y: number;
  s: number;
}

const WATCH = "#6fa8dc";
const DUST_BRIGHT = "#e8d48a";
const BRASS = "#c9a227";
const WATCH_DEEP = "#1a3348";
const DUST_DEEP = "#3a2e14";
const WATCH_MID = "#3d6f94";
const DUST_MID = "#8a6b2e";
const SKIN = "#c9a882";
const SKIN_SHADOW = "#8a6a48";

export function layoutCam(cw: number, ch: number): ViewCam {
  const padX = cw * 0.05;
  const padTop = ch * 0.01;
  const padBot = ch * 0.018;
  const s = Math.min((cw - padX * 2) / ARENA_W, (ch - padTop - padBot) / ARENA_H);
  const x = (cw - ARENA_W * s) / 2;
  const y = padTop + (ch - padTop - padBot - ARENA_H * s) / 2;
  return { x, y, s };
}

export function worldToScreen(cam: ViewCam, x: number, y: number): { x: number; y: number } {
  return { x: cam.x + x * cam.s, y: cam.y + y * cam.s };
}

export function screenToWorld(cam: ViewCam, x: number, y: number): { x: number; y: number } {
  return { x: (x - cam.x) / cam.s, y: (y - cam.y) / cam.s };
}

const teamGlow = (team: Team) => (team === 0 ? WATCH : DUST_BRIGHT);
const teamMid = (team: Team) => (team === 0 ? WATCH_MID : DUST_MID);

interface Kit {
  rim: string;
  mid: string;
  deep: string;
  cloth: string;
  clothLight: string;
  helmet: string;
  helmetLight: string;
  webbing: string;
  wood: string;
  metal: string;
  metalLight: string;
}

function kit(team: Team): Kit {
  if (team === 0) {
    return {
      rim: WATCH,
      mid: WATCH_MID,
      deep: WATCH_DEEP,
      cloth: "#3a6284",
      clothLight: "#6fa8dc",
      helmet: "#243848",
      helmetLight: "#8ec4e8",
      webbing: "#d8d2c0",
      wood: "#6a4a28",
      metal: "#b8b4a8",
      metalLight: "#ece8dc",
    };
  }
  return {
    rim: DUST_BRIGHT,
    mid: DUST_MID,
    deep: DUST_DEEP,
    cloth: "#c4a35a",
    clothLight: "#e8d48a",
    helmet: "#5c4a24",
    helmetLight: "#f2e6b0",
    webbing: "#efe6c4",
    wood: "#6a4a28",
    metal: "#c4b896",
    metalLight: "#efe6c8",
  };
}

export function drawArena(
  ctx: CanvasRenderingContext2D,
  match: Match,
  cam: ViewCam,
  t: number,
  hover: { x: number; y: number; valid: boolean; cardId: string | null } | null,
): void {
  const { s } = cam;
  ctx.save();
  ctx.translate(cam.x, cam.y);
  ctx.scale(s, s);

  drawOuterFrame(ctx);

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, 0, 0, ARENA_W, ARENA_H, 0.38);
  ctx.clip();

  drawMudFloor(ctx, t);
  drawLaneMarks(ctx);
  drawRiver(ctx, t);
  drawBridges(ctx);
  drawPads(ctx, match);

  if (hover?.cardId) {
    drawDeployHint(ctx, match, { ...hover, cardId: hover.cardId });
  }

  const sorted = match.entities.slice().sort((a, b) => a.y - b.y || a.id - b.id);
  for (const e of sorted) if (e.kind === "tower") drawTower(ctx, e);
  for (const e of sorted) if (e.kind === "building") drawBuilding(ctx, e, t, match.now);
  for (const e of sorted) if (e.kind === "troop") drawTroop(ctx, e, t, match.now);
  for (const e of sorted) if (e.kind === "spell") drawSpellMarker(ctx, e, t);
  for (const p of match.projectiles) drawProjectile(ctx, p);
  for (const e of sorted) {
    if (e.kind === "tower" || e.kind === "building" || e.kind === "troop") drawHealth(ctx, e);
  }

  ctx.restore();
  ctx.restore();
}

function drawOuterFrame(ctx: CanvasRenderingContext2D): void {
  roundRect(ctx, -0.55, -0.55, ARENA_W + 1.1, ARENA_H + 1.1, 0.55);
  ctx.fillStyle = "#12140f";
  ctx.fill();

  roundRect(ctx, -0.34, -0.34, ARENA_W + 0.68, ARENA_H + 0.68, 0.46);
  ctx.strokeStyle = BRASS;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 0.1;
  ctx.stroke();
  ctx.globalAlpha = 1;

  roundRect(ctx, 0, 0, ARENA_W, ARENA_H, 0.38);
  ctx.fillStyle = "#1a1c16";
  ctx.fill();
}

function drawMudFloor(ctx: CanvasRenderingContext2D, t: number): void {
  const field = ctx.createLinearGradient(0, 0, 0, ARENA_H);
  field.addColorStop(0, "#323428");
  field.addColorStop(0.14, "#2a2e24");
  field.addColorStop(0.48, "#23261e");
  field.addColorStop(0.52, "#2c2a20");
  field.addColorStop(1, "#25281f");
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

  const dusk = ctx.createLinearGradient(0, 0, 0, 5.8);
  dusk.addColorStop(0, "rgba(48, 50, 58, 0.62)");
  dusk.addColorStop(1, "rgba(26, 28, 22, 0)");
  ctx.fillStyle = dusk;
  ctx.fillRect(0, 0, ARENA_W, 5.8);

  ctx.fillStyle = "rgba(180,180,170,0.16)";
  for (let i = 0; i < 5; i++) {
    const sx = 1.4 + i * 3.4;
    const sy = 1.15 + Math.sin(t * 0.12 + i) * 0.12;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 2.2, 0.58, -0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(18, 20, 14, 0.55)";
  ctx.lineWidth = 0.07;
  for (let i = 0; i < 11; i++) {
    const y = 3.6 + i * 2.35;
    if (y > RIVER_TOP - 0.7 && y < RIVER_BOT + 0.7) continue;
    ctx.beginPath();
    ctx.moveTo(0.3, y);
    for (let x = 0.3; x < ARENA_W; x += 0.45) {
      ctx.lineTo(x, y + ((x * 7 + i * 13) % 5) * 0.05 - 0.1);
    }
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(12, 14, 10, 0.42)";
  for (let i = 0; i < 36; i++) {
    const sx = 0.5 + ((i * 53) % 172) / 10;
    const sy = 0.7 + ((i * 97) % 304) / 10;
    if (sy > RIVER_TOP - 0.2 && sy < RIVER_BOT + 0.2) continue;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 0.22 + (i % 3) * 0.07, 0.12 + (i % 2) * 0.05, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let row = 0; row < ARENA_H; row++) {
    for (let col = 0; col < ARENA_W; col++) {
      if ((row + col) % 3) continue;
      const north = row < RIVER_TOP;
      ctx.fillStyle = north ? "rgba(196, 163, 90, 0.06)" : "rgba(111, 168, 220, 0.055)";
      ctx.fillRect(col, row, 1, 1);
    }
  }

  drawWire(ctx, RIVER_TOP - 0.55);
  drawWire(ctx, RIVER_BOT + 0.55);
}

function drawWire(ctx: CanvasRenderingContext2D, y: number): void {
  ctx.save();
  ctx.strokeStyle = "rgba(90, 88, 78, 0.7)";
  ctx.lineWidth = 0.045;
  ctx.beginPath();
  ctx.moveTo(0.2, y);
  for (let x = 0.2; x < ARENA_W; x += 0.55) {
    ctx.lineTo(x + 0.22, y - 0.16);
    ctx.lineTo(x + 0.55, y);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(60, 58, 48, 0.55)";
  ctx.lineWidth = 0.03;
  for (let x = 0.4; x < ARENA_W; x += 1.1) {
    ctx.beginPath();
    ctx.moveTo(x, y - 0.18);
    ctx.lineTo(x + 0.12, y + 0.1);
    ctx.moveTo(x + 0.08, y - 0.16);
    ctx.lineTo(x - 0.06, y + 0.08);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLaneMarks(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.setLineDash([0.28, 0.22]);
  ctx.lineWidth = 0.07;
  for (const x of [3.8, 14.2]) {
    ctx.strokeStyle = "#cbb98a";
    ctx.beginPath();
    ctx.moveTo(x, 2.6);
    ctx.lineTo(x, RIVER_TOP - 0.2);
    ctx.moveTo(x, RIVER_BOT + 0.2);
    ctx.lineTo(x, ARENA_H - 2.6);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 0.05;
  for (const cx of [3.8, 9, 14.2]) {
    for (const cy of [11.2, 20.8]) {
      ctx.beginPath();
      ctx.arc(cx, cy, 0.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 0.32, cy);
      ctx.lineTo(cx + 0.32, cy);
      ctx.moveTo(cx, cy - 0.32);
      ctx.lineTo(cx, cy + 0.32);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawRiver(ctx: CanvasRenderingContext2D, t: number): void {
  const y = RIVER_TOP;
  const h = RIVER_BOT - RIVER_TOP;

  ctx.fillStyle = "rgba(18, 22, 20, 0.55)";
  ctx.fillRect(0, y - 0.28, ARENA_W, h + 0.56);

  const rg = ctx.createLinearGradient(0, y, 0, y + h);
  rg.addColorStop(0, "#2a3438");
  rg.addColorStop(0.18, "#3a4a52");
  rg.addColorStop(0.5, "#6a8490");
  rg.addColorStop(0.82, "#3a4a52");
  rg.addColorStop(1, "#2a3438");
  ctx.fillStyle = rg;
  ctx.fillRect(0, y, ARENA_W, h);

  ctx.fillStyle = "rgba(8, 10, 8, 0.35)";
  ctx.fillRect(0, y, ARENA_W, 0.12);
  ctx.fillRect(0, y + h - 0.12, ARENA_W, 0.12);

  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = "#d8e4e8";
  ctx.lineWidth = 0.04;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    const yy = y + 0.28 + i * 0.32;
    for (let x = 0; x <= ARENA_W; x += 0.22) {
      const oy = Math.sin(x * 1.05 + t * 1.6 + i * 0.8) * 0.08;
      if (x === 0) ctx.moveTo(x, yy + oy);
      else ctx.lineTo(x, yy + oy);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawBridges(ctx: CanvasRenderingContext2D): void {
  for (const b of BRIDGES) {
    const x = b.x1;
    const w = b.x2 - b.x1;
    const y = RIVER_TOP - 0.22;
    const h = RIVER_BOT - RIVER_TOP + 0.44;

    ctx.fillStyle = "rgba(20, 18, 12, 0.45)";
    roundRect(ctx, x - 0.1, y - 0.06, w + 0.2, h + 0.12, 0.08);
    ctx.fill();

    const plank = ctx.createLinearGradient(x, y, x + w, y);
    plank.addColorStop(0, "#4a4030");
    plank.addColorStop(0.5, "#6a5c44");
    plank.addColorStop(1, "#3e3628");
    roundRect(ctx, x, y, w, h, 0.08);
    ctx.fillStyle = plank;
    ctx.fill();
    ctx.strokeStyle = "#2a2418";
    ctx.lineWidth = 0.06;
    ctx.stroke();

    ctx.strokeStyle = "rgba(18, 16, 12, 0.55)";
    ctx.lineWidth = 0.045;
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 0.08, y + (h * i) / 5);
      ctx.lineTo(x + w - 0.08, y + (h * i) / 5);
      ctx.stroke();
    }

    ctx.fillStyle = "#8a8070";
    ctx.fillRect(x + 0.06, y + 0.05, 0.1, h - 0.1);
    ctx.fillRect(x + w - 0.16, y + 0.05, 0.1, h - 0.1);

    ctx.fillStyle = BRASS;
    for (let i = 0; i < 4; i++) {
      const ry = y + 0.22 + (i * (h - 0.4)) / 3;
      ctx.beginPath();
      ctx.arc(x + 0.11, ry, 0.045, 0, Math.PI * 2);
      ctx.arc(x + w - 0.11, ry, 0.045, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "#cbb98a";
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(x + 0.18, y + 0.08);
    ctx.lineTo(x + 0.18, y + h - 0.08);
    ctx.moveTo(x + w - 0.18, y + 0.08);
    ctx.lineTo(x + w - 0.18, y + h - 0.08);
    ctx.stroke();

    ctx.fillStyle = "#6a5a3a";
    roundRect(ctx, x - 0.12, y - 0.08, 0.34, 0.22, 0.04);
    ctx.fill();
    roundRect(ctx, x + w - 0.22, y - 0.08, 0.34, 0.22, 0.04);
    ctx.fill();
    roundRect(ctx, x - 0.12, y + h - 0.14, 0.34, 0.22, 0.04);
    ctx.fill();
    roundRect(ctx, x + w - 0.22, y + h - 0.14, 0.34, 0.22, 0.04);
    ctx.fill();
  }
}

function drawPads(ctx: CanvasRenderingContext2D, match: Match): void {
  for (const e of match.entities) {
    if (e.kind !== "tower") continue;
    const king = e.towerSlot === "king";
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.beginPath();
    ctx.ellipse(0, e.radius * 0.7, e.radius * (king ? 1.85 : 1.28), e.radius * (king ? 0.72 : 0.48), 0, 0, Math.PI * 2);
    ctx.fillStyle = e.team === 0 ? "rgba(111,168,220,0.16)" : "rgba(232,212,138,0.16)";
    ctx.fill();
    ctx.strokeStyle = e.team === 0 ? "rgba(111,168,220,0.32)" : "rgba(232,212,138,0.32)";
    ctx.lineWidth = 0.05;
    ctx.stroke();
    ctx.restore();
  }
}

function drawDeployHint(
  ctx: CanvasRenderingContext2D,
  match: Match,
  hover: { x: number; y: number; valid: boolean; cardId: string },
): void {
  const card = cardById(hover.cardId);
  ctx.save();
  const col = hover.valid ? WATCH : "#c45a3a";
  if (card.kind === "spell") {
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(hover.x, hover.y, card.spellRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = col;
    ctx.lineWidth = 0.1;
    ctx.setLineDash([0.2, 0.12]);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    const unlock = match.unlocksFor(0);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = WATCH;
    ctx.fillRect(0.15, RIVER_BOT, ARENA_W - 0.3, ARENA_H - RIVER_BOT - 1.05);
    if (unlock.left) ctx.fillRect(0.15, 6.4, ARENA_W * 0.5 - 0.15, RIVER_TOP - 6.4);
    if (unlock.right) ctx.fillRect(ARENA_W * 0.5, 6.4, ARENA_W * 0.5 - 0.15, RIVER_TOP - 6.4);
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(hover.x, hover.y, Math.max(0.55, card.radius + 0.22), 0, Math.PI * 2);
    ctx.strokeStyle = hover.valid ? "#e8f0f6" : "#e07050";
    ctx.lineWidth = 0.09;
    ctx.stroke();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = col;
    ctx.fill();
    if (!hover.valid) {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = "#e07050";
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.moveTo(hover.x - 0.28, hover.y - 0.28);
      ctx.lineTo(hover.x + 0.28, hover.y + 0.28);
      ctx.moveTo(hover.x + 0.28, hover.y - 0.28);
      ctx.lineTo(hover.x - 0.28, hover.y + 0.28);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function paint(ctx: CanvasRenderingContext2D, fill: string, stroke: string, lw = 0.05): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function shadow(ctx: CanvasRenderingContext2D, rx: number, ry: number, y = 0.42): void {
  ctx.beginPath();
  ctx.ellipse(0, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.fill();
}

function drawHelmet(ctx: CanvasRenderingContext2D, k: Kit, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y + 0.04 * s, 0.2 * s, 0.09 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = SKIN_SHADOW;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y + 0.02 * s, 0.16 * s, 0.1 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = SKIN;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y - 0.02 * s, 0.22 * s, 0.14 * s, 0, Math.PI, Math.PI * 2, true);
  paint(ctx, k.helmet, k.rim, 0.04 * s);
  ctx.beginPath();
  ctx.ellipse(x, y - 0.06 * s, 0.12 * s, 0.07 * s, 0, Math.PI, Math.PI * 2, true);
  ctx.fillStyle = k.helmetLight;
  ctx.globalAlpha = 0.45;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = k.deep;
  ctx.fillRect(x - 0.23 * s, y + 0.01 * s, 0.46 * s, 0.055 * s);
  ctx.strokeStyle = k.helmetLight;
  ctx.lineWidth = 0.03 * s;
  ctx.beginPath();
  ctx.moveTo(x - 0.2 * s, y + 0.02 * s);
  ctx.lineTo(x + 0.2 * s, y + 0.02 * s);
  ctx.stroke();
}

function drawRifle(
  ctx: CanvasRenderingContext2D,
  k: Kit,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  bayonet = false,
  scope = false,
): void {
  ctx.lineCap = "round";
  ctx.strokeStyle = k.wood;
  ctx.lineWidth = 0.09;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = k.metal;
  ctx.lineWidth = 0.045;
  ctx.beginPath();
  const mx = x0 + (x1 - x0) * 0.45;
  const my = y0 + (y1 - y0) * 0.45;
  ctx.moveTo(mx, my);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = k.metalLight;
  ctx.lineWidth = 0.02;
  ctx.stroke();
  if (scope) {
    ctx.fillStyle = k.metalLight;
    ctx.beginPath();
    ctx.arc(x0 + (x1 - x0) * 0.58, y0 + (y1 - y0) * 0.58 - 0.06, 0.055, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = k.rim;
    ctx.lineWidth = 0.025;
    ctx.stroke();
  }
  if (bayonet) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    ctx.fillStyle = k.metalLight;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + ux * 0.38 - uy * 0.05, y1 + uy * 0.38 + ux * 0.05);
    ctx.lineTo(x1 + ux * 0.08 + uy * 0.04, y1 + uy * 0.08 - ux * 0.04);
    ctx.closePath();
    paint(ctx, k.metalLight, BRASS, 0.03);
  }
}

function drawScout(ctx: CanvasRenderingContext2D, e: Entity, bob = 0): void {
  const k = kit(e.team);
  const stride = Math.sin(bob) * 0.08;
  shadow(ctx, 0.38, 0.16, 0.48);
  roundRect(ctx, -0.16, 0.18 + stride, 0.12, 0.32, 0.04);
  paint(ctx, k.deep, k.rim, 0.04);
  roundRect(ctx, 0.04, 0.16 - stride, 0.12, 0.34, 0.04);
  paint(ctx, k.cloth, k.rim, 0.04);
  roundRect(ctx, -0.12, 0.34, 0.1, 0.08, 0.02);
  ctx.fillStyle = k.deep;
  ctx.fill();
  roundRect(ctx, 0.06, 0.36, 0.1, 0.08, 0.02);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.22, 0.2);
  ctx.lineTo(-0.18, -0.22);
  ctx.lineTo(0.18, -0.22);
  ctx.lineTo(0.22, 0.2);
  ctx.closePath();
  const body = ctx.createLinearGradient(-0.2, -0.22, 0.22, 0.22);
  body.addColorStop(0, k.clothLight);
  body.addColorStop(0.45, k.cloth);
  body.addColorStop(1, k.deep);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = k.rim;
  ctx.lineWidth = 0.055;
  ctx.stroke();
  roundRect(ctx, 0.08, -0.08, 0.16, 0.22, 0.04);
  paint(ctx, k.deep, k.rim, 0.03);
  ctx.fillStyle = k.webbing;
  ctx.fillRect(-0.14, 0.02, 0.28, 0.05);
  ctx.fillRect(-0.03, -0.18, 0.06, 0.28);
  roundRect(ctx, -0.26, -0.18, 0.1, 0.28, 0.03);
  paint(ctx, k.clothLight, k.rim, 0.03);
  roundRect(ctx, 0.16, -0.16, 0.1, 0.22, 0.03);
  paint(ctx, k.cloth, k.rim, 0.03);
  drawRifle(ctx, k, 0.18, -0.05, 0.12, -0.72, false, false);
  drawHelmet(ctx, k, 0, -0.34, 0.92);
}

function drawBayonet(ctx: CanvasRenderingContext2D, e: Entity, bob = 0): void {
  const k = kit(e.team);
  const stride = Math.sin(bob) * 0.1;
  shadow(ctx, 0.48, 0.18, 0.58);
  ctx.save();
  ctx.translate(0, -0.06);
  roundRect(ctx, -0.2, 0.22 + stride * 0.6, 0.14, 0.42, 0.045);
  paint(ctx, k.deep, k.rim, 0.045);
  roundRect(ctx, 0.08, 0.18 - stride, 0.15, 0.46, 0.045);
  paint(ctx, k.cloth, k.rim, 0.045);
  roundRect(ctx, -0.16, 0.5, 0.12, 0.1, 0.03);
  ctx.fillStyle = k.deep;
  ctx.fill();
  roundRect(ctx, 0.1, 0.5, 0.14, 0.1, 0.03);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.32, 0.22);
  ctx.lineTo(-0.28, -0.38);
  ctx.lineTo(-0.08, -0.48);
  ctx.lineTo(0.22, -0.4);
  ctx.lineTo(0.34, 0.24);
  ctx.closePath();
  const body = ctx.createLinearGradient(-0.3, -0.48, 0.32, 0.26);
  body.addColorStop(0, k.clothLight);
  body.addColorStop(0.4, k.cloth);
  body.addColorStop(1, k.deep);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = k.rim;
  ctx.lineWidth = 0.065;
  ctx.stroke();
  ctx.fillStyle = k.webbing;
  ctx.fillRect(-0.26, 0.04, 0.52, 0.07);
  ctx.fillRect(-0.04, -0.36, 0.08, 0.42);
  ctx.fillStyle = BRASS;
  ctx.beginPath();
  ctx.arc(0.1, 0.07, 0.035, 0, Math.PI * 2);
  ctx.fill();
  roundRect(ctx, -0.38, -0.28, 0.14, 0.36, 0.04);
  paint(ctx, k.clothLight, k.rim, 0.04);
  roundRect(ctx, 0.22, -0.22, 0.14, 0.32, 0.04);
  paint(ctx, k.cloth, k.rim, 0.04);
  drawRifle(ctx, k, 0.16, 0.12, 0.08, -1.05, true, false);
  drawHelmet(ctx, k, -0.02, -0.58, 1.15);
  ctx.restore();
}

function drawMarksman(ctx: CanvasRenderingContext2D, e: Entity): void {
  const k = kit(e.team);
  shadow(ctx, 0.55, 0.2, 0.38);
  ctx.beginPath();
  ctx.ellipse(0.12, 0.28, 0.22, 0.16, -0.35, 0, Math.PI * 2);
  paint(ctx, k.deep, k.rim, 0.045);
  roundRect(ctx, -0.08, 0.12, 0.18, 0.28, 0.05);
  paint(ctx, k.cloth, k.rim, 0.04);
  ctx.beginPath();
  ctx.ellipse(-0.02, 0.02, 0.28, 0.18, -0.55, 0, Math.PI * 2);
  const body = ctx.createLinearGradient(-0.3, -0.2, 0.25, 0.25);
  body.addColorStop(0, k.clothLight);
  body.addColorStop(0.5, k.cloth);
  body.addColorStop(1, k.deep);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = k.rim;
  ctx.lineWidth = 0.055;
  ctx.stroke();
  ctx.fillStyle = k.webbing;
  ctx.fillRect(-0.16, 0.0, 0.28, 0.045);
  roundRect(ctx, -0.34, 0.02, 0.16, 0.14, 0.04);
  paint(ctx, k.clothLight, k.rim, 0.035);
  roundRect(ctx, 0.12, 0.08, 0.16, 0.12, 0.04);
  paint(ctx, k.cloth, k.rim, 0.035);
  ctx.strokeStyle = k.metal;
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.moveTo(-0.22, -0.18);
  ctx.lineTo(-0.18, 0.08);
  ctx.moveTo(-0.08, -0.18);
  ctx.lineTo(-0.04, 0.1);
  ctx.stroke();
  drawRifle(ctx, k, -0.35, -0.12, -0.22, -1.15, false, true);
  ctx.fillStyle = k.metalLight;
  ctx.fillRect(-0.28, -1.18, 0.12, 0.06);
  drawHelmet(ctx, k, -0.18, -0.28, 1.0);
}

function drawIronhide(ctx: CanvasRenderingContext2D, e: Entity, bob = 0): void {
  const k = kit(e.team);
  shadow(ctx, 0.95, 0.28, 0.52);
  if (e.speed > 0) {
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "#cbb98a";
    ctx.beginPath();
    ctx.ellipse(0.15, 0.58, 0.35 + Math.abs(Math.sin(bob)) * 0.12, 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  roundRect(ctx, -0.78, 0.18, 0.18, 0.42, 0.04);
  paint(ctx, k.deep, k.rim, 0.04);
  roundRect(ctx, 0.6, 0.18, 0.18, 0.42, 0.04);
  paint(ctx, k.deep, k.rim, 0.04);
  ctx.fillStyle = k.metal;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(-0.69, 0.22 + i * 0.08, 0.055, 0, Math.PI * 2);
    ctx.arc(0.69, 0.22 + i * 0.08, 0.055, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(-0.62, 0.38);
  ctx.lineTo(-0.52, -0.18);
  ctx.lineTo(-0.18, -0.32);
  ctx.lineTo(0.22, -0.32);
  ctx.lineTo(0.55, -0.12);
  ctx.lineTo(0.64, 0.4);
  ctx.closePath();
  const hull = ctx.createLinearGradient(-0.6, -0.32, 0.64, 0.42);
  hull.addColorStop(0, k.metalLight);
  hull.addColorStop(0.35, k.cloth);
  hull.addColorStop(1, k.deep);
  ctx.fillStyle = hull;
  ctx.fill();
  ctx.strokeStyle = k.rim;
  ctx.lineWidth = 0.08;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-0.5, -0.12);
  ctx.lineTo(-0.18, -0.28);
  ctx.lineTo(0.2, -0.28);
  ctx.lineTo(0.48, -0.08);
  ctx.lineTo(0.42, 0.08);
  ctx.lineTo(-0.46, 0.08);
  ctx.closePath();
  ctx.fillStyle = k.metal;
  ctx.fill();
  ctx.strokeStyle = k.helmetLight;
  ctx.lineWidth = 0.03;
  ctx.stroke();
  roundRect(ctx, -0.32, -0.52, 0.64, 0.42, 0.08);
  paint(ctx, k.mid, k.rim, 0.07);
  roundRect(ctx, -0.18, -0.42, 0.14, 0.12, 0.02);
  ctx.fillStyle = k.deep;
  ctx.fill();
  roundRect(ctx, 0.04, -0.42, 0.14, 0.12, 0.02);
  ctx.fillStyle = k.helmetLight;
  ctx.globalAlpha = 0.55;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = k.metal;
  ctx.fillRect(-0.045, -1.05, 0.09, 0.58);
  ctx.fillStyle = k.metalLight;
  ctx.fillRect(-0.045, -1.05, 0.09, 0.12);
  ctx.beginPath();
  ctx.arc(0, -1.08, 0.07, 0, Math.PI * 2);
  paint(ctx, k.metalLight, k.rim, 0.03);
  ctx.beginPath();
  ctx.arc(0.22, -0.28, 0.05, 0, Math.PI * 2);
  ctx.fillStyle = k.rim;
  ctx.fill();
}

function drawMortar(ctx: CanvasRenderingContext2D, e: Entity, t = 0): void {
  const k = kit(e.team);
  shadow(ctx, 0.55, 0.2, 0.5);
  ctx.beginPath();
  ctx.ellipse(0.12, 0.38, 0.32, 0.12, 0, 0, Math.PI * 2);
  paint(ctx, k.deep, k.metal, 0.04);
  ctx.strokeStyle = k.metal;
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(-0.18, 0.32);
  ctx.lineTo(-0.05, -0.02);
  ctx.moveTo(0.32, 0.32);
  ctx.lineTo(0.12, 0.0);
  ctx.stroke();
  ctx.lineCap = "round";
  ctx.strokeStyle = k.deep;
  ctx.lineWidth = 0.2;
  ctx.beginPath();
  ctx.moveTo(0.04, 0.16);
  ctx.lineTo(0.42, -0.72);
  ctx.stroke();
  ctx.strokeStyle = k.metal;
  ctx.lineWidth = 0.12;
  ctx.stroke();
  ctx.strokeStyle = k.metalLight;
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.moveTo(0.1, 0.04);
  ctx.lineTo(0.42, -0.72);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0.46, -0.8, 0.08, 0, Math.PI * 2);
  paint(ctx, k.metalLight, BRASS, 0.03);
  ctx.fillStyle = "#e8a040";
  ctx.beginPath();
  ctx.arc(0.58, -0.96, 0.055 + Math.sin(t * 8) * 0.012, 0, Math.PI * 2);
  ctx.fill();
  roundRect(ctx, 0.22, 0.18, 0.1, 0.12, 0.02);
  paint(ctx, k.metal, BRASS, 0.03);
  ctx.beginPath();
  ctx.ellipse(-0.22, 0.22, 0.2, 0.16, 0.2, 0, Math.PI * 2);
  const crew = ctx.createLinearGradient(-0.4, 0.0, -0.05, 0.38);
  crew.addColorStop(0, k.clothLight);
  crew.addColorStop(1, k.deep);
  ctx.fillStyle = crew;
  ctx.fill();
  ctx.strokeStyle = k.rim;
  ctx.lineWidth = 0.05;
  ctx.stroke();
  roundRect(ctx, -0.38, 0.08, 0.12, 0.2, 0.03);
  paint(ctx, k.cloth, k.rim, 0.03);
  drawHelmet(ctx, k, -0.22, -0.02, 0.95);
}

function drawPillbox(ctx: CanvasRenderingContext2D, e: Entity, t = 0): void {
  const k = kit(e.team);
  shadow(ctx, 0.92, 0.28, 0.55);
  ctx.fillStyle = "#6e5c38";
  for (let r = 0; r < 3; r++) {
    const bags = 7 - r;
    for (let i = 0; i < bags; i++) {
      const bw = 1.7 / 7;
      const bx = -0.82 + i * bw + (r % 2 ? 0.08 : 0);
      const by = 0.32 - r * 0.16;
      roundRect(ctx, bx, by, bw - 0.04, 0.16, 0.05);
      ctx.fill();
      ctx.strokeStyle = r % 2 ? "#cbb98a" : "#4a3c24";
      ctx.lineWidth = 0.02;
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.moveTo(-0.62, 0.12);
  ctx.lineTo(-0.55, -0.42);
  ctx.lineTo(0.55, -0.42);
  ctx.lineTo(0.64, 0.12);
  ctx.closePath();
  const conc = ctx.createLinearGradient(0, -0.45, 0, 0.18);
  conc.addColorStop(0, "#d8d0b8");
  conc.addColorStop(0.45, k.cloth);
  conc.addColorStop(1, k.deep);
  ctx.fillStyle = conc;
  ctx.fill();
  ctx.strokeStyle = k.rim;
  ctx.lineWidth = 0.07;
  ctx.stroke();
  ctx.strokeStyle = k.metalLight;
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(-0.5, -0.38);
  ctx.lineTo(0.5, -0.38);
  ctx.stroke();
  ctx.fillStyle = k.deep;
  roundRect(ctx, -0.28, -0.22, 0.56, 0.18, 0.03);
  ctx.fill();
  ctx.fillStyle = k.rim;
  ctx.globalAlpha = 0.7 + Math.sin(t * 5) * 0.15;
  ctx.fillRect(-0.2, -0.16, 0.4, 0.06);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = k.metal;
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(0.28, -0.4);
  ctx.lineTo(0.28, -0.98);
  ctx.stroke();
  ctx.strokeStyle = k.rim;
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(0.28, -0.98);
  ctx.lineTo(0.52, -0.72);
  ctx.lineTo(0.28, -0.58);
  ctx.stroke();
}

function drawTower(ctx: CanvasRenderingContext2D, e: Entity): void {
  const king = e.towerSlot === "king";
  const k = kit(e.team);
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.dying > 0) ctx.globalAlpha = Math.max(0, e.dying);

  const bodyW = king ? 3.15 : 1.95;
  const wallH = king ? 1.85 : 1.05;

  shadow(ctx, bodyW * 0.72, king ? 0.5 : 0.32, 0.7);

  const sand = ctx.createLinearGradient(0, -wallH, 0, 0.7);
  sand.addColorStop(0, "#d8cba0");
  sand.addColorStop(0.35, k.mid);
  sand.addColorStop(1, k.deep);
  roundRect(ctx, -bodyW * 0.5, -wallH * 0.55, bodyW, wallH + 0.62, 0.1);
  ctx.fillStyle = sand;
  ctx.fill();
  ctx.strokeStyle = k.rim;
  ctx.lineWidth = king ? 0.11 : 0.08;
  ctx.stroke();

  if (king) {
    roundRect(ctx, -bodyW * 0.72, -0.15, bodyW * 0.28, 0.85, 0.08);
    paint(ctx, k.mid, k.rim, 0.06);
    roundRect(ctx, bodyW * 0.44, -0.15, bodyW * 0.28, 0.85, 0.08);
    paint(ctx, k.mid, k.rim, 0.06);
  }

  ctx.fillStyle = "#6e5c38";
  const rows = king ? 5 : 3;
  const bags = king ? 10 : 6;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < bags - (r % 2); i++) {
      const bw = bodyW / bags;
      const bx = -bodyW * 0.48 + i * bw + (r % 2 ? bw * 0.32 : 0);
      const by = 0.42 - r * 0.18;
      roundRect(ctx, bx, by, bw - 0.03, 0.17, 0.05);
      ctx.fill();
      if (i % 2 === 0) {
        ctx.strokeStyle = "#cbb98a";
        ctx.lineWidth = 0.02;
        ctx.stroke();
      }
    }
  }

  ctx.fillStyle = k.deep;
  roundRect(ctx, -bodyW * 0.2, king ? -0.55 : -0.28, bodyW * 0.4, king ? 0.32 : 0.22, 0.03);
  ctx.fill();
  ctx.fillStyle = e.active ? k.rim : "rgba(0,0,0,0.45)";
  ctx.globalAlpha = e.active ? 0.95 : 0.28;
  ctx.fillRect(-bodyW * 0.16, king ? -0.46 : -0.22, bodyW * 0.32, 0.09);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = k.metalLight;
  ctx.lineWidth = 0.03;
  ctx.strokeRect(-bodyW * 0.2, king ? -0.55 : -0.28, bodyW * 0.4, king ? 0.32 : 0.22);

  const mastX = king ? 0.72 : 0.42;
  const mastTop = king ? -2.15 : -1.15;
  ctx.strokeStyle = k.metal;
  ctx.lineWidth = king ? 0.11 : 0.08;
  ctx.beginPath();
  ctx.moveTo(mastX, -0.2);
  ctx.lineTo(mastX, mastTop);
  ctx.stroke();
  if (king) {
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.moveTo(-0.55, -0.15);
    ctx.lineTo(-0.55, -1.55);
    ctx.stroke();
  }
  ctx.strokeStyle = k.rim;
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.moveTo(mastX, mastTop);
  ctx.lineTo(mastX + (king ? 0.7 : 0.42), mastTop + (king ? 0.5 : 0.32));
  ctx.lineTo(mastX, mastTop + (king ? 0.68 : 0.42));
  ctx.stroke();

  ctx.fillStyle = k.rim;
  ctx.beginPath();
  ctx.moveTo(-0.08, king ? -0.72 : -0.42);
  ctx.lineTo(king ? 0.95 : 0.52, king ? -1.12 : -0.62);
  ctx.lineTo(king ? 0.95 : 0.52, king ? -0.52 : -0.28);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 0.05;
  ctx.stroke();

  if (!e.active && king) {
    ctx.fillStyle = "rgba(10, 12, 8, 0.42)";
    roundRect(ctx, -bodyW * 0.5, -wallH * 0.55, bodyW, wallH + 0.62, 0.1);
    ctx.fill();
  }
  ctx.restore();
}

function drawBuilding(ctx: CanvasRenderingContext2D, e: Entity, t: number, now: number): void {
  ctx.save();
  ctx.translate(e.x, e.y);
  if (now < e.deployUntil) {
    const k = 1 - (e.deployUntil - now) / 0.42;
    ctx.translate(0, (1 - clamp(k, 0, 1)) * -0.7);
    ctx.globalAlpha = Math.max(0.2, k);
    ctx.scale(0.82 + clamp(k, 0, 1) * 0.18, 0.82 + clamp(k, 0, 1) * 0.18);
  }
  if (e.dying > 0) {
    const k = 1 - clamp(e.dying / 0.28, 0, 1);
    ctx.globalAlpha = Math.max(0.2, 1 - k);
    ctx.scale(1 + k * 0.1, 1 - k * 0.4);
    drawPillbox(ctx, e, t);
    drawDeathPuff(ctx, e, k);
    ctx.restore();
    return;
  }
  drawPillbox(ctx, e, t);
  if (justStruck(e, now)) {
    ctx.fillStyle = "rgba(255,255,220,0.28)";
    ctx.beginPath();
    ctx.arc(0, -0.1, 0.85, 0, Math.PI * 2);
    ctx.fill();
  }
  if (now < e.frozenUntil) smokeOverlay(ctx, 0.95);
  ctx.restore();
}

function drawDeathPuff(ctx: CanvasRenderingContext2D, e: Entity, k: number): void {
  const n = e.kind === "building" || e.radius > 0.55 ? 6 : 4;
  ctx.save();
  ctx.globalAlpha = 0.75 * (1 - k * 0.45);
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + e.id * 0.4;
    const d = 0.14 + k * (0.4 + (i % 3) * 0.1);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d - k * 0.18, 0.12 + (i % 3) * 0.04, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? "rgba(160,155,140,0.7)" : teamMid(e.team);
    ctx.fill();
  }
  ctx.restore();
}

function justStruck(e: Entity, now: number): boolean {
  return now >= e.deployUntil && e.attackCd > e.hitSpeed - 0.16;
}

function drawUnitBody(ctx: CanvasRenderingContext2D, e: Entity, t: number): void {
  const id = e.cardId;
  if (id === "ironhide") drawIronhide(ctx, e, e.bob);
  else if (id === "bayonet") drawBayonet(ctx, e, e.bob);
  else if (id === "marksman") drawMarksman(ctx, e);
  else if (id === "mortar") drawMortar(ctx, e, t);
  else drawScout(ctx, e, e.bob);
}

function drawTroop(ctx: CanvasRenderingContext2D, e: Entity, t: number, now: number): void {
  ctx.save();
  ctx.translate(e.x, e.y);
  const deploying = now < e.deployUntil;
  if (deploying) {
    const span = Math.max(0.18, cardById(e.cardId ?? "scouts").deployTime);
    const k = 1 - (e.deployUntil - now) / span;
    ctx.translate(0, (1 - clamp(k, 0, 1)) * -0.85);
    ctx.globalAlpha = clamp(k + 0.2, 0.2, 1);
  }
  if (e.dying > 0) {
    const k = 1 - clamp(e.dying / 0.28, 0, 1);
    ctx.globalAlpha = Math.max(0.15, 1 - k * 0.85);
    ctx.scale(1 + k * 0.12, 1 - k * 0.5);
    ctx.rotate(k * 0.55);
    ctx.save();
    ctx.rotate(e.facing + Math.PI / 2);
    drawUnitBody(ctx, e, t);
    ctx.restore();
    drawDeathPuff(ctx, e, k);
    ctx.restore();
    return;
  }
  const idle = now >= e.deployUntil && now >= e.frozenUntil;
  const walk = idle && e.speed > 0 ? Math.sin(e.bob) * 0.04 : 0;
  ctx.translate(0, walk);
  if (justStruck(e, now)) ctx.scale(1.06, 1.06);

  ctx.save();
  ctx.rotate(e.facing + Math.PI / 2);
  drawUnitBody(ctx, e, t);
  if (justStruck(e, now)) {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = "#fff6d0";
    ctx.beginPath();
    ctx.arc(0, -0.85, 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (now < e.frozenUntil) smokeOverlay(ctx, 0.7);
  ctx.restore();
}

function drawSpellMarker(ctx: CanvasRenderingContext2D, e: Entity, t: number): void {
  const card = cardById(e.cardId!);
  const k = clamp(1 - e.attackCd / Math.max(0.05, card.spellDelay), 0, 1);
  const haze = card.id === "smoke";
  ctx.save();
  ctx.translate(e.x, e.y);
  const beat = 0.88 + 0.12 * Math.max(0, Math.sin(k * Math.PI * 5));
  const r = card.spellRadius * (0.42 + k * 0.58);

  if (k < 0.78) {
    ctx.globalAlpha = 0.16 + k * 0.22;
    ctx.fillStyle = haze ? "rgba(180,180,170,0.55)" : "#d45a20";
    ctx.beginPath();
    ctx.arc(0, 0, r * beat, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = haze ? "#c8c4b4" : "#e8a040";
    ctx.lineWidth = 0.12;
    if (haze) ctx.setLineDash([0.22, 0.14]);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (haze) {
      ctx.fillStyle = "rgba(200,198,180,0.55)";
      for (let i = 0; i < 4; i++) {
        const a = t * 0.5 + i * 1.4;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 0.35, Math.sin(a) * 0.2 - 0.2 - k * 0.25, 0.22 + i * 0.06, 0.34 + k * 0.18, a, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = "#e8a040";
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#f2efe6";
      ctx.beginPath();
      ctx.moveTo(-0.32, 0);
      ctx.lineTo(0.32, 0);
      ctx.moveTo(0, -0.32);
      ctx.lineTo(0, 0.32);
      ctx.stroke();
      ctx.fillStyle = "#e8a040";
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i + t;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    const pop = (k - 0.78) / 0.22;
    if (haze) {
      ctx.globalAlpha = 0.5 * (1 - pop * 0.3);
      ctx.fillStyle = "rgba(180,180,170,0.7)";
      ctx.beginPath();
      ctx.arc(0, 0, card.spellRadius * (0.8 + pop * 0.25), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.55 * (1 - pop * 0.3);
      ctx.fillStyle = "#d45a20";
      ctx.beginPath();
      ctx.arc(0, 0, card.spellRadius * (0.7 + pop * 0.25), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e8a040";
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI * 2 * i) / 10;
        const rr = i % 2 === 0 ? card.spellRadius * (0.95 + pop * 0.12) : card.spellRadius * 0.42;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#f2efe6";
      ctx.lineWidth = 0.08;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  const ang = Math.atan2(p.ty - p.y, p.tx - p.x);
  ctx.rotate(ang);
  if (p.splash > 0.05) {
    ctx.fillStyle = "rgba(180,180,170,0.35)";
    ctx.beginPath();
    ctx.ellipse(-0.22, 0, 0.28, 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.16, 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2efe6";
    ctx.beginPath();
    ctx.ellipse(0.06, 0, 0.07, 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(-0.18, 0, 0.32, 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.radius * 2.1, p.radius * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2efe6";
    ctx.beginPath();
    ctx.arc(0.08, 0, p.radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function visHpY(e: Entity): number {
  if (e.kind === "tower") return e.towerSlot === "king" ? -2.85 : -1.75;
  if (e.cardId === "ironhide") return -1.22;
  if (e.cardId === "bayonet") return -1.28;
  if (e.cardId === "marksman") return -1.12;
  if (e.cardId === "mortar") return -1.18;
  if (e.kind === "building") return -1.22;
  return -0.98;
}

function drawHealth(ctx: CanvasRenderingContext2D, e: Entity): void {
  if (e.hp <= 0) return;
  const w = e.kind === "tower" ? (e.towerSlot === "king" ? 2.55 : 1.95) : Math.max(0.95, e.radius * 2.5);
  const h = e.kind === "tower" ? 0.18 : 0.12;
  const y = visHpY(e);
  const pct = clamp(e.hp / e.maxHp, 0, 1);
  ctx.save();
  ctx.translate(e.x, e.y);
  roundRect(ctx, -w / 2 - 0.04, y - 0.03, w + 0.08, h + 0.06, 0.05);
  ctx.fillStyle = "rgba(12, 14, 10, 0.75)";
  ctx.fill();
  ctx.strokeStyle = "rgba(201, 162, 39, 0.4)";
  ctx.lineWidth = 0.03;
  ctx.stroke();
  roundRect(ctx, -w / 2, y, w * pct, h, 0.04);
  ctx.fillStyle = pct > 0.4 ? teamGlow(e.team) : "#c4783a";
  ctx.fill();
  if (e.kind === "tower") {
    ctx.fillStyle = "rgba(242,239,230,0.85)";
    ctx.font = "0.28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(Math.max(0, Math.round(e.hp))), 0, y + h * 0.55);
  }
  ctx.restore();
}

function smokeOverlay(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "#c8c4b4";
  ctx.lineWidth = 0.06;
  ctx.setLineDash([0.16, 0.1]);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(180,180,170,0.32)";
  ctx.fill();
  ctx.restore();
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fakeEntity(cardId: string, team: Team, color: string): Entity {
  return {
    id: 0,
    team,
    kind: cardId === "pillbox" ? "building" : "troop",
    cardId,
    name: cardId,
    x: 0,
    y: 0,
    hp: 1,
    maxHp: 1,
    radius: 0.5,
    flying: false,
    speed: 0,
    range: 0,
    damage: 0,
    hitSpeed: 1,
    splash: 0,
    sight: 0,
    attackCd: 0,
    targetId: null,
    frozenUntil: 0,
    deployUntil: 0,
    lifetime: 0,
    age: 0,
    facing: -Math.PI / 2,
    bob: 0.6,
    towerSlot: null,
    active: true,
    dying: 0,
    color,
  };
}

export function drawCardArt(
  ctx: CanvasRenderingContext2D,
  cardId: string,
  w: number,
  h: number,
  team: Team = 0,
): void {
  const card = cardById(cardId);
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, team === 0 ? "#2a4054" : "#4a3c20");
  bg.addColorStop(0.45, shade(card.color, 0.35));
  bg.addColorStop(1, "#16180f");
  roundRect(ctx, 0, 0, w, h, 6);
  ctx.fillStyle = bg;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, 0, 0, w, h, 6);
  ctx.clip();
  ctx.fillStyle = "rgba(201,162,39,0.12)";
  ctx.fillRect(0, h * 0.62, w, h * 0.4);
  ctx.restore();

  ctx.save();
  ctx.translate(w / 2, h * 0.62);
  ctx.scale(Math.min(w, h) / 3.15, Math.min(w, h) / 3.15);
  const fake = fakeEntity(cardId, team, card.color);
  if (card.kind === "spell") {
    if (cardId === "smoke") {
      ctx.fillStyle = "rgba(180,180,170,0.5)";
      ctx.beginPath();
      ctx.ellipse(-0.15, -0.2, 0.28, 0.48, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0.18, -0.35, 0.32, 0.55, 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#c8c4b4";
      ctx.lineWidth = 0.07;
      ctx.setLineDash([0.12, 0.08]);
      ctx.beginPath();
      ctx.arc(0, 0.2, 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = "#e8a040";
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.arc(0, 0, 0.72, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-0.28, 0);
      ctx.lineTo(0.28, 0);
      ctx.moveTo(0, -0.28);
      ctx.lineTo(0, 0.28);
      ctx.stroke();
      ctx.fillStyle = "#d45a20";
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8 - Math.PI / 2;
        const rr = i % 2 === 0 ? 0.34 : 0.14;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  } else if (card.kind === "building") {
    ctx.translate(0, 0.15);
    drawPillbox(ctx, fake, 1);
  } else if (cardId === "ironhide") {
    ctx.translate(0, 0.12);
    drawIronhide(ctx, fake, 0.4);
  } else if (cardId === "bayonet") {
    ctx.translate(0, 0.08);
    drawBayonet(ctx, fake, 0.4);
  } else if (cardId === "marksman") {
    ctx.translate(0, 0.2);
    drawMarksman(ctx, fake);
  } else if (cardId === "mortar") {
    ctx.translate(0, 0.12);
    drawMortar(ctx, fake, 1);
  } else {
    ctx.save();
    ctx.translate(-0.42, 0.18);
    ctx.scale(0.78, 0.78);
    drawScout(ctx, fake, 0.2);
    ctx.restore();
    ctx.save();
    ctx.translate(0.42, 0.18);
    ctx.scale(0.78, 0.78);
    drawScout(ctx, fake, 1.1);
    ctx.restore();
    ctx.save();
    ctx.translate(0, -0.28);
    drawScout(ctx, fake, 0.6);
    ctx.restore();
  }
  ctx.restore();
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) * k;
  const g = ((n >> 8) & 255) * k;
  const b = (n & 255) * k;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export { inRiver, onBridge, bankOf };
